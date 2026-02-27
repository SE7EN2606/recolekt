# fetcher_api/api/routes/video.py
import os
import json
import tempfile
import logging
import threading
import re
import uuid
from flask import Blueprint, request, jsonify
from werkzeug.utils import secure_filename

from fetcher_api.adapters.db import execute, fetch_one
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
    logger.info(f"🔍 Content-Type: {request.content_type}")
    logger.info(f"🔍 Query args: {dict(request.args)}")
    logger.info(f"🔍 Form keys: {list(request.form.keys())}")
    logger.info(f"🔍 Files keys: {list(request.files.keys())}")
    
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

    url = request.args.get("url") or request.args.get("link")
    if url:
        logger.info(f"✅ Found URL in query: {url}")
        return url.strip()

    url = request.form.get("url") or request.form.get("link") or request.form.get("ig_url")
    if url:
        logger.info(f"✅ Found URL in form: {url}")
        return url.strip()

    try:
        raw_data = request.get_data(as_text=True)
        logger.info(f"🔍 Raw body (first 300 chars): {raw_data[:300]}")
        match = re.search(r'(https?://(?:www\.)?(?:instagram|facebook|fb)\.[^\s"\'<>]+)', raw_data)
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
        logger.info(f"✅ User authenticated: {user_id}")
    except ValueError as e:
        logger.error(f"❌ Auth failed: {e}")
        return jsonify({"error": "Authentication required"}), 401

    save_to_gcs = True
    force_retry = False
    try:
        if request.is_json and request.get_json():
            save_to_gcs = str(request.get_json().get("save_to_gcs", "true")).lower() == "true"
            force_retry = str(request.get_json().get("force_retry", "false")).lower() == "true"
        elif request.form:
            save_to_gcs = request.form.get("save_to_gcs", "true").lower() == "true"
            force_retry = request.form.get("force_retry", "false").lower() == "true"
        elif request.args:
            save_to_gcs = request.args.get("save_to_gcs", "true").lower() == "true"
            force_retry = request.args.get("force_retry", "false").lower() == "true"
    except:
        pass

    file = request.files.get("file")
    url = _extract_url_from_request()

    if not file and not url:
        logger.error("❌ No file or URL provided")
        return jsonify({"error": "Provide either file or URL"}), 400

    if url:
        url = str(url).strip()
        existing_reel = fetch_one(
            """
            SELECT id, status, (gcs_urls::jsonb->>'preview_thumbnail') as preview_url 
            FROM reels 
            WHERE user_id = %s AND source_url = %s
            """,
            (user_id, url)
        )
        
        if existing_reel:
            logger.info(f"📌 Reel already exists: {existing_reel['id']}")
            
            if existing_reel.get('status') == 'error' or force_retry:
                logger.info(f"⚠️ Reprocessing requested! Deleting old record...")
                execute("DELETE FROM reels WHERE id = %s", (existing_reel['id'],))
            else:
                return jsonify({
                    "reel_id": existing_reel['id'],
                    "status": existing_reel.get('status', 'completed'),
                    "message": "This reel already exists in your collection",
                    "preview_url": existing_reel.get('preview_url')
                }), 200

    temp_dir = tempfile.mkdtemp(dir=TEMP_DIR_BASE)
    video_path = None
    result = {
        "process_id": "",
        "summary": {},
        "caption": ""
    }

    try:
        platform_id = "IG"  # Default
        shortcode = "unknown"

        if file and file.filename:
            filename = secure_filename(file.filename)
            video_path = save_uploaded_file(file, temp_dir)
            shortcode = get_unique_id(filename).rstrip("-")
            result["process_id"] = f"{shortcode}--{get_timestamp()}--{get_unique_id(url or filename)}"
            logger.info(f"📁 File upload: {result['process_id']}")
        
        else:
            # ---------------------------------------------------------
            # ✅ FIXED: Facebook vs Instagram Routing
            # ---------------------------------------------------------
            url_lower = url.lower()
            is_facebook = "facebook.com" in url_lower or "fb." in url_lower
            
            if is_facebook:
                logger.info(f"🔗 Processing Facebook URL: {url}")
                from fetcher_api.adapters.facebook_client import facebook_client
                extracted = facebook_client.extract_shortcode(url)
                shortcode = extracted if extracted else "unknown"
                platform_id = "FB"
            else:
                logger.info(f"🔗 Processing Instagram URL: {url}")
                extracted = instagram_client.extract_shortcode(url)
                shortcode = extracted if extracted else "unknown"
                platform_id = "IG"

            shortcode = shortcode.rstrip("-")

            # Fallback for completely unknown IDs to prevent collisions
            if not shortcode or shortcode == "unknown" or shortcode == "None":
                shortcode = f"{platform_id.lower()}_{uuid.uuid4().hex[:10]}"
                logger.info(f"🔄 Assigned dynamic shortcode: {shortcode}")

            result["process_id"] = f"{shortcode}--{get_timestamp()}--{get_unique_id(url)}"
            video_path = os.path.join(temp_dir, f"{result['process_id']}.mp4")
            logger.info(f"🆔 Process ID: {result['process_id']}")

            logger.info(f"⏭️ Skipping metadata fetch - will be done in background")

        # ✅ FIXED: Dynamically use FB_reels or IG_reels based on platform
        gcs_paths = generate_gcs_paths(shortcode, platform_id)
        result["gcs_paths"] = gcs_paths
        
        logger.info(f"⏭️ Skipping thumbnail generation - will be done in background")

        result["gcs_urls"] = {"preview_thumbnail": None, "video": None}
        gcs_urls_json = json.dumps(result["gcs_urls"])

        logger.info(f"💾 Inserting into database...")
        logger.info(f"   ID: {result['process_id']}")
        logger.info(f"   User: {user_id}")
        logger.info(f"   URL: {url}")
        
        execute(
            """
            INSERT INTO reels (id, user_id, source_url, status, folder_id, gcs_urls, created_at)
            VALUES (%s, %s, %s, 'processing', 'default', %s, NOW())
            """,
            (result["process_id"], user_id, url, gcs_urls_json),
        )
        logger.info(f"✅ Database record created (caption/author will be added by background)")

    except Exception as e:
        logger.error(f"❌ Error in main processing: {e}", exc_info=True)
        return jsonify({"error": "Internal error"}), 500

    try:
        logger.info(f"🚀 Starting background processing thread...")
        # ✅ NOTE: Save dir is None here, but processing.py will still use the gcs_paths correctly.
        threading.Thread(
            target=background_process,
            args=(result, video_path, temp_dir, shortcode, "", url, save_to_gcs, "", None, user_id),
            daemon=True,
        ).start()
        logger.info(f"✅ Background thread started")
    except Exception as e:
        logger.error(f"❌ Failed to start background thread: {e}", exc_info=True)

    return jsonify({
        "status": "processing",
        "reel_id": result["process_id"],
        "preview_url": None
    })
