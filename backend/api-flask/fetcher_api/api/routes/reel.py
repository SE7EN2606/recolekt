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
from fetcher_api.api.helpers.recipe_formatters import normalize_recipe_for_display
from fetcher_api.services.storage import generate_gcs_paths, platform_reels_folder
from fetcher_api.services.recipe_assistant import answer_recipe_question
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


def _ensure_shopping_list(cur, user_id: str) -> int:
    cur.execute(
        """
        INSERT INTO shopping_lists (user_id, created_at, updated_at)
        VALUES (%s, NOW(), NOW())
        ON CONFLICT (user_id) DO UPDATE SET updated_at = shopping_lists.updated_at
        RETURNING id
        """,
        (user_id,),
    )
    return int(cur.fetchone()["id"])


def _serialize_shopping_override(row) -> dict:
    d = dict(row) if hasattr(row, "keys") else row._asdict()
    return {
        "ingredientKey": d.get("ingredient_key") or "",
        "checked": bool(d.get("checked")),
        "excluded": bool(d.get("excluded")),
        "updatedAt": d.get("updated_at").isoformat() if d.get("updated_at") else None,
    }


def _serialize_shopping_entry(row) -> dict:
    d = dict(row) if hasattr(row, "keys") else row._asdict()
    entry_id = d.pop("entry_id", None)
    servings = d.pop("entry_servings", None)
    added_at = d.pop("entry_added_at", None)
    recipe_override_payload = d.pop("recipe_override_payload", None) or {}
    recipe_verified_by_user = d.pop("recipe_verified_by_user", False)
    recipe_override_updated_at = d.pop("recipe_override_updated_at", None)
    d.pop("shopping_list_id", None)
    if isinstance(recipe_override_payload, str):
        recipe_override_payload = json_loads_maybe(recipe_override_payload, default={})
    if not isinstance(recipe_override_payload, dict):
        recipe_override_payload = {}
    reel = _normalize_row_for_api(
        d,
        include_prompt=False,
        measurement_system=_measurement_system_for_user(d.get("user_id")),
    )
    reel = _merge_row_location_from_db(reel, reel.get("id"), reel.get("user_id"))
    reel["process_id"] = reel.get("id")
    recipe_overrides = {
        "verifiedByUser": bool(recipe_verified_by_user),
        "overridePayload": recipe_override_payload,
        "updatedAt": recipe_override_updated_at.isoformat() if recipe_override_updated_at else None,
    }
    reel["recipeUserOverrides"] = recipe_overrides
    reel["recipe_user_overrides"] = recipe_overrides
    return {
        "id": entry_id,
        "reelId": reel.get("id"),
        "servings": float(servings) if servings is not None else None,
        "addedAt": added_at.isoformat() if added_at else None,
        "recipe": _json_safe_value(reel),
    }


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


def _apply_media_aliases(row_dict: dict) -> dict:
    gcs_urls = row_dict.get("gcs_urls")
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

    row_dict["gcs_urls"] = gcs_urls

    row_dict["thumbnailUrl"] = thumb
    row_dict["thumbnail_url"] = thumb
    row_dict["posterUrl"] = thumb
    row_dict["poster_url"] = thumb
    row_dict["image_url"] = thumb
    row_dict["cover_url"] = thumb

    row_dict["result_json_url"] = result_json
    row_dict["resultJsonUrl"] = result_json

    row_dict["video_url"] = video_url
    row_dict["videoUrl"] = video_url

    return row_dict


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


def _normalize_row_for_api(
    row_dict: dict,
    include_prompt: bool = False,
    measurement_system: str | None = None,
) -> dict:
    caption = row_dict.get("caption") or ""

    row_dict["recipe"] = json_loads_maybe(row_dict.get("recipe"), default=row_dict.get("recipe"))
    row_dict["workout"] = json_loads_maybe(row_dict.get("workout"), default=row_dict.get("workout"))
    row_dict["tools_list"] = json_loads_maybe(row_dict.get("tools_list"), default=row_dict.get("tools_list"))
    row_dict["location"] = json_loads_maybe(row_dict.get("location"), default=row_dict.get("location"))
    row_dict["gcs_urls"] = json_loads_maybe(row_dict.get("gcs_urls"), default={}) or {}
    row_dict["transcription"] = parse_transcription(row_dict.get("transcription"))

    if include_prompt:
        row_dict["prompt"] = json_loads_maybe(row_dict.get("prompt"), default=row_dict.get("prompt"))
    else:
        row_dict.pop("prompt", None)

    if isinstance(row_dict.get("recipe"), dict):
        row_dict["recipe"] = normalize_recipe_for_display(
            row_dict["recipe"],
            caption,
            measurement_system or "metric",
        )

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

    return _apply_media_aliases(row_dict)


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


def _gcs_blob_name_from_public_url(url: str) -> str | None:
    """
    Convert a public GCS URL into a blob name.

    Example:
    https://storage.googleapis.com/recolekt-storage/media/IG_reels/x/y.json
    -> media/IG_reels/x/y.json
    """
    if not url or not isinstance(url, str):
        return None

    cleaned = url.strip()
    if not cleaned:
        return None

    marker = "storage.googleapis.com/"
    if marker not in cleaned:
        return None

    try:
        after_host = cleaned.split(marker, 1)[1]
        parts = after_host.split("/", 1)

        if len(parts) != 2:
            return None

        blob_name = parts[1].split("?", 1)[0].strip()
        return blob_name or None

    except Exception:
        return None


def _build_reel_payload_for_api(process_id: str, user_id: str, include_prompt: bool = True) -> dict | None:
    measurement_system = _measurement_system_for_user(user_id)
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
    row_dict = _normalize_row_for_api(
        row_dict,
        include_prompt=include_prompt,
        measurement_system=measurement_system,
    )
    row_dict = _merge_row_location_from_db(row_dict, process_id, user_id)

    row_dict["process_id"] = row_dict.get("id")
    row_dict["user_id"] = row_dict.get("user_id") or user_id

    return _json_safe_value(_apply_media_aliases(row_dict))


