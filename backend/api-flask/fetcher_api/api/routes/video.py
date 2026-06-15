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
from fetcher_api.services.social_ingestion import (
    create_reused_social_reel,
    find_reusable_social_reel,
)
from fetcher_api.services.storage import generate_gcs_paths
from fetcher_api.services.social_urls import (
    SocialUrlResult,
    canonicalize_social_url,
    facebook_share_url_variants,
    has_stable_duplicate_url,
    is_facebook_share_url,
)
from fetcher_api.api.helpers.auth import get_user_id_from_request

logger = logging.getLogger("video")

EXTRACTION_DAILY_LIMIT_TOTAL = int(os.getenv("EXTRACTION_DAILY_LIMIT_TOTAL", "50"))
NON_RETRYABLE_SOCIAL_ERRORS = {
    "social_cookies_expired",
    "social_login_required",
    "social_rate_limited",
}


def _count_extractions_today() -> int:
    row = fetch_one(
        """
        SELECT COUNT(*) AS count
        FROM reels
        WHERE created_at >= DATE_TRUNC('day', NOW())
          AND created_at < DATE_TRUNC('day', NOW()) + INTERVAL '1 day'
        """
    ) or {}
    try:
        return int(dict(row).get("count") or 0)
    except Exception:
        return 0


def _extraction_limit_reached() -> bool:
    if EXTRACTION_DAILY_LIMIT_TOTAL <= 0:
        return False
    return _count_extractions_today() >= EXTRACTION_DAILY_LIMIT_TOTAL


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
            raw_data,
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
        match = re.search(r"/video/(\d+)", url or "")
        return match.group(1) if match else "unknown"

    return meta_client.extract_shortcode(url) or "unknown"


def _shortcode_from_existing_reel(reel_id: str, source_url: str, platform: str) -> str:
    """Prefer the stable id prefix for refreshes so old rows keep their identity."""
    if reel_id:
        prefix = str(reel_id).split("--", 1)[0].strip().rstrip("-")
        if prefix and prefix.lower() not in {"unknown", "none", "null"}:
            return prefix

    shortcode = (_extract_shortcode(source_url, platform) or "unknown").rstrip("-").strip()
    if shortcode and shortcode.lower() not in {"unknown", "none", "null"}:
        return shortcode

    return f"{platform.lower()}_{uuid.uuid4().hex[:10]}"


def _mark_reel_refresh_failed(reel_id: str, user_id: str, message: str):
    try:
        execute(
            """
            UPDATE reels
            SET status = 'error',
                error_message = %s,
                updated_at = NOW()
            WHERE id = %s AND user_id = %s
            """,
            (message[:500], reel_id, user_id),
        )
    except Exception:
        logger.exception("❌ Failed to mark refresh error for reel=%s user=%s", reel_id, user_id)


def _queue_existing_reel_refresh(
    reel_id: str,
    user_id: str,
    source_url: str,
    save_to_gcs: bool = True,
):
    if not source_url:
        return {
            "payload": {
                "error": "missing_source_url",
                "message": "This video cannot be refreshed because it has no source URL.",
            },
            "status_code": 400,
        }

    if not is_supported_url(source_url):
        return {
            "payload": {
                "error": "unsupported_platform",
                "message": "Only Instagram, Facebook, YouTube, and TikTok URLs can be refreshed.",
            },
            "status_code": 422,
        }

    url_result = canonicalize_social_url(source_url, resolve_facebook_redirects=True)
    processing_url = url_result.canonical_url or source_url
    if url_result.platform == "facebook" and url_result.content_id:
        source_url = processing_url

    platform_id = detect_platform(processing_url)
    shortcode = (
        url_result.content_id
        if platform_id == "FB" and url_result.content_id
        else _shortcode_from_existing_reel(reel_id, processing_url, platform_id)
    )
    shortcode = (shortcode or "unknown").rstrip("-").strip()

    try:
        gcs_paths = generate_gcs_paths(shortcode, platform_id, user_id=user_id)
    except TypeError:
        gcs_paths = generate_gcs_paths(shortcode, platform_id)

    result = {
        "process_id": reel_id,
        "id": reel_id,
        "user_id": user_id,
        "source_url": source_url,
        "summary": {},
        "caption": "",
        "gcs_paths": gcs_paths,
        "gcs_urls": {},
    }

    try:
        execute(
            """
            UPDATE reels
            SET status = 'processing',
                error_message = NULL,
                updated_at = NOW()
            WHERE id = %s AND user_id = %s
            """,
            (reel_id, user_id),
        )
        logger.info(
            "🔄 Refresh queued reel=%s user=%s platform=%s shortcode=%s canonical_key=%s",
            reel_id,
            user_id,
            platform_id,
            shortcode,
            url_result.canonical_key,
        )
    except Exception as exc:
        logger.error("❌ Failed to mark reel processing for refresh reel=%s user=%s: %s", reel_id, user_id, exc, exc_info=True)
        return {
            "payload": {
                "error": "refresh_failed",
                "message": "Refresh could not be started.",
            },
            "status_code": 500,
        }

    temp_dir = tempfile.mkdtemp(dir=TEMP_DIR_BASE)
    video_path = os.path.join(temp_dir, f"{reel_id}.mp4")

    try:
        threading.Thread(
            target=_refresh_reel_background,
            args=(result, video_path, temp_dir, shortcode, source_url, user_id, save_to_gcs),
            daemon=True,
        ).start()
    except Exception as exc:
        logger.error("❌ Failed to start refresh thread reel=%s user=%s: %s", reel_id, user_id, exc, exc_info=True)
        try:
            os.rmdir(temp_dir)
        except Exception:
            pass
        _mark_reel_refresh_failed(reel_id, user_id, str(exc))
        return {
            "payload": {
                "error": "refresh_failed",
                "message": "Refresh could not be started.",
            },
            "status_code": 500,
        }

    return {
        "payload": {
            "status": "processing",
            "duplicate": False,
            "reprocessing": True,
            "reel_id": reel_id,
            "process_id": reel_id,
        },
        "status_code": 202,
    }


