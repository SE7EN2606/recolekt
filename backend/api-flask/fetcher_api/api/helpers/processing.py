# fetcher_api/api/helpers/processing.py

"""Background processing logic - Fixed Dual-Language Structure"""
import os
import json
import shutil
import logging
from datetime import datetime
from google.cloud import storage

from fetcher_api.services.transcription import transcribe_video_deepgram
from fetcher_api.services.ai_service import analyze_instagram_video
from fetcher_api.services.db_insert import insert_reel_into_db
from fetcher_api.services.storage import save_video_to_gcs, save_result_json_to_gcs
from fetcher_api.utils.files import cleanup_file
from fetcher_api.api.helpers.normalizers import (
    get_video_duration,
    json_loads_maybe,
    ensure_dict,
    ensure_list,
    json_stringify,
)
from fetcher_api.utils.ocr_utils import maybe_ocr_and_merge_text
from fetcher_api.services.video_analysis import download_instagram_video
from fetcher_api.adapters.gcs_client import gcs_client

logger = logging.getLogger("api")


def cleanup_video_from_gcs(shortcode):
    """Delete MP4 video from GCS after processing completes (keeps thumbnails + JSONs)"""
    try:
        storage_client = storage.Client()
        bucket_name = os.getenv("GCS_BUCKET_NAME", "recolekt-analysis")
        bucket = storage_client.bucket(bucket_name)

        video_path = f"media/IG_reels/{shortcode}/{shortcode}_video.mp4"

        blob = bucket.blob(video_path)
        if blob.exists():
            blob.delete()
            logger.info(f"🗑️ Deleted MP4 from GCS (saved space): {video_path}")
            return True
        else:
            logger.warning(f"⚠️ MP4 not found in GCS: {video_path}")
            return False

    except Exception as e:
        logger.error(f"❌ Failed to delete MP4 from GCS: {e}")
        return False


