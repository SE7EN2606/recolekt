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
from fetcher_api.adapters.meta_client import meta_client
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

SUPPORTED_DOMAINS = [
    "instagram.com",
    "facebook.com", "fb.watch", "fb.com",
    "youtube.com", "youtu.be",
    "tiktok.com", "vm.tiktok.com", "vt.tiktok.com",
]


def is_supported_url(url: str) -> bool:
    """Check if URL is from a supported platform."""
    if not url:
        return False
    url_lower = url.lower()
    return any(domain in url_lower for domain in SUPPORTED_DOMAINS)


def detect_platform(url: str) -> str:
    """Return platform code: IG, FB, YT, TT or UNKNOWN."""
    if not url:
        return "UNKNOWN"
    url_lower = url.lower()
    if "instagram.com" in url_lower:
        return "IG"
    if "facebook.com" in url_lower or "fb.watch" in url_lower or "fb.com" in url_lower:
        return "FB"
    if "youtube.com" in url_lower or "youtu.be" in url_lower:
        return "YT"
    if "tiktok.com" in url_lower:
        return "TT"
    return "UNKNOWN"


def _coerce_bool(value, default: bool = False) -> bool:
    """Accept real booleans and common string forms."""
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)

    s = str(value).strip().lower()
    if s in {"true", "1", "yes", "y", "on"}:
        return True
    if s in {"false", "0", "no", "n", "off", ""}:
        return False
    return default


def _get_request_json() -> dict:
    """Safely read JSON body once."""
    try:
        if request.is_json or "application/json" in str(request.content_type):
            data = request.get_json(force=True, silent=True)
            if isinstance(data, dict):
                return data
    except Exception as e:
        logger.warning(f"❌ JSON parse failed: {e}")
    return {}


def _extract_url_from_request():
    """Ultra-robust URL extraction with full logging."""
    logger.info(f"🔍 Content-Type: {request.content_type}")
    logger.info(f"🔍 Query args: {dict(request.args)}")
    logger.info(f"🔍 Form keys: {list(request.form.keys())}")
    logger.info(f"🔍 Files keys: {list(request.files.keys())}")

    data = _get_request_json()
    if data:
        logger.info(f"✅ JSON data: {data}")
        url = data.get("url") or data.get("link") or data.get("ig_url")
        if url:
            logger.info(f"✅ Found URL in JSON: {url}")
            return str(url).strip()

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
        match = re.search(
            r'(https?://(?:www\.)?(?:instagram|facebook|fb|youtube|youtu\.be|tiktok|vm\.tiktok|vt\.tiktok)\.[^\s"\'<>]+)',
            raw_data
        )
        if match:
            found = match.group(1)
            logger.info(f"✅ Found URL via regex: {found}")
            return found
    except Exception as e:
        logger.warning(f"❌ Regex search failed: {e}")

    logger.error("❌ NO URL FOUND ANYWHERE")
    return None


def _extract_shortcode(url: str, platform: str) -> str:
    """Extract shortcode/video ID based on platform."""
    if platform == "YT":
        from fetcher_api.api.helpers.normalizers import extract_youtube_id
        return extract_youtube_id(url) or "unknown"
    if platform == "TT":
        match = re.search(r"/video/(\d+)", url)
        return match.group(1) if match else "unknown"
    # IG and FB use meta_client
    return meta_client.extract_shortcode(url) or "unknown"


