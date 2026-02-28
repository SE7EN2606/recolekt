# fetcher_api/api/routes/reel.py
"""
Reel management routes - list, update, delete, search
"""
import os
import json
import logging
from datetime import datetime, timedelta

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
    """Disable caching for dynamic lists"""
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response


def parse_transcription(transcription_raw):
    """
    Extract clean transcript text from DB column.

    Input can be:
    - JSON string: '{"status": "ok", "transcript": "...", "detected_language": "fr"}'
    - Dict: {"status": "ok", "transcript": "...", "detected_language": "fr"}
    - Plain text: "Transcript text..."
    - None

    Returns: Clean transcript text or None
    """
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
    """
    summary_title can be:
    - string title (legacy)
    - JSON string of a dict (due to older background_process saving bilingual object)
    - dict (rare)
    We only want a simple string title or None.
    """
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
    """
    Return a canonical bilingual summary object.

    Preferred source: summary_text if it's already a bilingual dict.
    Fallback: build from legacy summary_text + bullets/hashtags/emojis columns.
    """
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


@reel_bp.route("/saved_reels", methods=["GET"])
def list_saved_reels():
    """
    Get paginated list of user's saved reels.

    - ?view=list => lightweight payload for gallery (no recipe/workout/transcription normalization).
    - default    => full payload.
    """
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

        # --------------------------------------------------
        # LIGHTWEIGHT LIST VIEW (for gallery / DataContext)
        # --------------------------------------------------
        if view_mode == "list":
            sql = """
                SELECT 
                    id,
                    source_url,
                    folder_id,
                    is_favorite,
                    status,
                    summary_category,
                    summary_title,
                    summary_topic,
                    summary_text,
                    summary_hashtags,
                    content_type,
                    created_at,
                    caption,
                    author_name,
                    is_long_video,
                    duration,
                    gcs_urls::jsonb->'preview_thumbnail' as preview_thumbnail
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
                summary_title = row_dict.get("summary_title")

                summary_text_raw = row_dict.get("summary_text")
                summary_text = json_loads_maybe(summary_text_raw, default=summary_text_raw)

                hashtags = json_loads_maybe(
                    row_dict.get("summary_hashtags"),
                    default=row_dict.get("summary_hashtags"),
                )
                if not isinstance(hashtags, list):
                    hashtags = []

                if isinstance(summary_text, dict):
                    summary = summary_text
                else:
                    english_summary = summary_text if isinstance(summary_text, str) else ""
                    summary_title_str = summary_title
                    if not summary_title_str and caption:
                        summary_title_str = caption[:50]

                    summary = {
                        "category": row_dict.get("summary_category", "General"),
                        "title": summary_title_str,
                        "topic": row_dict.get("summary_topic", ""),
                        "english": {
                            "summary": english_summary,
                            "headlines": [],
                            "hashtags": hashtags,
                            "emojis": [],
                        },
                        "original": {
                            "summary": "",
                            "headlines": [],
                            "hashtags": hashtags,
                            "emojis": [],
                        },
                    }

                thumb = row_dict.get("preview_thumbnail")
                transformed_rows.append(
                    {
                        "id": row_dict["id"],
                        "source_url": row_dict.get("source_url"),
                        "folder_id": row_dict.get("folder_id") or "default",
                        "is_favorite": bool(row_dict.get("is_favorite")),
                        "status": row_dict.get("status") or "processing",
                        "content_type": row_dict.get("content_type"),
                        "created_at": row_dict.get("created_at").isoformat()
                        if row_dict.get("created_at")
                        else None,
                        "caption": caption,
                        "author_name": row_dict.get("author_name") or "Unknown",
                        "is_long_video": row_dict.get("is_long_video"),
                        "duration": row_dict.get("duration"),
                        "gcs_urls": {"preview_thumbnail": thumb if thumb else None},
                        "summary": summary,
                    }
                )

            response = jsonify(
                {
                    "reels": transformed_rows,
                    "page": page,
                    "per_page": per_page,
                    "has_more": len(transformed_rows) == per_page,
                }
            )
            return add_no_cache_headers(response)

        # --------------------------------------------------
        # FULL VIEW (no DB 'summary' column assumed)
        # --------------------------------------------------
        sql = """
            SELECT 
                id, source_url, folder_id, is_favorite, status,
                summary_category, summary_title, summary_topic, summary_text,
                summary_bullets, summary_hashtags, summary_emojis,
                content_type, created_at, caption, author_name,
                is_long_video, duration, recipe, workout, transcription,
                gcs_urls::jsonb->'preview_thumbnail' as preview_thumbnail
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

            transcription_raw = row_dict.get("transcription")
            row_dict["transcription"] = parse_transcription(transcription_raw)

            if isinstance(row_dict.get("recipe"), dict):
                row_dict["recipe"] = normalize_recipe(row_dict["recipe"], caption)

            summary_obj, summary_title_str, _english_preview = _build_canonical_summary(row_dict, caption)
            row_dict["summary_title"] = summary_title_str
            row_dict["summary_text"] = summary_obj
            row_dict["summary"] = summary_obj

            row_dict.pop("summary_bullets", None)
            row_dict.pop("summary_hashtags", None)
            row_dict.pop("summary_emojis", None)

            thumb = row_dict.get("preview_thumbnail")
            row_dict["gcs_urls"] = {"preview_thumbnail": thumb if thumb else None}
            row_dict["author_name"] = row_dict.get("author_name") or "Unknown"
            row_dict.pop("preview_thumbnail", None)

            transformed_rows.append(row_dict)

        response = jsonify(
            {
                "reels": transformed_rows,
                "page": page,
                "per_page": per_page,
                "has_more": len(transformed_rows) == per_page,
            }
        )
        return add_no_cache_headers(response)

    except Exception as e:
        logger.error(f"Error in /saved_reels: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@reel_bp.route("/update/<process_id>", methods=["PUT"])
def update_reel(process_id):
    """Update reel folder or favorite status"""
    try:
        try:
            user_id = get_user_id_from_request()
        except ValueError:
            return jsonify({"error": "Authentication required"}), 401

        data = request.get_json()
        if not data:
            return jsonify({"error": "No data provided"}), 400

        updates = []
        params = {}

        if data.get("folder_id") is not None:
            updates.append("folder_id = %(folder_id)s")
            params["folder_id"] = data["folder_id"]

        if data.get("is_favorite") is not None:
            updates.append("is_favorite = %(is_favorite)s")
            params["is_favorite"] = data["is_favorite"]

        if not updates:
            return jsonify({"error": "No valid fields to update"}), 400

        updates.append("updated_at = NOW()")
        params["process_id"] = process_id
        params["user_id"] = user_id

        sql = f"""
            UPDATE reels
            SET {', '.join(updates)}
            WHERE id = %(process_id)s AND user_id = %(user_id)s
            RETURNING id, folder_id, is_favorite
        """

        result = fetch_all(sql, params)

        if not result:
            return jsonify({"error": "Reel not found"}), 404

        updated = dict(result[0]) if hasattr(result[0], "keys") else result[0]._asdict()

        logger.info(f"✅ Updated reel {process_id}: {data}")

        return jsonify(
            {
                "status": "updated",
                "id": updated.get("id"),
                "folder_id": updated.get("folder_id"),
                "is_favorite": updated.get("is_favorite"),
            }
        )

    except Exception as e:
        logger.error(f"Error updating reel {process_id}: {e}", exc_info=True)
        return jsonify({"error": "Internal error"}), 500


@reel_bp.route("/reel/<process_id>", methods=["GET"])
def get_reel(process_id):
    """Fetch a single reel by ID — used by VideoDetail for fast direct lookup"""
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
                id, source_url, folder_id, is_favorite, status,
                summary_category, summary_title, summary_topic, summary_text,
                summary_bullets, summary_hashtags, summary_emojis,
                content_type, created_at, caption, author_name,
                is_long_video, duration, recipe, workout, transcription,
                gcs_urls
            FROM reels
            WHERE user_id = %s AND (id = %s OR id LIKE %s OR source_url LIKE %s)
            LIMIT 1
            """,
            (user_id, process_id, f"{shortcode}%", f"%{shortcode}%"),
        )

        if not row:
            return jsonify({"error": "Reel not found"}), 404

        row_dict = dict(row) if hasattr(row, "keys") else row._asdict()
        caption = row_dict.get("caption") or ""

        row_dict["recipe"] = json_loads_maybe(row_dict.get("recipe"), default=row_dict.get("recipe"))
        row_dict["workout"] = json_loads_maybe(row_dict.get("workout"), default=row_dict.get("workout"))
        row_dict["gcs_urls"] = json_loads_maybe(row_dict.get("gcs_urls"), default=row_dict.get("gcs_urls"))
        row_dict["transcription"] = parse_transcription(row_dict.get("transcription"))

        if isinstance(row_dict.get("recipe"), dict):
            row_dict["recipe"] = normalize_recipe(row_dict["recipe"], caption)

        summary_obj, summary_title_str, _english_preview = _build_canonical_summary(row_dict, caption)
        row_dict["summary_title"] = summary_title_str
        row_dict["summary_text"] = summary_obj
        row_dict["summary"] = summary_obj

        row_dict.pop("summary_bullets", None)
        row_dict.pop("summary_hashtags", None)
        row_dict.pop("summary_emojis", None)

        row_dict["author_name"] = row_dict.get("author_name") or "Unknown"

        if row_dict.get("created_at"):
            row_dict["created_at"] = row_dict["created_at"].isoformat()

        logger.info(f"✅ GET /reel/{process_id} -> {row_dict['id']}")
        response = jsonify(row_dict)
        return add_no_cache_headers(response)

    except Exception as e:
        logger.error(f"Error fetching reel {process_id}: {e}", exc_info=True)
        return jsonify({"error": "Internal error"}), 500


@reel_bp.route("/reel/<process_id>", methods=["DELETE", "OPTIONS"])
def delete_reel(process_id):
    """
    Delete reel from DB + Google Cloud Storage.
    FIXED: Now uniquely targets the process_id folder to avoid accidental cross-deletions.
    """
    if request.method == "OPTIONS":
        return "", 200

    try:
        try:
            user_id = get_user_id_from_request()
        except ValueError:
            return jsonify({"error": "Authentication required"}), 401

        # 1. Fetch the record first to get the GCS URLs and the real ID
        reel_data = fetch_one(
            """
            SELECT id, gcs_urls, source_url 
            FROM reels 
            WHERE user_id = %s AND id = %s 
            LIMIT 1
            """,
            (user_id, process_id),
        )

        if not reel_data:
            logger.warning(f"⚠️ Reel {process_id} not found for user {user_id}")
            return jsonify({"error": "Reel not found"}), 404

        reel_dict = dict(reel_data) if hasattr(reel_data, "keys") else reel_data._asdict()
        actual_id = reel_dict["id"]

        # 2. Delete the specific folder from Google Cloud Storage
        try:
            storage_client = storage.Client()
            bucket_name = os.getenv("GCS_BUCKET_NAME", "recolekt-analysis")
            bucket = storage_client.bucket(bucket_name)
            
            # We prioritize the folder named after the process_id
            target_folder = f"media/IG_reels/{actual_id}/"
            
            logger.info(f"🔍 Attempting to clear GCS folder: {target_folder}")
            blobs = list(bucket.list_blobs(prefix=target_folder))
            
            if blobs:
                for blob in blobs:
                    blob.delete()
                logger.info(f"✅ Deleted {len(blobs)} files from GCS folder: {target_folder}")
            else:
                # FALLBACK: If the folder doesn't exist by ID, check if it's stored under the old shortcode
                gcs_urls = json_loads_maybe(reel_dict.get("gcs_urls"), default={})
                if isinstance(gcs_urls, dict) and gcs_urls.get("preview_thumbnail"):
                    sample = gcs_urls["preview_thumbnail"]
                    if "media/IG_reels/" in sample:
                        folder_name = sample.split("media/IG_reels/")[1].split("/")[0]
                        fallback_folder = f"media/IG_reels/{folder_name}/"
                        
                        fallback_blobs = list(bucket.list_blobs(prefix=fallback_folder))
                        for fb in fallback_blobs:
                            fb.delete()
                        logger.info(f"✅ Deleted {len(fallback_blobs)} files from fallback GCS folder: {fallback_folder}")

        except Exception as gcs_error:
            logger.error(f"❌ GCS deletion error for {actual_id}: {gcs_error}")

        # 3. Finally, delete the row from the database
        execute("DELETE FROM reels WHERE user_id = %s AND id = %s", (user_id, actual_id))
        logger.info(f"✅ Deleted reel {actual_id} from database")

        return jsonify({"status": "deleted", "id": actual_id}), 200

    except Exception as e:
        logger.error(f"❌ Error in delete_reel: {e}", exc_info=True)
        return jsonify({"error": "Internal error", "details": str(e)}), 500

@reel_bp.route("/search", methods=["GET"])
def search_reels():
    """Search user's reels using PostgreSQL full-text search"""
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
                gcs_urls::jsonb as gcs_urls
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

            transcription_raw = row_dict.get("transcription")
            row_dict["transcription"] = parse_transcription(transcription_raw)

            if isinstance(recipe, dict):
                recipe = normalize_recipe(recipe, caption)

            summary_obj, summary_title_str, _english_preview = _build_canonical_summary(row_dict, caption)
            row_dict["summary_title"] = summary_title_str
            row_dict["summary_text"] = summary_obj
            row_dict["summary"] = summary_obj
            row_dict.pop("summary_bullets", None)
            row_dict.pop("summary_hashtags", None)
            row_dict.pop("summary_emojis", None)

            row_dict["content_type"] = row_dict.get("content_type", "generic")
            row_dict["recipe"] = recipe
            row_dict["workout"] = workout

            transformed.append(row_dict)

        return jsonify(transformed)

    except Exception as e:
        logger.error(f"Error in /search: {e}", exc_info=True)
        return jsonify({"error": "Internal error"}), 500

