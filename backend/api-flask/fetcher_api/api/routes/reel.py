# fetcher_api/api/routes/reel.py
"""
Reel management routes - list, update, delete, search
"""
import os
import json
import logging


from flask import Blueprint, request, jsonify
import psycopg2.extras


from fetcher_api.adapters.db import execute, fetch_all, fetch_one, get_db_connection
from fetcher_api.api.helpers.auth import get_user_id_from_request
from fetcher_api.api.helpers.formatters import (
    json_loads_maybe,
    build_bilingual_summary_object,
    extract_english_preview_and_title,
)
from fetcher_api.api.helpers.recipe_formatters import normalize_recipe
from fetcher_api.services.storage import generate_gcs_paths


logger = logging.getLogger("reels")


reel_bp = Blueprint("reels", __name__)


# Canonical content types the frontend understands.
# "products" is the AI's public label for what is internally "tools" — normalize it here
# so the frontend always receives a consistent value.
_VALID_CONTENT_TYPES = {"recipe", "general", "workout", "tools", "location"}
_CONTENT_TYPE_ALIASES = {"products": "tools"}


def _normalize_content_type(raw: str | None) -> str:
    if not raw:
        return "general"
    normalized = _CONTENT_TYPE_ALIASES.get(raw, raw)
    return normalized if normalized in _VALID_CONTENT_TYPES else "general"


def add_no_cache_headers(response):
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response


def add_short_cache_headers(response):
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
        bullets = json_loads_maybe(row_dict.get("summary_bullets"), default=row_dict.get("summary_bullets"))
        hashtags = json_loads_maybe(row_dict.get("summary_hashtags"), default=row_dict.get("summary_hashtags"))
        emojis = json_loads_maybe(row_dict.get("summary_emojis"), default=row_dict.get("summary_emojis"))

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

    english_preview, summary_title_str = extract_english_preview_and_title(summary_obj, summary_title_db)

    if not summary_title_str and caption:
        summary_title_str = caption[:50]

    return summary_obj, summary_title_str, english_preview


def _merge_geocoded_coords(location_raw, geocoded_rows: list[dict]) -> list[dict] | dict | None:
    if not location_raw or not geocoded_rows:
        return location_raw

    coords_by_pos: dict[int, dict] = {row["position"]: row for row in geocoded_rows}

    is_single = isinstance(location_raw, dict)
    locations = [location_raw] if is_single else location_raw

    enriched = []
    for idx, loc in enumerate(locations, start=1):
        if not isinstance(loc, dict):
            enriched.append(loc)
            continue

        geo = coords_by_pos.get(idx)
        if not geo:
            enriched.append(loc)
            continue

        merged = dict(loc)
        if not merged.get("lat") and geo.get("lat") is not None:
            merged["lat"] = geo["lat"]
        if not merged.get("lng") and geo.get("lng") is not None:
            merged["lng"] = geo["lng"]
        if not merged.get("google_place_id") and geo.get("google_place_id"):
            merged["google_place_id"] = geo["google_place_id"]
        if not merged.get("maps_url") and geo.get("maps_url"):
            merged["maps_url"] = geo["maps_url"]

        enriched.append(merged)

    return enriched[0] if is_single else enriched


def _fetch_geocoded_rows(reel_id: str, user_id: str) -> list[dict]:
    rows = fetch_all(
        """
        SELECT position, lat, lng, google_place_id, maps_url
        FROM reel_locations
        WHERE reel_id = %s AND user_id = %s AND lat IS NOT NULL
        ORDER BY position
        """,
        (reel_id, user_id),
    )
    if not rows:
        return []
    return [dict(r) if hasattr(r, "keys") else r._asdict() for r in rows]


def _upsert_reel_locations_conn(conn, reel_id: str, user_id: str, location) -> int:
    if not location:
        return 0

    locations = location if isinstance(location, list) else [location]
    locations = [loc for loc in locations if isinstance(loc, dict) and loc.get("name")]

    if not locations:
        return 0

    rows = []
    for idx, loc in enumerate(locations, start=1):
        name = (loc.get("name") or "").strip()
        if not name:
            continue
        rows.append((
            reel_id,
            user_id,
            idx,
            name,
            (loc.get("type") or loc.get("place_type") or "").strip() or None,
            (loc.get("description") or "").strip() or None,
            (loc.get("address") or "").strip() or None,
            (loc.get("neighborhood") or "").strip() or None,
            (loc.get("city") or "").strip() or None,
            loc.get("lat"),
            loc.get("lng"),
            loc.get("google_place_id"),
            loc.get("maps_url"),
        ))

    if not rows:
        return 0

    sql = """
        INSERT INTO reel_locations (
            reel_id, user_id, position,
            name, place_type, description,
            address, neighborhood, city,
            lat, lng, google_place_id, maps_url
        )
        VALUES %s
        ON CONFLICT (reel_id, user_id, position) DO UPDATE SET
            name            = EXCLUDED.name,
            place_type      = EXCLUDED.place_type,
            description     = EXCLUDED.description,
            address         = EXCLUDED.address,
            neighborhood    = EXCLUDED.neighborhood,
            city            = EXCLUDED.city,
            lat             = COALESCE(EXCLUDED.lat, reel_locations.lat),
            lng             = COALESCE(EXCLUDED.lng, reel_locations.lng),
            google_place_id = COALESCE(EXCLUDED.google_place_id, reel_locations.google_place_id),
            maps_url        = COALESCE(EXCLUDED.maps_url, reel_locations.maps_url);
    """

    with conn.cursor() as cur:
        psycopg2.extras.execute_values(cur, sql, rows)

    return len(rows)


