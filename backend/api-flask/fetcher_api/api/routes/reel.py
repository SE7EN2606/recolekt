# fetcher_api/api/routes/reel.py
"""
Reel management routes - list, update, delete, search
"""
import os
import json
import logging

from flask import Blueprint, request, jsonify
from google.cloud import storage

from fetcher_api.adapters.db import execute, fetch_all, fetch_one
from fetcher_api.api.helpers.auth import get_user_id_from_request
from fetcher_api.api.helpers.formatters import (
    json_loads_maybe,
    build_bilingual_summary_object,
    extract_english_preview_and_title,
)
from fetcher_api.api.helpers.recipe_formatters import normalize_recipe

logger = logging.getLogger("reels")

reel_bp = Blueprint("reels", __name__)


def add_no_cache_headers(response):
    """Disable caching for dynamic lists — gallery always gets fresh data."""
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response


def add_short_cache_headers(response):
    """Short private cache for single reel detail — instant back-navigation."""
    response.headers["Cache-Control"] = "private, max-age=60, stale-while-revalidate=30"
    return response


def parse_transcription(transcription_raw):
    if not transcription_raw:
        return None
    if isinstance(transcription_raw, dict):
        return transcription_raw.get("transcript")
    if isinstance(transcription_raw, str):
        try:
            parsed = json.loads(transcription_raw)
            if isinstance(parsed, dict) and "transcript" in parsed:
                return parsed["transcript"]
        except (json.JSONDecodeError, ValueError):
            pass
        return transcription_raw
    return None


def _coerce_summary_title_string(summary_title_raw):
    if summary_title_raw is None:
        return None
    if isinstance(summary_title_raw, dict):
        return None
    if isinstance(summary_title_raw, str):
        parsed = json_loads_maybe(summary_title_raw, default=summary_title_raw)
        if isinstance(parsed, dict):
            return None
        return summary_title_raw.strip() or None
    return None


def _build_canonical_summary(row_dict, caption: str):
    summary_title_db = _coerce_summary_title_string(row_dict.get("summary_title"))
    summary_text_raw = row_dict.get("summary_text")
    summary_text = json_loads_maybe(summary_text_raw, default=summary_text_raw)

    if isinstance(summary_text, dict) and "english" in summary_text:
        summary_obj = summary_text
    else:
        bullets = json_loads_maybe(
            row_dict.get("summary_bullets"),
            default=row_dict.get("summary_bullets"),
        )
        hashtags = json_loads_maybe(
            row_dict.get("summary_hashtags"),
            default=row_dict.get("summary_hashtags"),
        )
        emojis = json_loads_maybe(
            row_dict.get("summary_emojis"),
            default=row_dict.get("summary_emojis"),
        )

        if not isinstance(bullets, list):
            bullets = []
        if not isinstance(hashtags, list):
            hashtags = []
        if not isinstance(emojis, list):
            emojis = []

        summary_obj = build_bilingual_summary_object(
            summary_title=summary_title_db,
            summary_text=summary_text if isinstance(summary_text, str) else "",
            bullets=bullets,
            hashtags=hashtags,
            emojis=emojis,
            caption=caption,
        )

    english_preview, summary_title_str = extract_english_preview_and_title(
        summary_obj, summary_title_db
    )

    if not summary_title_str and caption:
        summary_title_str = caption[:50]

    return summary_obj, summary_title_str, english_preview


# ──────────────────────────────────────────────────────────────────────────────
# LIST
# ──────────────────────────────────────────────────────────────────────────────

