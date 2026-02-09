# fetcher_api/api/routes/video.py
import os
import json
import tempfile
import logging
import threading
import re
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

def _extract_url_from_request():
    """Ultra-robust URL extraction with full logging"""
    
    # Log everything
    logger.info(f"🔍 Content-Type: {request.content_type}")
    logger.info(f"🔍 Query args: {dict(request.args)}")
    logger.info(f"🔍 Form keys: {list(request.form.keys())}")
    logger.info(f"🔍 Files keys: {list(request.files.keys())}")
    
    # 1. JSON Body
    if request.is_json or 'application/json' in str(request.content_type):
        try:
            data = request.get_json(force=True, silent=True)
            logger.info(f"✅ JSON data: {data}")
            if data and isinstance(data, dict):
                url = data.get("url") or data.get("link") or data.get("ig_url")
                if url:
                    logger.info(f"✅ Found URL in JSON: {url}")
                    return str(url).strip()
        except Exception as e:
            logger.warning(f"❌ JSON parse failed: {e}")

    # 2. Query String
    url = request.args.get("url") or request.args.get("link")
    if url:
        logger.info(f"✅ Found URL in query: {url}")
        return url.strip()

    # 3. Form Data
    url = request.form.get("url") or request.form.get("link") or request.form.get("ig_url")
    if url:
        logger.info(f"✅ Found URL in form: {url}")
        return url.strip()

    # 4. Raw body regex search
    try:
        raw_data = request.get_data(as_text=True)
        logger.info(f"🔍 Raw body (first 300 chars): {raw_data[:300]}")
        match = re.search(r'(https?://(?:www\.)?instagram\.com/[^\s"\'<>]+)', raw_data)
        if match:
            found = match.group(1)
            logger.info(f"✅ Found URL via regex: {found}")
            return found
    except Exception as e:
        logger.warning(f"❌ Regex search failed: {e}")

    logger.error("❌ NO URL FOUND ANYWHERE")
    return None

@video_bp.route("/summarize", methods=["POST"])
def summarize():
    logger.info("📥 /summarize called")
    
    try:
        user_id = get_user_id_from_request()
    except ValueError:
        return jsonify({"error": "Authentication required"}), 401

    save_to_gcs = True
    try:
        if request.is_json and request.get_json():
            save_to_gcs = str(request.get_json().get("save_to_gcs", "true")).lower() == "true"
        elif request.form:
            save_to_gcs = request.form.get("save_to_gcs", "true").lower() == "true"
        elif request.args:
            save_to_gcs = request.args.get("save_to_gcs", "true").lower() == "true"
    except:
        pass

    file = request.files.get("file")
    url = _extract_url_from_request()

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
        if file and file.filename:
            filename = secure_filename(file.filename)
            video_path = save_uploaded_file(file, temp_dir)
            shortcode = get_unique_id(filename).rstrip("-")
            result["process_id"] = f"{shortcode}--{get_timestamp()}--{get_unique_id(url or filename)}"
        else:
            url = str(url).strip()
            shortcode = instagram_client.extract_shortcode(url) or "unknown"
            shortcode = shortcode.rstrip("-")
            result["process_id"] = f"{shortcode}--{get_timestamp()}--{get_unique_id(url)}"
            video_path = os.path.join(temp_dir, f"{result['process_id']}.mp4")

            try:
                post = instagram_client.get_post(shortcode)
                if post:
                    caption = post.caption or ""
                    author_name = post.owner_username or ""
            except Exception:
                pass

        gcs_paths = generate_gcs_paths(shortcode, "IG")
        result["gcs_paths"] = gcs_paths
        
        preview_url = None
        thumb_path = os.path.join(temp_dir, f"{shortcode}_thumbnail.jpeg")
        thumbnail_success = False
        if post:
            thumbnail_success = download_instagram_thumbnail(post, thumb_path)
        if not thumbnail_success and video_path and os.path.exists(video_path):
            generate_reel_thumbnail(video_path, thumb_path, 0.0)
            
        if os.path.exists(thumb_path) and save_to_gcs and gcs_client.available:
            preview_url = gcs_client.upload_file(thumb_path, gcs_client.analysis_bucket_name, gcs_paths["preview_thumbnail"])
            cleanup_file(thumb_path)

        result["gcs_urls"] = {"preview_thumbnail": preview_url, "video": None}
        gcs_urls_json = json.dumps(result["gcs_urls"])

        execute(
            """
            INSERT INTO reels (id, user_id, source_url, status, folder_id, caption, author_name, gcs_urls, created_at)
            VALUES (%s, %s, %s, 'processing', 'default', %s, %s, %s, NOW())
            ON CONFLICT (id) DO UPDATE SET status = 'processing', updated_at = NOW()
            """,
            (result["process_id"], user_id, url, caption, author_name, gcs_urls_json),
        )

    except Exception as e:
        logger.error(f"Error: {e}", exc_info=True)
        return jsonify({"error": "Internal error"}), 500

    threading.Thread(
        target=background_process,
        args=(result, video_path, temp_dir, shortcode, caption, url, save_to_gcs, author_name, None, user_id),
        daemon=True,
    ).start()

    return jsonify({
        "status": "preview_ready" if preview_url else "processing",
        "reel_id": result["process_id"],
        "preview_url": preview_url
    })
