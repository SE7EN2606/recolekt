import io
import json
import logging
import os
import tempfile
from datetime import datetime, timezone
from typing import Any

from fetcher_api.adapters.db import fetch_one
from fetcher_api.adapters.gcs_client import gcs_client


logger = logging.getLogger("storage")


def _row_to_dict(row: Any) -> dict:
    if not row:
        return {}

    if hasattr(row, "keys"):
        return dict(row)

    if hasattr(row, "_asdict"):
        return row._asdict()

    return {}


def _get_user_id_for_shortcode(shortcode: str):
    try:
        row = fetch_one(
            "SELECT user_id FROM reels WHERE id LIKE %s ORDER BY created_at DESC LIMIT 1",
            (f"{shortcode}%",),
        )
        return _row_to_dict(row).get("user_id")
    except Exception as e:
        logger.error("Error fetching user_id for shortcode %s: %s", shortcode, e)

    return None


def _sortable_prefix() -> str:
    """
    Short readable UTC timestamp.

    Example:
    260427-154020
    """
    return datetime.now(timezone.utc).strftime("%y%m%d-%H%M%S")


def platform_reels_folder(platform: str) -> str:
    platform = (platform or "IG").strip().upper()

    if platform == "YT":
        return "YT_shorts"

    if platform == "TT":
        return "TT_videos"

    if platform == "FB":
        return "FB_reels"

    return f"{platform}_reels"


def generate_gcs_paths(
    shortcode: str,
    platform: str = "IG",
    user_id: str = None,
    stamp: str = None,
):
    """
    Canonical GCS object paths.

    Layout:
    media/IG_reels/260427-154020_DMTJwYotfWw_b5b1a4ab/
      DMTJwYotfWw_b5b1a4ab_thumbnail.webp
      DMTJwYotfWw_b5b1a4ab_input_payload.json
      DMTJwYotfWw_b5b1a4ab_result.json
      DMTJwYotfWw_b5b1a4ab_content_payload.json

    Folder is chronological.
    Filenames include shortcode + user_id for readability.
    """
    shortcode = (shortcode or "").strip()
    platform = (platform or "IG").strip().upper()

    clean_shortcode = shortcode.split("--")[0] if "--" in shortcode else shortcode.split("_")[0]
    final_user_id = user_id or _get_user_id_for_shortcode(clean_shortcode)
    final_stamp = stamp or _sortable_prefix()

    identity = (
        f"{clean_shortcode}_{final_user_id}"
        if final_user_id
        else clean_shortcode
    )

    folder_name = f"{final_stamp}_{identity}"
    base_path = f"media/{platform_reels_folder(platform)}/{folder_name}/"

    return {
        "preview_thumbnail": f"{base_path}{identity}_thumbnail.webp",
        "video": f"{base_path}{identity}_video.mp4",
        "result_json": f"{base_path}{identity}_result.json",
    }


def public_gcs_url(blob_name: str, bucket_name: str = None) -> str | None:
    if not blob_name:
        return None

    bucket = (
        bucket_name
        or getattr(gcs_client, "analysis_bucket_name", None)
        or os.getenv("GCS_BUCKET_NAME", "recolekt-storage")
    )

    return f"https://storage.googleapis.com/{bucket}/{blob_name}"