def _refresh_result_json_in_gcs(process_id: str, user_id: str, include_prompt: bool = True) -> dict | None:
    payload = _build_reel_payload_for_api(process_id, user_id, include_prompt=include_prompt)
    if not payload:
        return None

    try:
        from fetcher_api.adapters.gcs_client import gcs_client

        if not gcs_client.available:
            logger.warning("GCS not available — skipping refreshed result_json upload")
            return payload

        gcs_urls = payload.get("gcs_urls") or {}
        result_json_url = (
            gcs_urls.get("result_json")
            or gcs_urls.get("result_json_url")
            or payload.get("result_json_url")
        )

        blob_name = _gcs_blob_name_from_public_url(result_json_url)
        if not blob_name:
            logger.warning(
                "⚠️ PATCH /reel/%s/location — no stored result_json URL, skipping GCS refresh",
                process_id,
            )
            return payload

        bucket_name = (
            getattr(gcs_client, "analysis_bucket_name", None)
            or os.getenv("GCS_BUCKET_NAME", "recolekt-storage")
        )
        bucket = gcs_client.client.bucket(bucket_name)
        blob = bucket.blob(blob_name)
        blob.upload_from_string(
            _json_dumps_safe(payload),
            content_type="application/json",
        )
        logger.info(
            "📄 PATCH /reel/%s/location — refreshed existing GCS result JSON -> %s",
            process_id,
            blob_name,
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
            SELECT id, source_url, gcs_urls
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
        gcs_urls = json_loads_maybe(row_dict.get("gcs_urls"), default={}) or {}

        try:
            from fetcher_api.adapters.gcs_client import gcs_client

            if gcs_client.available:
                bucket_name = (
                    getattr(gcs_client, "analysis_bucket_name", None)
                    or os.getenv("GCS_BUCKET_NAME", "recolekt-storage")
                )

                bucket = gcs_client.client.bucket(bucket_name)

                blob_names = []
                for value in gcs_urls.values():
                    blob_name = _gcs_blob_name_from_public_url(value)
                    if blob_name:
                        blob_names.append(blob_name)

                prefixes = set()
                for blob_name in blob_names:
                    if "/" in blob_name:
                        prefixes.add(blob_name.rsplit("/", 1)[0] + "/")

                if prefixes:
                    total_deleted = 0

                    for prefix in prefixes:
                        logger.info("🔍 Attempting to clear actual GCS folder: %s", prefix)
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

                        total_deleted += deleted
                        logger.info("✅ Deleted %d files from GCS: %s", deleted, prefix)

                    logger.info(
                        "✅ Deleted %d total GCS files for reel %s",
                        total_deleted,
                        process_id,
                    )

                else:
                    logger.warning(
                        "⚠️ No stored GCS URLs found for reel %s; falling back to shortcode/user prefix scan",
                        process_id,
                    )

                    platform_code = _detect_platform_code(source_url)
                    shortcode = process_id.split("--")[0] if "--" in process_id else process_id.split("_")[0]
                    platform_folder = platform_reels_folder(platform_code)

                    fallback_prefix = f"media/{platform_folder}/"
                    folder_match = f"{shortcode}_{user_id}/"

                    blobs = list(bucket.list_blobs(prefix=fallback_prefix))
                    deleted = 0

                    for blob in blobs:
                        if folder_match in blob.name:
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

                    logger.info(
                        "✅ Deleted %d files from GCS by fallback scan for reel %s",
                        deleted,
                        process_id,
                    )

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
                    process_id,
                    saved,
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
                process_id,
                idx,
                name,
                address,
                neighborhood,
                city,
                region,
                postal_code,
                country,
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
                    process_id,
                    idx,
                    name,
                    merged["lat"],
                    merged["lng"],
                )
            else:
                logger.info(
                    "📍 PATCH /reel/%s/location geocode miss #%d — %r",
                    process_id,
                    idx,
                    name,
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
            process_id,
            len(enriched),
            incoming_with_coords,
            len(enriched),
            saved,
        )
        return jsonify({
            "status": "ok",
            "saved": saved,
            "location": response_location,
        }), 200

    except Exception as e:
        logger.error(f"❌ Error patching location for {process_id}: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


def _ensure_recipe_assistant_table():
    execute(
        """
        CREATE TABLE IF NOT EXISTS recipe_assistant_messages (
            id BIGSERIAL PRIMARY KEY,
            reel_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            question TEXT NOT NULL,
            answer TEXT NOT NULL,
            sources_used JSONB NOT NULL DEFAULT '[]'::jsonb,
            missing_info JSONB NOT NULL DEFAULT '[]'::jsonb,
            model TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """,
        commit=True,
    )
    execute(
        """
        CREATE INDEX IF NOT EXISTS idx_recipe_assistant_messages_reel_user_created
        ON recipe_assistant_messages (reel_id, user_id, created_at DESC)
        """,
        commit=True,
    )


def _fetch_recipe_assistant_history(reel_id: str, user_id: str, limit: int = 10):
    _ensure_recipe_assistant_table()
    rows = fetch_all(
        """
        SELECT question, answer, sources_used, missing_info, model, created_at
        FROM recipe_assistant_messages
        WHERE reel_id = %s AND user_id = %s
        ORDER BY created_at DESC
        LIMIT %s
        """,
        (reel_id, user_id, limit),
    ) or []

    out = []
    for row in rows:
        d = dict(row)
        out.append({
            "question": d.get("question") or "",
            "answer": d.get("answer") or "",
            "sourcesUsed": json_loads_maybe(d.get("sources_used"), default=d.get("sources_used") or []),
            "missingInfo": json_loads_maybe(d.get("missing_info"), default=d.get("missing_info") or []),
            "model": d.get("model"),
            "createdAt": d.get("created_at").isoformat() if d.get("created_at") else None,
        })
    return out


def _save_recipe_assistant_message(
    reel_id: str,
    user_id: str,
    question: str,
    result: dict,
):
    _ensure_recipe_assistant_table()
    execute(
        """
        INSERT INTO recipe_assistant_messages (
            reel_id, user_id, question, answer, sources_used, missing_info, model
        )
        VALUES (%s, %s, %s, %s, %s::jsonb, %s::jsonb, %s)
        """,
        (
            reel_id,
            user_id,
            question,
            result.get("answer") or "",
            _json_dumps_safe(result.get("sourcesUsed") or []),
            _json_dumps_safe(result.get("missingInfo") or []),
            result.get("model"),
        ),
        commit=True,
    )


def _serialize_recipe_note(row) -> dict:
    if not row:
        return {
            "noteText": "",
            "createdAt": None,
            "updatedAt": None,
        }

    d = dict(row) if hasattr(row, "keys") else row._asdict()
    return {
        "noteText": d.get("note_text") or "",
        "createdAt": d.get("created_at").isoformat() if d.get("created_at") else None,
        "updatedAt": d.get("updated_at").isoformat() if d.get("updated_at") else None,
    }


def _serialize_recipe_overrides(row) -> dict:
    if not row:
        return {
            "verifiedByUser": False,
            "overridePayload": {},
            "createdAt": None,
            "updatedAt": None,
        }

    d = dict(row) if hasattr(row, "keys") else row._asdict()
    payload = d.get("override_payload") or {}
    if isinstance(payload, str):
        payload = json_loads_maybe(payload, default={})
    if not isinstance(payload, dict):
        payload = {}

    return {
        "verifiedByUser": bool(d.get("verified_by_user")),
        "overridePayload": payload,
        "createdAt": d.get("created_at").isoformat() if d.get("created_at") else None,
        "updatedAt": d.get("updated_at").isoformat() if d.get("updated_at") else None,
    }


def _sanitize_recipe_override_payload(data: dict) -> tuple[dict, bool]:
    override_payload = data.get("overridePayload", data.get("override_payload", data.get("overrides", {})))
    if not isinstance(override_payload, dict):
        override_payload = {}

    ingredients = override_payload.get("ingredients") if isinstance(override_payload.get("ingredients"), dict) else {}
    steps = override_payload.get("steps") if isinstance(override_payload.get("steps"), dict) else {}

    edited_ingredients = ingredients.get("editedById", ingredients.get("edited_by_id", {}))
    removed_ingredient_ids = ingredients.get("removedIds", ingredients.get("removed_ids", []))
    added_ingredients = ingredients.get("added", [])
    edited_steps = steps.get("editedById", steps.get("edited_by_id", {}))

    if not isinstance(edited_ingredients, dict):
        edited_ingredients = {}
    if not isinstance(removed_ingredient_ids, list):
        removed_ingredient_ids = []
    if not isinstance(added_ingredients, list):
        added_ingredients = []
    if not isinstance(edited_steps, dict):
        edited_steps = {}

    sanitized_added = []
    for item in added_ingredients:
        if not isinstance(item, dict):
            continue
        try:
            section_index = int(item.get("sectionIndex") or item.get("section_index") or 0)
        except (TypeError, ValueError):
            section_index = 0
        sanitized_added.append({
            "id": str(item.get("id") or ""),
            "sectionIndex": max(0, section_index),
            "value": item.get("value") if item.get("value") is not None else "",
        })

    sanitized_payload = {
        "ingredients": {
            "editedById": {str(k): v for k, v in edited_ingredients.items()},
            "removedIds": [str(v) for v in removed_ingredient_ids if v is not None],
            "added": sanitized_added,
        },
        "steps": {
            "editedById": {str(k): v for k, v in edited_steps.items()},
        },
    }

    verified_by_user = bool(data.get("verifiedByUser", data.get("verified_by_user", False)))
    return sanitized_payload, verified_by_user


def _serialize_cook_summary(row) -> dict:
    if not row:
        return {
            "cookCount": 0,
            "lastCookedAt": None,
            "verifiedByUser": False,
            "hasActiveSession": False,
            "activeSessionId": None,
        }

    d = dict(row) if hasattr(row, "keys") else row._asdict()
    return {
        "cookCount": int(d.get("cook_count") or 0),
        "lastCookedAt": d.get("last_cooked_at").isoformat() if d.get("last_cooked_at") else None,
        "verifiedByUser": bool(d.get("verified_by_user")),
        "hasActiveSession": bool(d.get("has_active_session")),
        "activeSessionId": d.get("active_session_id"),
    }


def _serialize_cook_session(row) -> dict:
    if not row:
        return {
            "currentStepIndex": 0,
            "checkedIngredientIds": [],
            "completedStepIds": [],
            "status": "active",
        }

    d = dict(row) if hasattr(row, "keys") else row._asdict()
    checked = d.get("checked_ingredient_ids") or []
    completed = d.get("completed_step_ids") or []

    if isinstance(checked, str):
        checked = json_loads_maybe(checked, default=[])
    if isinstance(completed, str):
        completed = json_loads_maybe(completed, default=[])

    return {
        "currentStepIndex": int(d.get("current_step_index") or 0),
        "checkedIngredientIds": checked if isinstance(checked, list) else [],
        "completedStepIds": completed if isinstance(completed, list) else [],
        "status": d.get("status") or "active",
    }


def _sanitize_cook_session_payload(data: dict) -> dict:
    current_step_index = data.get("currentStepIndex", data.get("current_step_index", 0))
    try:
        current_step_index = int(current_step_index)
    except (TypeError, ValueError):
        current_step_index = 0
    current_step_index = max(0, current_step_index)

    checked_ingredient_ids = data.get("checkedIngredientIds", data.get("checked_ingredient_ids", []))
    completed_step_ids = data.get("completedStepIds", data.get("completed_step_ids", []))

    if not isinstance(checked_ingredient_ids, list):
        checked_ingredient_ids = []
    if not isinstance(completed_step_ids, list):
        completed_step_ids = []

    status = data.get("status", "active")
    if status not in {"active", "completed"}:
        status = "active"

    return {
        "current_step_index": current_step_index,
        "checked_ingredient_ids": [str(v) for v in checked_ingredient_ids if v is not None],
        "completed_step_ids": [str(v) for v in completed_step_ids if v is not None],
        "status": status,
    }


@reel_bp.route("/reel/<process_id>/notes", methods=["GET", "PUT", "DELETE", "OPTIONS"])
def recipe_personal_notes(process_id):
    if request.method == "OPTIONS":
        return "", 200

    try:
        try:
            user_id = get_user_id_from_request()
        except ValueError:
            return jsonify({"error": "Authentication required"}), 401

        if not _reel_exists(process_id, user_id):
            return jsonify({"error": "Reel not found"}), 404

        if request.method == "GET":
            row = fetch_one(
                """
                SELECT note_text, created_at, updated_at
                FROM recipe_personal_notes
                WHERE user_id = %s AND reel_id = %s
                LIMIT 1
                """,
                (user_id, process_id),
            )
            return add_no_cache_headers(jsonify(_serialize_recipe_note(row)))

        if request.method == "DELETE":
            with get_db_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        DELETE FROM recipe_personal_notes
                        WHERE user_id = %s AND reel_id = %s
                        """,
                        (user_id, process_id),
                    )
                conn.commit()

            return add_no_cache_headers(jsonify(_serialize_recipe_note(None)))

        data = request.get_json(silent=True) or {}
        note_text = data.get("noteText", data.get("note_text", data.get("note", "")))

        if note_text is None:
            note_text = ""

        note_text = str(note_text)

        if len(note_text) > 10000:
            return jsonify({"error": "Note is too long"}), 400

        with get_db_connection() as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(
                    """
                    INSERT INTO recipe_personal_notes (
                        user_id,
                        reel_id,
                        note_text,
                        created_at,
                        updated_at
                    )
                    VALUES (%s, %s, %s, NOW(), NOW())
                    ON CONFLICT (user_id, reel_id) DO UPDATE SET
                        note_text = EXCLUDED.note_text,
                        updated_at = NOW()
                    RETURNING note_text, created_at, updated_at
                    """,
                    (user_id, process_id, note_text),
                )
                row = cur.fetchone()
            conn.commit()

        return add_no_cache_headers(jsonify(_serialize_recipe_note(row)))

    except Exception as e:
        logger.error("Error handling recipe note for reel %s: %s", process_id, e, exc_info=True)
        return jsonify({"error": "Recipe note failed"}), 500


@reel_bp.route("/reel/<process_id>/recipe-overrides", methods=["GET", "PUT", "OPTIONS"])
def recipe_user_overrides(process_id):
    if request.method == "OPTIONS":
        return "", 200

    try:
        try:
            user_id = get_user_id_from_request()
        except ValueError:
            return jsonify({"error": "Authentication required"}), 401

        if not _reel_exists(process_id, user_id):
            return jsonify({"error": "Reel not found"}), 404

        if request.method == "GET":
            row = fetch_one(
                """
                SELECT override_payload, verified_by_user, created_at, updated_at
                FROM recipe_user_overrides
                WHERE user_id = %s AND reel_id = %s
                LIMIT 1
                """,
                (user_id, process_id),
            )
            return add_no_cache_headers(jsonify(_serialize_recipe_overrides(row)))

        payload, verified_by_user = _sanitize_recipe_override_payload(request.get_json(silent=True) or {})

        with get_db_connection() as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(
                    """
                    INSERT INTO recipe_user_overrides (
                        user_id,
                        reel_id,
                        override_payload,
                        verified_by_user,
                        created_at,
                        updated_at
                    )
                    VALUES (%s, %s, %s, %s, NOW(), NOW())
                    ON CONFLICT (user_id, reel_id) DO UPDATE SET
                        override_payload = EXCLUDED.override_payload,
                        verified_by_user = EXCLUDED.verified_by_user,
                        updated_at = NOW()
                    RETURNING override_payload, verified_by_user, created_at, updated_at
                    """,
                    (
                        user_id,
                        process_id,
                        psycopg2.extras.Json(payload),
                        verified_by_user,
                    ),
                )
                row = cur.fetchone()
            conn.commit()

        return add_no_cache_headers(jsonify(_serialize_recipe_overrides(row)))

    except Exception as e:
        logger.error("Error handling recipe overrides for reel %s: %s", process_id, e, exc_info=True)
        return jsonify({"error": "Recipe override save failed"}), 500


@reel_bp.route("/shopping-list", methods=["GET", "OPTIONS"])
def get_shopping_list():
    if request.method == "OPTIONS":
        return "", 200

    try:
        try:
            user_id = get_user_id_from_request()
        except ValueError:
            return jsonify({"error": "Authentication required"}), 401

        with get_db_connection() as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                shopping_list_id = _ensure_shopping_list(cur, user_id)
                cur.execute(
                    """
                    SELECT
                        sre.id AS entry_id,
                        sre.shopping_list_id,
                        sre.servings AS entry_servings,
                        sre.added_at AS entry_added_at,
                        r.id, r.user_id, r.source_url, r.folder_id, r.is_favorite, r.status,
                        r.summary_category, r.summary_title, r.summary_topic, r.summary_text,
                        r.summary_bullets, r.summary_hashtags, r.summary_emojis,
                        r.content_type, r.created_at, r.caption, r.author_name,
                        r.is_long_video, r.duration, r.recipe, r.workout, r.transcription,
                        r.tools_list, r.location, r.is_list, r.list_subtype, r.list_count, r.list_type,
                        r.gcs_urls,
                        ruo.override_payload AS recipe_override_payload,
                        ruo.verified_by_user AS recipe_verified_by_user,
                        ruo.updated_at AS recipe_override_updated_at
                    FROM shopping_recipe_entries sre
                    JOIN reels r
                      ON r.id = sre.reel_id
                     AND r.user_id = %s
                    LEFT JOIN recipe_user_overrides ruo
                      ON ruo.reel_id = r.id
                     AND ruo.user_id = r.user_id
                    WHERE sre.shopping_list_id = %s
                      AND sre.user_id = %s
                    ORDER BY sre.added_at DESC
                    """,
                    (user_id, shopping_list_id, user_id),
                )
                entry_rows = cur.fetchall()
                cur.execute(
                    """
                    SELECT ingredient_key, checked, excluded, updated_at
                    FROM shopping_item_overrides
                    WHERE shopping_list_id = %s
                      AND user_id = %s
                    ORDER BY updated_at DESC
                    """,
                    (shopping_list_id, user_id),
                )
                override_rows = cur.fetchall()
            conn.commit()

        return add_no_cache_headers(jsonify({
            "shoppingListId": shopping_list_id,
            "recipeEntries": [_serialize_shopping_entry(row) for row in entry_rows],
            "itemOverrides": [_serialize_shopping_override(row) for row in override_rows],
        }))

    except Exception as e:
        logger.error("Error fetching shopping list: %s", e, exc_info=True)
        return jsonify({"error": "Shopping list fetch failed"}), 500


@reel_bp.route("/shopping-list/recipes", methods=["POST", "OPTIONS"])
def add_shopping_recipe():
    if request.method == "OPTIONS":
        return "", 200

    try:
        try:
            user_id = get_user_id_from_request()
        except ValueError:
            return jsonify({"error": "Authentication required"}), 401

        data = request.get_json(silent=True) or {}
        reel_id = str(data.get("reelId", data.get("reel_id", ""))).strip()
        servings_raw = data.get("servings")

        if not reel_id:
            return jsonify({"error": "reelId is required"}), 400
        if not _reel_exists(reel_id, user_id):
            return jsonify({"error": "Reel not found"}), 404

        try:
            servings = float(servings_raw) if servings_raw is not None else None
        except (TypeError, ValueError):
            servings = None

        with get_db_connection() as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                shopping_list_id = _ensure_shopping_list(cur, user_id)
                cur.execute(
                    """
                    INSERT INTO shopping_recipe_entries (
                        shopping_list_id,
                        user_id,
                        reel_id,
                        servings,
                        added_at
                    )
                    VALUES (%s, %s, %s, %s, NOW())
                    ON CONFLICT (shopping_list_id, reel_id) DO UPDATE SET
                        servings = EXCLUDED.servings,
                        added_at = shopping_recipe_entries.added_at
                    RETURNING id, reel_id, servings, added_at
                    """,
                    (shopping_list_id, user_id, reel_id, servings),
                )
                row = cur.fetchone()
            conn.commit()

        return add_no_cache_headers(jsonify({
            "id": row.get("id"),
            "reelId": row.get("reel_id"),
            "servings": float(row.get("servings")) if row.get("servings") is not None else None,
            "addedAt": row.get("added_at").isoformat() if row.get("added_at") else None,
        }))

    except Exception as e:
        logger.error("Error adding shopping recipe: %s", e, exc_info=True)
        return jsonify({"error": "Shopping recipe add failed"}), 500


@reel_bp.route("/shopping-list/recipes/<reel_id>", methods=["DELETE", "OPTIONS"])
def remove_shopping_recipe(reel_id):
    if request.method == "OPTIONS":
        return "", 200

    try:
        try:
            user_id = get_user_id_from_request()
        except ValueError:
            return jsonify({"error": "Authentication required"}), 401

        if not _reel_exists(reel_id, user_id):
            return jsonify({"error": "Reel not found"}), 404

        with get_db_connection() as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                shopping_list_id = _ensure_shopping_list(cur, user_id)
                cur.execute(
                    """
                    DELETE FROM shopping_recipe_entries
                    WHERE shopping_list_id = %s
                      AND user_id = %s
                      AND reel_id = %s
                    """,
                    (shopping_list_id, user_id, reel_id),
                )
            conn.commit()

        return add_no_cache_headers(jsonify({"ok": True, "reelId": reel_id}))

    except Exception as e:
        logger.error("Error removing shopping recipe %s: %s", reel_id, e, exc_info=True)
        return jsonify({"error": "Shopping recipe remove failed"}), 500


@reel_bp.route("/shopping-list/items/<path:ingredient_key>", methods=["PATCH", "OPTIONS"])
def patch_shopping_item(ingredient_key):
    if request.method == "OPTIONS":
        return "", 200

    try:
        try:
            user_id = get_user_id_from_request()
        except ValueError:
            return jsonify({"error": "Authentication required"}), 401

        key = str(ingredient_key or "").strip()
        if not key:
            return jsonify({"error": "ingredient_key is required"}), 400

        data = request.get_json(silent=True) or {}
        checked = data.get("checked")
        excluded = data.get("excluded")
        if checked is None and excluded is None:
            return jsonify({"error": "checked or excluded is required"}), 400
        has_checked = checked is not None
        has_excluded = excluded is not None

        with get_db_connection() as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                shopping_list_id = _ensure_shopping_list(cur, user_id)
                cur.execute(
                    """
                    INSERT INTO shopping_item_overrides (
                        shopping_list_id,
                        user_id,
                        ingredient_key,
                        checked,
                        excluded,
                        updated_at
                    )
                    VALUES (%s, %s, %s, %s, %s, NOW())
                    ON CONFLICT (shopping_list_id, ingredient_key) DO UPDATE SET
                        checked = CASE WHEN %s THEN EXCLUDED.checked ELSE shopping_item_overrides.checked END,
                        excluded = CASE WHEN %s THEN EXCLUDED.excluded ELSE shopping_item_overrides.excluded END,
                        updated_at = NOW()
                    RETURNING ingredient_key, checked, excluded, updated_at
                    """,
                    (
                        shopping_list_id,
                        user_id,
                        key,
                        bool(checked) if has_checked else False,
                        bool(excluded) if has_excluded else False,
                        has_checked,
                        has_excluded,
                    ),
                )
                row = cur.fetchone()
            conn.commit()

        return add_no_cache_headers(jsonify(_serialize_shopping_override(row)))

    except Exception as e:
        logger.error("Error updating shopping item %s: %s", ingredient_key, e, exc_info=True)
        return jsonify({"error": "Shopping item update failed"}), 500


@reel_bp.route("/reel/<process_id>/cook-state", methods=["GET", "OPTIONS"])
def get_recipe_cook_state(process_id):
    if request.method == "OPTIONS":
        return "", 200

    try:
        try:
            user_id = get_user_id_from_request()
        except ValueError:
            return jsonify({"error": "Authentication required"}), 401

        if not _reel_exists(process_id, user_id):
            return jsonify({"error": "Reel not found"}), 404

        row = fetch_one(
            """
            SELECT
                cook_count,
                last_cooked_at,
                verified_by_user,
                has_active_session,
                active_session_id
            FROM recipe_cook_summaries
            WHERE user_id = %s AND reel_id = %s
            LIMIT 1
            """,
            (user_id, process_id),
        )
        return add_no_cache_headers(jsonify(_serialize_cook_summary(row)))

    except Exception as e:
        logger.error("Error fetching cook state for reel %s: %s", process_id, e, exc_info=True)
        return jsonify({"error": "Cook state fetch failed"}), 500


@reel_bp.route("/reel/<process_id>/mark-cooked", methods=["POST", "OPTIONS"])
def mark_recipe_cooked(process_id):
    if request.method == "OPTIONS":
        return "", 200

    try:
        try:
            user_id = get_user_id_from_request()
        except ValueError:
            return jsonify({"error": "Authentication required"}), 401

        if not _reel_exists(process_id, user_id):
            return jsonify({"error": "Reel not found"}), 404

        with get_db_connection() as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(
                    """
                    UPDATE recipe_cook_sessions
                    SET
                        status = 'completed',
                        completed_at = NOW(),
                        last_active_at = NOW(),
                        updated_at = NOW()
                    WHERE user_id = %s
                      AND reel_id = %s
                      AND status = 'active'
                    """,
                    (user_id, process_id),
                )
                cur.execute(
                    """
                    INSERT INTO recipe_cook_summaries (
                        user_id,
                        reel_id,
                        cook_count,
                        last_cooked_at,
                        verified_by_user,
                        has_active_session,
                        active_session_id,
                        created_at,
                        updated_at
                    )
                    VALUES (%s, %s, 1, NOW(), FALSE, FALSE, NULL, NOW(), NOW())
                    ON CONFLICT (user_id, reel_id) DO UPDATE SET
                        cook_count = recipe_cook_summaries.cook_count + 1,
                        last_cooked_at = NOW(),
                        has_active_session = FALSE,
                        active_session_id = NULL,
                        updated_at = NOW()
                    RETURNING
                        cook_count,
                        last_cooked_at,
                        verified_by_user,
                        has_active_session,
                        active_session_id
                    """,
                    (user_id, process_id),
                )
                row = cur.fetchone()
            conn.commit()

        return add_no_cache_headers(jsonify(_serialize_cook_summary(row)))

    except Exception as e:
        logger.error("Error marking recipe cooked for reel %s: %s", process_id, e, exc_info=True)
        return jsonify({"error": "Mark cooked failed"}), 500


@reel_bp.route("/reel/<process_id>/reset-cook-state", methods=["POST", "OPTIONS"])
def reset_recipe_cook_state(process_id):
    if request.method == "OPTIONS":
        return "", 200

    try:
        try:
            user_id = get_user_id_from_request()
        except ValueError:
            return jsonify({"error": "Authentication required"}), 401

        if not _reel_exists(process_id, user_id):
            return jsonify({"error": "Reel not found"}), 404

        with get_db_connection() as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(
                    """
                    UPDATE recipe_cook_sessions
                    SET
                        status = 'abandoned',
                        completed_at = NULL,
                        last_active_at = NOW(),
                        updated_at = NOW()
                    WHERE user_id = %s
                      AND reel_id = %s
                      AND status = 'active'
                    """,
                    (user_id, process_id),
                )
                cur.execute(
                    """
                    INSERT INTO recipe_cook_summaries (
                        user_id,
                        reel_id,
                        cook_count,
                        last_cooked_at,
                        verified_by_user,
                        has_active_session,
                        active_session_id,
                        created_at,
                        updated_at
                    )
                    VALUES (%s, %s, 0, NULL, FALSE, FALSE, NULL, NOW(), NOW())
                    ON CONFLICT (user_id, reel_id) DO UPDATE SET
                        cook_count = 0,
                        last_cooked_at = NULL,
                        verified_by_user = FALSE,
                        has_active_session = FALSE,
                        active_session_id = NULL,
                        updated_at = NOW()
                    RETURNING
                        cook_count,
                        last_cooked_at,
                        verified_by_user,
                        has_active_session,
                        active_session_id
                    """,
                    (user_id, process_id),
                )
                row = cur.fetchone()
            conn.commit()

        return add_no_cache_headers(jsonify(_serialize_cook_summary(row)))

    except Exception as e:
        logger.error("Error resetting cook state for reel %s: %s", process_id, e, exc_info=True)
        return jsonify({"error": "Reset cook state failed"}), 500


@reel_bp.route("/reel/<process_id>/cook-session", methods=["GET", "PUT", "OPTIONS"])
def recipe_cook_session(process_id):
    if request.method == "OPTIONS":
        return "", 200

    try:
        try:
            user_id = get_user_id_from_request()
        except ValueError:
            return jsonify({"error": "Authentication required"}), 401

        if not _reel_exists(process_id, user_id):
            return jsonify({"error": "Reel not found"}), 404

        if request.method == "GET":
            row = fetch_one(
                """
                SELECT
                    current_step_index,
                    checked_ingredient_ids,
                    completed_step_ids,
                    status
                FROM recipe_cook_sessions
                WHERE user_id = %s
                  AND reel_id = %s
                  AND status = 'active'
                ORDER BY last_active_at DESC
                LIMIT 1
                """,
                (user_id, process_id),
            )
            return add_no_cache_headers(jsonify(_serialize_cook_session(row)))

        payload = _sanitize_cook_session_payload(request.get_json(silent=True) or {})

        with get_db_connection() as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(
                    """
                    SELECT id
                    FROM recipe_cook_sessions
                    WHERE user_id = %s
                      AND reel_id = %s
                      AND status = 'active'
                    ORDER BY last_active_at DESC
                    LIMIT 1
                    FOR UPDATE
                    """,
                    (user_id, process_id),
                )
                existing = cur.fetchone()

                if existing:
                    cur.execute(
                        """
                        UPDATE recipe_cook_sessions
                        SET
                            status = %s,
                            completed_at = CASE WHEN %s = 'completed' THEN NOW() ELSE NULL END,
                            last_active_at = NOW(),
                            current_step_index = %s,
                            checked_ingredient_ids = %s,
                            completed_step_ids = %s,
                            updated_at = NOW()
                        WHERE id = %s
                        RETURNING
                            id,
                            current_step_index,
                            checked_ingredient_ids,
                            completed_step_ids,
                            status
                        """,
                        (
                            payload["status"],
                            payload["status"],
                            payload["current_step_index"],
                            psycopg2.extras.Json(payload["checked_ingredient_ids"]),
                            psycopg2.extras.Json(payload["completed_step_ids"]),
                            existing["id"],
                        ),
                    )
                else:
                    cur.execute(
                        """
                        SELECT updated_at
                        FROM recipe_cook_summaries
                        WHERE user_id = %s
                          AND reel_id = %s
                          AND has_active_session = FALSE
                          AND active_session_id IS NULL
                          AND updated_at > NOW() - INTERVAL '2 seconds'
                        LIMIT 1
                        """,
                        (user_id, process_id),
                    )
                    recently_cleared = cur.fetchone()

                    if recently_cleared and payload["status"] == "active":
                        conn.rollback()
                        return add_no_cache_headers(jsonify(_serialize_cook_session(None)))

                    cur.execute(
                        """
                        INSERT INTO recipe_cook_sessions (
                            user_id,
                            reel_id,
                            status,
                            started_at,
                            completed_at,
                            last_active_at,
                            current_step_index,
                            checked_ingredient_ids,
                            completed_step_ids,
                            created_at,
                            updated_at
                        )
                        VALUES (
                            %s,
                            %s,
                            %s,
                            NOW(),
                            CASE WHEN %s = 'completed' THEN NOW() ELSE NULL END,
                            NOW(),
                            %s,
                            %s,
                            %s,
                            NOW(),
                            NOW()
                        )
                        RETURNING
                            id,
                            current_step_index,
                            checked_ingredient_ids,
                            completed_step_ids,
                            status
                        """,
                        (
                            user_id,
                            process_id,
                            payload["status"],
                            payload["status"],
                            payload["current_step_index"],
                            psycopg2.extras.Json(payload["checked_ingredient_ids"]),
                            psycopg2.extras.Json(payload["completed_step_ids"]),
                        ),
                    )

                row = cur.fetchone()

                if row["status"] == "active":
                    cur.execute(
                        """
                        INSERT INTO recipe_cook_summaries (
                            user_id,
                            reel_id,
                            cook_count,
                            has_active_session,
                            active_session_id,
                            verified_by_user,
                            created_at,
                            updated_at
                        )
                        VALUES (%s, %s, 0, TRUE, %s, FALSE, NOW(), NOW())
                        ON CONFLICT (user_id, reel_id) DO UPDATE SET
                            has_active_session = TRUE,
                            active_session_id = EXCLUDED.active_session_id,
                            updated_at = NOW()
                        """,
                        (user_id, process_id, row["id"]),
                    )
                else:
                    cur.execute(
                        """
                        INSERT INTO recipe_cook_summaries (
                            user_id,
                            reel_id,
                            cook_count,
                            has_active_session,
                            active_session_id,
                            verified_by_user,
                            created_at,
                            updated_at
                        )
                        VALUES (%s, %s, 0, FALSE, NULL, FALSE, NOW(), NOW())
                        ON CONFLICT (user_id, reel_id) DO UPDATE SET
                            has_active_session = FALSE,
                            active_session_id = NULL,
                            updated_at = NOW()
                        """,
                        (user_id, process_id),
                    )

            conn.commit()

        return add_no_cache_headers(jsonify(_serialize_cook_session(row)))

    except Exception as e:
        logger.error("Error handling cook session for reel %s: %s", process_id, e, exc_info=True)
        return jsonify({"error": "Cook session failed"}), 500


@reel_bp.route("/reel/<process_id>/cook-session/reset", methods=["POST", "OPTIONS"])
def reset_recipe_cook_session(process_id):
    if request.method == "OPTIONS":
        return "", 200

    try:
        try:
            user_id = get_user_id_from_request()
        except ValueError:
            return jsonify({"error": "Authentication required"}), 401

        if not _reel_exists(process_id, user_id):
            return jsonify({"error": "Reel not found"}), 404

        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE recipe_cook_sessions
                    SET
                        status = 'abandoned',
                        completed_at = NULL,
                        current_step_index = 0,
                        checked_ingredient_ids = '[]'::jsonb,
                        completed_step_ids = '[]'::jsonb,
                        last_active_at = NOW(),
                        updated_at = NOW()
                    WHERE user_id = %s
                      AND reel_id = %s
                      AND status = 'active'
                    """,
                    (user_id, process_id),
                )
                cur.execute(
                    """
                    INSERT INTO recipe_cook_summaries (
                        user_id,
                        reel_id,
                        cook_count,
                        has_active_session,
                        active_session_id,
                        verified_by_user,
                        created_at,
                        updated_at
                    )
                    VALUES (%s, %s, 0, FALSE, NULL, FALSE, NOW(), NOW())
                    ON CONFLICT (user_id, reel_id) DO UPDATE SET
                        has_active_session = FALSE,
                        active_session_id = NULL,
                        updated_at = NOW()
                    """,
                    (user_id, process_id),
                )
            conn.commit()

        return add_no_cache_headers(jsonify(_serialize_cook_session(None)))

    except Exception as e:
        logger.error("Error resetting cook session for reel %s: %s", process_id, e, exc_info=True)
        return jsonify({"error": "Reset cook session failed"}), 500



