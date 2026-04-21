# fetcher_api/api/routes.py
"""
Main API routes - Simple endpoints and health checks
"""
import os
import re
import json
import logging
import tempfile
import threading
import uuid
from datetime import datetime
from flask import Blueprint, jsonify, request

from fetcher_api.adapters.db import fetch_one, fetch_all, execute, get_user_tier, count_user_reels
from fetcher_api.api.helpers.auth import get_user_id_from_request

logger = logging.getLogger("api")

api_bp = Blueprint("api", __name__)

SAVE_DIR = os.path.normpath(
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "saved_reels")
)
os.makedirs(SAVE_DIR, exist_ok=True)

FRONTEND_BASE_URL = os.getenv("FRONTEND_BASE_URL", "http://localhost:3000")

# Business Logic Limits
PLAN_LIMITS = {
    "free": 10,
    "pro": 99999,
    "admin": 99999,
}


def _detect_platform_code(url: str) -> str:
    url_lower = (url or "").lower()

    if "youtube.com" in url_lower or "youtu.be" in url_lower:
        return "YT"
    if "tiktok.com" in url_lower:
        return "TT"
    if "facebook.com" in url_lower or "fb." in url_lower:
        return "FB"
    return "IG"


def _extract_shortcode_for_url(url: str, platform_id: str) -> str:
    """
    Best-effort stable ID extraction per platform.
    Falls back to empty string so caller can generate a synthetic shortcode.
    """
    try:
        if platform_id in {"IG", "FB"}:
            from fetcher_api.adapters.meta_client import meta_client
            return (meta_client.extract_shortcode(url) or "").strip()
    except Exception:
        logger.warning("⚠️ meta_client.extract_shortcode failed", exc_info=True)

    if platform_id == "YT":
        try:
            from fetcher_api.api.helpers.normalizers import extract_youtube_id
            return (extract_youtube_id(url) or "").strip()
        except Exception:
            logger.warning("⚠️ extract_youtube_id failed", exc_info=True)
            return ""

    if platform_id == "TT":
        m = re.search(r"/video/(\d+)", url or "")
        if m:
            return m.group(1).strip()

    return ""


@api_bp.route("/", methods=["GET"])
def root():
    """API health check"""
    return jsonify({"ok": True, "message": "Rekolekt API active"})


@api_bp.route("/health", methods=["GET"])
def health():
    """Detailed health check"""
    return jsonify({
        "status": "healthy",
        "service": "recolekt-api",
        "version": "2.0.0",
    })


@api_bp.route("/plan", methods=["GET"])
def get_plan_route():
    """Get user's subscription plan from the users table"""
    try:
        user_id = get_user_id_from_request()
    except ValueError:
        return jsonify({"error": "Authentication required"}), 401

    tier = get_user_tier(user_id)
    return jsonify({"plan": tier})


@api_bp.route("/saves/count", methods=["GET"])
def count_saves_route():
    """Get count of user's saved reels"""
    try:
        user_id = get_user_id_from_request()
    except ValueError:
        return jsonify({"error": "Authentication required"}), 401

    count = count_user_reels(user_id)
    return jsonify({"count": count})


# ---------------------------------------------------------
# SEARCH
# ---------------------------------------------------------


@api_bp.route("/search", methods=["GET"])
def search_reels():
    """
    Full-text search across the user's reels using PostgreSQL tsvector.
    Supports prefix matching so partial words like "spag" match "spaghetti".

    Query params:
      q         — search string (required)
      folder_id — optional filter: a folder UUID, 'favorites', or 'unsorted'
    """
    try:
        user_id = get_user_id_from_request()
    except ValueError:
        return jsonify({"error": "Authentication required"}), 401

    raw_q = request.args.get("q", "").strip()
    folder_id = request.args.get("folder_id", "").strip() or None

    if not raw_q:
        return jsonify([])

    # Build a safe prefix tsquery: "spag bol" → "spag:* & bol:*"
    tokens = re.findall(r"\w+", raw_q.lower())
    if not tokens:
        return jsonify([])
    tsquery = " & ".join(f"{t}:*" for t in tokens)

    sql = """
        SELECT r.*, ts_rank_cd(r.search_vector, query) AS rank
        FROM   reels r,
               to_tsquery('english', %s) AS query
        WHERE  r.user_id = %s
          AND  r.search_vector @@ query
    """
    params = [tsquery, user_id]

    if folder_id and folder_id != "all":
        if folder_id == "favorites":
            sql += " AND r.is_favorite = TRUE"
        elif folder_id == "unsorted":
            sql += " AND (r.folder_id IS NULL OR r.folder_id = 'unsorted')"
        else:
            sql += " AND r.folder_id = %s"
            params.append(folder_id)

    sql += " ORDER BY rank DESC LIMIT 100"

    rows = fetch_all(sql, tuple(params))

    def serialize(row):
        out = {}
        for k, v in dict(row).items():
            if hasattr(v, "isoformat"):
                out[k] = v.isoformat()
            else:
                out[k] = v
        return out

    return jsonify([serialize(r) for r in rows])