def background_process(result, video_path, temp_dir, shortcode, caption, url, save_to_gcs, author_name, save_dir, user_id):
    try:
        logger.info(f"🧵 Background worker started for {result['process_id']}")

        result["user_id"] = user_id
        result["source_url"] = url

        # 1. Download Video (if not done in main thread)
        if not os.path.exists(video_path):
            logger.info(f"⬇️ Background downloading video: {url}")
            dl_result = download_instagram_video(url, video_path)

            # dl_result should be dict; guard anyway
            dl_result = ensure_dict(dl_result)

            if not dl_result.get("success"):
                logger.error("❌ Background download failed")
                result["status"] = "error"
                insert_reel_into_db(result)
                return

            meta = ensure_dict(dl_result.get("metadata", {}))
            if not caption:
                caption = meta.get("caption", "")
            if not author_name:
                author_name = meta.get("username", "")

            result["caption"] = caption
            result["author_name"] = author_name

        # 2. Extract Duration
        logger.info(f"📹 Attempting to extract duration from: {video_path}")

        if os.path.exists(video_path):
            file_size = os.path.getsize(video_path)
            logger.info(f"📊 Video file size: {file_size:,} bytes ({file_size / (1024*1024):.2f} MB)")
        else:
            logger.error(f"❌ Video file DOES NOT EXIST at: {video_path}")

        duration, duration_seconds = get_video_duration(video_path)

        logger.info(f"⏱️ Duration extraction result: duration={duration}, seconds={duration_seconds}")

        if duration:
            result["duration"] = duration
            logger.info(f"✅ Duration saved to result: {duration}")
        else:
            logger.warning("⚠️ No duration extracted! Setting to None")
            result["duration"] = None

        # 3. Transcribe
        raw_transcription = transcribe_video_deepgram(video_path)

        transcription_data = {}
        if isinstance(raw_transcription, str):
            try:
                transcription_data = json.loads(raw_transcription)
            except Exception:
                transcription_data = {
                    "transcript": raw_transcription,
                    "status": "raw_text",
                    "detected_language": "unknown",
                }
        elif isinstance(raw_transcription, dict):
            transcription_data = raw_transcription
        else:
            transcription_data = {"transcript": "", "status": "error", "detected_language": "unknown"}

        transcript_text = ensure_dict(transcription_data).get("transcript", "")
        detected_lang = ensure_dict(transcription_data).get("detected_language", "unknown")

        logger.info(f"🗣️ Audio transcribed. Language detected: {detected_lang}")

        # 4. OCR Merge
        merged_text = transcript_text
        try:
            merged_text, _ = maybe_ocr_and_merge_text(transcript_text, caption, None, None, "document")
        except Exception as e:
            logger.warning(f"OCR step failed: {e}")

        # 5. AI Analysis (Dual-Language)
        logger.info("🤖 Starting AI Analysis (Dual-Language Mode)...")

        ai_result = analyze_instagram_video(merged_text, caption, detected_lang)
        ai_result = ensure_dict(ai_result)

        # Content type + special payloads
        content_type = ai_result.get("content_type", "general") or "general"

        # IMPORTANT: recipe/workout may arrive as JSON strings -> parse safely for dict access
        recipe_raw = ai_result.get("recipe")
        workout_raw = ai_result.get("workout")

        recipe_obj = None
        workout_obj = None

        if isinstance(recipe_raw, dict):
            recipe_obj = recipe_raw
        elif isinstance(recipe_raw, str):
            parsed = json_loads_maybe(recipe_raw, default=None)
            recipe_obj = parsed if isinstance(parsed, dict) else None

        if isinstance(workout_raw, dict):
            workout_obj = workout_raw
        elif isinstance(workout_raw, str):
            parsed = json_loads_maybe(workout_raw, default=None)
            workout_obj = parsed if isinstance(parsed, dict) else None

        # Normalize top-level summary-ish fields (may vary by analyzer implementation)
        summary_field = ai_result.get("summary", "")
        if isinstance(summary_field, str):
            top_level_summary = summary_field
        elif isinstance(summary_field, dict):
            eng_sum = ensure_dict(summary_field.get("english", {}))
            top_level_summary = eng_sum.get("summary", "") or eng_sum.get("text", "") or ""
        else:
            top_level_summary = ""

        top_level_headlines = ai_result.get("headlines", [])
        top_level_hashtags = ai_result.get("hashtags", [])
        top_level_emojis = ai_result.get("emojis", [])

        top_level_headlines = ensure_list(top_level_headlines)
        top_level_hashtags = ensure_list(top_level_hashtags)
        top_level_emojis = ensure_list(top_level_emojis)

        # Handle both recipe and general content
        if content_type == "recipe" and recipe_obj:
            # Recipe content - extract dual-language data
            eng_recipe = ensure_dict(recipe_obj.get("english", {}))
            orig_recipe = ensure_dict(recipe_obj.get("original", {}))

            summary_block = {
                "english": {
                    "title": eng_recipe.get("title", "Recipe"),
                    "summary": top_level_summary,
                    "headlines": top_level_headlines,
                    "hashtags": top_level_hashtags,
                    "emojis": top_level_emojis,
                },
                "original": {
                    "title": orig_recipe.get("title", "Recette"),
                    "summary": top_level_summary,
                    "headlines": top_level_headlines,
                    "hashtags": top_level_hashtags,
                    "emojis": top_level_emojis,
                },
            }

            display_title = eng_recipe.get("title", "Recipe")
            display_category = ai_result.get("category", "Cooking")
            display_topic = ai_result.get("topic", "Recipe")

        else:
            # General content - use summary structure if present
            summary_data = ai_result.get("summary", {})

            if isinstance(summary_data, dict) and "english" in summary_data:
                # Dual-language summary
                summary_block = summary_data

                eng = ensure_dict(summary_data.get("english", {}))
                display_title = eng.get("title", "Saved Video")
                display_category = eng.get("category", "General")
                display_topic = eng.get("topic", "General")

            else:
                # Fallback: build minimal structure
                summary_block = {
                    "english": {
                        "title": ai_result.get("title", "Saved Video"),
                        "summary": top_level_summary,
                        "headlines": top_level_headlines,
                        "hashtags": top_level_hashtags,
                        "emojis": top_level_emojis,
                    },
                    "original": {
                        "title": ai_result.get("title", "Saved Video"),
                        "summary": top_level_summary,
                        "headlines": top_level_headlines,
                        "hashtags": top_level_hashtags,
                        "emojis": top_level_emojis,
                    },
                }

                display_title = ai_result.get("title", "Saved Video")
                display_category = ai_result.get("category", "General")
                display_topic = ai_result.get("topic", "General")

        eng_data = ensure_dict(ensure_dict(summary_block).get("english", {}))

        result.update(
            {
                "summary": summary_block,  # DUAL-LANGUAGE STRUCTURE PRESERVED
                "caption": caption,
                "author_name": author_name,
                "content_type": content_type,
                # Flat fields for database/search (English by default)
                "summary_category": display_category,
                "summary_topic": display_topic,
                "summary_title": display_title,
                "summary_text": eng_data.get("summary", "") if isinstance(eng_data.get("summary", ""), str) else "",
                "summary_bullets": json.dumps(ensure_list(eng_data.get("headlines", [])), ensure_ascii=False),
                "summary_hashtags": ensure_list(eng_data.get("hashtags", [])),
                "summary_emojis": ensure_list(eng_data.get("emojis", [])),
                # Special content types (MUST BE JSON STRINGS FOR POSTGRESQL)
                # IMPORTANT: Avoid double-dumping if already JSON text
                "recipe": json_stringify(recipe_raw) if recipe_raw is not None else None,
                "workout": json_stringify(workout_raw) if workout_raw is not None else None,
                "transcription": transcription_data,
                "created_at": datetime.utcnow().isoformat(),
            }
        )

        # 6. Upload Caption + Transcription JSONs to GCS
        if save_to_gcs and gcs_client.available:
            try:
                bucket_name = os.getenv("GCS_BUCKET_NAME", "recolekt-analysis")
                storage_client = storage.Client()
                bucket = storage_client.bucket(bucket_name)

                # Upload Caption JSON
                caption_json_path = f"media/IG_reels/{shortcode}/{shortcode}_caption.json"
                caption_blob = bucket.blob(caption_json_path)
                caption_blob.upload_from_string(
                    json.dumps({"caption": caption, "author": author_name}, indent=2, ensure_ascii=False),
                    content_type="application/json",
                )
                logger.info(f"✅ Uploaded caption JSON: {caption_json_path}")

                # Upload Transcription JSON
                transcription_json_path = f"media/IG_reels/{shortcode}/{shortcode}_transcription.json"
                transcription_blob = bucket.blob(transcription_json_path)
                transcription_blob.upload_from_string(
                    json.dumps(transcription_data, indent=2, ensure_ascii=False),
                    content_type="application/json",
                )
                logger.info(f"✅ Uploaded transcription JSON: {transcription_json_path}")

            except Exception as e:
                logger.error(f"❌ Failed to upload caption/transcription JSONs: {e}")

        # 7. GCS Uploads (Video + Result)
        video_uploaded_successfully = False
        if save_to_gcs and gcs_client.available:
            try:
                video_url = save_video_to_gcs(video_path, shortcode, "IG")
                save_result_json_to_gcs(
                    result=result,
                    process_id=result["process_id"],
                    temp_dir=temp_dir,
                    shortcode=shortcode,
                    media_folder="IG",
                )

                if video_url:
                    gcs_urls = result.get("gcs_urls", {})
                    if isinstance(gcs_urls, str):
                        gcs_urls = json_loads_maybe(gcs_urls, default={})
                    gcs_urls = ensure_dict(gcs_urls)
                    gcs_urls["video"] = video_url
                    result["gcs_urls"] = gcs_urls
                    video_uploaded_successfully = True

            except Exception as e:
                logger.error(f"GCS upload failed: {e}")

        # 8. Finalize
        result["status"] = "done"

        logger.info(f"💾 Saving to database with duration={result.get('duration')}")
        insert_reel_into_db(result)

        # 9. Cleanup MP4 from GCS
        if video_uploaded_successfully:
            logger.info("🗑️ Processing complete - cleaning up MP4 from GCS...")
            cleanup_video_from_gcs(shortcode)

        # Log completion
        safe_title = display_title
        if isinstance(safe_title, dict):
            safe_title = safe_title.get("english", "Saved Video")
        logger.info(f"✅ Processing Complete: {safe_title}")

        # 10. Cleanup local files
        cleanup_file(video_path)
        if temp_dir and os.path.exists(temp_dir):
            shutil.rmtree(temp_dir)

    except Exception as e:
        logger.error(f"❌ Background Process Failed: {e}", exc_info=True)
        try:
            result["status"] = "error"
            if "user_id" not in result:
                result["user_id"] = user_id
            insert_reel_into_db(result)
        except Exception:
            pass
