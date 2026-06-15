import json
import logging
from datetime import datetime, timezone

import psycopg2.extras

from fetcher_api.adapters.db import fetch_one, get_db_connection
from fetcher_api.services.social_urls import canonicalize_social_url, has_stable_duplicate_url

logger = logging.getLogger("db")


def _to_jsonb(value) -> str | None:
    """Safely serialize any value for a jsonb column."""
    if value is None:
        return None

    if isinstance(value, (dict, list, bool, int, float)):
        return json.dumps(value, ensure_ascii=False)

    if isinstance(value, str):
        s = value.strip()
        if not s:
            return None
        try:
            json.loads(s)
            return s
        except Exception:
            return json.dumps(value, ensure_ascii=False)

    return json.dumps(value, ensure_ascii=False)


def _to_jsonb_array(value) -> str:
    """Force a json array/object payload for jsonb columns that should not store plain strings."""
    if isinstance(value, (list, dict)):
        return json.dumps(value, ensure_ascii=False)

    if isinstance(value, str):
        s = value.strip()
        if not s:
            return "[]"
        try:
            parsed = json.loads(s)
            if isinstance(parsed, (list, dict)):
                return json.dumps(parsed, ensure_ascii=False)
        except Exception:
            pass

    return "[]"


def _parse_json_recursively(value, depth: int = 0):
    if depth > 3 or not isinstance(value, str):
        return value
    text = value.strip()
    if not text or text[0] not in "{[":
        return value
    try:
        return _parse_json_recursively(json.loads(text), depth + 1)
    except Exception:
        return value


def _looks_json_shaped(value) -> bool:
    if not isinstance(value, str):
        return False
    text = value.strip()
    if not text or text[0] not in "{[":
        return False
    try:
        json.loads(text)
        return True
    except Exception:
        return False


def _usable_display_text(value) -> str:
    if not isinstance(value, str):
        return ""
    text = value.strip()
    if not text or text == "[object Object]" or _looks_json_shaped(text):
        return ""
    return text


def _value_at_path(value, path: str):
    current = value
    for key in path.split("."):
        if not isinstance(current, dict):
            return None
        current = current.get(key)
    return current


def _extract_plain_title(*values) -> str | None:
    paths = (
        "english.title",
        "original.title",
        "title",
        "summary.english.title",
        "summary.original.title",
        "summary.title",
    )
    repaired_json_title = False

    for value in values:
        parsed = _parse_json_recursively(value)
        if parsed is not value and isinstance(value, str):
            repaired_json_title = True

        direct = _usable_display_text(parsed)
        if direct:
            if repaired_json_title:
                logger.warning("⚠️ [DB_INSERT] Repaired JSON-shaped summary_title into plain title")
            return direct

        if isinstance(parsed, dict):
            for path in paths:
                candidate = _parse_json_recursively(_value_at_path(parsed, path))
                title = _usable_display_text(candidate)
                if title:
                    if repaired_json_title:
                        logger.warning("⚠️ [DB_INSERT] Repaired JSON-shaped summary_title into plain title")
                    return title

    return None


def canonicalize_source_url(source_url: str | None) -> str:
    """
    Normalize source URLs so each saved reel is unique per user.

    Examples:
      https://www.instagram.com/reel/ABC/?utm_source=x
      https://instagram.com/reel/ABC
    become:
      https://www.instagram.com/reel/ABC/

    This keeps uniqueness stable even if frontend/webhook sends slightly different URLs.
    """
    result = canonicalize_social_url(source_url)
    if result.canonical_url:
        return result.canonical_url

    # Opaque Facebook share links are not content identities. Keep the raw URL for
    # processing visibility, but do not turn a share token into a duplicate key.
    return (source_url or "").strip()


