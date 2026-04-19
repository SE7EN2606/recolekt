# fetcher_api/services/db_insert.py

import json
import logging

import psycopg2.extras

from fetcher_api.adapters.db import execute, fetch_one, get_db_connection

logger = logging.getLogger("db")


def _to_jsonb(value) -> str | None:
    """Safely serialize any value that must go into a jsonb column."""
    if value is None:
        return None
    if isinstance(value, str):
        return value if value.strip().startswith(("{", "[")) else None
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False)
    return None


def check_duplicate_reel(user_id, source_url):
    try:
        sql = "SELECT id FROM reels WHERE user_id = %s AND source_url = %s LIMIT 1;"
        result = fetch_one(sql, (user_id, source_url))
        return bool(result)
    except Exception as e:
        logger.error(f"Error checking duplicate: {e}")
        return False


def _upsert_reel_locations(conn, reel_id: str, user_id: str, location) -> int:
    """
    Write each location in the list as an individual reel_locations row.
    Runs inside the same connection as the reel upsert so it shares the commit.
    Returns the number of rows written.
    """
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
        ))

    if not rows:
        return 0

    sql = """
        INSERT INTO reel_locations (
            reel_id, user_id, position,
            name, place_type, description,
            address, neighborhood, city
        )
        VALUES %s
        ON CONFLICT (reel_id, user_id, position) DO UPDATE SET
            name         = EXCLUDED.name,
            place_type   = EXCLUDED.place_type,
            description  = EXCLUDED.description,
            address      = EXCLUDED.address,
            neighborhood = EXCLUDED.neighborhood,
            city         = EXCLUDED.city;
    """

    with conn.cursor() as cur:
        psycopg2.extras.execute_values(cur, sql, rows)

    logger.info("📍 [DB_INSERT] Wrote %d reel_locations rows for reel %s", len(rows), reel_id)
    return len(rows)


def insert_reel_into_db(reel_data):
    process_id = reel_data.get("process_id") or reel_data.get("id")

    try:
        user_id = reel_data.get("user_id")
        logger.info(f"🔧 [DB_INSERT] Starting upsert for process_id: {process_id}")

        if not user_id:
            logger.error(f"❌ [DB_INSERT] Skipping insert for {process_id}: user_id is None/empty")
            return

        summary_struct = reel_data.get("summary")
        summary_en = summary_struct.get("english", {}) if isinstance(summary_struct, dict) else {}
        summary_orig = summary_struct.get("original", {}) if isinstance(summary_struct, dict) else {}

        # ── summary_title ────────────────────────────────────────────────
        raw_title = reel_data.get("summary_title")
        if isinstance(raw_title, dict):
            summary_title_str = (
                (raw_title.get("english") or {}).get("title")
                or (raw_title.get("original") or {}).get("title")
                or raw_title.get("title")
                or ""
            ).strip() or None
        else:
            summary_title_str = (str(raw_title).strip() if raw_title else None) or None

        if not summary_title_str:
            summary_title_str = (
                (summary_en.get("title") or "").strip()
                or (summary_orig.get("title") or "").strip()
                or None
            )

        # ── summary_text ─────────────────────────────────────────────────
        raw_text = reel_data.get("summary_text") or reel_data.get("summary")
        if isinstance(raw_text, dict):
            summary_text_json = json.dumps(raw_text, ensure_ascii=False)
        elif isinstance(raw_text, str) and raw_text.strip().startswith("{"):
            summary_text_json = raw_text
        else:
            summary_text_json = None

        final_status = reel_data.get("status", "processing")

        # ── gcs_urls ─────────────────────────────────────────────────────
        gcs_urls = _to_jsonb(reel_data.get("gcs_urls", {}))

        # ── transcription ────────────────────────────────────────────────
        transcription = reel_data.get("transcription")
        if isinstance(transcription, dict):
            transcription = json.dumps(transcription, ensure_ascii=False)
        elif transcription is None:
            transcription = ""

        # ── summary_bullets ──────────────────────────────────────────────
        summary_bullets = reel_data.get("summary_bullets")
        if summary_bullets is None and isinstance(summary_en, dict):
            summary_bullets = summary_en.get("headlines", [])
        if isinstance(summary_bullets, list):
            summary_bullets_json = json.dumps(summary_bullets, ensure_ascii=False)
        elif isinstance(summary_bullets, str):
            summary_bullets_json = summary_bullets
        else:
            summary_bullets_json = "[]"

        # ── jsonb fields ─────────────────────────────────────────────────
        recipe_json = _to_jsonb(reel_data.get("recipe"))
        workout_json = _to_jsonb(reel_data.get("workout"))
        tools_list_json = _to_jsonb(reel_data.get("tools_list"))
        location_json = _to_jsonb(reel_data.get("location"))

        # keep content prompt in prompt column; keep debug separately if schema supports later
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

        sql = """
            INSERT INTO reels (
                id, user_id, source_url, status, folder_id,
                caption, author_name, duration, is_long_video,
                summary_category, summary_topic, summary_title, summary_text,
                summary_bullets, summary_hashtags, summary_emojis,
                content_type, recipe, workout, detected_language,
                gcs_urls, transcription, tools_list, location, prompt,
                is_list, list_subtype, list_count, list_type,
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
                %(is_list)s, %(list_subtype)s, %(list_count)s, %(list_type)s,
                %(created_at)s, NOW()
            )
            ON CONFLICT (id) DO UPDATE SET
                status            = EXCLUDED.status,
                caption           = EXCLUDED.caption,
                author_name       = EXCLUDED.author_name,
                duration          = EXCLUDED.duration,
                summary_title     = EXCLUDED.summary_title,
                summary_text      = EXCLUDED.summary_text,
                summary_category  = EXCLUDED.summary_category,
                summary_topic     = EXCLUDED.summary_topic,
                summary_bullets   = EXCLUDED.summary_bullets,
                summary_hashtags  = EXCLUDED.summary_hashtags,
                summary_emojis    = EXCLUDED.summary_emojis,
                content_type      = EXCLUDED.content_type,
                recipe            = EXCLUDED.recipe,
                workout           = EXCLUDED.workout,
                detected_language = EXCLUDED.detected_language,
                transcription     = EXCLUDED.transcription,
                gcs_urls          = EXCLUDED.gcs_urls,
                tools_list        = EXCLUDED.tools_list,
                location          = EXCLUDED.location,
                prompt            = EXCLUDED.prompt,
                is_list           = EXCLUDED.is_list,
                list_subtype      = EXCLUDED.list_subtype,
                list_count        = EXCLUDED.list_count,
                list_type         = EXCLUDED.list_type,
                updated_at        = NOW();
        """

        params = {
            "id": process_id,
            "user_id": user_id,
            "source_url": reel_data.get("source_url"),
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
            "created_at": reel_data.get("created_at"),
        }

        logger.info("🔧 [DB_INSERT] Executing SQL and committing transaction...")
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(sql, params)

            location_raw = reel_data.get("location")
            if location_raw:
                _upsert_reel_locations(conn, process_id, user_id, location_raw)

            conn.commit()

        logger.info(
            f"✅ [DB] Successfully saved {process_id} | status={final_status} | list_subtype={list_subtype}"
        )

    except Exception as e:
        logger.error(f"❌❌❌ [DB_INSERT] FAILED for {process_id}: {e}")
        logger.exception("Full traceback:")
        raise