def _normalize_row_for_api(row_dict: dict, include_prompt: bool = False) -> dict:
    caption = row_dict.get("caption") or ""

    row_dict["recipe"] = json_loads_maybe(row_dict.get("recipe"), default=row_dict.get("recipe"))
    row_dict["workout"] = json_loads_maybe(row_dict.get("workout"), default=row_dict.get("workout"))
    row_dict["tools_list"] = json_loads_maybe(row_dict.get("tools_list"), default=row_dict.get("tools_list"))
    row_dict["location"] = json_loads_maybe(row_dict.get("location"), default=row_dict.get("location"))
    row_dict["gcs_urls"] = json_loads_maybe(row_dict.get("gcs_urls"), default={})
    row_dict["transcription"] = parse_transcription(row_dict.get("transcription"))

    if include_prompt:
        row_dict["prompt"] = json_loads_maybe(row_dict.get("prompt"), default=row_dict.get("prompt"))
    else:
        row_dict.pop("prompt", None)

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
    row_dict["is_list"] = bool(row_dict.get("is_list", False))

    # Normalize content_type: "products" → "tools", unknown → "general"
    row_dict["content_type"] = _normalize_content_type(row_dict.get("content_type"))

    if row_dict.get("created_at"):
        row_dict["created_at"] = row_dict["created_at"].isoformat()

    return row_dict


