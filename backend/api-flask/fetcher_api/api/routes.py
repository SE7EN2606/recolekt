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
from decimal import Decimal

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


def _find_duplicate_reel(user_id: str, url: str, shortcode: str | None = None):
    """
    A reel must be unique per user.

    Match by exact source_url first, then by shortcode embedded in the generated id.
    This blocks duplicates even if the incoming URL has slightly different formatting.
    """
    url = (url or "").strip()
    shortcode = (shortcode or "").strip()

    try:
        if shortcode:
            return fetch_one(
                """
                SELECT id, status, gcs_urls, created_at
                FROM reels
                WHERE user_id = %s
                  AND (
                        source_url = %s
                        OR id LIKE %s
                  )
                ORDER BY created_at DESC NULLS LAST
                LIMIT 1
                """,
                (user_id, url, f"{shortcode}--%"),
            )

        return fetch_one(
            """
            SELECT id, status, gcs_urls, created_at
            FROM reels
            WHERE user_id = %s AND source_url = %s
            ORDER BY created_at DESC NULLS LAST
            LIMIT 1
            """,
            (user_id, url),
        )

    except Exception as exc:
        logger.warning(
            "⚠️ Duplicate lookup failed for user=%s url=%s shortcode=%s: %s",
            user_id,
            url,
            shortcode,
            exc,
        )

    return None


def _json_loads_maybe(value, default=None):
    if value is None:
        return default
    if isinstance(value, (dict, list)):
        return value
    if isinstance(value, str):
        try:
            return json.loads(value)
        except Exception:
            return default if default is not None else value
    return default if default is not None else value


def _json_safe(value):
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, list):
        return [_json_safe(v) for v in value]
    if isinstance(value, dict):
        return {k: _json_safe(v) for k, v in value.items()}
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return value


def _normalize_content_type(raw: str | None) -> str:
    ct = (raw or "").strip().lower()
    if not ct or ct in {"generic", "summary"}:
        return "general"
    if ct == "tools":
        return "products"
    if ct == "places":
        return "location"
    if ct in {"recipe", "workout", "location", "products", "software", "finance", "general"}:
        return ct
    return "general"


def _build_gallery_summary(row_dict: dict) -> dict:
    summary = _json_loads_maybe(row_dict.get("summary_text"), default={})

    if isinstance(summary, dict):
        if "english" in summary or "original" in summary:
            return summary

        title = row_dict.get("summary_title") or row_dict.get("caption") or "Untitled"
        summary_text = summary.get("summary") if isinstance(summary.get("summary"), str) else ""
        return {
            "title": title,
            "english": {
                "title": title,
                "summary": summary_text,
                "headlines": summary.get("headlines", []) if isinstance(summary.get("headlines"), list) else [],
                "hashtags": summary.get("hashtags", []) if isinstance(summary.get("hashtags"), list) else [],
                "emojis": summary.get("emojis", []) if isinstance(summary.get("emojis"), list) else [],
            },
        }

    if isinstance(summary, str) and summary.strip():
        title = row_dict.get("summary_title") or row_dict.get("caption") or "Untitled"
        return {
            "title": title,
            "english": {
                "title": title,
                "summary": summary,
                "headlines": [],
                "hashtags": [],
                "emojis": [],
            },
        }

    title = row_dict.get("summary_title") or row_dict.get("caption") or "Untitled"
    return {
        "title": title,
        "english": {
            "title": title,
            "summary": "",
            "headlines": [],
            "hashtags": [],
            "emojis": [],
        },
    }


def _serialize_reel_row(row) -> dict:
    row_dict = dict(row) if hasattr(row, "keys") else row._asdict()

    payload = {
        "id": row_dict.get("id"),
        "process_id": row_dict.get("id"),
        "user_id": row_dict.get("user_id"),
        "source_url": row_dict.get("source_url"),
        "folder_id": row_dict.get("folder_id") or "unsorted",
        "is_favorite": bool(row_dict.get("is_favorite")),
        "status": row_dict.get("status"),
        "content_type": _normalize_content_type(row_dict.get("content_type")),
        "created_at": row_dict.get("created_at"),
        "caption": row_dict.get("caption") or "",
        "author_name": row_dict.get("author_name") or "Unknown",
        "duration": row_dict.get("duration"),
        "transcription": _json_loads_maybe(row_dict.get("transcription"), default=row_dict.get("transcription")),
        "recipe": _json_loads_maybe(row_dict.get("recipe"), default=row_dict.get("recipe")),
        "workout": _json_loads_maybe(row_dict.get("workout"), default=row_dict.get("workout")),
        "tools_list": _json_loads_maybe(row_dict.get("tools_list"), default=row_dict.get("tools_list")),
        "location": _json_loads_maybe(row_dict.get("location"), default=row_dict.get("location")),
        "gcs_urls": _json_loads_maybe(row_dict.get("gcs_urls"), default={}) or {},
        "summary_title": row_dict.get("summary_title"),
        "error_message": row_dict.get("error_message"),
    }

    payload["summary"] = _build_gallery_summary(row_dict)

    return _json_safe(payload)


@api_bp.route("/", methods=["GET"])
def root():
    return jsonify({"ok": True, "message": "Rekolekt API active"})


@api_bp.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status": "healthy",
        "service": "recolekt-api",
        "version": "2.0.0",
    })


@api_bp.route("/plan", methods=["GET"])
def get_plan_route():
    try:
        user_id = get_user_id_from_request()
    except ValueError:
        return jsonify({"error": "Authentication required"}), 401

    tier = get_user_tier(user_id)
    return jsonify({"plan": tier})


