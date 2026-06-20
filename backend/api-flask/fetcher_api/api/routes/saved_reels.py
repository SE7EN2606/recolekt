import json
import logging
import time
from decimal import Decimal

from flask import Blueprint, jsonify, request

from fetcher_api.adapters.db import fetch_all, fetch_one
from fetcher_api.api.helpers.auth import get_user_id_from_request
from fetcher_api.api.helpers.media_aliases import apply_media_aliases
from fetcher_api.api.helpers.recipe_formatters import normalize_recipe_for_display
from fetcher_api.services.processing_recovery import recover_stale_processing_reels

logger = logging.getLogger("saved_reels")

saved_reels_bp = Blueprint("saved_reels", __name__)
LIST_PAYLOAD_WARNING_KB = 500


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

    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")

    if isinstance(value, list):
        return [_json_safe(v) for v in value]

    if isinstance(value, dict):
        return {str(k): _json_safe(v) for k, v in value.items()}

    if hasattr(value, "isoformat"):
        return value.isoformat()

    return value


def _payload_size_kb(payload: dict | list) -> float:
    try:
        return len(json.dumps(payload, ensure_ascii=False, default=str).encode("utf-8")) / 1024
    except Exception:
        return 0.0


def _log_list_payload(endpoint: str, user_id: str, payload: dict | list, row_count: int, duration_ms: float):
    size_kb = _payload_size_kb(payload)
    logger.info(
        "gallery_list_payload endpoint=%s user=%s row_count=%s size_kb=%.1f duration_ms=%.0f",
        endpoint,
        user_id,
        row_count,
        size_kb,
        duration_ms,
    )
    if size_kb > LIST_PAYLOAD_WARNING_KB:
        logger.warning(
            "Gallery/list payload too large endpoint=%s user=%s row_count=%s size_kb=%.1f duration_ms=%.0f",
            endpoint,
            user_id,
            row_count,
            size_kb,
            duration_ms,
        )


def _normalize_content_type(raw: str | None) -> str:
    ct = (raw or "").strip().lower()

    if not ct or ct in {"generic", "summary"}:
        return "general"

    if ct == "tools":
        return "products"

    if ct == "places":
        return "location"

    if ct in {
        "recipe",
        "workout",
        "location",
        "products",
        "software",
        "finance",
        "general",
    }:
        return ct

    return "general"


def _build_summary(row_dict: dict) -> dict:
    summary = _json_loads_maybe(row_dict.get("summary_text"), default={})
    title = row_dict.get("summary_title") or row_dict.get("caption") or "Untitled"

    if isinstance(summary, dict):
        if "english" in summary or "original" in summary:
            return summary

        return {
            "title": title,
            "english": {
                "title": title,
                "summary": summary.get("summary", "") if isinstance(summary.get("summary"), str) else "",
                "headlines": summary.get("headlines", []) if isinstance(summary.get("headlines"), list) else [],
                "hashtags": summary.get("hashtags", []) if isinstance(summary.get("hashtags"), list) else [],
                "emojis": summary.get("emojis", []) if isinstance(summary.get("emojis"), list) else [],
            },
        }

    if isinstance(summary, str) and summary.strip():
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


def _apply_media_aliases(payload: dict) -> dict:
    return apply_media_aliases(payload)


def _platform_from_url(source_url: str | None) -> str | None:
    url = (source_url or "").lower()
    if "facebook.com" in url or "fb.com" in url:
        return "facebook"
    if "tiktok.com" in url:
        return "tiktok"
    if "youtube.com" in url or "youtu.be" in url:
        return "youtube"
    if "instagram.com" in url:
        return "instagram"
    return None


def _measurement_system_for_user(user_id: str | None) -> str:
    if not user_id:
        return "metric"

    try:
        row = fetch_one(
            "SELECT measurement_system FROM users WHERE user_id = %s LIMIT 1",
            (user_id,),
        )
        value = row.get("measurement_system") if hasattr(row, "get") else None
    except Exception:
        logger.warning("Failed to load measurement preference for user %s", user_id, exc_info=True)
        value = None

    value = (value or "metric").strip().lower()
    return value if value in {"metric", "us", "imperial"} else "metric"


def _serialize_reel_row(row, measurement_system: str | None = None) -> dict:
    row_dict = dict(row) if hasattr(row, "keys") else row._asdict()
    caption = row_dict.get("caption") or ""
    recipe = _json_loads_maybe(row_dict.get("recipe"), default=row_dict.get("recipe"))
    if isinstance(recipe, dict):
        recipe = normalize_recipe_for_display(
            recipe,
            caption,
            measurement_system or "metric",
        )

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
        "recipe": recipe,
        "workout": _json_loads_maybe(row_dict.get("workout"), default=row_dict.get("workout")),
        "tools_list": _json_loads_maybe(row_dict.get("tools_list"), default=row_dict.get("tools_list")),
        "location": _json_loads_maybe(row_dict.get("location"), default=row_dict.get("location")),
        "gcs_urls": _json_loads_maybe(row_dict.get("gcs_urls"), default={}) or {},
        "summary_title": row_dict.get("summary_title"),
        "summary_topic": row_dict.get("summary_topic"),
        "error_message": row_dict.get("error_message"),
    }

    if payload["content_type"] == "recipe":
        payload["recipe_user_state"] = {
            "cookCount": int(row_dict.get("recipe_cook_count") or 0),
            "lastCookedAt": row_dict.get("recipe_last_cooked_at"),
            "hasActiveSession": bool(row_dict.get("recipe_has_active_session")),
            "activeSessionId": row_dict.get("recipe_active_session_id"),
            "hasNote": bool(row_dict.get("recipe_has_note")),
            "noteUpdatedAt": row_dict.get("recipe_note_updated_at"),
        }

    payload["summary"] = _build_summary(row_dict)
    payload = _apply_media_aliases(payload)

    return _json_safe(payload)