def check_duplicate_reel(user_id, source_url):
    """
    Return an existing reel row for this user + canonical source URL, or None.

    This intentionally returns the row, not just bool, so callers can reuse the
    existing reel id instead of creating a second copy.
    """
    try:
        canonical_result = canonicalize_social_url(source_url)
        canonical_url = canonical_result.canonical_url
        if not user_id or not has_stable_duplicate_url(canonical_result):
            return None

        sql = """
            SELECT id, status, gcs_urls, created_at
            FROM reels
            WHERE user_id = %s AND source_url = %s
            ORDER BY created_at DESC NULLS LAST
            LIMIT 1;
        """
        return fetch_one(sql, (user_id, canonical_url))

    except Exception as e:
        logger.error("Error checking duplicate: %s", e)
        return None


def _upsert_reel_locations(conn, reel_id: str, user_id: str, location) -> int:
    """
    Replace reel_locations rows for this reel with the current location payload.
    Runs inside the same connection as the reel upsert so it shares the commit.
    Returns the number of rows written.
    """
    with conn.cursor() as cur:
        cur.execute(
            "DELETE FROM reel_locations WHERE reel_id = %s AND user_id = %s",
            (reel_id, user_id),
        )

    if not location:
        logger.info("📍 [DB_INSERT] Cleared reel_locations for reel %s", reel_id)
        return 0

    locations = location if isinstance(location, list) else [location]
    locations = [loc for loc in locations if isinstance(loc, dict) and loc.get("name")]

    if not locations:
        logger.info("📍 [DB_INSERT] Cleared reel_locations for reel %s", reel_id)
        return 0

    rows = []
    for idx, loc in enumerate(locations, start=1):
        name = (loc.get("name") or "").strip()
        if not name:
            continue

        rows.append(
            (
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
            )
        )

    if not rows:
        logger.info("📍 [DB_INSERT] Cleared reel_locations for reel %s", reel_id)
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
            lat                    = EXCLUDED.lat,
            lng                    = EXCLUDED.lng,
            google_place_id        = EXCLUDED.google_place_id,
            maps_url               = EXCLUDED.maps_url;
    """

    with conn.cursor() as cur:
        psycopg2.extras.execute_values(cur, sql, rows)

    logger.info("📍 [DB_INSERT] Wrote %d reel_locations rows for reel %s", len(rows), reel_id)
    return len(rows)


def insert_reel_into_db(reel_data):
    original_process_id = reel_data.get("process_id") or reel_data.get("id")
    process_id = original_process_id

    try:
        user_id = reel_data.get("user_id")
        logger.info("🔧 [DB_INSERT] Starting upsert for process_id: %s", process_id)

        if not process_id:
            logger.error("❌ [DB_INSERT] Skipping insert: process_id is missing")
            return

        if not user_id:
            logger.error("❌ [DB_INSERT] Skipping insert for %s: user_id is missing", process_id)
            return

        source_url = canonicalize_source_url(reel_data.get("source_url"))

        if not source_url:
            logger.warning("⚠️ [DB_INSERT] Missing source_url for %s; duplicate prevention disabled", process_id)

        existing_duplicate = check_duplicate_reel(user_id, source_url) if source_url else None
        if existing_duplicate:
            existing_id = existing_duplicate.get("id") if hasattr(existing_duplicate, "get") else existing_duplicate["id"]

            if existing_id and existing_id != process_id:
                logger.info(
                    "♻️ [DB_INSERT] Duplicate reel detected for user=%s source_url=%s. "
                    "Updating existing reel %s instead of creating %s",
                    user_id,
                    source_url,
                    existing_id,
                    process_id,
                )
                process_id = existing_id
                reel_data["process_id"] = process_id
                reel_data["id"] = process_id

        summary_struct = reel_data.get("summary")
        summary_en = summary_struct.get("english", {}) if isinstance(summary_struct, dict) else {}
        summary_orig = summary_struct.get("original", {}) if isinstance(summary_struct, dict) else {}

        summary_title_str = _extract_plain_title(
            reel_data.get("summary_title"),
            reel_data.get("title"),
            summary_struct,
            reel_data.get("summary_text"),
        )

        raw_text = reel_data.get("summary_text")
        if raw_text is None:
            raw_text = reel_data.get("summary")
        summary_text_json = _to_jsonb(raw_text)

        final_status = reel_data.get("status", "processing")
        gcs_urls = _to_jsonb(reel_data.get("gcs_urls", {}))

        transcription = reel_data.get("transcription")
        if isinstance(transcription, dict):
            transcription = json.dumps(transcription, ensure_ascii=False)
        elif transcription is None:
            transcription = ""

        summary_bullets = reel_data.get("summary_bullets")
        if summary_bullets is None and isinstance(summary_en, dict):
            summary_bullets = summary_en.get("headlines", [])
        summary_bullets_json = _to_jsonb_array(summary_bullets)

        recipe_json = _to_jsonb(reel_data.get("recipe"))
        workout_json = _to_jsonb(reel_data.get("workout"))
        tools_list_json = _to_jsonb(reel_data.get("tools_list"))
        location_json = _to_jsonb(reel_data.get("location"))
        prompt_json = _to_jsonb(reel_data.get("prompt"))

        summary_hashtags = reel_data.get("summary_hashtags")
        if summary_hashtags is None and isinstance(summary_en, dict):
            summary_hashtags = summary_en.get("hashtags", [])
        if not isinstance(summary_hashtags, list):
            summary_hashtags = []

        summary_emojis = reel_data.get("summary_emojis")
        if summary_emojis is None and isinstance(summary_en, dict):
            summary_emojis = summary_en.get("emojis", [])
        if not isinstance(summary_emojis, list):
            summary_emojis = []

        detected_language = reel_data.get("detected_language", "unknown")

        is_list = bool(reel_data.get("is_list", False))
        list_subtype = reel_data.get("list_subtype") or None
        list_count = reel_data.get("list_count") or None
        list_type = reel_data.get("list_type") or None

        created_at = reel_data.get("created_at") or datetime.now(timezone.utc)

        sql = """
            INSERT INTO reels (
                id, user_id, source_url, status, folder_id,
                caption, author_name, duration, is_long_video,
                summary_category, summary_topic, summary_title, summary_text,
                summary_bullets, summary_hashtags, summary_emojis,
                content_type, recipe, workout, detected_language,
                gcs_urls, transcription, tools_list, location, prompt,
                is_list, list_subtype, list_count, list_type, error_message,
                created_at, updated_at
            )
            VALUES (
                %(id)s, %(user_id)s, %(source_url)s, %(status)s, %(folder_id)s,
                %(caption)s, %(author_name)s, %(duration)s, %(is_long_video)s,
                %(summary_category)s, %(summary_topic)s, %(summary_title)s, %(summary_text)s::jsonb,
                %(summary_bullets)s::jsonb, %(summary_hashtags)s, %(summary_emojis)s,
                %(content_type)s, %(recipe)s::jsonb, %(workout)s::jsonb, %(detected_language)s,
                %(gcs_urls)s::jsonb, %(transcription)s,
                %(tools_list)s::jsonb, %(location)s::jsonb, %(prompt)s::jsonb,
                %(is_list)s, %(list_subtype)s, %(list_count)s, %(list_type)s, %(error_message)s,
                %(created_at)s, NOW()
            )
            ON CONFLICT (id) DO UPDATE SET
                source_url         = EXCLUDED.source_url,
                status             = EXCLUDED.status,
                caption            = EXCLUDED.caption,
                author_name        = EXCLUDED.author_name,
                duration           = EXCLUDED.duration,
                summary_title      = EXCLUDED.summary_title,
                summary_text       = EXCLUDED.summary_text,
                summary_category   = EXCLUDED.summary_category,
                summary_topic      = EXCLUDED.summary_topic,
                summary_bullets    = EXCLUDED.summary_bullets,
                summary_hashtags   = EXCLUDED.summary_hashtags,
                summary_emojis     = EXCLUDED.summary_emojis,
                content_type       = EXCLUDED.content_type,
                recipe             = EXCLUDED.recipe,
                workout            = EXCLUDED.workout,
                detected_language  = EXCLUDED.detected_language,
                transcription      = EXCLUDED.transcription,
                gcs_urls           = COALESCE(reels.gcs_urls, '{}'::jsonb) || COALESCE(EXCLUDED.gcs_urls, '{}'::jsonb),
                tools_list         = EXCLUDED.tools_list,
                location           = EXCLUDED.location,
                prompt             = EXCLUDED.prompt,
                is_list            = EXCLUDED.is_list,
                list_subtype       = EXCLUDED.list_subtype,
                list_count         = EXCLUDED.list_count,
                list_type          = EXCLUDED.list_type,
                error_message      = EXCLUDED.error_message,
                updated_at         = NOW();
        """

        params = {
            "id": process_id,
            "user_id": user_id,
            "source_url": source_url,
            "status": final_status,
            "folder_id": reel_data.get("folder_id", "default"),
            "caption": reel_data.get("caption") or "",
            "author_name": reel_data.get("author_name") or "",
            "duration": reel_data.get("duration"),
            "is_long_video": reel_data.get("is_long_video", False),
            "summary_category": reel_data.get("summary_category") or reel_data.get("category") or "",
            "summary_topic": reel_data.get("summary_topic") or reel_data.get("topic") or "",
            "summary_title": summary_title_str,
            "summary_text": summary_text_json,
            "summary_bullets": summary_bullets_json,
            "summary_hashtags": summary_hashtags,
            "summary_emojis": summary_emojis,
            "content_type": reel_data.get("content_type", "general"),
            "recipe": recipe_json,
            "workout": workout_json,
            "detected_language": detected_language,
            "gcs_urls": gcs_urls,
            "transcription": transcription,
            "tools_list": tools_list_json,
            "location": location_json,
            "prompt": prompt_json,
            "is_list": is_list,
            "list_subtype": list_subtype,
            "list_count": list_count,
            "list_type": list_type,
            "error_message": reel_data.get("error_message"),
            "created_at": created_at,
        }

        logger.info("🔧 [DB_INSERT] Executing SQL and committing transaction...")
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(sql, params)

                # If /summarize already inserted a transient duplicate row with a new id,
                # remove it after updating the canonical existing row.
                if original_process_id and original_process_id != process_id:
                    cur.execute(
                        "DELETE FROM reel_locations WHERE reel_id = %s AND user_id = %s",
                        (original_process_id, user_id),
                    )

                    try:
                        cur.execute(
                            "DELETE FROM saved_places WHERE video_id = %s AND user_id = %s",
                            (original_process_id, user_id),
                        )
                    except Exception as saved_places_exc:
                        logger.warning(
                            "⚠️ [DB_INSERT] Failed deleting duplicate saved_places for %s: %s",
                            original_process_id,
                            saved_places_exc,
                        )

                    cur.execute(
                        "DELETE FROM reels WHERE id = %s AND user_id = %s",
                        (original_process_id, user_id),
                    )

                    if cur.rowcount:
                        logger.info(
                            "🧹 [DB_INSERT] Removed transient duplicate reel row %s after updating %s",
                            original_process_id,
                            process_id,
                        )

            _upsert_reel_locations(
                conn,
                process_id,
                user_id,
                reel_data.get("location"),
            )

            conn.commit()

        logger.info(
            "✅ [DB] Successfully saved %s | status=%s | list_subtype=%s",
            process_id,
            final_status,
            list_subtype,
        )

    except Exception as e:
        logger.error("❌❌❌ [DB_INSERT] FAILED for %s: %s", process_id, e)
        logger.exception("Full traceback:")
        raise
