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
from fetcher_api.services.video_analysis import download_instagram_video, generate_reel_thumbnail

logger = logging.getLogger("api")

FREE_MAX_DURATION = 180
PRO_MAX_DURATION = 360


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
    """Pull the best available title string out of the AI bilingual summary block."""
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

    is_facebook = "facebook.com" in url.lower() or "fb." in url.lower()
    platform_code = "FB" if is_facebook else "IG"
    gcs_paths = generate_gcs_paths(shortcode, platform_code, user_id)

    try:
        # 0. Ensure critical fields are always in result (needed for error handler)
        result["user_id"] = user_id
        result["source_url"] = url
        result["caption"] = caption
        result["author_name"] = author_name

        # 1. Download & Metadata
        if not os.path.exists(video_path):
            dl_result = ensure_dict(download_instagram_video(url, video_path))
            if not dl_result.get("success"):
                result["status"] = "error"
                insert_reel_into_db(result)
                return
            meta = ensure_dict(dl_result.get("metadata", {}))
            caption     = caption     or meta.get("caption", "")
            author_name = author_name or meta.get("username", "")
            result["caption"] = caption
            result["author_name"] = author_name

        # 2. Duration & Strategy
        duration, duration_seconds = get_video_duration(video_path)
        user_tier  = get_user_tier(user_id)
        is_too_long = (
            (user_tier == "free" and duration_seconds > FREE_MAX_DURATION) or
            (user_tier == "pro"  and duration_seconds > PRO_MAX_DURATION)
        )

        # 3. Transcription
        if is_too_long:
            transcription_data = {"status": "bookmark_only", "transcript": "", "detected_language": "en"}
        else:
            raw = transcribe_video_deepgram(video_path)
            if isinstance(raw, str) and raw.strip().startswith("{"):
                transcription_data = json_loads_maybe(raw, default={"transcript": raw})
            else:
                transcription_data = raw if isinstance(raw, dict) else {"transcript": str(raw)}

        final_transcript = transcription_data.get("transcript", "")
        if isinstance(final_transcript, dict):
            final_transcript = final_transcript.get("transcript", "")
        transcription_data["transcript"]         = final_transcript
        transcription_data["detected_language"]  = transcription_data.get("detected_language") or "en"
        if transcription_data["detected_language"] == "unknown":
            transcription_data["detected_language"] = "en"

        # 4. Thumbnail & Early UI Update
        thumbnail_path = os.path.join(os.path.dirname(video_path), f"{shortcode}_thumb.jpg")
        generate_reel_thumbnail(video_path, thumbnail_path)

        if os.path.exists(thumbnail_path) and save_to_gcs and gcs_client.available:
            thumb_blob = gcs_client.client.bucket(gcs_client.analysis_bucket_name).blob(
                gcs_paths["preview_thumbnail"]
            )
            thumb_blob.upload_from_filename(thumbnail_path, content_type="image/jpeg")
            thumb_url = (
                f"https://storage.googleapis.com/"
                f"{gcs_client.analysis_bucket_name}/{gcs_paths['preview_thumbnail']}"
            )
            result["gcs_urls"] = {"preview_thumbnail": thumb_url}
            execute(
                "UPDATE reels SET gcs_urls = %s::jsonb WHERE id = %s",
                (json.dumps(result["gcs_urls"]), result["process_id"]),
                commit=True,
            )

        # 5. AI Analysis
        merged_text = final_transcript
        try:
            merged_text, _ = maybe_ocr_and_merge_text(final_transcript, caption, None, None, "document")
        except Exception:
            pass

        ai_res = ensure_dict(
            analyze_instagram_video(merged_text, caption, transcription_data["detected_language"])
        )

        # ── Parse AI summary & extract title before saving ──────────────────
        ai_summary = ai_res.get("summary", {})
        if isinstance(ai_summary, str):
            try:
                ai_summary = json.loads(ai_summary)
            except Exception:
                ai_summary = {}
        if not isinstance(ai_summary, dict):
            ai_summary = {}

        summary_title = _extract_title_from_ai_summary(ai_summary)
        # Fall back to caption first line if AI didn't produce a title
        if not summary_title and caption:
            summary_title = caption.split("\n")[0][:80].strip()
        # ────────────────────────────────────────────────────────────────────

        # 6. Final Result Object
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
            "transcription":        transcription_data,
            "processing_strategy":  "bookmark" if is_too_long else "full",
        })

        # 7. GCS Upload (Video + Result JSON)
        video_uploaded = False
        if save_to_gcs and gcs_client.available:
            video_url = save_video_to_gcs(video_path, shortcode, platform_code)
            save_result_json_to_gcs(result, result["process_id"], temp_dir, shortcode, platform_code)

            base_url = f"https://storage.googleapis.com/{gcs_client.analysis_bucket_name}/"
            result["gcs_urls"].update({
                "result_json": base_url + gcs_paths["result_json"],
                "video":       video_url,
            })
            video_uploaded = bool(video_url)

        # 8. Final DB Save & Cleanup
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