@reel_bp.route("/saved_reels", methods=["GET"])
def list_saved_reels():
    try:
        try:
            user_id = get_user_id_from_request()
        except ValueError:
            return jsonify({"error": "Authentication required"}), 401

        page = int(request.args.get("page", 1))
        per_page = int(request.args.get("per_page", 30))
        view_mode = request.args.get("view", "full").lower().strip()
        per_page = max(1, min(per_page, 100))
        offset = (page - 1) * per_page

        if view_mode == "list":
            sql = """
                SELECT
                    id, source_url, folder_id, is_favorite, status,
                    summary_category, summary_title, summary_topic, summary_text,
                    summary_bullets, summary_hashtags, summary_emojis,
                    content_type, created_at, caption, author_name,
                    is_long_video, duration,
                    gcs_urls::jsonb AS gcs_urls
                FROM reels
                WHERE user_id = %s
                ORDER BY created_at DESC
                LIMIT %s OFFSET %s
            """
            db_rows = fetch_all(sql, (user_id, per_page, offset))
            transformed_rows = []

            for row in db_rows:
                if hasattr(row, "keys"):
                    row_dict = dict(row)
                elif hasattr(row, "_asdict"):
                    row_dict = row._asdict()
                else:
                    continue

                caption = row_dict.get("caption") or ""
                gcs_urls = json_loads_maybe(row_dict.get("gcs_urls"), default={})

                summary_obj, summary_title_str, _ = _build_canonical_summary(row_dict, caption)

                transformed_rows.append({
                    "id": row_dict["id"],
                    "source_url": row_dict.get("source_url"),
                    "folder_id": row_dict.get("folder_id") or "default",
                    "is_favorite": bool(row_dict.get("is_favorite")),
                    "status": row_dict.get("status") or "processing",
                    "content_type": row_dict.get("content_type"),
                    "created_at": row_dict["created_at"].isoformat() if row_dict.get("created_at") else None,
                    "caption": caption,
                    "author_name": row_dict.get("author_name") or "Unknown",
                    "is_long_video": row_dict.get("is_long_video"),
                    "duration": row_dict.get("duration"),
                    "gcs_urls": gcs_urls,
                    "summary": summary_obj,
                    "title": summary_title_str,
                })

            return add_no_cache_headers(jsonify({
                "reels": transformed_rows,
                "page": page,
                "per_page": per_page,
                "has_more": len(transformed_rows) == per_page,
            }))

        sql = """
            SELECT
                id, source_url, folder_id, is_favorite, status,
                summary_category, summary_title, summary_topic, summary_text,
                summary_bullets, summary_hashtags, summary_emojis,
                content_type, created_at, caption, author_name,
                is_long_video, duration, recipe, workout, transcription,
                gcs_urls::jsonb AS gcs_urls
            FROM reels
            WHERE user_id = %s
            ORDER BY created_at DESC
            LIMIT %s OFFSET %s
        """
        db_rows = fetch_all(sql, (user_id, per_page, offset))
        transformed_rows = []

        for row in db_rows:
            if hasattr(row, "keys"):
                row_dict = dict(row)
            elif hasattr(row, "_asdict"):
                row_dict = row._asdict()
            else:
                continue

            caption = row_dict.get("caption") or ""

            row_dict["recipe"] = json_loads_maybe(row_dict.get("recipe"), default=row_dict.get("recipe"))
            row_dict["workout"] = json_loads_maybe(row_dict.get("workout"), default=row_dict.get("workout"))
            row_dict["transcription"] = parse_transcription(row_dict.get("transcription"))
            row_dict["gcs_urls"] = json_loads_maybe(row_dict.get("gcs_urls"), default={})

            if isinstance(row_dict.get("recipe"), dict):
                row_dict["recipe"] = normalize_recipe(row_dict["recipe"], caption)

            summary_obj, summary_title_str, _ = _build_canonical_summary(row_dict, caption)
            row_dict["summary_title"] = summary_title_str
            row_dict["summary_text"] = summary_obj
            row_dict["summary"] = summary_obj
            row_dict["title"] = summary_title_str

            row_dict.pop("summary_bullets", None)
            row_dict.pop("summary_hashtags", None)
            row_dict.pop("summary_emojis", None)

            row_dict["author_name"] = row_dict.get("author_name") or "Unknown"
            row_dict["folder_id"] = row_dict.get("folder_id") or "default"
            row_dict["is_favorite"] = bool(row_dict.get("is_favorite"))
            if row_dict.get("created_at"):
                row_dict["created_at"] = row_dict["created_at"].isoformat()

            transformed_rows.append(row_dict)

        return add_no_cache_headers(jsonify({
            "reels": transformed_rows,
            "page": page,
            "per_page": per_page,
            "has_more": len(transformed_rows) == per_page,
        }))

    except Exception as e:
        logger.error(f"Error in /saved_reels: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


# ──────────────────────────────────────────────────────────────────────────────
# UPDATE
# ──────────────────────────────────────────────────────────────────────────────

@reel_bp.route("/update/<process_id>", methods=["PUT"])
def update_reel(process_id):
    try:
        try:
            user_id = get_user_id_from_request()
        except ValueError:
            return jsonify({"error": "Authentication required"}), 401

        data = request.get_json(silent=True)
        if not data:
            return jsonify({"error": "No data provided"}), 400

        updates = []
        params = []

        if data.get("folder_id") is not None:
            updates.append("folder_id = %s")
            params.append(data["folder_id"])

        if data.get("is_favorite") is not None:
            updates.append("is_favorite = %s")
            params.append(data["is_favorite"])

        if not updates:
            return jsonify({"error": "No valid fields to update"}), 400

        params.extend([process_id, user_id])

        execute(
            f"UPDATE reels SET {', '.join(updates)}, updated_at = NOW() WHERE id = %s AND user_id = %s",
            tuple(params),
            commit=True
        )

        logger.info(f"✅ Updated reel {process_id}: {data}")

        return jsonify({
            "status": "updated",
            "id": process_id,
            "folder_id": data.get("folder_id"),
            "is_favorite": data.get("is_favorite"),
        }), 200

    except Exception as e:
        logger.error(f"Error updating reel {process_id}: {e}", exc_info=True)
        return jsonify({"error": "Internal error"}), 500


# ──────────────────────────────────────────────────────────────────────────────
# GET SINGLE
# ──────────────────────────────────────────────────────────────────────────────

@reel_bp.route("/reel/<process_id>", methods=["GET"])
def get_reel(process_id):
    """Fetch a single reel by ID — used by VideoDetail for fast direct lookup."""
    try:
        try:
            user_id = get_user_id_from_request()
        except ValueError:
            return jsonify({"error": "Authentication required"}), 401

        if "--" in process_id:
            shortcode = process_id.split("--")[0]
        else:
            shortcode = process_id.split("-")[0]
        shortcode = shortcode.rstrip("-")

        row = fetch_one(
            """
            SELECT
                id, user_id, source_url, folder_id, is_favorite, status,
                summary_category, summary_title, summary_topic, summary_text,
                summary_bullets, summary_hashtags, summary_emojis,
                content_type, created_at, caption, author_name,
                is_long_video, duration, recipe, workout, transcription,
                gcs_urls
            FROM reels
            WHERE user_id = %s AND (id = %s OR id LIKE %s)
            LIMIT 1
            """,
            (user_id, process_id, f"{shortcode}%"),
        )

        if not row:
            return jsonify({"error": "Reel not found"}), 404

        row_dict = dict(row) if hasattr(row, "keys") else row._asdict()
        caption = row_dict.get("caption") or ""

        row_dict["recipe"] = json_loads_maybe(row_dict.get("recipe"), default=row_dict.get("recipe"))
        row_dict["workout"] = json_loads_maybe(row_dict.get("workout"), default=row_dict.get("workout"))
        row_dict["gcs_urls"] = json_loads_maybe(row_dict.get("gcs_urls"), default={})
        row_dict["transcription"] = parse_transcription(row_dict.get("transcription"))

        if isinstance(row_dict.get("recipe"), dict):
            row_dict["recipe"] = normalize_recipe(row_dict["recipe"], caption)

        summary_obj, summary_title_str, _ = _build_canonical_summary(row_dict, caption)
        row_dict["summary_title"] = summary_title_str
        row_dict["summary_text"] = summary_obj
        row_dict["summary"] = summary_obj
        row_dict["title"] = summary_title_str

        row_dict.pop("summary_bullets", None)
        row_dict.pop("summary_hashtags", None)
        row_dict.pop("summary_emojis", None)

        row_dict["author_name"] = row_dict.get("author_name") or "Unknown"
        row_dict["folder_id"] = row_dict.get("folder_id") or "default"
        row_dict["is_favorite"] = bool(row_dict.get("is_favorite"))
        if row_dict.get("created_at"):
            row_dict["created_at"] = row_dict["created_at"].isoformat()

        logger.info(f"✅ GET /reel/{process_id} -> {row_dict['id']}")

        return add_short_cache_headers(jsonify(row_dict))

    except Exception as e:
        logger.error(f"Error fetching reel {process_id}: {e}", exc_info=True)
        return jsonify({"error": "Internal error"}), 500


# ──────────────────────────────────────────────────────────────────────────────
# DELETE
# ──────────────────────────────────────────────────────────────────────────────

@reel_bp.route("/reel/<process_id>", methods=["DELETE", "OPTIONS"])
def delete_reel(process_id):
    if request.method == "OPTIONS":
        return "", 200

    try:
        try:
            user_id = get_user_id_from_request()
        except ValueError:
            return jsonify({"error": "Authentication required"}), 401

        reel_data = fetch_one(
            "SELECT id, gcs_urls, source_url FROM reels WHERE user_id = %s AND id = %s LIMIT 1",
            (user_id, process_id),
        )

        if not reel_data:
            logger.warning(f"⚠️ Reel {process_id} not found for user {user_id}")
            return jsonify({"error": "Reel not found"}), 404

        reel_dict = dict(reel_data) if hasattr(reel_data, "keys") else reel_data._asdict()
        actual_id = reel_dict["id"]

        try:
            from fetcher_api.services.storage import generate_gcs_paths

            storage_client = storage.Client()
            bucket_name = os.getenv("GCS_BUCKET_NAME", "recolekt-analysis")
            bucket = storage_client.bucket(bucket_name)

            source_url = reel_dict.get("source_url") or ""
            is_fb = "facebook.com" in source_url.lower() or "fb." in source_url.lower()
            p_code = "FB" if is_fb else "IG"
            shortcode = actual_id.split("--")[0] if "--" in actual_id else actual_id.split("_")[0]

            gcs_paths = generate_gcs_paths(shortcode, p_code, user_id)
            target_folder = "/".join(gcs_paths["video"].split("/")[:-1]) + "/"

            logger.info(f"🔍 Attempting to clear GCS folder: {target_folder}")
            blobs = list(bucket.list_blobs(prefix=target_folder))
            if blobs:
                for blob in blobs:
                    blob.delete()
                logger.info(f"✅ Deleted {len(blobs)} files from GCS folder: {target_folder}")

        except Exception as gcs_error:
            logger.error(f"❌ GCS deletion error for {actual_id}: {gcs_error}")

        execute(
            "DELETE FROM reels WHERE user_id = %s AND id = %s",
            (user_id, actual_id),
            commit=True
        )
        logger.info(f"✅ Deleted reel {actual_id} from database")

        return jsonify({"status": "deleted", "id": actual_id}), 200

    except Exception as e:
        logger.error(f"❌ Error in delete_reel: {e}", exc_info=True)
        return jsonify({"error": "Internal error", "details": str(e)}), 500


# ──────────────────────────────────────────────────────────────────────────────
# SEARCH
# ──────────────────────────────────────────────────────────────────────────────

@reel_bp.route("/search", methods=["GET"])
def search_reels():
    q = request.args.get("q", "").strip()
    if not q:
        return jsonify([])

    try:
        try:
            user_id = get_user_id_from_request()
        except ValueError:
            return jsonify({"error": "Authentication required"}), 401

        sql = """
            SELECT
                id, source_url, folder_id, is_favorite, status,
                summary_category, summary_title, summary_topic, summary_text,
                summary_bullets, summary_hashtags, summary_emojis,
                content_type, recipe, workout, created_at,
                caption, author_name, is_long_video, duration, transcription,
                gcs_urls::jsonb AS gcs_urls
            FROM reels
            WHERE user_id = %s
              AND search_vector @@ plainto_tsquery('simple', %s)
            ORDER BY created_at DESC
            LIMIT 200
        """
        rows = fetch_all(sql, (user_id, q))
        transformed = []

        for row in rows:
            if hasattr(row, "keys"):
                row_dict = dict(row)
            elif hasattr(row, "_asdict"):
                row_dict = row._asdict()
            else:
                continue

            caption = row_dict.get("caption") or ""
            recipe = json_loads_maybe(row_dict.get("recipe"), default=row_dict.get("recipe"))
            workout = json_loads_maybe(row_dict.get("workout"), default=row_dict.get("workout"))

            row_dict["transcription"] = parse_transcription(row_dict.get("transcription"))
            row_dict["gcs_urls"] = json_loads_maybe(row_dict.get("gcs_urls"), default={})

            if isinstance(recipe, dict):
                recipe = normalize_recipe(recipe, caption)

            summary_obj, summary_title_str, _ = _build_canonical_summary(row_dict, caption)
            row_dict["summary_title"] = summary_title_str
            row_dict["summary_text"] = summary_obj
            row_dict["summary"] = summary_obj
            row_dict["title"] = summary_title_str

            row_dict.pop("summary_bullets", None)
            row_dict.pop("summary_hashtags", None)
            row_dict.pop("summary_emojis", None)

            row_dict["content_type"] = row_dict.get("content_type", "generic")
            row_dict["recipe"] = recipe
            row_dict["workout"] = workout
            row_dict["author_name"] = row_dict.get("author_name") or "Unknown"
            row_dict["folder_id"] = row_dict.get("folder_id") or "default"
            row_dict["is_favorite"] = bool(row_dict.get("is_favorite"))
            if row_dict.get("created_at"):
                row_dict["created_at"] = row_dict["created_at"].isoformat()

            transformed.append(row_dict)

        return jsonify(transformed)

    except Exception as e:
        logger.error(f"Error in /search: {e}", exc_info=True)
        return jsonify({"error": "Internal error"}), 500
