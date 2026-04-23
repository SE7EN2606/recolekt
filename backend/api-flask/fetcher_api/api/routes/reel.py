"""
Reel management routes - list, update, delete, search
"""
import os
import json
import logging
from decimal import Decimal

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
from fetcher_api.utils.geocode import geocode_one, reverse_geocode_one

logger = logging.getLogger("reels")

reel_bp = Blueprint("reels", __name__)

_PUBLIC_CONTENT_TYPES = {
    "recipe",
    "workout",
    "location",
    "products",
    "software",
    "finance",
    "general",
}

_BLOCKED_MACRO_VALUES = {
    "europe", "europa",
    "alps", "alpine", "dolomites", "mediterranean",
    "scandinavia", "middle east", "southeast asia", "asia", "africa",
    "north america", "south america", "latin america", "oceania",
    "caribbean", "balkans", "nordics", "benelux", "central europe",
    "eastern europe", "western europe", "northern europe", "southern europe",
}


def _normalize_content_type(raw: str | None) -> str:
    ct = (raw or "").strip().lower()

    if not ct or ct in {"generic", "summary"}:
        return "general"

    if ct == "tools":
        return "products"

    return ct if ct in _PUBLIC_CONTENT_TYPES else "general"


def _safe_strip(value) -> str:
    return (value or "").strip() if isinstance(value, str) or value is None else str(value).strip()


def _null_if_blocked_macro_region(value: str) -> str:
    cleaned = _safe_strip(value)
    if not cleaned:
        return ""
    return "" if cleaned.lower() in _BLOCKED_MACRO_VALUES else cleaned


def _json_safe_value(value):
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, list):
        return [_json_safe_value(v) for v in value]
    if isinstance(value, dict):
        return {k: _json_safe_value(v) for k, v in value.items()}
    return value


def _json_dumps_safe(value) -> str:
    return json.dumps(_json_safe_value(value), ensure_ascii=False)


def add_no_cache_headers(response):
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
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

    extracted = extract_english_preview_and_title(summary_obj, summary_title_db)

    if isinstance(extracted, tuple):
        if len(extracted) == 3:
            english_preview, summary_title_str, _ = extracted
        elif len(extracted) == 2:
            english_preview, summary_title_str = extracted
        elif len(extracted) == 1:
            english_preview = extracted[0]
            summary_title_str = summary_title_db
        else:
            english_preview = ""
            summary_title_str = summary_title_db
    else:
        english_preview = ""
        summary_title_str = summary_title_db

    if not summary_title_str and caption:
        summary_title_str = caption[:50]

    return summary_obj, summary_title_str, english_preview


def _merge_geocoded_coords(location_raw, geocoded_rows: list[dict]) -> list[dict] | dict | None:
    if not location_raw or not geocoded_rows:
        return location_raw

    rows_by_pos: dict[int, dict] = {row["position"]: row for row in geocoded_rows}

    is_single = isinstance(location_raw, dict)
    locations = [location_raw] if is_single else location_raw

    enriched = []
    for idx, loc in enumerate(locations, start=1):
        if not isinstance(loc, dict):
            enriched.append(loc)
            continue

        row = rows_by_pos.get(idx)
        if not row:
            enriched.append(loc)
            continue

        merged = dict(loc)

        for json_key, db_key in (
            ("name", "name"),
            ("description", "description"),
            ("address", "address"),
            ("neighborhood", "neighborhood"),
            ("city", "city"),
            ("region", "region"),
            ("country", "country"),
            ("postal_code", "postal_code"),
            ("instagram_username", "instagram_username"),
            ("instagram_account_name", "instagram_account_name"),
            ("google_place_id", "google_place_id"),
            ("maps_url", "maps_url"),
        ):
            if not merged.get(json_key) and row.get(db_key):
                merged[json_key] = row[db_key]

        if not merged.get("type") and row.get("place_type"):
            merged["type"] = row["place_type"]

        if not merged.get("place_type") and row.get("place_type"):
            merged["place_type"] = row["place_type"]

        if merged.get("lat") is None and row.get("lat") is not None:
            merged["lat"] = float(row["lat"]) if isinstance(row["lat"], Decimal) else row["lat"]
        if merged.get("lng") is None and row.get("lng") is not None:
            merged["lng"] = float(row["lng"]) if isinstance(row["lng"], Decimal) else row["lng"]

        enriched.append(merged)

    return enriched[0] if is_single else enriched


