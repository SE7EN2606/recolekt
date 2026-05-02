import json
import logging
from decimal import Decimal

from flask import Blueprint, jsonify, request

from fetcher_api.adapters.db import fetch_all
from fetcher_api.api.helpers.auth import get_user_id_from_request

logger = logging.getLogger("saved_reels")

saved_reels_bp = Blueprint("saved_reels", __name__)


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
    gcs_urls = payload.get("gcs_urls")
    if not isinstance(gcs_urls, dict):
        gcs_urls = {}

    thumb = (
        gcs_urls.get("preview_thumbnail")
        or gcs_urls.get("thumbnail")
        or gcs_urls.get("thumbnail_url")
        or gcs_urls.get("poster")
        or gcs_urls.get("poster_url")
    )

    result_json = (
        gcs_urls.get("result_json")
        or gcs_urls.get("result_json_url")
    )

    video_url = (
        gcs_urls.get("video")
        or gcs_urls.get("video_url")
    )

    if thumb:
        gcs_urls["preview_thumbnail"] = thumb
        gcs_urls.setdefault("thumbnail", thumb)
        gcs_urls.setdefault("thumbnail_url", thumb)

    if result_json:
        gcs_urls["result_json"] = result_json
        gcs_urls.setdefault("result_json_url", result_json)

    if video_url:
        gcs_urls["video"] = video_url
        gcs_urls.setdefault("video_url", video_url)

    payload["gcs_urls"] = gcs_urls

    payload["thumbnailUrl"] = thumb
    payload["thumbnail_url"] = thumb
    payload["posterUrl"] = thumb
    payload["poster_url"] = thumb
    payload["image_url"] = thumb
    payload["cover_url"] = thumb

    payload["result_json_url"] = result_json
    payload["resultJsonUrl"] = result_json

    payload["video_url"] = video_url
    payload["videoUrl"] = video_url

    return payload


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

    payload["summary"] = _build_summary(row_dict)
    payload = _apply_media_aliases(payload)

    return _json_safe(payload)


@saved_reels_bp.route("/saved_reels", methods=["GET", "OPTIONS"])
def saved_reels():
    if request.method == "OPTIONS":
        return "", 200

    try:
        user_id = get_user_id_from_request()
    except ValueError:
        return jsonify({"error": "Authentication required"}), 401

    page = max(int(request.args.get("page", 1) or 1), 1)
    per_page = min(max(int(request.args.get("per_page", 100) or 100), 1), 1000)
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

    reels = []

    for r in rows:
        try:
            reels.append(_serialize_reel_row(r))
        except Exception:
            try:
                row_dict = dict(r) if hasattr(r, "keys") else {}
                bad_id = row_dict.get("id")
            except Exception:
                bad_id = None

            logger.exception("Failed to serialize saved reel row id=%s", bad_id)

    return jsonify({
        "reels": reels,
        "page": page,
        "per_page": per_page,
        "count": len(reels),
    })

@saved_reels_bp.route("/search", methods=["GET", "OPTIONS"])
def search_saved_reels():
    if request.method == "OPTIONS":
        return "", 200

    try:
        user_id = get_user_id_from_request()
    except ValueError:
        return jsonify({"error": "Authentication required"}), 401

    raw_q = (request.args.get("q") or "").strip()
    folder_id = (request.args.get("folder_id") or "").strip() or None

    if not raw_q:
        return jsonify([])

    # Keep v1 intentionally simple and robust:
    # - works even if search_vector is missing/stale
    # - searches recipe JSON text, caption, title, transcript, author
    # - returns the same serialized shape as /saved_reels for Gallery cards
    like = f"%{raw_q.lower()}%"

    sql = """
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
            NULL::jsonb AS tools_list,
            NULL::jsonb AS location,
            gcs_urls,
            summary_title,
            summary_text,
            error_message,
            CASE
                WHEN LOWER(COALESCE(content_type, '')) = 'recipe'
                     AND LOWER(COALESCE(recipe::text, '')) LIKE %s THEN 4
                WHEN LOWER(COALESCE(summary_title, '')) LIKE %s THEN 3
                WHEN LOWER(COALESCE(caption, '')) LIKE %s THEN 2
                ELSE 1
            END AS search_rank
        FROM reels
        WHERE user_id = %s
          AND (
            LOWER(COALESCE(summary_title, '')) LIKE %s
            OR LOWER(COALESCE(caption, '')) LIKE %s
            OR LOWER(COALESCE(author_name, '')) LIKE %s
            OR LOWER(COALESCE(recipe::text, '')) LIKE %s
            OR LOWER(COALESCE(workout::text, '')) LIKE %s
            OR LOWER(COALESCE(transcription::text, '')) LIKE %s
            OR LOWER(COALESCE(summary_text::text, '')) LIKE %s
          )
    """

    params = [
        like, like, like,
        user_id,
        like, like, like, like, like, like, like,
    ]

    if folder_id and folder_id != "all":
        if folder_id == "favorites":
            sql += " AND is_favorite = TRUE"
        elif folder_id == "unsorted":
            sql += " AND (folder_id IS NULL OR folder_id = 'unsorted')"
        else:
            sql += " AND folder_id = %s"
            params.append(folder_id)

    sql += " ORDER BY search_rank DESC, created_at DESC NULLS LAST LIMIT 100"

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

