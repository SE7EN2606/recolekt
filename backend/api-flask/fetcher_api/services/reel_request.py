import os
import shutil
import tempfile
import logging

from fetcher_api.adapters.instagram_client import instagram_client
from fetcher_api.services.video_analysis import (
    generate_reel_thumbnail,
    download_instagram_video,
)
from fetcher_api.services.storage import save_preview_thumbnail_to_gcs
from fetcher_api.services.db_insert import insert_preview
from fetcher_api.services.worker_launcher import launch_worker
from fetcher_api.utils.timestamps import get_timestamp, get_unique_id

logger = logging.getLogger("reel_request")


def process_reel_request(request):
    """
    Light pipeline:
      - extract URL or file
      - download video (+ platform thumbnail where available)
      - upload preview thumbnail (platform thumb → FFmpeg fallback)
      - insert preview row into DB
      - spawn isolated worker (subprocess)
      - return preview response to frontend
    """

    # ---------------------------------------------------------
    # Input handling
    # ---------------------------------------------------------
    url = request.form.get("url")
    file = request.files.get("file")
    caption_from_user = request.form.get("caption", "")

    if not url and not file:
        return {"error": "Provide either file or URL"}

    temp_dir = tempfile.mkdtemp()
    caption = ""
    author_name = ""
    dl = {}  # download result dict (populated for URL downloads only)

    # ---------------------------------------------------------
    # 1. VIDEO DOWNLOAD or FILE UPLOAD
    # ---------------------------------------------------------
    if file and file.filename:
        # Local upload
        filename = file.filename
        process_id = f"{get_timestamp()}_{get_unique_id(filename)}"
        video_path = os.path.join(temp_dir, filename)

        file.save(video_path)

        caption = caption_from_user
        shortcode = "uploaded"
        logger.info(f"Local upload → process_id {process_id}")

    else:
        # URL download (Instagram / YouTube / TikTok / Facebook)
        shortcode = instagram_client.extract_shortcode(url) or "unknown"
        process_id = f"{shortcode}_{get_timestamp()}_{get_unique_id(url)}"
        video_path = os.path.join(temp_dir, f"{process_id}.mp4")

        logger.info(f"Downloading: {url}")

        dl = download_instagram_video(url, video_path)

        if not dl.get("success"):
            return {"error": "Failed to download video"}

        metadata = dl.get("metadata", {})
        caption = metadata.get("caption", "")
        author_name = metadata.get("username", "")

    # ---------------------------------------------------------
    # 2. PREVIEW THUMBNAIL
    #    Priority: platform thumbnail → FFmpeg fallback
    # ---------------------------------------------------------
    preview_url = None
    preview_path = os.path.join(temp_dir, "preview.jpg")

    try:
        thumb_ready = False

        # ── Try platform thumbnail first (no letterbox, full quality) ──
        platform_thumb = dl.get("thumbnail_path")
        if platform_thumb and os.path.exists(platform_thumb):
            shutil.copy2(platform_thumb, preview_path)
            thumb_ready = True
            logger.info(f"✅ Using platform thumbnail: {platform_thumb}")

        # ── FFmpeg fallback (file uploads or failed platform thumb) ───
        if not thumb_ready:
            logger.info("⚠️ No platform thumbnail — falling back to FFmpeg")
            thumb_ready = generate_reel_thumbnail(video_path, preview_path, 0.5)

        if thumb_ready and os.path.exists(preview_path):
            preview_url = save_preview_thumbnail_to_gcs(preview_path, shortcode)
            logger.info(f"Preview uploaded: {preview_url}")
        else:
            logger.warning("Thumbnail generation returned False — preview_url will be None")

    except Exception as e:
        logger.warning(f"Preview thumbnail failed: {e}")

    # ---------------------------------------------------------
    # 3. DB INSERT – Preview record
    # ---------------------------------------------------------
    insert_preview(
        process_id=process_id,
        user_id="temp_user",
        caption=caption,
        author_name=author_name,
        preview_url=preview_url,
        source_url=url,
        folder_id="default",
    )
    logger.info(f"Inserted preview DB row for process_id={process_id}")

    # ---------------------------------------------------------
    # 4. LAUNCH BACKGROUND WORKER (subprocess)
    # ---------------------------------------------------------
    payload = {
        "process_id":  process_id,
        "video_path":  video_path,
        "temp_dir":    temp_dir,
        "caption":     caption,
        "author_name": author_name,
        "url":         url,
        "shortcode":   shortcode,
    }

    launch_worker(payload)
    logger.info(f"Worker launched for {process_id}")

    # ---------------------------------------------------------
    # 5. RETURN PREVIEW TO FRONTEND
    # ---------------------------------------------------------
    return {
        "status":      "preview_ready",
        "reel_id":     process_id,
        "preview_url": preview_url,
    }