def _serialize_reel_card_row(row) -> dict:
    row_dict = dict(row) if hasattr(row, "keys") else row._asdict()
    source_url = row_dict.get("source_url")
    thumbnail_url = row_dict.get("thumbnail_url")

    payload = {
        "id": row_dict.get("id"),
        "process_id": row_dict.get("id"),
        "source_url": source_url,
        "folder_id": row_dict.get("folder_id") or "unsorted",
        "is_favorite": bool(row_dict.get("is_favorite")),
        "status": row_dict.get("status"),
        "content_type": _normalize_content_type(row_dict.get("content_type")),
        "list_subtype": row_dict.get("list_subtype"),
        "summary_title": row_dict.get("summary_title"),
        "summary_topic": row_dict.get("summary_topic"),
        "summary_category": row_dict.get("summary_category"),
        "created_at": row_dict.get("created_at"),
        "updated_at": row_dict.get("updated_at"),
        "author_name": row_dict.get("author_name") or "Unknown",
        "duration": row_dict.get("duration"),
        "duration_seconds": row_dict.get("duration_seconds"),
        "thumbnail_url": thumbnail_url,
        "thumbnailUrl": thumbnail_url,
        "platform": row_dict.get("platform") or _platform_from_url(source_url),
        "error_message": row_dict.get("error_message"),
    }

    if payload["content_type"] == "recipe":
        payload["recipe_user_state"] = {
            "cookCount": int(row_dict.get("recipe_cook_count") or 0),
            "lastCookedAt": row_dict.get("recipe_last_cooked_at"),
            "hasActiveSession": bool(row_dict.get("recipe_has_active_session")),
            "activeSessionId": row_dict.get("recipe_active_session_id"),
            "hasNote": bool(row_dict.get("recipe_has_note")),
            "noteUpdatedAt": row_dict.get("recipe_note_updated_at"),
        }

    return _json_safe(payload)


@saved_reels_bp.route("/saved_reels", methods=["GET", "OPTIONS"])
def saved_reels():
    if request.method == "OPTIONS":
        return "", 200

    started = time.perf_counter()
    try:
        user_id = get_user_id_from_request()
    except ValueError:
        return jsonify({"error": "Authentication required"}), 401
    try:
        recover_stale_processing_reels(user_id=user_id, timeout_seconds=180)
    except Exception as exc:
        logger.warning("⚠️ Stale processing recovery skipped user=%s error=%s", user_id, exc)

    page = max(int(request.args.get("page", 1) or 1), 1)
    per_page = min(max(int(request.args.get("per_page", 100) or 100), 1), 1000)
    offset = (page - 1) * per_page

    rows = fetch_all(
        """
        SELECT
            r.id,
            r.source_url,
            r.folder_id,
            r.is_favorite,
            r.status,
            r.content_type,
            r.list_subtype,
            r.created_at,
            r.updated_at,
            r.author_name,
            r.duration,
            r.duration_seconds,
            r.gcs_urls->>'preview_thumbnail' AS thumbnail_url,
            r.summary_title,
            r.summary_topic,
            r.summary_category,
            r.error_message,
            rcs.cook_count AS recipe_cook_count,
            rcs.last_cooked_at AS recipe_last_cooked_at,
            rcs.has_active_session AS recipe_has_active_session,
            rcs.active_session_id AS recipe_active_session_id,
            (
                rpn.id IS NOT NULL
                AND LENGTH(TRIM(COALESCE(rpn.note_text, ''))) > 0
            ) AS recipe_has_note,
            rpn.updated_at AS recipe_note_updated_at
        FROM reels r
        LEFT JOIN recipe_cook_summaries rcs
          ON rcs.user_id = r.user_id
         AND rcs.reel_id = r.id
        LEFT JOIN recipe_personal_notes rpn
          ON rpn.user_id = r.user_id
         AND rpn.reel_id = r.id
        WHERE r.user_id = %s
        ORDER BY r.created_at DESC NULLS LAST
        LIMIT %s OFFSET %s
        """,
        (user_id, per_page, offset),
    )

    reels = []

    for r in rows:
        try:
            reels.append(_serialize_reel_card_row(r))
        except Exception:
            try:
                row_dict = dict(r) if hasattr(r, "keys") else {}
                bad_id = row_dict.get("id")
            except Exception:
                bad_id = None

            logger.exception("Failed to serialize saved reel row id=%s", bad_id)

    payload = {
        "reels": reels,
        "page": page,
        "per_page": per_page,
        "count": len(reels),
    }
    _log_list_payload("saved_reels", user_id, payload, len(reels), (time.perf_counter() - started) * 1000)
    return jsonify(payload)

