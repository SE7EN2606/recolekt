"""Background processing logic - Cleaned Transcription & Single-JSON Storage"""
import os
import json
import shutil
import logging
from datetime import datetime


from fetcher_api.services.transcription import transcribe_video_deepgram
from fetcher_api.services.ai_service import analyze_instagram_video
from fetcher_api.services.db_insert import insert_reel_into_db
from fetcher_api.services.storage import save_video_to_gcs, save_result_json_to_gcs, generate_gcs_paths
from fetcher_api.utils.files import cleanup_file
from fetcher_api.adapters.db import execute, get_user_tier
from fetcher_api.api.helpers.normalizers import (
    get_video_duration,
    json_loads_maybe,
    ensure_dict,
    ensure_list,
    json_stringify,
)
from fetcher_api.utils.ocr_utils import maybe_ocr_and_merge_text

from fetcher_api.services.video_analysis import (
    download_instagram_video,
    generate_reel_thumbnail,
    download_instagram_thumbnail,
    fetch_youtube_data,
)

logger = logging.getLogger("api")

FREE_MAX_DURATION    = 180
PRO_MAX_DURATION     = 360
MAX_DURATION_SECONDS = 300


def cleanup_video_from_gcs(shortcode, platform_code="IG", user_id=None):
    try:
        from fetcher_api.adapters.gcs_client import gcs_client
        if not gcs_client.available:
            return False
        paths = generate_gcs_paths(shortcode, platform_code, user_id)
        blob = gcs_client.client.bucket(gcs_client.analysis_bucket_name).blob(paths["video"])
        if blob.exists():
            blob.delete()
        return True
    except Exception as e:
        logger.error(f"❌ GCS Cleanup failed: {e}")
        return False


def _extract_title_from_ai_summary(ai_summary: dict) -> str:
    if not isinstance(ai_summary, dict):
        return ""
    eng  = ai_summary.get("english",  {})
    orig = ai_summary.get("original", {})
    return (
        (eng.get("title")  if isinstance(eng,  dict) else None) or
        (orig.get("title") if isinstance(orig, dict) else None) or
        ai_summary.get("title") or
        ""
    ).strip()