def _detect_platform_code(source_url: str) -> str:
    url = (source_url or "").lower()
    if "youtube.com" in url or "youtu.be" in url:
        return "YT"
    if "tiktok.com" in url or "vm.tiktok.com" in url or "vt.tiktok.com" in url:
        return "TT"
    if "facebook.com" in url or "fb." in url:
        return "FB"
    return "IG"


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
                    tools_list, location, recipe,
                    is_list, list_subtype, list_count, list_type,
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

                row_dict = _normalize_row_for_api(row_dict, include_prompt=False)

                transformed_rows.append({
                    "id": row_dict["id"],
                    "source_url": row_dict.get("source_url"),
                    "folder_id": row_dict.get("folder_id"),
                    "is_favorite": row_dict.get("is_favorite"),
                    "status": row_dict.get("status") or "processing",
                    "content_type": row_dict.get("content_type"),
                    "created_at": row_dict.get("created_at"),
                    "caption": row_dict.get("caption") or "",
                    "author_name": row_dict.get("author_name"),
                    "is_long_video": row_dict.get("is_long_video"),
                    "duration": row_dict.get("duration"),
                    "gcs_urls": row_dict.get("gcs_urls") or {},
                    "tools_list": row_dict.get("tools_list"),
                    "location": row_dict.get("location"),
                    "recipe": row_dict.get("recipe"),
                    "is_list": row_dict.get("is_list"),
                    "list_subtype": row_dict.get("list_subtype"),
                    "list_count": row_dict.get("list_count"),
                    "list_type": row_dict.get("list_type"),
                    "summary": row_dict.get("summary"),
                    "title": row_dict.get("title"),
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
                tools_list, location, prompt,
                is_list, list_subtype, list_count, list_type,
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

            row_dict = _normalize_row_for_api(row_dict, include_prompt=True)
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
# GET SINGLE + DELETE
# ──────────────────────────────────────────────────────────────────────────────


@reel_bp.route("/reel/<process_id>", methods=["GET", "DELETE", "OPTIONS"])
def reel_detail(process_id):
    if request.method == "OPTIONS":
        return "", 200
    if request.method == "GET":
        return _get_reel(process_id)
    if request.method == "DELETE":
        return _delete_reel(process_id)


def _get_reel(process_id):
    try:
        try:
            user_id = get_user_id_from_request()
        except ValueError:
            return jsonify({"error": "Authentication required"}), 401

        row = fetch_one(
            """
            SELECT
                id, user_id, source_url, folder_id, is_favorite, status,
                summary_category, summary_title, summary_topic, summary_text,
                summary_bullets, summary_hashtags, summary_emojis,
                content_type, created_at, caption, author_name,
                is_long_video, duration, recipe, workout, transcription,
                tools_list, location, prompt,
                is_list, list_subtype, list_count, list_type,
                gcs_urls
            FROM reels
            WHERE user_id = %s AND id = %s
            LIMIT 1
            """,
            (user_id, process_id),
        )

        if not row:
            return jsonify({"error": "Reel not found"}), 404

        row_dict = dict(row) if hasattr(row, "keys") else row._asdict()
        row_dict = _normalize_row_for_api(row_dict, include_prompt=True)

        if row_dict.get("location"):
            geocoded_rows = _fetch_geocoded_rows(process_id, user_id)
            if geocoded_rows:
                row_dict["location"] = _merge_geocoded_coords(row_dict["location"], geocoded_rows)
                logger.debug(
                    "📍 GET /reel/%s — merged %d geocoded rows into location",
                    process_id, len(geocoded_rows),
                )

        logger.info(f"✅ GET /reel/{process_id} -> {row_dict['id']}")
        return add_short_cache_headers(jsonify(row_dict))

    except Exception as e:
        logger.error(f"Error fetching reel {process_id}: {e}", exc_info=True)
        return jsonify({"error": "Internal error"}), 500


def _delete_reel(process_id):
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
            from fetcher_api.adapters.gcs_client import gcs_client

            if not gcs_client.available:
                logger.warning("GCS not available — skipping file deletion")
            else:
                bucket_name = getattr(gcs_client, "analysis_bucket_name", None) or os.getenv("GCS_BUCKET_NAME", "recolekt-storage")
                bucket = gcs_client.client.bucket(bucket_name)

                source_url = reel_dict.get("source_url") or ""
                platform_code = _detect_platform_code(source_url)
                shortcode = actual_id.split("--")[0] if "--" in actual_id else actual_id.split("_")[0]

                gcs_paths = generate_gcs_paths(shortcode, platform_code, user_id=user_id)
                target_folder = "/".join(gcs_paths["video"].split("/")[:-1]) + "/"

                logger.info(f"🔍 Attempting to clear GCS folder: {target_folder}")
                blobs = list(bucket.list_blobs(prefix=target_folder))
                if blobs:
                    for blob in blobs:
                        blob.delete()
                    logger.info(f"✅ Deleted {len(blobs)} files from GCS: {target_folder}")
                else:
                    logger.info(f"ℹ️ No GCS files found at: {target_folder}")

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
# PATCH LOCATION
# ──────────────────────────────────────────────────────────────────────────────


@reel_bp.route("/reel/<process_id>/location", methods=["PATCH"])
def patch_reel_location(process_id):
    try:
        try:
            user_id = get_user_id_from_request()
        except ValueError:
            return jsonify({"error": "Authentication required"}), 401

        data = request.get_json(silent=True)
        if not data or "location" not in data:
            return jsonify({"error": "Missing location array"}), 400

        location = data["location"]
        if not isinstance(location, list):
            return jsonify({"error": "location must be an array"}), 400

        already_geocoded = fetch_one(
            """
            SELECT COUNT(*) AS cnt
            FROM reel_locations
            WHERE reel_id = %s AND user_id = %s AND lat IS NOT NULL
            """,
            (process_id, user_id),
        )
        geocoded_count = (already_geocoded["cnt"] if already_geocoded else 0) or 0

        incoming_with_coords = sum(
            1 for loc in location
            if isinstance(loc, dict) and loc.get("lat") is not None
        )

        if geocoded_count > 0 and geocoded_count >= len(location):
            logger.info(
                "📍 PATCH /reel/%s/location — skipped, %d/%d rows already geocoded in reel_locations",
                process_id, geocoded_count, len(location),
            )
            return jsonify({"status": "already_geocoded", "count": geocoded_count}), 200

        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE reels
                    SET location = %s::jsonb, updated_at = NOW()
                    WHERE id = %s AND user_id = %s
                    """,
                    (json.dumps(location), process_id, user_id),
                )

            saved = _upsert_reel_locations_conn(conn, process_id, user_id, location)
            conn.commit()

        logger.info(
            "✅ PATCH /reel/%s/location — %d places in jsonb, %d rows in reel_locations (coords: %d/%d)",
            process_id, len(location), saved, incoming_with_coords, len(location),
        )
        return jsonify({"status": "ok", "saved": saved}), 200

    except Exception as e:
        logger.error(f"❌ Error patching location for {process_id}: {e}", exc_info=True)
        return jsonify({"error": "Internal error"}), 500


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
                tools_list, location, prompt,
                is_list, list_subtype, list_count, list_type,
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

            row_dict = _normalize_row_for_api(row_dict, include_prompt=True)
            transformed.append(row_dict)

        return jsonify(transformed)

    except Exception as e:
        logger.error(f"Error in /search: {e}", exc_info=True)
        return jsonify({"error": "Internal error"}), 500