def _fetch_geocoded_rows(reel_id: str, user_id: str) -> list[dict]:
    rows = fetch_all(
        """
        SELECT
            position,
            name,
            place_type,
            description,
            address,
            neighborhood,
            city,
            region,
            country,
            postal_code,
            instagram_username,
            instagram_account_name,
            lat,
            lng,
            google_place_id,
            maps_url
        FROM reel_locations
        WHERE reel_id = %s AND user_id = %s
        ORDER BY position
        """,
        (reel_id, user_id),
    )
    if not rows:
        return []
    return [dict(r) if hasattr(r, "keys") else r._asdict() for r in rows]


def _reel_exists(process_id: str, user_id: str) -> bool:
    row = fetch_one(
        "SELECT id FROM reels WHERE id = %s AND user_id = %s LIMIT 1",
        (process_id, user_id),
    )
    return bool(row)


def _fill_place_locality_from_reverse(place: dict) -> dict:
    if not isinstance(place, dict):
        return place

    merged = dict(place)
    lat = merged.get("lat")
    lng = merged.get("lng")

    if lat is None or lng is None:
        return merged

    if merged.get("city") and merged.get("region") and merged.get("country"):
        return merged

    reverse_data = reverse_geocode_one(lat, lng) or {}
    if not reverse_data:
        return merged

    for field in ("neighborhood", "city", "region", "country", "postal_code"):
        if not merged.get(field) and reverse_data.get(field):
            merged[field] = reverse_data[field]

    return merged


def _fill_location_locality_from_reverse(location):
    if isinstance(location, dict):
        return _fill_place_locality_from_reverse(location)

    if isinstance(location, list):
        return [
            _fill_place_locality_from_reverse(loc) if isinstance(loc, dict) else loc
            for loc in location
        ]

    return location


def _merge_row_location_from_db(row_dict: dict, reel_id: str, user_id: str) -> dict:
    if not row_dict.get("location"):
        return row_dict

    geocoded_rows = _fetch_geocoded_rows(reel_id, user_id)
    if geocoded_rows:
        row_dict["location"] = _merge_geocoded_coords(row_dict["location"], geocoded_rows)

    return row_dict


