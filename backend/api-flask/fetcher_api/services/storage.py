# fetcher_api/services/storage.py
import os
import io
import json
import logging

from fetcher_api.adapters.gcs_client import gcs_client
from fetcher_api.adapters.db import fetch_one

logger = logging.getLogger("storage")


def _get_user_id_for_shortcode(shortcode: str):
    try:
        row = fetch_one(
            "SELECT user_id FROM reels WHERE id LIKE %s ORDER BY created_at DESC LIMIT 1",
            (f"{shortcode}%",),
        )
        if row:
            if hasattr(row, "keys"):
                return dict(row).get("user_id")
            return row._asdict().get("user_id")
    except Exception as e:
        logger.error(f"Error fetching user_id for shortcode {shortcode}: {e}")
    return None


def generate_gcs_paths(shortcode: str, platform: str = "IG", user_id: str = None):
    """
    Canonical GCS object paths.

    Always scopes by user_id when available:
      media/{platform}_reels/{shortcode}_{user_id}/...

    Falls back to shortcode-only folder only if user_id cannot be resolved.
    """
    shortcode = (shortcode or "").strip()
    platform = (platform or "IG").strip().upper()

    final_user_id = user_id or _get_user_id_for_shortcode(shortcode)
    folder_name = f"{shortcode}_{final_user_id}" if final_user_id else shortcode
    base_path = f"media/{platform}_reels/{folder_name}/"

    return {
        "preview_thumbnail": f"{base_path}{shortcode}_thumbnail.webp",
        "video": f"{base_path}{shortcode}_video.mp4",
        "result_json": f"{base_path}{shortcode}_result.json",
    }


def compress_thumbnail(image_bytes: bytes, max_width: int = 1080, quality: int = 85) -> bytes:
    """
    Resize to max 1080px wide and compress at quality=85.
    Keeps poster quality while cutting file size ~60-70%.
    """
    try:
        from PIL import Image

        img = Image.open(io.BytesIO(image_bytes))
        if img.mode in ("RGBA", "P", "CMYK"):
            img = img.convert("RGB")

        if img.width > max_width:
            ratio = max_width / img.width
            img = img.resize((max_width, int(img.height * ratio)), Image.LANCZOS)

        output = io.BytesIO()
        img.save(output, format="WEBP", quality=quality, method=6)

        original_kb = len(image_bytes) // 1024
        compressed_kb = output.tell() // 1024
        logger.info(f"🗜️ Thumbnail compressed: {original_kb}kB → {compressed_kb}kB")

        return output.getvalue()

    except ImportError:
        logger.warning("⚠️ Pillow not installed — skipping thumbnail compression")
        return image_bytes
    except Exception as e:
        logger.warning(f"⚠️ Thumbnail compression failed, using original: {e}")
        return image_bytes


def _safe_upload(
    local_path: str,
    bucket: str,
    blob_name: str,
    content_type=None,
    cache_control: str = "public, max-age=86400",
):
    """Upload file to GCS with optional cache-control header."""
    if not gcs_client.available:
        return None

    try:
        return gcs_client.upload_file(
            local_path,
            bucket,
            blob_name,
            content_type=content_type,
            cache_control=cache_control,
            timeout=600,
        )
    except TypeError:
        return gcs_client.upload_file(
            local_path,
            bucket,
            blob_name,
            content_type=content_type,
            timeout=600,
        )
    except Exception as e:
        logger.error(f"Failed upload: {e}")
        return None


def _safe_upload_bytes(
    data: bytes,
    bucket: str,
    blob_name: str,
    content_type=None,
    cache_control: str = "public, max-age=86400",
):
    """Upload raw bytes directly to GCS — avoids writing a temp file."""
    if not gcs_client.available:
        return None

    try:
        bucket_obj = gcs_client.client.bucket(bucket)
        blob = bucket_obj.blob(blob_name)
        blob.cache_control = cache_control
        blob.upload_from_string(
            data,
            content_type=content_type or "application/octet-stream",
            timeout=600,
        )
        logger.info(f"✅ Uploaded bytes to gs://{bucket}/{blob_name}")
        return f"gs://{bucket}/{blob_name}"
    except Exception as e:
        logger.error(f"Failed bytes upload to {blob_name}: {e}")
        return None


def save_result_json_to_gcs(
    result: dict,
    process_id: str,
    temp_dir: str,
    shortcode: str = None,
    media_folder: str = "IG",
    user_id: str = None,
):
    try:
        if not shortcode:
            shortcode = process_id.split("--")[0] if "--" in process_id else process_id.split("_")[0]

        gcs_paths = generate_gcs_paths(shortcode, media_folder, user_id=user_id)
        local_json_path = os.path.join(temp_dir, f"{process_id}_result.json")

        with open(local_json_path, "w", encoding="utf-8") as f:
            json.dump(result, f, indent=2, ensure_ascii=False)

        return _safe_upload(
            local_json_path,
            gcs_client.analysis_bucket_name,
            gcs_paths["result_json"],
            content_type="application/json",
            cache_control="public, max-age=3600",
        )
    except Exception as e:
        logger.error(f"Error saving result JSON: {e}")
        return None


def save_video_to_gcs(video_path: str, shortcode: str, media_folder: str = "IG", user_id: str = None):
    gcs_paths = generate_gcs_paths(shortcode, media_folder, user_id=user_id)
    return _safe_upload(
        video_path,
        gcs_client.analysis_bucket_name,
        gcs_paths["video"],
        content_type="video/mp4",
        cache_control="public, max-age=604800",
    )


def save_thumbnail_to_gcs(thumbnail_path: str, shortcode: str, media_folder: str = "IG", user_id: str = None):
    """
    Compress thumbnail and upload to the canonical preview_thumbnail path.

    Path ends with .webp, so upload WEBP bytes with image/webp.
    """
    gcs_paths = generate_gcs_paths(shortcode, media_folder, user_id=user_id)

    try:
        with open(thumbnail_path, "rb") as f:
            raw_bytes = f.read()

        compressed = compress_thumbnail(raw_bytes)

        uploaded = _safe_upload_bytes(
            compressed,
            gcs_client.analysis_bucket_name,
            gcs_paths["preview_thumbnail"],
            content_type="image/webp",
            cache_control="public, max-age=86400",
        )
        if uploaded:
            return uploaded

    except Exception as e:
        logger.warning(f"⚠️ Compressed upload failed, falling back to direct upload: {e}")

    return _safe_upload(
        thumbnail_path,
        gcs_client.analysis_bucket_name,
        gcs_paths["preview_thumbnail"],
        content_type="image/webp",
        cache_control="public, max-age=86400",
    )