def _looks_like_webp(data: bytes) -> bool:
    return bool(data and len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP")


def compress_thumbnail(
    image_bytes: bytes,
    max_width: int = 1080,
    quality: int = 85,
) -> bytes | None:
    """
    Convert image bytes to WEBP, resize to max 1080px wide, and compress.
    Returns WEBP bytes or None if conversion is impossible.
    """
    if not image_bytes:
        return None

    try:
        from PIL import Image

        img = Image.open(io.BytesIO(image_bytes))

        if img.mode in ("RGBA", "P", "CMYK"):
            img = img.convert("RGB")
        elif img.mode != "RGB":
            img = img.convert("RGB")

        if img.width > max_width:
            ratio = max_width / img.width
            img = img.resize((max_width, int(img.height * ratio)), Image.LANCZOS)

        output = io.BytesIO()
        img.save(output, format="WEBP", quality=quality, method=6)

        original_kb = len(image_bytes) // 1024
        compressed_kb = output.tell() // 1024
        logger.info("🗜️ Thumbnail converted to WEBP: %dkB → %dkB", original_kb, compressed_kb)

        return output.getvalue()

    except ImportError:
        if _looks_like_webp(image_bytes):
            logger.warning("⚠️ Pillow not installed — using existing WEBP bytes as-is")
            return image_bytes

        logger.error("❌ Pillow not installed — cannot convert non-WEBP thumbnail to WEBP")
        return None

    except Exception as e:
        if _looks_like_webp(image_bytes):
            logger.warning("⚠️ WEBP thumbnail passthrough after conversion failure: %s", e)
            return image_bytes

        logger.warning("⚠️ Thumbnail WEBP conversion failed: %s", e)
        return None


def _safe_upload(
    local_path: str,
    bucket: str,
    blob_name: str,
    content_type=None,
    cache_control: str = "public, max-age=86400",
):
    if not gcs_client.available:
        return None

    try:
        uploaded = gcs_client.upload_file(
            local_path,
            bucket,
            blob_name,
            content_type=content_type,
            cache_control=cache_control,
            timeout=600,
        )
        return public_gcs_url(blob_name, bucket) or uploaded

    except TypeError:
        uploaded = gcs_client.upload_file(
            local_path,
            bucket,
            blob_name,
            content_type=content_type,
            timeout=600,
        )
        return public_gcs_url(blob_name, bucket) or uploaded

    except Exception as e:
        logger.error("Failed upload: %s", e)
        return None


def _safe_upload_bytes(
    data: bytes,
    bucket: str,
    blob_name: str,
    content_type=None,
    cache_control: str = "public, max-age=86400",
):
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

        logger.info("✅ Uploaded bytes to gs://%s/%s", bucket, blob_name)
        return public_gcs_url(blob_name, bucket)

    except Exception as e:
        logger.error("Failed bytes upload to %s: %s", blob_name, e)
        return None


def save_result_json_to_gcs(
    result: dict,
    process_id: str,
    temp_dir: str,
    shortcode: str = None,
    media_folder: str = "IG",
    user_id: str = None,
    gcs_paths: dict | None = None,
):
    """
    Save canonical result JSON to GCS.

    If gcs_paths is provided, upload to gcs_paths["result_json"].
    This prevents mismatched folders/timestamps between DB URLs and uploaded objects.
    """
    try:
        if not shortcode:
            shortcode = process_id.split("--")[0] if "--" in process_id else process_id.split("_")[0]

        effective_user_id = user_id or (result.get("user_id") if isinstance(result, dict) else None)
        paths = gcs_paths or generate_gcs_paths(shortcode, media_folder, effective_user_id)

        local_dir = temp_dir or tempfile.gettempdir()
        os.makedirs(local_dir, exist_ok=True)
        local_json_path = os.path.join(local_dir, f"{process_id}_result.json")

        with open(local_json_path, "w", encoding="utf-8") as f:
            json.dump(result, f, indent=2, ensure_ascii=False)

        return _safe_upload(
            local_json_path,
            gcs_client.analysis_bucket_name,
            paths["result_json"],
            content_type="application/json; charset=utf-8",
            cache_control="no-store, no-cache, max-age=0, must-revalidate",
        )

    except Exception as e:
        logger.error("Error saving result JSON: %s", e)
        return None


def save_video_to_gcs(
    video_path: str,
    shortcode: str,
    media_folder: str = "IG",
    user_id: str = None,
    gcs_paths: dict | None = None,
):
    paths = gcs_paths or generate_gcs_paths(shortcode, media_folder, user_id)

    return _safe_upload(
        video_path,
        gcs_client.analysis_bucket_name,
        paths["video"],
        content_type="video/mp4",
        cache_control="public, max-age=604800",
    )


def save_thumbnail_to_gcs(
    thumbnail_path: str,
    shortcode: str,
    media_folder: str = "IG",
    user_id: str = None,
    gcs_paths: dict | None = None,
):
    paths = gcs_paths or generate_gcs_paths(shortcode, media_folder, user_id)

    try:
        with open(thumbnail_path, "rb") as f:
            raw_bytes = f.read()

        webp_bytes = compress_thumbnail(raw_bytes)
        if not webp_bytes:
            logger.error("❌ Thumbnail conversion to WEBP failed for %s", thumbnail_path)
            return None

        return _safe_upload_bytes(
            webp_bytes,
            gcs_client.analysis_bucket_name,
            paths["preview_thumbnail"],
            content_type="image/webp",
            cache_control="public, max-age=86400",
        )

    except Exception as e:
        logger.error("❌ Thumbnail upload failed for %s: %s", thumbnail_path, e)

    return None