def _refresh_reel_background(
    result,
    video_path,
    temp_dir,
    shortcode,
    source_url,
    user_id,
    save_to_gcs=True,
):
    try:
        background_process(
            result,
            video_path,
            temp_dir,
            shortcode,
            "",
            source_url,
            save_to_gcs,
            "",
            None,
            user_id,
            force=True,
        )
    except Exception as exc:
        logger.exception("❌ Refresh background failed reel=%s user=%s", result.get("process_id"), user_id)
        _mark_reel_refresh_failed(result.get("process_id"), user_id, str(exc))


def _find_existing_reel(user_id: str, url_result: SocialUrlResult, shortcode: str | None = None):
    """
    A reel must be unique per user.

    Instagram keeps its shortcode lookup. Facebook only matches stable reel/video
    IDs from canonical URLs, never opaque share tokens.
    """
    if not user_id:
        return None

    shortcode = (shortcode or "").strip()
    url = (url_result.canonical_url or "").strip()
    original_is_facebook_share = is_facebook_share_url(url_result.original_url)

    try:
        if url_result.platform == "facebook" and url_result.content_id:
            content_id = url_result.content_id
            existing = fetch_one(
                """
                SELECT id, status, gcs_urls, source_url, summary_title, error_message, created_at
                FROM reels
                WHERE user_id = %s
                  AND (
                        source_url ~* %s
                     OR source_url ~* %s
                     OR source_url ~* %s
                     OR source_url ~* %s
                  )
                ORDER BY created_at DESC NULLS LAST
                LIMIT 1
                """,
                (
                    user_id,
                    rf"facebook\.com/reels?/{content_id}([/?#]|$)",
                    rf"facebook\.com/(?:[^/?#]+/)?videos/(?:[^/?#]+/)?{content_id}([/?#]|$)",
                    rf"facebook\.com/watch[^#]*[?&]v={content_id}([&#]|$)",
                    rf"facebook\.com/video\.php[^#]*[?&]v={content_id}([&#]|$)",
                ),
            )
            if existing:
                logger.info(
                    "📌 Duplicate by canonical key user=%s canonical_key=%s existing=%s",
                    user_id,
                    url_result.canonical_key,
                    existing.get("id"),
                )
                return existing

        if original_is_facebook_share:
            share_variants = facebook_share_url_variants(url_result.original_url)
            placeholders = ", ".join(["%s"] * len(share_variants))
            existing = fetch_one(
                f"""
                SELECT id, status, gcs_urls, source_url, summary_title, error_message, created_at
                FROM reels
                WHERE user_id = %s AND source_url IN ({placeholders})
                ORDER BY created_at DESC NULLS LAST
                LIMIT 1
                """,
                (user_id, *share_variants),
            )
            if existing:
                logger.info(
                    "📌 Duplicate by exact historical Facebook share URL fallback user=%s existing=%s original_url=%s source_url=%s",
                    user_id,
                    existing.get("id"),
                    url_result.original_url,
                    existing.get("source_url"),
                )
                return existing

            if not url_result.content_id:
                logger.info(
                    "ℹ️ No duplicate: Facebook share URL did not resolve to a content ID and no exact historical share URL exists user=%s original_url=%s resolution=%s",
                    user_id,
                    url_result.original_url,
                    url_result.resolution_status,
                )
            else:
                logger.info(
                    "ℹ️ No duplicate by canonical key or exact historical Facebook share URL user=%s canonical_key=%s original_url=%s",
                    user_id,
                    url_result.canonical_key,
                    url_result.original_url,
                )
            return None

        if url_result.platform == "instagram" and shortcode:
            return fetch_one(
                """
                SELECT id, status, gcs_urls, source_url, summary_title, error_message, created_at
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

        if has_stable_duplicate_url(url_result):
            return fetch_one(
                """
                SELECT id, status, gcs_urls, source_url, summary_title, error_message, created_at
                FROM reels
                WHERE user_id = %s AND source_url = %s
                ORDER BY created_at DESC NULLS LAST
                LIMIT 1
                """,
                (user_id, url),
            )

    except Exception as exc:
        logger.warning(
            "⚠️ Duplicate lookup failed for user=%s canonical_key=%s url=%s shortcode=%s: %s",
            user_id,
            url_result.canonical_key,
            url,
            shortcode,
            exc,
        )

    return None


def _preview_url_from_reel(row) -> str | None:
    if not row:
        return None

    row_dict = dict(row) if hasattr(row, "keys") else row._asdict()

    gcs_urls = row_dict.get("gcs_urls") or {}
    if isinstance(gcs_urls, str):
        try:
            gcs_urls = json.loads(gcs_urls)
        except Exception:
            gcs_urls = {}

    if not isinstance(gcs_urls, dict):
        return None

    return (
        gcs_urls.get("preview_thumbnail")
        or gcs_urls.get("thumbnail")
        or gcs_urls.get("thumbnail_url")
        or gcs_urls.get("poster")
        or gcs_urls.get("poster_url")
    )


def _duplicate_response(existing_reel, url_result: SocialUrlResult) -> dict:
    existing = dict(existing_reel) if hasattr(existing_reel, "keys") else existing_reel._asdict()
    existing_id = existing.get("id")
    return {
        "status": existing.get("status") or "processing",
        "duplicate": True,
        "code": "duplicate_reel",
        "message": "Already saved — this video is already in your Recolekt library.",
        "existingReelId": existing_id,
        "existingReelUrl": f"/video/{existing_id}",
        "canonicalKey": url_result.canonical_key,
        "originalUrl": url_result.original_url,
        "canonicalUrl": url_result.canonical_url or None,
        "sourceUrl": existing.get("source_url"),
        "title": existing.get("summary_title"),
        "errorCode": existing.get("error_message"),
        "preview_url": _preview_url_from_reel(existing_reel),
    }


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
            "message": "Only Instagram, Facebook, YouTube, and TikTok URLs are supported.",
        }), 422

    platform_id = "IG"
    shortcode = "unknown"

    if url:
        url = str(url).strip()
        url_result = canonicalize_social_url(url, resolve_facebook_redirects=True)
        logger.info(
            "🔗 URL canonicalization platform=%s status=%s key=%s original=%s resolved=%s",
            url_result.platform,
            url_result.resolution_status,
            url_result.canonical_key,
            url_result.original_url,
            url_result.resolved_url,
        )

        processing_url = url_result.canonical_url or url
        if url_result.platform == "facebook" and url_result.content_id:
            url = processing_url

        platform_id = detect_platform(processing_url)
        shortcode = url_result.content_id if platform_id == "FB" else _extract_shortcode(processing_url, platform_id)
        shortcode = (shortcode or "unknown").rstrip("-").strip()

        if not shortcode or shortcode in {"unknown", "None"}:
            shortcode = f"{platform_id.lower()}_{uuid.uuid4().hex[:10]}"
            logger.info(f"🔄 Assigned dynamic shortcode: {shortcode}")

        existing_reel = _find_existing_reel(user_id, url_result, shortcode)

        if existing_reel:
            existing_id = existing_reel.get("id")
            existing_status = existing_reel.get("status") or "processing"

            logger.info(
                "📌 Duplicate reel blocked before processing: existing=%s user=%s canonical_key=%s original_url=%s canonical_url=%s",
                existing_id,
                user_id,
                url_result.canonical_key,
                url_result.original_url,
                url_result.canonical_url,
            )

            existing_error_code = existing_reel.get("error_message")
            if force_retry:
                logger.info("🔄 Reprocessing requested for existing reel %s; preserving row and refreshing in place", existing_id)
                queued = _queue_existing_reel_refresh(existing_id, user_id, existing_reel.get("source_url") or processing_url or url, save_to_gcs)
                return jsonify(queued["payload"]), queued["status_code"]
            elif existing_status == "error" and existing_error_code in NON_RETRYABLE_SOCIAL_ERRORS:
                logger.info(
                    "🚫 Not retrying non-retryable social extraction error existing=%s user=%s error_code=%s",
                    existing_id,
                    user_id,
                    existing_error_code,
                )
                return jsonify(_duplicate_response(existing_reel, url_result)), 200
            elif existing_status == "error":
                logger.info("🔄 Reprocessing existing error reel %s in place", existing_id)
                queued = _queue_existing_reel_refresh(existing_id, user_id, existing_reel.get("source_url") or processing_url or url, save_to_gcs)
                return jsonify(queued["payload"]), queued["status_code"]
            else:
                return jsonify(_duplicate_response(existing_reel, url_result)), 200

        if url_result.platform in {"facebook", "instagram"} and not force_retry:
            reusable_reel = find_reusable_social_reel(user_id, url_result, shortcode)
            if reusable_reel:
                reused_process_id = f"{shortcode}--{get_timestamp()}--{get_unique_id(processing_url or url)}"
                try:
                    reuse_gcs_paths = generate_gcs_paths(shortcode, platform_id, user_id=user_id)
                except TypeError:
                    reuse_gcs_paths = generate_gcs_paths(shortcode, platform_id)

                reuse_result = create_reused_social_reel(
                    reusable_reel,
                    reused_process_id,
                    user_id,
                    processing_url,
                    reuse_gcs_paths,
                )

                logger.info(
                    "♻️ Reused processed social reel source=%s new=%s user=%s canonical_key=%s",
                    reuse_result.get("source_reel_id"),
                    reuse_result.get("reel_id"),
                    user_id,
                    url_result.canonical_key,
                )
                return jsonify({
                    "status": "done",
                    "duplicate": False,
                    "reused": True,
                    "reel_id": reused_process_id,
                    "process_id": reused_process_id,
                    "preview_url": (reuse_result.get("gcs_urls") or {}).get("preview_thumbnail"),
                }), 200

    if _extraction_limit_reached():
        logger.warning("🚦 Daily extraction limit reached: %s", EXTRACTION_DAILY_LIMIT_TOTAL)
        return jsonify({
            "error": "extraction_limit_reached",
            "message": "Lots of people are using Recolekt right now. Please try again in a few hours.",
        }), 429

    temp_dir = tempfile.mkdtemp(dir=TEMP_DIR_BASE)
    video_path = None

    result = {
        "process_id": "",
        "summary": {},
        "caption": "",
    }

    try:
        if file and file.filename:
            filename = secure_filename(file.filename)
            video_path = save_uploaded_file(file, temp_dir)
            shortcode = get_unique_id(filename).rstrip("-")
            result["process_id"] = f"{shortcode}--{get_timestamp()}--{get_unique_id(url or filename)}"
            logger.info(f"📁 File upload: {result['process_id']}")
        else:
            logger.info(f"🔗 Processing {platform_id} URL: {url}")

            result["process_id"] = f"{shortcode}--{get_timestamp()}--{get_unique_id(url)}"
            video_path = os.path.join(temp_dir, f"{result['process_id']}.mp4")

            logger.info(f"🆔 Process ID: {result['process_id']}")
            logger.info("⏭️ Skipping metadata fetch - will be done in background")

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
        "duplicate": False,
        "reel_id": result["process_id"],
        "process_id": result["process_id"],
        "preview_url": None,
    })


@video_bp.route("/reels/<path:reel_id>/refresh", methods=["POST"])
def refresh_reel(reel_id):
    logger.info("🔄 /reels/%s/refresh called", reel_id)

    try:
        user_id = get_user_id_from_request()
    except ValueError as e:
        logger.error("❌ Refresh auth failed: %s", e)
        return jsonify({"error": "Authentication required"}), 401

    reel = fetch_one(
        """
        SELECT id, user_id, source_url, status, folder_id, is_favorite, created_at
        FROM reels
        WHERE id = %s AND user_id = %s
        LIMIT 1
        """,
        (reel_id, user_id),
    )

    if not reel:
        logger.info("🚫 Refresh denied or missing reel=%s user=%s", reel_id, user_id)
        return jsonify({"error": "not_found", "message": "Video not found."}), 404

    queued = _queue_existing_reel_refresh(reel_id, user_id, str(reel.get("source_url") or "").strip(), True)
    if queued["status_code"] >= 400:
        return jsonify(queued["payload"]), queued["status_code"]

    payload = {
        "success": True,
        "reel_id": reel_id,
        "status": "processing",
        "message": "Refresh started",
    }
    payload.update(queued["payload"])
    return jsonify(payload), queued["status_code"]