@reel_bp.route("/reel/<process_id>/ask/history", methods=["GET", "OPTIONS"])
def get_recipe_assistant_history(process_id):
    if request.method == "OPTIONS":
        return "", 200

    try:
        try:
            user_id = get_user_id_from_request()
        except ValueError:
            return jsonify({"error": "Authentication required"}), 401

        row_dict = _build_reel_payload_for_api(process_id, user_id, include_prompt=False)
        if not row_dict:
            return jsonify({"error": "Reel not found"}), 404

        if (row_dict.get("content_type") or "").lower() != "recipe":
            return jsonify({"error": "Recipe assistant is only available for recipe reels"}), 400

        limit_raw = request.args.get("limit", "10")
        try:
            limit = int(limit_raw)
        except ValueError:
            limit = 10

        limit = max(1, min(limit, 50))

        history = _fetch_recipe_assistant_history(process_id, user_id, limit=limit)

        return add_no_cache_headers(jsonify({"history": history}))

    except Exception as e:
        logger.error("Error fetching recipe assistant history for reel %s: %s", process_id, e, exc_info=True)
        return jsonify({"error": "Recipe assistant history failed"}), 500


@reel_bp.route("/reel/<process_id>/ask", methods=["POST", "OPTIONS"])
def ask_reel_recipe(process_id):
    if request.method == "OPTIONS":
        return "", 200

    try:
        try:
            user_id = get_user_id_from_request()
        except ValueError:
            return jsonify({"error": "Authentication required"}), 401

        data = request.get_json(silent=True) or {}
        question = (data.get("question") or "").strip()

        if not question:
            return jsonify({"error": "Question is required"}), 400

        if len(question) > 1000:
            return jsonify({"error": "Question is too long"}), 400

        row_dict = _build_reel_payload_for_api(process_id, user_id, include_prompt=False)
        if not row_dict:
            return jsonify({"error": "Reel not found"}), 404

        if (row_dict.get("content_type") or "").lower() != "recipe":
            return jsonify({"error": "Recipe assistant is only available for recipe reels"}), 400

        recipe = json_loads_maybe(row_dict.get("recipe"), default=row_dict.get("recipe"))
        if not recipe:
            return jsonify({"error": "Recipe data is missing"}), 400

        transcription = parse_transcription(row_dict.get("transcription"))

        result = answer_recipe_question(
            question=question,
            recipe=recipe,
            caption=row_dict.get("caption") or "",
            transcription=transcription,
            language=row_dict.get("detected_language") or "en",
        )

        try:
            _save_recipe_assistant_message(process_id, user_id, question, result)
        except Exception as save_err:
            logger.warning(
                "⚠️ Recipe assistant answer generated but history save failed for %s: %s",
                process_id,
                save_err,
                exc_info=True,
            )

        result["history"] = _fetch_recipe_assistant_history(process_id, user_id, limit=10)

        return add_no_cache_headers(jsonify(result))

    except Exception as e:
        logger.error("Error in recipe assistant for reel %s: %s", process_id, e, exc_info=True)
        return jsonify({"error": "Recipe assistant failed"}), 500