@video_bp.route("/summarize", methods=["POST"])
def summarize():
    logger.info("📥 /summarize called")

    try:
        user_id = get_user_id_from_request()
        logger.info(f"✅ User authenticated: {user_id}")
    except ValueError as e:
        logger.error(f"❌ Auth failed: {e}")
        return jsonify({"error": "Authentication required"}), 401

    request_json = _get_request_json()

    save_to_gcs = True
    force_retry = False
    try:
        if request_json:
            save_to_gcs = _coerce_bool(request_json.get("save_to_gcs"), True)
            force_retry = _coerce_bool(request_json.get("force_retry"), False)
        elif request.form:
            save_to_gcs = _coerce_bool(request.form.get("save_to_gcs"), True)
            force_retry = _coerce_bool(request.form.get("force_retry"), False)
        elif request.args:
            save_to_gcs = _coerce_bool(request.args.get("save_to_gcs"), True)
            force_retry = _coerce_bool(request.args.get("force_retry"), False)
    except Exception as e:
        logger.warning(f"⚠️ Failed to parse boolean flags, using defaults: {e}")

    file = request.files.get("file")
    url = _extract_url_from_request()

    if not file and not url:
        logger.error("❌ No file or URL provided")
        return jsonify({"error": "Provide either file or URL"}), 400

    if url and not is_supported_url(url):
        logger.warning(f"❌ Unsupported URL: {url}")
        return jsonify({
            "error": "unsupported_platform",
            "message": "Only Instagram, Facebook, YouTube, and TikTok URLs are supported."
        }), 422

    if url:
        url = str(url).strip()
        existing_reel = fetch_one(
            """
            SELECT id, status, (gcs_urls::jsonb->>'preview_thumbnail') as preview_url
            FROM reels
            WHERE user_id = %s AND source_url = %s
            """,
            (user_id, url),
        )

        if existing_reel:
            logger.info(f"📌 Reel already exists: {existing_reel['id']}")

            if existing_reel.get("status") == "error" or force_retry:
                logger.info("⚠️ Reprocessing requested! Deleting old record...")
                execute("DELETE FROM reels WHERE id = %s", (existing_reel["id"],))
            else:
                return jsonify({
                    "reel_id": existing_reel["id"],
                    "status": existing_reel.get("status", "processing"),
                    "message": "This reel already exists in your collection",
                    "preview_url": existing_reel.get("preview_url"),
                }), 200

    temp_dir = tempfile.mkdtemp(dir=TEMP_DIR_BASE)
    video_path = None
    result = {
        "process_id": "",
        "summary": {},
        "caption": "",
    }

    try:
        platform_id = "IG"
        shortcode = "unknown"

        if file and file.filename:
            filename = secure_filename(file.filename)
            video_path = save_uploaded_file(file, temp_dir)
            shortcode = get_unique_id(filename).rstrip("-")
            result["process_id"] = f"{shortcode}--{get_timestamp()}--{get_unique_id(url or filename)}"
            logger.info(f"📁 File upload: {result['process_id']}")
        else:
            platform_id = detect_platform(url)
            shortcode = _extract_shortcode(url, platform_id)
            logger.info(f"🔗 Processing {platform_id} URL: {url}")

            shortcode = shortcode.rstrip("-")

            if not shortcode or shortcode in ("unknown", "None"):
                shortcode = f"{platform_id.lower()}_{uuid.uuid4().hex[:10]}"
                logger.info(f"🔄 Assigned dynamic shortcode: {shortcode}")

            result["process_id"] = f"{shortcode}--{get_timestamp()}--{get_unique_id(url)}"
            video_path = os.path.join(temp_dir, f"{result['process_id']}.mp4")
            logger.info(f"🆔 Process ID: {result['process_id']}")
            logger.info("⏭️ Skipping metadata fetch - will be done in background")

        # Prefer user-scoped GCS paths if supported by generate_gcs_paths()
        try:
            gcs_paths = generate_gcs_paths(shortcode, platform_id, user_id=user_id)
        except TypeError:
            gcs_paths = generate_gcs_paths(shortcode, platform_id)

        result["gcs_paths"] = gcs_paths

        logger.info("⏭️ Skipping thumbnail generation - will be done in background")

        result["gcs_urls"] = {
            "preview_thumbnail": None,
            "video": None,
            "result_json": None,
        }
        gcs_urls_json = json.dumps(result["gcs_urls"])

        logger.info("💾 Inserting into database...")
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
        logger.info("✅ Database record created (caption/author will be added by background)")

    except Exception as e:
        logger.error(f"❌ Error in main processing: {e}", exc_info=True)
        return jsonify({"error": "Internal error"}), 500

    try:
        logger.info("🚀 Starting background processing thread...")
        threading.Thread(
            target=background_process,
            args=(result, video_path, temp_dir, shortcode, "", url, save_to_gcs, "", None, user_id),
            daemon=True,
        ).start()
        logger.info("✅ Background thread started")
    except Exception as e:
        logger.error(f"❌ Failed to start background thread: {e}", exc_info=True)

    return jsonify({
        "status": "processing",
        "reel_id": result["process_id"],
        "preview_url": None,
    })