def _upsert_reel_locations_conn(conn, reel_id: str, user_id: str, location) -> int:
    with conn.cursor() as cur:
        cur.execute(
            "DELETE FROM reel_locations WHERE reel_id = %s AND user_id = %s",
            (reel_id, user_id),
        )

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
            (loc.get("region") or "").strip() or None,
            (loc.get("country") or "").strip() or None,
            (loc.get("postal_code") or "").strip() or None,
            (loc.get("instagram_username") or "").strip() or None,
            (loc.get("instagram_account_name") or "").strip() or None,
            loc.get("lat"),
            loc.get("lng"),
            (loc.get("google_place_id") or "").strip() or None,
            (loc.get("maps_url") or "").strip() or None,
        ))

    if not rows:
        return 0

    sql = """
        INSERT INTO reel_locations (
            reel_id, user_id, position,
            name, place_type, description,
            address, neighborhood, city,
            region, country, postal_code,
            instagram_username, instagram_account_name,
            lat, lng, google_place_id, maps_url
        )
        VALUES %s
        ON CONFLICT (reel_id, user_id, position) DO UPDATE SET
            name                   = EXCLUDED.name,
            place_type             = EXCLUDED.place_type,
            description            = EXCLUDED.description,
            address                = EXCLUDED.address,
            neighborhood           = EXCLUDED.neighborhood,
            city                   = EXCLUDED.city,
            region                 = EXCLUDED.region,
            country                = EXCLUDED.country,
            postal_code            = EXCLUDED.postal_code,
            instagram_username     = EXCLUDED.instagram_username,
            instagram_account_name = EXCLUDED.instagram_account_name,
            lat                    = COALESCE(EXCLUDED.lat, reel_locations.lat),
            lng                    = COALESCE(EXCLUDED.lng, reel_locations.lng),
            google_place_id        = COALESCE(EXCLUDED.google_place_id, reel_locations.google_place_id),
            maps_url               = COALESCE(EXCLUDED.maps_url, reel_locations.maps_url);
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
    row_dict["content_type"] = _normalize_content_type(row_dict.get("content_type"))

    created_at = row_dict.get("created_at")
    if created_at and hasattr(created_at, "isoformat"):
        row_dict["created_at"] = created_at.isoformat()

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


def _derive_gcs_artifacts(process_id: str, source_url: str, user_id: str):
    platform_code = _detect_platform_code(source_url)
    shortcode = process_id.split("--")[0] if "--" in process_id else process_id.split("_")[0]
    gcs_paths = generate_gcs_paths(shortcode, platform_code, user_id=user_id)
    bucket_name = os.getenv("GCS_BUCKET_NAME", "recolekt-storage")
    gcs_urls = {
        key: f"https://storage.googleapis.com/{bucket_name}/{path}"
        for key, path in gcs_paths.items()
    }
    return bucket_name, gcs_paths, gcs_urls


def _build_reel_payload_for_api(process_id: str, user_id: str, include_prompt: bool = True) -> dict | None:
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
        return None

    row_dict = dict(row) if hasattr(row, "keys") else row._asdict()
    row_dict = _normalize_row_for_api(row_dict, include_prompt=include_prompt)
    row_dict = _merge_row_location_from_db(row_dict, process_id, user_id)

    source_url = row_dict.get("source_url") or ""
    _, gcs_paths, derived_urls = _derive_gcs_artifacts(process_id, source_url, user_id)

    existing_urls = row_dict.get("gcs_urls")
    if not isinstance(existing_urls, dict):
        existing_urls = {}
    for key, value in derived_urls.items():
        existing_urls.setdefault(key, value)

    row_dict["gcs_paths"] = gcs_paths
    row_dict["gcs_urls"] = existing_urls
    row_dict["process_id"] = row_dict.get("id")
    row_dict["user_id"] = row_dict.get("user_id") or user_id

    return _json_safe_value(row_dict)


def _refresh_result_json_in_gcs(process_id: str, user_id: str, include_prompt: bool = True) -> dict | None:
    payload = _build_reel_payload_for_api(process_id, user_id, include_prompt=include_prompt)
    if not payload:
        return None

    try:
        from fetcher_api.adapters.gcs_client import gcs_client

        if not gcs_client.available:
            logger.warning("GCS not available — skipping refreshed result_json upload")
            return payload

        source_url = payload.get("source_url") or ""
        bucket_name = getattr(gcs_client, "analysis_bucket_name", None) or os.getenv("GCS_BUCKET_NAME", "recolekt-storage")
        _, gcs_paths, gcs_urls = _derive_gcs_artifacts(process_id, source_url, user_id)

        payload["gcs_paths"] = gcs_paths
        existing_urls = payload.get("gcs_urls")
        if not isinstance(existing_urls, dict):
            existing_urls = {}
        for key, value in gcs_urls.items():
            existing_urls.setdefault(key, value)
        payload["gcs_urls"] = existing_urls

        bucket = gcs_client.client.bucket(bucket_name)
        blob = bucket.blob(gcs_paths["result_json"])
        blob.upload_from_string(
            _json_dumps_safe(payload),
            content_type="application/json",
        )
        logger.info(
            "📄 PATCH /reel/%s/location — refreshed GCS result JSON -> %s",
            process_id,
            gcs_paths["result_json"],
        )

    except Exception as exc:
        logger.warning(
            "⚠️ PATCH /reel/%s/location — failed to refresh GCS result JSON: %s",
            process_id,
            exc,
        )

    return payload


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

        row_dict = _build_reel_payload_for_api(process_id, user_id, include_prompt=True)
        if not row_dict:
            return jsonify({"error": "Reel not found"}), 404

        logger.info(f"✅ GET /reel/{process_id} -> {row_dict['id']}")
        return add_no_cache_headers(jsonify(row_dict))

    except Exception as e:
        logger.error(f"Error fetching reel {process_id}: {e}", exc_info=True)
        return jsonify({"error": "Internal error"}), 500


def _delete_reel(process_id):
    try:
        try:
            user_id = get_user_id_from_request()
        except ValueError:
            return jsonify({"error": "Authentication required"}), 401

        row = fetch_one(
            """
            SELECT id, source_url
            FROM reels
            WHERE id = %s AND user_id = %s
            LIMIT 1
            """,
            (process_id, user_id),
        )

        if not row:
            logger.warning("⚠️ Reel %s not found for user %s", process_id, user_id)
            return jsonify({"error": "Reel not found"}), 404

        row_dict = dict(row) if hasattr(row, "keys") else row._asdict()
        source_url = row_dict.get("source_url") or ""

        try:
            from fetcher_api.adapters.gcs_client import gcs_client

            if gcs_client.available:
                bucket_name = (
                    getattr(gcs_client, "analysis_bucket_name", None)
                    or os.getenv("GCS_BUCKET_NAME", "recolekt-storage")
                )
                _, gcs_paths, _ = _derive_gcs_artifacts(process_id, source_url, user_id)

                any_path = next(iter(gcs_paths.values()), "")
                prefix = f"{any_path.rsplit('/', 1)[0]}/" if "/" in any_path else ""

                if prefix:
                    logger.info("🔍 Attempting to clear GCS folder: %s", prefix)
                    bucket = gcs_client.client.bucket(bucket_name)
                    blobs = list(bucket.list_blobs(prefix=prefix))

                    deleted = 0
                    for blob in blobs:
                        try:
                            blob.delete()
                            deleted += 1
                        except Exception as blob_exc:
                            logger.warning(
                                "⚠️ Failed deleting GCS blob %s for reel %s: %s",
                                blob.name,
                                process_id,
                                blob_exc,
                            )

                    logger.info("✅ Deleted %d files from GCS: %s", deleted, prefix)

        except Exception as exc:
            logger.warning(
                "⚠️ Failed to clear GCS assets for reel %s: %s",
                process_id,
                exc,
            )

        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "DELETE FROM reel_locations WHERE reel_id = %s AND user_id = %s",
                    (process_id, user_id),
                )

                try:
                    cur.execute(
                        "DELETE FROM saved_places WHERE video_id = %s AND user_id = %s",
                        (process_id, user_id),
                    )
                except Exception as saved_places_exc:
                    logger.warning(
                        "⚠️ Failed deleting saved_places for reel %s: %s",
                        process_id,
                        saved_places_exc,
                    )

                cur.execute(
                    "DELETE FROM reels WHERE id = %s AND user_id = %s",
                    (process_id, user_id),
                )
                deleted_rows = cur.rowcount

            conn.commit()

        if not deleted_rows:
            logger.warning("⚠️ Reel %s vanished before delete commit", process_id)
            return jsonify({"error": "Reel not found"}), 404

        logger.info("✅ Deleted reel %s from database", process_id)
        return jsonify({"status": "deleted", "id": process_id}), 200

    except Exception as e:
        logger.error(f"❌ Error deleting reel {process_id}: {e}", exc_info=True)
        return jsonify({"error": "Internal error"}), 500


@reel_bp.route("/reel/<process_id>/location", methods=["PATCH"])
def patch_reel_location(process_id):
    try:
        try:
            user_id = get_user_id_from_request()
        except ValueError:
            return jsonify({"error": "Authentication required"}), 401

        if not _reel_exists(process_id, user_id):
            logger.warning("⚠️ PATCH /reel/%s/location — reel not found", process_id)
            return jsonify({"error": "Reel not found"}), 404

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
        all_already_done = geocoded_count > 0 and geocoded_count >= len(location)

        if all_already_done:
            geocoded_rows = _fetch_geocoded_rows(process_id, user_id)
            if geocoded_rows:
                enriched = _merge_geocoded_coords(location, geocoded_rows)
                enriched = _fill_location_locality_from_reverse(enriched)
                enriched = _json_safe_value(enriched)

                with get_db_connection() as conn:
                    with conn.cursor() as cur:
                        cur.execute(
                            "SELECT 1 FROM reels WHERE id = %s AND user_id = %s FOR UPDATE",
                            (process_id, user_id),
                        )
                        if not cur.fetchone():
                            conn.rollback()
                            return jsonify({"error": "Reel not found"}), 404

                        cur.execute(
                            """
                            UPDATE reels
                            SET location = %s::jsonb, updated_at = NOW()
                            WHERE id = %s AND user_id = %s
                            """,
                            (_json_dumps_safe(enriched), process_id, user_id),
                        )
                    saved = _upsert_reel_locations_conn(conn, process_id, user_id, enriched)
                    conn.commit()

                refreshed_payload = _refresh_result_json_in_gcs(process_id, user_id, include_prompt=True)
                response_location = (
                    refreshed_payload.get("location")
                    if isinstance(refreshed_payload, dict) and refreshed_payload.get("location") is not None
                    else _json_safe_value(enriched)
                )

                logger.info(
                    "📍 PATCH /reel/%s/location — already geocoded, refreshed JSONB and %d reel_location rows",
                    process_id, saved,
                )
                return jsonify({
                    "status": "already_geocoded",
                    "count": geocoded_count,
                    "saved": saved,
                    "location": response_location,
                }), 200

            return jsonify({"status": "already_geocoded", "count": geocoded_count}), 200

        enriched = []
        for idx, loc in enumerate(location, start=1):
            if not isinstance(loc, dict):
                enriched.append(loc)
                continue

            if loc.get("lat") is not None and loc.get("lng") is not None:
                merged = _fill_place_locality_from_reverse(dict(loc))
                enriched.append(_json_safe_value(merged))
                continue

            name = _safe_strip(loc.get("name"))
            address = _safe_strip(loc.get("address"))
            neighborhood = _null_if_blocked_macro_region(_safe_strip(loc.get("neighborhood")))
            city = _null_if_blocked_macro_region(_safe_strip(loc.get("city")))
            region = _null_if_blocked_macro_region(_safe_strip(loc.get("region")))
            country = _null_if_blocked_macro_region(_safe_strip(loc.get("country")))
            postal_code = _safe_strip(loc.get("postal_code"))

            logger.info(
                "📍 PATCH /reel/%s/location geocode input #%d — name=%r address=%r neighborhood=%r city=%r region=%r postal_code=%r country=%r",
                process_id, idx, name, address, neighborhood, city, region, postal_code, country,
            )

            coords = geocode_one(
                name=name,
                address=address,
                neighborhood=neighborhood,
                city=city,
                region=region,
                country=country,
                postal_code=postal_code,
            )

            merged = dict(loc)
            if coords:
                merged["lat"], merged["lng"] = coords
                merged = _fill_place_locality_from_reverse(merged)

                logger.info(
                    "📍 PATCH /reel/%s/location geocode success #%d — %r -> %.6f, %.6f",
                    process_id, idx, name, merged["lat"], merged["lng"],
                )
            else:
                logger.info(
                    "📍 PATCH /reel/%s/location geocode miss #%d — %r",
                    process_id, idx, name,
                )

            enriched.append(_json_safe_value(merged))

        incoming_with_coords = sum(
            1 for loc in enriched
            if isinstance(loc, dict) and loc.get("lat") is not None
        )

        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT 1 FROM reels WHERE id = %s AND user_id = %s FOR UPDATE",
                    (process_id, user_id),
                )
                if not cur.fetchone():
                    conn.rollback()
                    return jsonify({"error": "Reel not found"}), 404

                cur.execute(
                    """
                    UPDATE reels
                    SET location = %s::jsonb, updated_at = NOW()
                    WHERE id = %s AND user_id = %s
                    """,
                    (_json_dumps_safe(enriched), process_id, user_id),
                )

            saved = _upsert_reel_locations_conn(conn, process_id, user_id, enriched)
            conn.commit()

        refreshed_payload = _refresh_result_json_in_gcs(process_id, user_id, include_prompt=True)
        response_location = (
            refreshed_payload.get("location")
            if isinstance(refreshed_payload, dict) and refreshed_payload.get("location") is not None
            else _json_safe_value(enriched)
        )

        logger.info(
            "✅ PATCH /reel/%s/location — %d places, %d/%d geocoded, %d reel_location rows saved",
            process_id, len(enriched), incoming_with_coords, len(enriched), saved,
        )
        return jsonify({
            "status": "ok",
            "saved": saved,
            "location": response_location,
        }), 200

    except Exception as e:
        logger.error(f"❌ Error patching location for {process_id}: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500