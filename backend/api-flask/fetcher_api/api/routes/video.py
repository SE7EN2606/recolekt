# fetcher_api/api/routes/video.py
"""
Video processing routes - /summarize endpoint
"""
import os
import json
import tempfile
import logging
import threading
from flask import Blueprint, request, jsonify
from werkzeug.utils import secure_filename

from fetcher_api.adapters.db import execute
from fetcher_api.adapters.gcs_client import gcs_client
from fetcher_api.adapters.instagram_client import instagram_client
from fetcher_api.utils.files import save_uploaded_file, cleanup_file
from fetcher_api.utils.timestamps import get_timestamp, get_unique_id
from fetcher_api.services.video_analysis import (
    generate_reel_thumbnail,
    download_instagram_video,
    download_instagram_thumbnail,
)
from fetcher_api.api.helpers.processing import background_process
from fetcher_api.services.storage import generate_gcs_paths
from fetcher_api.api.helpers.auth import get_user_id_from_request

logger = logging.getLogger("video")

video_bp = Blueprint("video", __name__)

TEMP_DIR_BASE = os.path.join(tempfile.gettempdir(), "recolekt_processing")
os.makedirs(TEMP_DIR_BASE, exist_ok=True)


@video_bp.route("/summarize", methods=["POST"])
def summarize():
    """
    Upload video or provide Instagram URL for processing
    Returns immediate preview with thumbnail, then processes in background
    """
    logger.info("📥 /summarize called")
    
    try:
        user_id = get_user_id_from_request()
    except ValueError:
        return jsonify({"error": "Authentication required"}), 401
    
    save_to_gcs = request.form.get("save_to_gcs", "true").lower() == "true" and gcs_client.available
    url = request.form.get("url") or request.form.get("URL")  # ← FIXED: Accept both lowercase and uppercase
    file = request.files.get("file")
    
    if not file and not url:
        return jsonify({"error": "Provide either file or URL"}), 400
    
    temp_dir = tempfile.mkdtemp(dir=TEMP_DIR_BASE)
    video_path = None
    caption = ""
    author_name = ""
    post = None
    result = {
        "process_id": "",
        "summary": {},
        "caption": caption
    }
    
    try:
        # ===== FILE UPLOAD =====
        if file and file.filename:
            filename = secure_filename(file.filename)
            video_path = save_uploaded_file(file, temp_dir)
            shortcode = get_unique_id(filename).rstrip("-")
            result["process_id"] = f"{shortcode}--{get_timestamp()}--{get_unique_id(url)}"
            caption = request.form.get("caption", "") or ""
        
        # ===== INSTAGRAM URL =====
        else:
            shortcode = instagram_client.extract_shortcode(url) or "unknown"
            shortcode = shortcode.rstrip("-")
            result["process_id"] = f"{shortcode}--{get_timestamp()}--{get_unique_id(url)}"
            video_path = os.path.join(temp_dir, f"{result['process_id']}.mp4")
            
            # Fetch Instagram metadata
            try:
                logger.info(f"⚡️ Fetching metadata for {shortcode}...")
                post = instagram_client.get_post(shortcode)
                if post:
                    caption = post.caption or ""
                    author_name = post.owner_username or ""
            except Exception as e:
                logger.warning(f"Metadata fetch failed: {e}")
        
        # Generate GCS paths
        gcs_paths = generate_gcs_paths(shortcode, "IG")
        result["gcs_paths"] = gcs_paths
        
        # ===== GENERATE THUMBNAIL =====
        preview_url = None
        try:
            thumb_path = os.path.join(temp_dir, f"{shortcode}_thumbnail.jpeg")
            thumbnail_success = False
            
            # Try Instagram thumbnail first
            if post:
                thumbnail_success = download_instagram_thumbnail(post, thumb_path)
            
            # Fallback: generate from video
            if not thumbnail_success and video_path and os.path.exists(video_path):
                generate_reel_thumbnail(video_path, thumb_path, 0.0)
            
            # Upload to GCS
            if os.path.exists(thumb_path) and save_to_gcs:
                preview_url = gcs_client.upload_file(
                    thumb_path,
                    gcs_client.analysis_bucket_name,
                    gcs_paths["preview_thumbnail"],
                )
                cleanup_file(thumb_path)
            
            result["gcs_urls"] = {
                "preview_thumbnail": preview_url,
                "video": None
            }
        
        except Exception as e:
            logger.warning(f"Thumbnail generation failed: {e}")
        
        # ===== INSERT INTO DB =====
        gcs_urls_json = json.dumps(result.get("gcs_urls", {}))
        
        execute(
            """
            INSERT INTO reels (id, user_id, source_url, status, folder_id, caption, author_name, summary_title, is_long_video, gcs_urls, created_at)
            VALUES (%s, %s, %s, 'processing', 'default', %s, %s, NULL, FALSE, %s, NOW())
            ON CONFLICT (id) DO UPDATE SET
                status = 'processing',
                summary_title = NULL,
                summary_text = NULL,
                summary_bullets = NULL,
                updated_at = NOW()
            """,
            (result["process_id"], user_id, url, caption, author_name, gcs_urls_json),
        )
        
        logger.info(f"✅ Fast response ready for {result['process_id']}")
    
    except Exception as e:
        logger.error(f"Error in /summarize: {e}", exc_info=True)
        return jsonify({"error": "Internal error"}), 500
    
    # ===== START BACKGROUND PROCESSING =====
    threading.Thread(
        target=background_process,
        args=(result, video_path, temp_dir, shortcode, caption, url, save_to_gcs, author_name, None, user_id),
        daemon=True,
    ).start()
    
    return jsonify({
        "status": "preview_ready" if preview_url else "processing",
        "reel_id": result["process_id"],
        "preview_url": preview_url,
        "message": "Processing started"
    })
