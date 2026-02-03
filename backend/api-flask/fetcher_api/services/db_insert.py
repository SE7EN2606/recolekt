# fetcher_api/services/db_insert.py

import json
import logging
from fetcher_api.adapters.db import execute, fetch_one, get_connection

logger = logging.getLogger("db")

def check_duplicate_reel(user_id, source_url):
    """
    Checks if a reel with the same source_url already exists for the user.
    """
    try:
        sql = "SELECT id FROM reels WHERE user_id = %s AND source_url = %s LIMIT 1;"
        result = fetch_one(sql, (user_id, source_url))
        return bool(result)
    except Exception as e:
        logger.error(f"Error checking duplicate: {e}")
        return False

def _get_text(value, lang="english"):
    """Helper to extract language from Dual-Language objects or return string."""
    if isinstance(value, dict):
        return value.get(lang) or value.get("original") or ""
    return value or ""

def insert_reel_into_db(reel_data):
    """
    Inserts or updates a reel record in the DB with Dual-Language support.
    """
    conn = None
    try:
        # Extract fields
        process_id = reel_data.get("process_id") or reel_data.get("id")
        user_id = reel_data.get("user_id")
        
        logger.info(f"🔧 [DB_INSERT] Starting insert for process_id: {process_id}")
        
        # --- DUAL-LANGUAGE TITLE HANDLING ---
        raw_title = reel_data.get("summary_title")
        raw_text = reel_data.get("summary_text")
        
        logger.info(f"🔧 [DB_INSERT] Raw title type: {type(raw_title)}, value: {raw_title}")
        
        # ✅ FIXED: Store FULL JSONB object, not just English string
        # Convert dict to JSON string for JSONB columns
        if isinstance(raw_title, dict):
            summary_title_json = json.dumps(raw_title)
            display_title = _get_text(raw_title, "english")  # For logging only
        else:
            summary_title_json = None
            display_title = raw_title or ""
        
        if isinstance(raw_text, dict):
            summary_text_json = json.dumps(raw_text)
        else:
            summary_text_json = None
        
        # ✅ FIXED: Only mark as "done" if explicitly passed from background worker
        # The background worker will pass status="done" when ALL processing is complete
        final_status = reel_data.get("status", "processing")
        
        logger.info(f"🔧 [DB_INSERT] Display title: '{display_title}'")
        logger.info(f"🔧 [DB_INSERT] final_status: {final_status}")
        logger.info(f"🔧 [DB_INSERT] duration: {reel_data.get('duration')}")

        # Ensure JSONB fields are valid strings
        gcs_urls = reel_data.get("gcs_urls", {})
        if isinstance(gcs_urls, dict):
            gcs_urls = json.dumps(gcs_urls)

        transcription = reel_data.get("transcription", {})
        if isinstance(transcription, dict):
            transcription = json.dumps(transcription)
        
        # ✅ FIXED: summary_bullets should be JSONB
        summary_bullets = reel_data.get("summary_bullets", [])
        if isinstance(summary_bullets, list):
            summary_bullets_json = json.dumps(summary_bullets)
        else:
            summary_bullets_json = summary_bullets or "[]"

        # Handle complex objects
        recipe_json = reel_data.get("recipe")
        workout_json = reel_data.get("workout")

        sql = """
        INSERT INTO reels (
            id, user_id, source_url, status, folder_id,
            caption, author_name, duration, is_long_video,
            
            summary_category, summary_topic, summary_title, summary_text,
            summary_bullets, summary_hashtags, summary_emojis,
            
            content_type, recipe, workout,
            
            gcs_urls, transcription, created_at, updated_at
        )
        VALUES (
            %(id)s, %(user_id)s, %(source_url)s, %(status)s, %(folder_id)s,
            %(caption)s, %(author_name)s, %(duration)s, %(is_long_video)s,
            
            %(summary_category)s, %(summary_topic)s, %(summary_title)s, %(summary_text)s,
            %(summary_bullets)s, %(summary_hashtags)s, %(summary_emojis)s,
            
            %(content_type)s, %(recipe)s, %(workout)s,
            
            %(gcs_urls)s, %(transcription)s, %(created_at)s, NOW()
        )
        ON CONFLICT (id) DO UPDATE SET
            status = EXCLUDED.status,
            caption = EXCLUDED.caption,
            duration = EXCLUDED.duration,
            summary_title = EXCLUDED.summary_title,
            summary_text = EXCLUDED.summary_text,
            summary_category = EXCLUDED.summary_category,
            summary_topic = EXCLUDED.summary_topic,
            summary_bullets = EXCLUDED.summary_bullets,
            summary_hashtags = EXCLUDED.summary_hashtags,
            summary_emojis = EXCLUDED.summary_emojis,
            content_type = EXCLUDED.content_type,
            recipe = EXCLUDED.recipe,
            workout = EXCLUDED.workout,
            transcription = EXCLUDED.transcription,
            gcs_urls = EXCLUDED.gcs_urls,
            updated_at = NOW();
        """
        
        params = {
            "id": process_id,
            "user_id": user_id,
            "source_url": reel_data.get("source_url"),
            "status": final_status,
            "folder_id": reel_data.get("folder_id", "default"),
            "caption": reel_data.get("caption", ""),
            "author_name": reel_data.get("author_name", ""),
            "duration": reel_data.get("duration"),
            "is_long_video": reel_data.get("is_long_video", False),
            
            "summary_category": reel_data.get("summary_category", "General"),
            "summary_topic": reel_data.get("summary_topic", "General"),
            "summary_title": summary_title_json,  # ✅ FIXED: Store full JSONB
            "summary_text": summary_text_json,     # ✅ FIXED: Store full JSONB
            
            "summary_bullets": summary_bullets_json,  # ✅ FIXED: JSONB array
            "summary_hashtags": reel_data.get("summary_hashtags", []),
            "summary_emojis": reel_data.get("summary_emojis", []),
            
            "content_type": reel_data.get("content_type", "generic"),
            "recipe": recipe_json,   # Full Dual-Language JSON
            "workout": workout_json, # Full Dual-Language JSON
            
            "gcs_urls": gcs_urls,
            "transcription": transcription,
            "created_at": reel_data.get("created_at")
        }
        
        logger.info(f"🔧 [DB_INSERT] Getting database connection...")
        conn = get_connection()
        
        logger.info(f"🔧 [DB_INSERT] Executing SQL...")
        execute(sql, params, commit=False)
        
        logger.info(f"🔧 [DB_INSERT] SQL executed successfully. Committing transaction...")
        conn.commit()
        
        logger.info(f"✅ [DB] Successfully saved {process_id} | status={final_status} | duration={reel_data.get('duration')} | title='{display_title}'")

    except Exception as e:
        logger.error(f"❌❌❌ [DB_INSERT] FAILED for {process_id}: {e}")
        logger.exception("Full traceback:")
        
        # Rollback on error
        if conn:
            try:
                conn.rollback()
                logger.warning(f"⚠️ [DB_INSERT] Transaction rolled back for {process_id}")
            except Exception as rollback_error:
                logger.error(f"❌ [DB_INSERT] Rollback also failed: {rollback_error}")
        raise e