# ---------------------------------------------------------
# API TOKEN MANAGEMENT
# ---------------------------------------------------------


@api_bp.route("/api_token/generate", methods=["POST"])
def generate_api_token_route():
    """Generate a new API token for the logged-in user"""
    try:
        user_id = get_user_id_from_request()
    except ValueError:
        return jsonify({"error": "Authentication required"}), 401

    from fetcher_api.utils.tokens import generate_api_token, hash_token, get_token_prefix

    token = generate_api_token()
    token_hash = hash_token(token)
    token_prefix = get_token_prefix(token)

    # Deactivate old tokens
    execute(
        "UPDATE user_api_tokens SET is_active = FALSE WHERE user_id = %s;",
        (user_id,),
    )

    # Insert new token
    execute(
        """
        INSERT INTO user_api_tokens (user_id, token_hash, token_prefix)
        VALUES (%s, %s, %s);
        """,
        (user_id, token_hash, token_prefix),
    )

    logger.info("✅ Generated API token for user %s", user_id)

    return jsonify({
        "ok": True,
        "token": token,
        "prefix": token_prefix,
    })


@api_bp.route("/api_token/info", methods=["GET"])
def get_api_token_info():
    """Get info about user's current token (not the token itself)"""
    try:
        user_id = get_user_id_from_request()
    except ValueError:
        return jsonify({"error": "Authentication required"}), 401

    row = fetch_one(
        """
        SELECT token_prefix, created_at, last_used_at, is_active
        FROM user_api_tokens
        WHERE user_id = %s AND is_active = TRUE
        ORDER BY created_at DESC
        LIMIT 1;
        """,
        (user_id,),
    )

    if not row:
        return jsonify({"has_token": False})

    return jsonify({
        "has_token": True,
        "prefix": row.get("token_prefix"),
        "created_at": row.get("created_at").isoformat() if row.get("created_at") else None,
        "last_used_at": row.get("last_used_at").isoformat() if row.get("last_used_at") else None,
    })


@api_bp.route("/api_token/revoke", methods=["POST"])
def revoke_api_token():
    """Revoke user's API token"""
    try:
        user_id = get_user_id_from_request()
    except ValueError:
        return jsonify({"error": "Authentication required"}), 401

    execute(
        "UPDATE user_api_tokens SET is_active = FALSE WHERE user_id = %s;",
        (user_id,),
    )

    logger.info("🔒 Revoked API tokens for user %s", user_id)

    return jsonify({"ok": True})


# ---------------------------------------------------------
# IMPORT SHARE (from iOS Shortcuts)
# ---------------------------------------------------------