@saved_reels_bp.route("/search", methods=["GET", "OPTIONS"])
def search_saved_reels():
    if request.method == "OPTIONS":
        return "", 200

    started = time.perf_counter()
    try:
        user_id = get_user_id_from_request()
    except ValueError:
        return jsonify({"error": "Authentication required"}), 401

    raw_q = (request.args.get("q") or "").strip()
    folder_id = (request.args.get("folder_id") or "").strip() or None

    if not raw_q:
        payload = []
        _log_list_payload("search", user_id, payload, 0, (time.perf_counter() - started) * 1000)
        return jsonify(payload)

    # Keep v1 intentionally simple and robust:
    # - works even if search_vector is missing/stale
    # - searches recipe JSON text, caption, title, transcript, author
    # - returns the same lightweight card shape as /saved_reels for Gallery cards
    like = f"%{raw_q.lower()}%"

    sql = """
        SELECT
            r.id,
            r.source_url,
            r.folder_id,
            r.is_favorite,
            r.status,
            r.content_type,
            r.list_subtype,
            r.created_at,
            r.updated_at,
            r.author_name,
            r.duration,
            r.duration_seconds,
            r.gcs_urls->>'preview_thumbnail' AS thumbnail_url,
            r.summary_title,
            r.summary_topic,
            r.summary_category,
            r.error_message,
            rcs.cook_count AS recipe_cook_count,
            rcs.last_cooked_at AS recipe_last_cooked_at,
            rcs.has_active_session AS recipe_has_active_session,
            rcs.active_session_id AS recipe_active_session_id,
            (
                rpn.id IS NOT NULL
                AND LENGTH(TRIM(COALESCE(rpn.note_text, ''))) > 0
            ) AS recipe_has_note,
            rpn.updated_at AS recipe_note_updated_at,
            CASE
                WHEN LOWER(COALESCE(r.content_type, '')) = 'recipe'
                     AND LOWER(COALESCE(r.summary_title, '')) LIKE %s THEN 5
                WHEN LOWER(COALESCE(r.content_type, '')) = 'recipe'
                     AND LOWER(COALESCE(r.recipe::text, '')) LIKE %s THEN 4
                WHEN LOWER(COALESCE(r.summary_topic, '')) LIKE %s THEN 3
                WHEN LOWER(COALESCE(r.summary_title, '')) LIKE %s THEN 3
                WHEN LOWER(COALESCE(r.caption, '')) LIKE %s THEN 2
                ELSE 1
            END AS search_rank
        FROM reels r
        LEFT JOIN recipe_cook_summaries rcs
          ON rcs.user_id = r.user_id
         AND rcs.reel_id = r.id
        LEFT JOIN recipe_personal_notes rpn
          ON rpn.user_id = r.user_id
         AND rpn.reel_id = r.id
        WHERE r.user_id = %s
          AND (
            LOWER(COALESCE(r.summary_title, '')) LIKE %s
            OR LOWER(COALESCE(r.summary_topic, '')) LIKE %s
            OR LOWER(COALESCE(r.caption, '')) LIKE %s
            OR LOWER(COALESCE(r.author_name, '')) LIKE %s
            OR LOWER(COALESCE(r.recipe::text, '')) LIKE %s
            OR LOWER(COALESCE(r.workout::text, '')) LIKE %s
            OR LOWER(COALESCE(r.transcription::text, '')) LIKE %s
            OR LOWER(COALESCE(r.summary_text::text, '')) LIKE %s
          )
    """

    params = [
        like, like, like, like, like,
        user_id,
        like, like, like, like, like, like, like, like,
    ]

    content_type = (request.args.get("content_type") or "").strip().lower()
    if content_type == "recipe":
        sql += " AND LOWER(COALESCE(r.content_type, '')) = 'recipe'"

    if folder_id and folder_id != "all":
        if folder_id == "favorites":
            sql += " AND r.is_favorite = TRUE"
        elif folder_id == "unsorted":
            sql += " AND (r.folder_id IS NULL OR r.folder_id = 'unsorted')"
        else:
            sql += " AND r.folder_id = %s"
            params.append(folder_id)

    sql += " ORDER BY search_rank DESC, r.created_at DESC NULLS LAST LIMIT 100"

    rows = fetch_all(sql, tuple(params))

    results = []
    for r in rows:
        try:
            results.append(_serialize_reel_card_row(r))
        except Exception:
            try:
                row_dict = dict(r) if hasattr(r, "keys") else {}
                bad_id = row_dict.get("id")
            except Exception:
                bad_id = None

            logger.exception("Failed to serialize search reel row id=%s", bad_id)

    _log_list_payload("search", user_id, results, len(results), (time.perf_counter() - started) * 1000)
    return jsonify(results)