def background_process(result, video_path, temp_dir, shortcode, caption, url,
                       save_to_gcs, author_name, save_dir, user_id):
    from fetcher_api.adapters.gcs_client import gcs_client
    from fetcher_api.adapters.meta_client import meta_client

    url_lower   = url.lower()
    is_youtube  = "youtube.com" in url_lower or "youtu.be" in url_lower
    is_facebook = "facebook.com" in url_lower or "fb." in url_lower
    is_tiktok   = "tiktok.com" in url_lower

    platform_code = "YT" if is_youtube else "FB" if is_facebook else "TT" if is_tiktok else "IG"
    gcs_paths = generate_gcs_paths(shortcode, platform_code, user_id)

    try:
        result["user_id"]     = user_id
        result["source_url"]  = url
        result["caption"]     = caption
        result["author_name"] = author_name

        # ══════════════════════════════════════════════════════════════
        # YOUTUBE PATH — transcript API + oEmbed, audio fallback
        # ══════════════════════════════════════════════════════════════
        if is_youtube:
            logger.info("🎬 YouTube path: fetching transcript + metadata (no download)")

            yt = fetch_youtube_data(url, temp_dir=temp_dir)
            if not yt.get("success"):
                result["status"] = "error"
                insert_reel_into_db(result)
                return

            meta        = yt.get("metadata", {})
            caption     = caption     or meta.get("caption", "")
            author_name = author_name or meta.get("username", "")
            result["caption"]     = caption
            result["author_name"] = author_name

            transcript_text   = yt.get("transcript", "")
            detected_language = yt.get("detected_language", "en") or "en"
            audio_path        = yt.get("audio_path")   # set when captions unavailable
            processing_strategy = "youtube_captions"

            # ── Audio fallback → Deepgram ────────────────────────────
            if not transcript_text.strip() and audio_path and os.path.exists(audio_path):
                logger.info(f"🎵 No captions — running Deepgram on audio: {audio_path}")
                try:
                    raw = transcribe_video_deepgram(audio_path)
                    if isinstance(raw, str) and raw.strip().startswith("{"):
                        td = json_loads_maybe(raw, default={"transcript": raw})
                    else:
                        td = raw if isinstance(raw, dict) else {"transcript": str(raw)}

                    transcript_text   = td.get("transcript", "") or ""
                    if isinstance(transcript_text, dict):
                        transcript_text = transcript_text.get("transcript", "")
                    detected_language = td.get("detected_language", "en") or "en"
                    processing_strategy = "youtube_audio_deepgram"
                    logger.info(f"✅ Deepgram transcript: {len(transcript_text)} chars, lang={detected_language}")
                except Exception as e:
                    logger.error(f"❌ Deepgram on YouTube audio failed: {e}")
                finally:
                    try:
                        if audio_path and os.path.exists(audio_path):
                            os.unlink(audio_path)
                    except Exception:
                        pass

            transcription_data = {
                "transcript":        transcript_text,
                "detected_language": detected_language,
                "status":            processing_strategy,
            }
            logger.info(f"✅ YouTube transcript ready: {len(transcript_text)} chars, strategy={processing_strategy}")

            # ── Thumbnail from oEmbed ────────────────────────────────
            thumbnail_path   = os.path.join(temp_dir, f"{shortcode}_thumb.jpg")
            thumb_success    = False
            thumb_url_oembed = meta.get("thumbnail_url", "")
            if thumb_url_oembed:
                try:
                    import requests as req
                    r = req.get(thumb_url_oembed, timeout=15)
                    if r.status_code == 200:
                        with open(thumbnail_path, "wb") as f:
                            f.write(r.content)
                        thumb_success = True
                        logger.info("✅ YouTube thumbnail downloaded from oEmbed")
                except Exception as e:
                    logger.warning(f"⚠️ YouTube thumbnail download failed: {e}")

            if thumb_success and save_to_gcs and gcs_client.available:
                thumb_blob = gcs_client.client.bucket(gcs_client.analysis_bucket_name).blob(
                    gcs_paths["preview_thumbnail"]
                )
                thumb_blob.upload_from_filename(thumbnail_path, content_type="image/jpeg")
                thumb_url = (
                    f"https://storage.googleapis.com/{gcs_client.analysis_bucket_name}/"
                    f"{gcs_paths['preview_thumbnail']}"
                )
                result["gcs_urls"] = {"preview_thumbnail": thumb_url}
                execute(
                    "UPDATE reels SET gcs_urls = %s::jsonb WHERE id = %s",
                    (json.dumps(result["gcs_urls"]), result["process_id"]),
                    commit=True,
                )

            # ── AI Analysis ──────────────────────────────────────────
            merged_text = transcript_text
            if caption and caption not in transcript_text:
                merged_text = f"{transcript_text}\n\n{caption}".strip()

            ai_res = ensure_dict(
                analyze_instagram_video(
                    merged_text, caption, detected_language,
                    video_path=None, duration_seconds=0,
                )
            )

            ai_summary = ai_res.get("summary", {})
            if isinstance(ai_summary, str):
                try: ai_summary = json.loads(ai_summary)
                except Exception: ai_summary = {}
            if not isinstance(ai_summary, dict):
                ai_summary = {}

            summary_title = _extract_title_from_ai_summary(ai_summary)
            if not summary_title and caption:
                summary_title = caption.split("\n")[0][:80].strip()

            result.update({
                "status":              "done",
                "user_id":             user_id,
                "source_url":          url,
                "duration":            None,
                "duration_seconds":    0,
                "caption":             caption,
                "author_name":         author_name,
                "summary":             ai_summary,
                "summary_title":       summary_title,
                "content_type":        ai_res.get("content_type", "general"),
                "summary_category":    ai_res.get("category", ""),
                "summary_topic":       ai_res.get("topic", ""),
                "recipe":              json_stringify(ai_res.get("recipe")),
                "workout":             json_stringify(ai_res.get("workout")),
                "prompt":              ai_res.get("prompt"),
                "transcription":       transcription_data,
                "processing_strategy": processing_strategy,
                "detected_language":   ai_res.get("detected_language", detected_language),
            })

            if save_to_gcs and gcs_client.available:
                save_result_json_to_gcs(result, result["process_id"], temp_dir, shortcode, platform_code)
                base_url = f"https://storage.googleapis.com/{gcs_client.analysis_bucket_name}/"
                if "gcs_urls" not in result:
                    result["gcs_urls"] = {}
                result["gcs_urls"].update({
                    "result_json": base_url + gcs_paths["result_json"],
                    "video":       None,
                })

            insert_reel_into_db(result)

            if os.path.exists(thumbnail_path):
                cleanup_file(thumbnail_path)
            if temp_dir and os.path.exists(temp_dir):
                shutil.rmtree(temp_dir, ignore_errors=True)

            logger.info(f"✅ YouTube processing complete: {result['process_id']}")
            return

        # ══════════════════════════════════════════════════════════════
        # STANDARD PATH — Instagram / Facebook / TikTok
        # ══════════════════════════════════════════════════════════════

        # 1. Download & Metadata
        if not os.path.exists(video_path):
            if is_facebook:
                dl_result = ensure_dict(meta_client.download_video(url, video_path))
            else:
                dl_result = ensure_dict(download_instagram_video(url, video_path))

            if not dl_result.get("success"):
                result["status"] = "error"
                insert_reel_into_db(result)
                return

            meta        = ensure_dict(dl_result.get("metadata", {}))
            post_obj    = dl_result.get("post")
            caption     = caption     or meta.get("caption", "")
            author_name = author_name or meta.get("username", "")
            result["caption"]     = caption
            result["author_name"] = author_name
        else:
            post_obj = None
            meta     = {}

        # 2. Duration Check
        duration, duration_seconds = get_video_duration(video_path)
        is_too_long = duration_seconds > MAX_DURATION_SECONDS

        # 3. Transcription
        if is_too_long:
            logger.info(f"⏳ Video > 5min ({duration_seconds}s). Smart Bookmark Fallback.")
            transcription_data = {"status": "bookmark_only", "transcript": "", "detected_language": "unknown"}
        else:
            raw = transcribe_video_deepgram(video_path)
            if isinstance(raw, str) and raw.strip().startswith("{"):
                transcription_data = json_loads_maybe(raw, default={"transcript": raw})
            else:
                transcription_data = raw if isinstance(raw, dict) else {"transcript": str(raw)}

        final_transcript = transcription_data.get("transcript", "")
        if isinstance(final_transcript, dict):
            final_transcript = final_transcript.get("transcript", "")
        transcription_data["transcript"] = final_transcript

        raw_lang = transcription_data.get("detected_language") or ""
        if not raw_lang or raw_lang == "unknown":
            transcription_data["detected_language"] = "en" if final_transcript.strip() else "unknown"
        else:
            transcription_data["detected_language"] = raw_lang

        # 4. Thumbnail
        thumbnail_path = os.path.join(os.path.dirname(video_path), f"{shortcode}_thumb.jpg")
        thumb_success  = False

        if post_obj and not is_facebook:
            thumb_success = download_instagram_thumbnail(post_obj, thumbnail_path, url)
        elif is_facebook and meta.get("thumbnail"):
            import requests
            try:
                r = requests.get(meta.get("thumbnail"), timeout=15)
                if r.status_code == 200:
                    with open(thumbnail_path, "wb") as f:
                        f.write(r.content)
                    thumb_success = True
            except Exception as e:
                logger.warning(f"⚠️ Failed to download Facebook thumbnail: {e}")

        if not thumb_success:
            generate_reel_thumbnail(video_path, thumbnail_path)

        if os.path.exists(thumbnail_path) and save_to_gcs and gcs_client.available:
            thumb_blob = gcs_client.client.bucket(gcs_client.analysis_bucket_name).blob(
                gcs_paths["preview_thumbnail"]
            )
            thumb_blob.upload_from_filename(thumbnail_path, content_type="image/jpeg")
            thumb_url = (
                f"https://storage.googleapis.com/{gcs_client.analysis_bucket_name}/"
                f"{gcs_paths['preview_thumbnail']}"
            )
            result["gcs_urls"] = {"preview_thumbnail": thumb_url}
            execute(
                "UPDATE reels SET gcs_urls = %s::jsonb WHERE id = %s",
                (json.dumps(result["gcs_urls"]), result["process_id"]),
                commit=True,
            )

        # 5. AI Analysis
        merged_text = final_transcript
        if not is_too_long:
            try:
                merged_text, _ = maybe_ocr_and_merge_text(final_transcript, caption, None, None, "document")
            except Exception:
                pass

        ai_res = ensure_dict(
            analyze_instagram_video(
                merged_text, caption, transcription_data["detected_language"],
                video_path=video_path, duration_seconds=duration_seconds,
            )
        )

        ai_summary = ai_res.get("summary", {})
        if isinstance(ai_summary, str):
            try: ai_summary = json.loads(ai_summary)
            except Exception: ai_summary = {}
        if not isinstance(ai_summary, dict):
            ai_summary = {}

        summary_title = _extract_title_from_ai_summary(ai_summary)
        if not summary_title and caption:
            summary_title = caption.split("\n")[0][:80].strip()

        # 6. Final Result
        result.update({
            "status":               "done",
            "user_id":              user_id,
            "source_url":           url,
            "duration":             duration,
            "duration_seconds":     duration_seconds,
            "caption":              caption,
            "author_name":          author_name,
            "summary":              ai_summary,
            "summary_title":        summary_title,
            "content_type":         ai_res.get("content_type", "general"),
            "summary_category":     ai_res.get("category", ""),
            "summary_topic":        ai_res.get("topic", ""),
            "recipe":               json_stringify(ai_res.get("recipe")),
            "workout":              json_stringify(ai_res.get("workout")),
            "prompt":               ai_res.get("prompt"),
            "transcription":        transcription_data,
            "processing_strategy":  "bookmark" if is_too_long else "full",
            "detected_language":    ai_res.get("detected_language", "unknown"),
        })

        # 7. GCS Upload
        video_uploaded = False
        if save_to_gcs and gcs_client.available:
            if not is_too_long:
                video_url      = save_video_to_gcs(video_path, shortcode, platform_code)
                video_uploaded = bool(video_url)
            else:
                video_url = None
                logger.info("⏩ Bookmark mode: Skipping MP4 upload.")

            save_result_json_to_gcs(result, result["process_id"], temp_dir, shortcode, platform_code)
            base_url = f"https://storage.googleapis.com/{gcs_client.analysis_bucket_name}/"
            result["gcs_urls"].update({
                "result_json": base_url + gcs_paths["result_json"],
                "video":       video_url,
            })

        # 8. DB Save & Cleanup
        insert_reel_into_db(result)
        if video_uploaded:
            cleanup_video_from_gcs(shortcode, platform_code, user_id)

        cleanup_file(video_path)
        if os.path.exists(thumbnail_path):
            cleanup_file(thumbnail_path)
        if temp_dir and os.path.exists(temp_dir):
            shutil.rmtree(temp_dir)

    except Exception as e:
        logger.error(f"❌ Background Process Failed: {e}", exc_info=True)
        result["status"] = "error"
        insert_reel_into_db(result)