@api_bp.route("/saves/count", methods=["GET"])
def count_saves_route():
    try:
        user_id = get_user_id_from_request()
    except ValueError:
        return jsonify({"error": "Authentication required"}), 401

    count = count_user_reels(user_id)
    return jsonify({"count": count})


@api_bp.route("/saved_reels", methods=["GET", "OPTIONS"])
def saved_reels():
    if request.method == "OPTIONS":
        return "", 200

    try:
        user_id = get_user_id_from_request()
    except ValueError:
        return jsonify({"error": "Authentication required"}), 401

    page = max(int(request.args.get("page", 1) or 1), 1)
    per_page = min(max(int(request.args.get("per_page", 100) or 100), 1), 200)
    offset = (page - 1) * per_page

    rows = fetch_all(
        """
        SELECT
            id,
            user_id,
            source_url,
            folder_id,
            is_favorite,
            status,
            content_type,
            created_at,
            caption,
            author_name,
            duration,
            transcription,
            recipe,
            workout,
            tools_list,
            location,
            gcs_urls,
            summary_title,
            summary_text,
            error_message
        FROM reels
        WHERE user_id = %s
        ORDER BY created_at DESC NULLS LAST
        LIMIT %s OFFSET %s
        """,
        (user_id, per_page, offset),
    )

    reels = [_serialize_reel_row(r) for r in rows]
    return jsonify({
        "reels": reels,
        "page": page,
        "per_page": per_page,
        "count": len(reels),
    })


@api_bp.route("/search", methods=["GET"])
def search_reels():
    try:
        user_id = get_user_id_from_request()
    except ValueError:
        return jsonify({"error": "Authentication required"}), 401

    raw_q = request.args.get("q", "").strip()
    folder_id = request.args.get("folder_id", "").strip() or None

    if not raw_q:
        return jsonify([])

    tokens = re.findall(r"\w+", raw_q.lower())
    if not tokens:
        return jsonify([])

    tsquery = " & ".join(f"{t}:*" for t in tokens)

    sql = """
        SELECT r.*, ts_rank_cd(r.search_vector, query) AS rank
        FROM reels r,
             to_tsquery('english', %s) AS query
        WHERE r.user_id = %s
          AND r.search_vector @@ query
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

    results = []
    for r in rows:
        try:
            results.append(_serialize_reel_row(r))
        except Exception:
            try:
                row_dict = dict(r) if hasattr(r, "keys") else {}
                bad_id = row_dict.get("id")
            except Exception:
                bad_id = None

            logger.exception("Failed to serialize search reel row id=%s", bad_id)

    return jsonify(results)


@api_bp.route("/api_token/generate", methods=["POST"])
def generate_api_token_route():
    try:
        user_id = get_user_id_from_request()
    except ValueError:
        return jsonify({"error": "Authentication required"}), 401

    from fetcher_api.utils.tokens import generate_api_token, hash_token, get_token_prefix

    token = generate_api_token()
    token_hash = hash_token(token)
    token_prefix = get_token_prefix(token)

    execute(
        "UPDATE user_api_tokens SET is_active = FALSE WHERE user_id = %s;",
        (user_id,),
    )

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


@api_bp.route("/api/import_share", methods=["POST"])
def import_share():
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

    data = request.get_json(silent=True) or {}
    if not data or not data.get("url"):
        return jsonify({"error": "Missing 'url' in request body"}), 400

    url = data.get("url").strip()
    client = data.get("client", "unknown")
    force = bool(data.get("force", False))

    logger.info("📲 Import share from %s for user %s: %s (force=%s)", client, user_id, url, force)

    platform_id = _detect_platform_code(url)
    shortcode = _extract_shortcode_for_url(url, platform_id) or "unknown"
    shortcode = shortcode.strip()

    if not shortcode or shortcode.lower() == "unknown" or shortcode == "None":
        shortcode = f"{platform_id.lower()}_{uuid.uuid4().hex[:10]}"
        logger.info("🔄 Assigned dynamic shortcode: %s", shortcode)

    existing_duplicate = _find_duplicate_reel(user_id, url, shortcode)

    if existing_duplicate and not force:
        logger.info(
            "📌 Duplicate import_share blocked: user=%s existing=%s url=%s",
            user_id,
            existing_duplicate.get("id"),
            url,
        )
        return jsonify({
            "ok": False,
            "error": "duplicate",
            "duplicate": True,
            "reel_id": existing_duplicate.get("id"),
            "process_id": existing_duplicate.get("id"),
            "message": "This video has already been saved.",
        }), 409

    if existing_duplicate and force:
        logger.info(
            "⚠️ Force import_share requested; deleting existing duplicate first: %s",
            existing_duplicate.get("id"),
        )
        execute(
            "DELETE FROM reels WHERE id = %s AND user_id = %s",
            (existing_duplicate.get("id"), user_id),
        )

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

    from fetcher_api.utils.timestamps import get_timestamp, get_unique_id
    from fetcher_api.services.storage import generate_gcs_paths
    from fetcher_api.api.helpers.processing import background_process

    is_facebook = platform_id == "FB"

    process_id = f"{shortcode}--{get_timestamp()}--{get_unique_id(url)}"
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
            "process_id": process_id,
            "open_url": open_url,
            "message": "Processing started",
        })

    except Exception as e:
        logger.error("❌ Import share error: %s", e, exc_info=True)
        return jsonify({
            "ok": False,
            "error": "processing_error",
            "message": str(e),
        }), 500