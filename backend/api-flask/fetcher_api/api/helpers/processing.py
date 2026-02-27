# fetcher_api/api/helpers/processing.py
"""Background processing logic - Fixed Dual-Language Structure with Early UI Updates"""
import os
import json
import shutil
import logging
from datetime import datetime

from fetcher_api.services.transcription import transcribe_video_deepgram
from fetcher_api.services.ai_service import analyze_instagram_video
from fetcher_api.services.db_insert import insert_reel_into_db
from fetcher_api.services.storage import save_video_to_gcs, save_result_json_to_gcs
from fetcher_api.utils.files import cleanup_file
from fetcher_api.adapters.db import execute  
from fetcher_api.api.helpers.normalizers import (
    get_video_duration,
    json_loads_maybe,
    ensure_dict,
    ensure_list,
    json_stringify,
)
from fetcher_api.utils.ocr_utils import maybe_ocr_and_merge_text
from fetcher_api.services.video_analysis import download_instagram_video, generate_reel_thumbnail

logger = logging.getLogger("api")

def cleanup_video_from_gcs(shortcode, platform_folder="IG_reels"):
    """Delete MP4 video from GCS after processing completes (keeps thumbnails + JSONs)"""
    try:
        from fetcher_api.adapters.gcs_client import gcs_client

        if not gcs_client.available:
            logger.warning("⚠️ GCS client not available, skipping MP4 cleanup")
            return False

        bucket = gcs_client.client.bucket(gcs_client.analysis_bucket_name)
        video_path = f"media/{platform_folder}/{shortcode}/{shortcode}_video.mp4"

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