@reel_bp.route("/update/<process_id>", methods=["PUT", "PATCH", "OPTIONS"])
def update_reel(process_id):
    if request.method == "OPTIONS":
        return "", 200

    try:
        try:
            user_id = get_user_id_from_request()
        except ValueError:
            return jsonify({"error": "Authentication required"}), 401

        if not _reel_exists(process_id, user_id):
            return jsonify({"error": "Reel not found"}), 404

        data = request.get_json(silent=True) or {}

        allowed = {
            "folder_id":        "folder_id",
            "is_favorite":      "is_favorite",
            "summary_title":    "summary_title",
            "summary_category": "summary_category",
            "content_type":     "content_type",
            "summary_topic":    "summary_topic",
            "summary_text":     "summary_text",
            "caption":          "caption",
        }

        set_clauses = []
        values = []

        for frontend_key, db_col in allowed.items():
            if frontend_key in data:
                val = data[frontend_key]
                if db_col == "content_type":
                    val = _normalize_content_type(val)
                if db_col in ("summary_text",) and isinstance(val, (dict, list)):
                    import json as _json
                    val = _json.dumps(val, ensure_ascii=False)
                set_clauses.append(f"{db_col} = %s")
                values.append(val)

        if not set_clauses:
            return jsonify({"status": "no_op"}), 200

        set_clauses.append("updated_at = NOW()")
        values.extend([process_id, user_id])

        execute(
            f"UPDATE reels SET {', '.join(set_clauses)} WHERE id = %s AND user_id = %s",
            tuple(values),
        )

        logger.info("✅ PUT /update/%s — updated: %s", process_id, list(data.keys()))
        return jsonify({"status": "ok", "id": process_id}), 200

    except Exception as e:
        logger.error("❌ Error updating reel %s: %s", process_id, e, exc_info=True)
        return jsonify({"error": "Internal error"}), 500