@api_bp.route("/api/import_share", methods=["POST"])
def import_share():
    """
    Accept URL from iOS Shortcut (or other client) with Bearer token auth.
    Triggers background processing and returns a link to open.
    """
    auth_header = request.headers.get("Authorization", "")

    if not auth_header.startswith("Bearer "):
        return jsonify({"error": "Missing or invalid Authorization header"}), 401

    token = auth_header.replace("Bearer ", "").strip()

    if not token:
        return jsonify({"error": "Empty token"}), 401

    from fetcher_api.utils.tokens import hash_token
    token_hash = hash_token(token)

    row = fetch_one(
        """
        SELECT user_id
        FROM user_api_tokens
        WHERE token_hash = %s AND is_active = TRUE;
        """,
        (token_hash,),
    )

    if not row:
        logger.warning("⚠️ Invalid API token attempt")
        return jsonify({"error": "Invalid or expired token"}), 401

    user_id = row.get("user_id")

    execute(
        "UPDATE user_api_tokens SET last_used_at = NOW() WHERE token_hash = %s;",
        (token_hash,),
    )

    data = request.get_json()
    if not data or not data.get("url"):
        return jsonify({"error": "Missing 'url' in request body"}), 400

    url = data.get("url").strip()
    client = data.get("client", "unknown")
    force = bool(data.get("force", False))

    logger.info("📲 Import share from %s for user %s: %s (force=%s)", client, user_id, url, force)

    # 1. Duplicate check — skipped when force=True
    from fetcher_api.services.db_insert import check_duplicate_reel
    if not force and check_duplicate_reel(user_id, url):
        return jsonify({
            "ok": False,
            "error": "duplicate",
            "message": "This video has already been saved.",
        }), 409

    # 2. Plan limit check
    tier = get_user_tier(user_id)
    current_count = count_user_reels(user_id)
    limit = PLAN_LIMITS.get(tier, 10)

    if current_count >= limit:
        logger.warning("🚫 User %s (%s) hit save limit: %s/%s", user_id, tier, current_count, limit)
        return jsonify({
            "ok": False,
            "error": "limit_reached",
            "message": f"{tier.capitalize()} plan limit reached ({limit} saves). Upgrade to Pro for unlimited saves.",
            "upgrade": True,
        }), 403

    # ---------------------------------------------------------
    # Platform Detection and Routing
    # ---------------------------------------------------------
    from fetcher_api.utils.timestamps import get_timestamp, get_unique_id
    from fetcher_api.services.storage import generate_gcs_paths
    from fetcher_api.api.helpers.processing import background_process

    platform_id = _detect_platform_code(url)
    is_facebook = platform_id == "FB"

    shortcode = _extract_shortcode_for_url(url, platform_id) or "unknown"
    shortcode = shortcode.strip()

    if not shortcode or shortcode.lower() == "unknown" or shortcode == "None":
        shortcode = f"{platform_id.lower()}_{uuid.uuid4().hex[:10]}"
        logger.info("🔄 Assigned dynamic shortcode: %s", shortcode)

    process_id = f"{shortcode}_{get_timestamp()}_{get_unique_id(url)}"
    temp_dir = tempfile.mkdtemp()
    video_path = os.path.join(temp_dir, f"{process_id}.mp4")

    try:
        if is_facebook:
            from fetcher_api.adapters.meta_client import meta_client
            dl = meta_client.download_video(url, video_path)
        else:
            from fetcher_api.services.video_analysis import download_instagram_video
            dl = download_instagram_video(url, video_path)

        if not dl.get("success"):
            return jsonify({
                "ok": False,
                "error": "download_failed",
                "message": "Failed to download video",
            }), 400

        metadata = dl.get("metadata") or {}
        caption = metadata.get("caption", "") or ""
        author_name = metadata.get("username", "") or ""

        gcs_paths = generate_gcs_paths(shortcode, platform_id, user_id=user_id)

        preview_record = {
            "process_id": process_id,
            "status": "processing",
            "source_url": url,
            "folder_id": "unsorted",
            "caption": caption,
            "author_name": author_name,
            "content_type": "general",
            "summary": {
                "english": {
                    "title": "Processing…",
                    "summary": "",
                    "headlines": [],
                    "hashtags": [],
                    "emojis": [],
                },
                "original": {
                    "title": "Processing…",
                    "summary": "",
                    "headlines": [],
                    "hashtags": [],
                    "emojis": [],
                },
            },
            "gcs_urls": {},
            "created_at": datetime.utcnow().isoformat(),
        }

        early_path = os.path.join(SAVE_DIR, f"{process_id}.json")
        with open(early_path, "w", encoding="utf-8") as f:
            json.dump(preview_record, f, ensure_ascii=False, indent=2)

        threading.Thread(
            target=background_process,
            args=(
                {"process_id": process_id, "gcs_paths": gcs_paths},
                video_path,
                temp_dir,
                shortcode,
                caption,
                url,
                True,
                author_name,
                SAVE_DIR,
                user_id,
                force,
            ),
            daemon=True,
        ).start()

        logger.info("✅ Started processing %s (%s) via import_share", process_id, platform_id)

        open_url = f"{FRONTEND_BASE_URL}/gallery/all?refresh=1"

        return jsonify({
            "ok": True,
            "reel_id": process_id,
            "open_url": open_url,
            "message": "Processing started",
        })

    except Exception as e:
        logger.error("❌ Import share error: %s", e)
        return jsonify({
            "ok": False,
            "error": "processing_error",
            "message": str(e),
        }), 500