def background_process(
    result,
    video_path,
    temp_dir,
    shortcode,
    caption,
    url,
    save_to_gcs,
    author_name,
    save_dir,
    user_id,
):
    from fetcher_api.adapters.gcs_client import gcs_client

    # ✅ DYNAMICALLY ROUTE FB TO FB_reels FOLDER
    is_facebook = "facebook.com" in url.lower() or "fb." in url.lower()
    platform_folder = "FB_reels" if is_facebook else "IG_reels"
    platform_code = "FB" if is_facebook else "IG"

    try:
        logger.info(f"🧵 Background worker started for {result['process_id']} ({platform_code})")

        result["user_id"] = user_id
        result["source_url"] = url

        # 1. Download Video 
        post_object = None
        if not os.path.exists(video_path):
            logger.info(f"⬇️ Background downloading video: {url}")
            dl_result = download_instagram_video(url, video_path)

            dl_result = ensure_dict(dl_result)

            if not dl_result.get("success"):
                logger.error("❌ Background download failed")
                result["status"] = "error"
                insert_reel_into_db(result)
                return

            post_object = dl_result.get("post")
            meta = ensure_dict(dl_result.get("metadata", {}))
            if not caption:
                caption = meta.get("caption", "")
            if not author_name:
                author_name = meta.get("username", "")

            result["caption"] = caption
            result["author_name"] = author_name

        # 2. Extract Duration
        if os.path.exists(video_path):
            file_size = os.path.getsize(video_path)
            logger.info(f"📊 Video file size: {file_size:,} bytes")

        duration, duration_seconds = get_video_duration(video_path)
        if duration:
            result["duration"] = duration
        else:
            result["duration"] = None

        # 3. Find/Download Thumbnail
        thumbnail_path = None
        if os.path.exists(video_path):
            try:
                video_dir = os.path.dirname(video_path)
                possible_thumbnail_paths = [
                    os.path.join(video_dir, f"{shortcode}.jpg"),
                    os.path.join(video_dir, f"{shortcode}.jpeg"),
                    os.path.join(video_dir, f"{result['process_id']}.jpg"),
                    os.path.join(video_dir, f"{result['process_id']}.jpeg"),
                ]

                for path in possible_thumbnail_paths:
                    if os.path.exists(path):
                        thumbnail_path = path
                        break

                if not thumbnail_path and post_object:
                    from fetcher_api.services.video_analysis import download_instagram_thumbnail
                    potential_path = os.path.join(video_dir, f"{shortcode}_thumbnail.jpg")
                    if download_instagram_thumbnail(post_object, potential_path):
                        thumbnail_path = potential_path

                if not thumbnail_path:
                    logger.warning("⚠️ No API thumbnail found. Falling back to OpenCV/FFmpeg frame extraction...")
                    potential_path = os.path.join(video_dir, f"{shortcode}_cv2_thumbnail.jpg")
                    if generate_reel_thumbnail(video_path, potential_path):
                        thumbnail_path = potential_path
                        
            except Exception as e:
                logger.error(f"❌ Thumbnail search/download failed: {e}")

        # 3.5: EARLY UI UPDATE 
        thumbnail_already_uploaded = False
        if thumbnail_path and os.path.exists(thumbnail_path) and save_to_gcs and gcs_client.available:
            try:
                bucket = gcs_client.client.bucket(gcs_client.analysis_bucket_name)
                # ✅ SAVES DIRECTLY TO FB_reels FOR FACEBOOK
                thumbnail_gcs_path = f"media/{platform_folder}/{shortcode}/{shortcode}_thumbnail.jpeg"
                thumbnail_blob = bucket.blob(thumbnail_gcs_path)
                thumbnail_blob.upload_from_filename(thumbnail_path, content_type="image/jpeg")
                
                thumbnail_url = f"https://storage.googleapis.com/{gcs_client.analysis_bucket_name}/{thumbnail_gcs_path}"
                
                gcs_urls = result.get("gcs_urls", {})
                if isinstance(gcs_urls, str):
                    gcs_urls = json_loads_maybe(gcs_urls, default={})
                gcs_urls = ensure_dict(gcs_urls)
                gcs_urls["preview_thumbnail"] = thumbnail_url
                result["gcs_urls"] = gcs_urls
                
                execute(
                    "UPDATE reels SET gcs_urls = %s::jsonb WHERE id = %s",
                    (json.dumps(gcs_urls, ensure_ascii=False), result["process_id"]),
                    commit=True
                )
                thumbnail_already_uploaded = True
            except Exception as e:
                logger.error(f"❌ Early thumbnail upload failed: {e}")

        # 4. Transcribe
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
            transcription_data = {
                "transcript": "",
                "status": "error",
                "detected_language": "unknown",
            }

        transcript_text = ensure_dict(transcription_data).get("transcript", "")
        detected_lang = ensure_dict(transcription_data).get("detected_language", "unknown")

        # 5. OCR Merge
        merged_text = transcript_text
        try:
            merged_text, _ = maybe_ocr_and_merge_text(transcript_text, caption, None, None, "document")
        except Exception as e:
            pass

        # 6. AI Analysis
        ai_result = analyze_instagram_video(merged_text, caption, detected_lang)
        ai_result = ensure_dict(ai_result)

        content_type = ai_result.get("content_type", "general") or "general"

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

        summary_from_ai = ai_result.get("summary", {})
        if not isinstance(summary_from_ai, dict) or "english" not in summary_from_ai:
            summary_from_ai = {
                "english": {
                    "title": ai_result.get("title", ""),
                    "summary": ai_result.get("summary_text", ""),
                    "headlines": ensure_list(ai_result.get("headlines", [])),
                    "hashtags": ensure_list(ai_result.get("hashtags", [])),
                    "emojis": ensure_list(ai_result.get("emojis", [])),
                },
                "original": {
                    "title": ai_result.get("title", ""),
                    "summary": ai_result.get("summary_text", ""),
                    "headlines": ensure_list(ai_result.get("headlines", [])),
                    "hashtags": ensure_list(ai_result.get("hashtags", [])),
                    "emojis": ensure_list(ai_result.get("emojis", [])),
                },
            }

        eng_summary = ensure_dict(summary_from_ai.get("english", {}))
        orig_summary = ensure_dict(summary_from_ai.get("original", {}))

        if content_type == "recipe" and recipe_obj:
            eng_recipe = ensure_dict(recipe_obj.get("english", {}))
            orig_recipe = ensure_dict(recipe_obj.get("original", {}))

            summary_block = {
                "english": {
                    "title": eng_recipe.get("title", "") or eng_summary.get("title", "Recipe"),
                    "summary": eng_summary.get("summary", ""),
                    "headlines": eng_summary.get("headlines", []),
                    "hashtags": eng_summary.get("hashtags", []),
                    "emojis": eng_summary.get("emojis", []),
                },
                "original": {
                    "title": orig_recipe.get("title", "") or orig_summary.get("title", "Recette"),
                    "summary": orig_summary.get("summary", ""),
                    "headlines": orig_summary.get("headlines", []),
                    "hashtags": orig_summary.get("hashtags", []),
                    "emojis": orig_summary.get("emojis", []),
                },
            }

            display_title = eng_recipe.get("title", "Recipe")
            display_category = ai_result.get("category", "Cooking")
            display_topic = ai_result.get("topic", "Recipe")

        else:
            summary_block = summary_from_ai
            display_title = eng_summary.get("title", "Saved Video")
            display_category = ai_result.get("category", "General")
            display_topic = ai_result.get("topic", "General")

        eng_data = ensure_dict(ensure_dict(summary_block).get("english", {}))

        result.update(
            {
                "summary": summary_block,
                "caption": caption,
                "author_name": author_name,
                "content_type": content_type,
                "summary_category": display_category,
                "summary_topic": display_topic,
                "summary_title": summary_block,
                "summary_text": summary_block,
                "summary_bullets": json.dumps(ensure_list(eng_data.get("headlines", [])), ensure_ascii=False),
                "summary_hashtags": ensure_list(eng_data.get("hashtags", [])),
                "summary_emojis": ensure_list(eng_data.get("emojis", [])),
                "recipe": json_stringify(recipe_raw) if recipe_raw is not None else None,
                "workout": json_stringify(workout_raw) if workout_raw is not None else None,
                "transcription": transcription_data,
                "created_at": datetime.utcnow().isoformat(),
            }
        )

        # 7. Upload Rest of JSONs to GCS
        if save_to_gcs and gcs_client.available:
            try:
                bucket = gcs_client.client.bucket(gcs_client.analysis_bucket_name)

                if not thumbnail_already_uploaded and thumbnail_path and os.path.exists(thumbnail_path):
                    thumbnail_gcs_path = f"media/{platform_folder}/{shortcode}/{shortcode}_thumbnail.jpeg"
                    thumbnail_blob = bucket.blob(thumbnail_gcs_path)
                    thumbnail_blob.upload_from_filename(thumbnail_path, content_type="image/jpeg")
                    thumbnail_url = f"https://storage.googleapis.com/{gcs_client.analysis_bucket_name}/{thumbnail_gcs_path}"
                    
                    gcs_urls = result.get("gcs_urls", {})
                    if isinstance(gcs_urls, str): gcs_urls = json_loads_maybe(gcs_urls, default={})
                    gcs_urls = ensure_dict(gcs_urls)
                    gcs_urls["preview_thumbnail"] = thumbnail_url
                    result["gcs_urls"] = gcs_urls

                # ✅ SAVES DIRECTLY TO FB_reels FOR FACEBOOK
                caption_json_path = f"media/{platform_folder}/{shortcode}/{shortcode}_caption.json"
                caption_blob = bucket.blob(caption_json_path)
                caption_blob.upload_from_string(
                    json.dumps({"caption": caption, "author": author_name}, indent=2, ensure_ascii=False),
                    content_type="application/json",
                )

                transcription_json_path = f"media/{platform_folder}/{shortcode}/{shortcode}_transcription.json"
                transcription_blob = bucket.blob(transcription_json_path)
                transcription_blob.upload_from_string(
                    json.dumps(transcription_data, indent=2, ensure_ascii=False),
                    content_type="application/json",
                )

            except Exception as e:
                logger.error(f"❌ Failed to upload files to GCS: {e}")

        # 8. GCS Uploads (Video + compact Result JSON)
        video_uploaded_successfully = False
        if save_to_gcs and gcs_client.available:
            try:
                video_url = save_video_to_gcs(video_path, shortcode, platform_code)

                compact_result = dict(result)
                try:
                    summary_for_json = ensure_dict(compact_result.get("summary", {}))
                    eng_for_json = ensure_dict(summary_for_json.get("english", {}))
                    compact_result["summary_title"] = eng_for_json.get("title", "") or ""
                    compact_result["summary_text"] = eng_for_json.get("summary", "") or ""
                except Exception as e:
                    pass

                for key in ("summary_bullets", "summary_hashtags", "summary_emojis"):
                    compact_result.pop(key, None)

                # ✅ SAVES RESULT TO FB_reels
                save_result_json_to_gcs(
                    result=compact_result,
                    process_id=result["process_id"],
                    temp_dir=temp_dir,
                    shortcode=shortcode,
                    media_folder=platform_code,
                )

                if video_url:
                    gcs_urls = result.get("gcs_urls", {})
                    if isinstance(gcs_urls, str): gcs_urls = json_loads_maybe(gcs_urls, default={})
                    gcs_urls = ensure_dict(gcs_urls)
                    gcs_urls["video"] = video_url
                    result["gcs_urls"] = gcs_urls
                    video_uploaded_successfully = True

            except Exception as e:
                logger.error(f"GCS upload failed: {e}")

        # 9. Finalize
        result["status"] = "done"
        logger.info(f"💾 Saving to database with duration={result.get('duration')}")
        insert_reel_into_db(result)

        # 10. Cleanup MP4 from GCS
        if video_uploaded_successfully:
            cleanup_video_from_gcs(shortcode, platform_folder)

        # 11. Cleanup local files
        cleanup_file(video_path)
        if thumbnail_path: cleanup_file(thumbnail_path)
        if temp_dir and os.path.exists(temp_dir): shutil.rmtree(temp_dir)

    except Exception as e:
        logger.error(f"❌ Background Process Failed: {e}", exc_info=True)
        try:
            result["status"] = "error"
            if "user_id" not in result: result["user_id"] = user_id
            insert_reel_into_db(result)
        except Exception:
            pass
