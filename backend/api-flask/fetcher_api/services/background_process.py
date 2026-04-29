"""Background processing logic - Cleaned Transcription & Single-JSON Storage"""

import asyncio
import json
import logging
import os
import shutil
from dataclasses import asdict, is_dataclass

import requests

from fetcher_api.adapters.db import execute
from fetcher_api.api.helpers.normalizers import ensure_dict, get_video_duration, json_stringify
from fetcher_api.services.ai_service import analyze_instagram_video
from fetcher_api.services.db_insert import insert_reel_into_db
from fetcher_api.services.storage import (
    generate_gcs_paths,
    save_result_json_to_gcs,
    save_video_to_gcs,
)
from fetcher_api.services.transcription import get_prompt_transcript, transcribe_video
from fetcher_api.services.video_analysis import (
    download_instagram_thumbnail,
    download_instagram_video,
    fetch_youtube_data,
    generate_reel_thumbnail,
)
from fetcher_api.utils.files import cleanup_file

logger = logging.getLogger("api")

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
        logger.error("❌ GCS Cleanup failed: %s", e)
        return False


def _extract_title_from_ai_summary(ai_summary: dict) -> str:
    if not isinstance(ai_summary, dict):
        return ""

    eng = ai_summary.get("english", {})
    orig = ai_summary.get("original", {})
    return (
        (eng.get("title") if isinstance(eng, dict) else None)
        or (orig.get("title") if isinstance(orig, dict) else None)
        or ai_summary.get("title")
        or ""
    ).strip()


def _run_async(coro):
    try:
        return asyncio.run(coro)
    except RuntimeError:
        loop = asyncio.new_event_loop()
        try:
            return loop.run_until_complete(coro)
        finally:
            loop.close()


def _transcription_result_to_dict(result) -> dict:
    if result is None:
        return {
            "status": "error",
            "transcript": "",
            "detected_language": "unknown",
            "transcription_source": "empty",
            "deepgram": None,
            "voxtral": None,
        }

    if is_dataclass(result):
        payload = asdict(result)
    elif isinstance(result, dict):
        payload = dict(result)
    else:
        payload = {
            "status": "error",
            "transcript": "",
            "detected_language": "unknown",
            "transcription_source": "empty",
            "deepgram": None,
            "voxtral": None,
        }

    payload["transcript"] = payload.get("transcript") or ""
    payload["detected_language"] = payload.get("detected_language") or "unknown"
    payload["transcription_source"] = payload.get("transcription_source") or "empty"
    payload["status"] = payload.get("status") or "error"
    payload.setdefault("deepgram", None)
    payload.setdefault("voxtral", None)
    return payload


def _run_parallel_transcription(media_path: str) -> tuple[str, dict, bool]:
    result = _run_async(transcribe_video(media_path))
    prompt_transcript = get_prompt_transcript(result)
    transcription_data = _transcription_result_to_dict(result)
    is_silent = transcription_data.get("status") == "empty/music" or not prompt_transcript.strip()
    return prompt_transcript, transcription_data, is_silent


def _save_content_payload(content_payload, process_id, gcs_paths, temp_dir, gcs_client):
    """
    Write the full Mistral payload log to GCS as {process_id}_content_payload.json,
    in the same folder as result.json.
    """
    if not content_payload or not gcs_client.available:
        return

    try:
        import tempfile as _tempfile

        payload_filename = f"{process_id}_content_payload.json"
        payload_local_path = os.path.join(
            temp_dir or _tempfile.gettempdir(),
            payload_filename,
        )

        with open(payload_local_path, "w", encoding="utf-8") as f:
            json.dump(
                {"process_id": process_id, "calls": content_payload},
                f,
                ensure_ascii=False,
                indent=2,
            )

        payload_gcs_path = gcs_paths["result_json"].replace("_result.json", "_content_payload.json")
        blob = gcs_client.client.bucket(gcs_client.analysis_bucket_name).blob(payload_gcs_path)
        blob.upload_from_filename(payload_local_path, content_type="application/json")

        logger.info("📄 Content payload saved → %s", payload_gcs_path)
        cleanup_file(payload_local_path)

    except Exception as e:
        logger.warning("⚠️ Could not save content payload file: %s", e)


def _save_input_payload(
    process_id,
    gcs_paths,
    temp_dir,
    gcs_client,
    caption,
    transcript,
    ocr_text,
    merged_text,
):
    """Save clean input data (caption, transcript, OCR text) to GCS for debugging."""
    if not gcs_client.available:
        return

    try:
        import tempfile as _tempfile

        payload = {
            "process_id": process_id,
            "caption": caption or "",
            "transcript": transcript or "",
            "ocr_text": ocr_text or "",
            "merged_text": merged_text or "",
        }
        filename = f"{process_id}_input_payload.json"
        local_path = os.path.join(temp_dir or _tempfile.gettempdir(), filename)

        with open(local_path, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)

        gcs_path = gcs_paths["result_json"].replace("_result.json", "_input_payload.json")
        blob = gcs_client.client.bucket(gcs_client.analysis_bucket_name).blob(gcs_path)
        blob.upload_from_filename(local_path, content_type="application/json")

        logger.info("📋 Input payload saved → %s", gcs_path)
        cleanup_file(local_path)

    except Exception as e:
        logger.warning("⚠️ Could not save input payload: %s", e)


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
    force=False,
):
    from fetcher_api.adapters.gcs_client import gcs_client
    from fetcher_api.adapters.meta_client import meta_client

    url_lower = (url or "").lower()
    is_youtube = "youtube.com" in url_lower or "youtu.be" in url_lower
    is_facebook = "facebook.com" in url_lower or "fb." in url_lower
    is_tiktok = "tiktok.com" in url_lower

    platform_code = "YT" if is_youtube else "FB" if is_facebook else "TT" if is_tiktok else "IG"
    gcs_paths = generate_gcs_paths(shortcode, platform_code, user_id)

    if force:
        logger.info("🔄 FORCED re-process for %s (user=%s)", url, user_id)

    try:
        result["user_id"] = user_id
        result["source_url"] = url
        result["caption"] = caption
        result["author_name"] = author_name
        result.setdefault("gcs_urls", {})

        # ── YouTube path ──────────────────────────────────────────────────────
        if is_youtube:
            logger.info("🎬 YouTube path: fetching transcript + metadata (no download)")

            yt = fetch_youtube_data(url, temp_dir=temp_dir)
            if not yt.get("success"):
                result["status"] = "error"
                insert_reel_into_db(result)
                return

            meta = yt.get("metadata", {}) or {}
            caption = caption or meta.get("caption", "")
            author_name = author_name or meta.get("username", "")
            result["caption"] = caption
            result["author_name"] = author_name

            transcript_text = yt.get("transcript", "") or ""
            detected_language = yt.get("detected_language", "en") or "en"
            audio_path = yt.get("audio_path")
            processing_strategy = "youtube_captions"

            prompt_transcript = transcript_text
            is_silent_input = not bool(prompt_transcript.strip())

            if not transcript_text.strip() and audio_path and os.path.exists(audio_path):
                logger.info("🎵 No captions — running parallel transcription on audio: %s", audio_path)
                try:
                    prompt_transcript, transcription_data, is_silent_input = _run_parallel_transcription(audio_path)
                    transcript_text = transcription_data.get("transcript", "") or ""
                    detected_language = transcription_data.get("detected_language", "unknown") or "unknown"
                    processing_strategy = "youtube_audio_parallel"
                    logger.info(
                        "✅ Parallel audio transcript: %d chars, lang=%s, source=%s",
                        len(transcript_text),
                        detected_language,
                        transcription_data.get("transcription_source"),
                    )
                except Exception as e:
                    logger.error("❌ Parallel transcription on YouTube audio failed: %s", e)
                    transcription_data = {
                        "status": "error",
                        "transcript": "",
                        "detected_language": "unknown",
                        "transcription_source": "empty",
                        "deepgram": None,
                        "voxtral": None,
                    }
                    prompt_transcript = ""
                    transcript_text = ""
                    detected_language = "unknown"
                    is_silent_input = True
                finally:
                    try:
                        if audio_path and os.path.exists(audio_path):
                            os.unlink(audio_path)
                    except Exception:
                        pass
            else:
                transcription_data = {
                    "status": processing_strategy,
                    "transcript": transcript_text,
                    "detected_language": detected_language,
                    "transcription_source": "youtube_captions",
                    "deepgram": None,
                    "voxtral": None,
                }

            thumbnail_path = os.path.join(temp_dir, f"{shortcode}_thumb.jpg")
            thumb_success = False

            yt_thumb = yt.get("thumbnail_path")
            if yt_thumb and os.path.exists(yt_thumb):
                if yt_thumb != thumbnail_path:
                    shutil.copy2(yt_thumb, thumbnail_path)
                thumb_success = True
            else:
                thumb_url_oembed = meta.get("thumbnail_url", "")
                if thumb_url_oembed:
                    try:
                        r = requests.get(thumb_url_oembed, timeout=15)
                        if r.status_code == 200:
                            with open(thumbnail_path, "wb") as f:
                                f.write(r.content)
                            thumb_success = True
                    except Exception as e:
                        logger.warning("⚠️ YouTube thumbnail download failed: %s", e)

            if thumb_success and save_to_gcs and gcs_client.available:
                thumb_blob = gcs_client.client.bucket(gcs_client.analysis_bucket_name).blob(
                    gcs_paths["preview_thumbnail"]
                )
                thumb_blob.upload_from_filename(thumbnail_path, content_type="image/jpeg")
                thumb_url = (
                    f"https://storage.googleapis.com/{gcs_client.analysis_bucket_name}/"
                    f"{gcs_paths['preview_thumbnail']}"
                )
                result["gcs_urls"]["preview_thumbnail"] = thumb_url
                execute(
                    "UPDATE reels SET gcs_urls = %s::jsonb WHERE id = %s",
                    (json.dumps(result["gcs_urls"]), result["process_id"]),
                    commit=True,
                )

            _save_input_payload(
                result["process_id"],
                gcs_paths,
                temp_dir,
                gcs_client,
                caption,
                transcript_text,
                "",
                prompt_transcript,
            )

            ai_res = ensure_dict(
                analyze_instagram_video(
                    prompt_transcript,
                    caption,
                    detected_language,
                    video_path=None,
                    duration_seconds=0,
                    is_silent=is_silent_input,
                )
            )

            content_payload = ai_res.pop("_content_payload", None)

            ai_summary = ai_res.get("summary", {})
            if isinstance(ai_summary, str):
                try:
                    ai_summary = json.loads(ai_summary)
                except Exception:
                    ai_summary = {}
            if not isinstance(ai_summary, dict):
                ai_summary = {}

            summary_title = _extract_title_from_ai_summary(ai_summary)
            if not summary_title and caption:
                summary_title = caption.split("\n")[0][:80].strip()

            result.update(
                {
                    "status": "done",
                    "user_id": user_id,
                    "source_url": url,
                    "duration": None,
                    "duration_seconds": 0,
                    "caption": caption,
                    "author_name": author_name,
                    "summary": ai_summary,
                    "summary_title": summary_title,
                    "content_type": ai_res.get("content_type", "general"),
                    "summary_category": ai_res.get("category", ""),
                    "summary_topic": ai_res.get("topic", ""),
                    "recipe": json_stringify(ai_res.get("recipe")),
                    "workout": json_stringify(ai_res.get("workout")),
                    "tools_list": ai_res.get("tools_list"),
                    "location": ai_res.get("location"),
                    "is_list": ai_res.get("is_list"),
                    "list_count": ai_res.get("list_count"),
                    "list_type": ai_res.get("list_type"),
                    "list_subtype": ai_res.get("list_subtype"),
                    "prompt": ai_res.get("prompt"),
                    "transcription": transcription_data,
                    "processing_strategy": processing_strategy,
                    "detected_language": ai_res.get("detected_language", detected_language),
                }
            )

            if save_to_gcs and gcs_client.available:
                save_result_json_to_gcs(result, result["process_id"], temp_dir, shortcode, platform_code)
                base_url = f"https://storage.googleapis.com/{gcs_client.analysis_bucket_name}/"
                result["gcs_urls"].update(
                    {
                        "result_json": base_url + gcs_paths["result_json"],
                        "video": None,
                    }
                )
                _save_content_payload(content_payload, result["process_id"], gcs_paths, temp_dir, gcs_client)

            insert_reel_into_db(result)

            if os.path.exists(thumbnail_path):
                cleanup_file(thumbnail_path)
            if temp_dir and os.path.exists(temp_dir):
                shutil.rmtree(temp_dir, ignore_errors=True)

            logger.info("✅ YouTube processing complete: %s", result["process_id"])
            return

        # ── Instagram / TikTok / Facebook path ───────────────────────────────
        dl_result = {}
        if not os.path.exists(video_path):
            if is_tiktok:
                dl_result = ensure_dict(download_instagram_video(url, video_path))
            else:
                dl_result = ensure_dict(meta_client.download_video(url, video_path))

            if not dl_result.get("success"):
                result["status"] = "error"
                insert_reel_into_db(result)
                return

            meta = ensure_dict(dl_result.get("metadata", {}))
            post_obj = dl_result.get("post")
            caption = caption or meta.get("caption", "")
            author_name = author_name or meta.get("username", "")
            result["caption"] = caption
            result["author_name"] = author_name
        else:
            post_obj = None
            meta = {}
            dl_result = {}

        duration, duration_seconds = get_video_duration(video_path)
        is_too_long = duration_seconds > MAX_DURATION_SECONDS

        if is_too_long:
            logger.info("⏳ Video > 5min (%ss). Smart Bookmark Fallback.", duration_seconds)
            transcription_data = {
                "status": "bookmark_only",
                "transcript": "",
                "detected_language": "unknown",
                "transcription_source": "empty",
                "deepgram": None,
                "voxtral": None,
            }
            prompt_transcript = ""
            final_transcript = ""
            is_silent_input = False
        else:
            prompt_transcript, transcription_data, is_silent_input = _run_parallel_transcription(video_path)
            final_transcript = transcription_data.get("transcript", "") or ""

        thumbnail_path = os.path.join(os.path.dirname(video_path), f"{shortcode}_thumb.jpg")
        thumb_success = False

        platform_thumb = dl_result.get("thumbnail_path")
        if platform_thumb and os.path.exists(platform_thumb):
            if platform_thumb != thumbnail_path:
                shutil.copy2(platform_thumb, thumbnail_path)
            thumb_success = True
            logger.info("✅ Using platform thumbnail → %s", thumbnail_path)
        elif post_obj and not is_facebook:
            thumb_success = download_instagram_thumbnail(post_obj, thumbnail_path, url)
        elif is_facebook and meta.get("thumbnail"):
            try:
                r = requests.get(meta.get("thumbnail"), timeout=15)
                if r.status_code == 200:
                    with open(thumbnail_path, "wb") as f:
                        f.write(r.content)
                    thumb_success = True
            except Exception as e:
                logger.warning("⚠️ Failed to download Facebook thumbnail: %s", e)

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
            result["gcs_urls"]["preview_thumbnail"] = thumb_url
            execute(
                "UPDATE reels SET gcs_urls = %s::jsonb WHERE id = %s",
                (json.dumps(result["gcs_urls"]), result["process_id"]),
                commit=True,
            )

        _save_input_payload(
            result["process_id"],
            gcs_paths,
            temp_dir,
            gcs_client,
            caption,
            final_transcript,
            "",
            prompt_transcript,
        )

        ai_res = ensure_dict(
            analyze_instagram_video(
                prompt_transcript,
                caption,
                transcription_data["detected_language"],
                video_path=video_path,
                duration_seconds=duration_seconds,
                is_silent=is_silent_input,
            )
        )

        logger.info("🔑 ai_res keys: %s", sorted(ai_res.keys()))
        logger.info(
            "🔑 tools_list present: %s | type: %s",
            ai_res.get("tools_list") is not None,
            type(ai_res.get("tools_list")).__name__,
        )

        content_payload = ai_res.pop("_content_payload", None)

        ai_summary = ai_res.get("summary", {})
        if isinstance(ai_summary, str):
            try:
                ai_summary = json.loads(ai_summary)
            except Exception:
                ai_summary = {}
        if not isinstance(ai_summary, dict):
            ai_summary = {}

        summary_title = _extract_title_from_ai_summary(ai_summary)
        if not summary_title and caption:
            summary_title = caption.split("\n")[0][:80].strip()

        result.update(
            {
                "status": "done",
                "user_id": user_id,
                "source_url": url,
                "duration": duration,
                "duration_seconds": duration_seconds,
                "caption": caption,
                "author_name": author_name,
                "summary": ai_summary,
                "summary_title": summary_title,
                "content_type": ai_res.get("content_type", "general"),
                "summary_category": ai_res.get("category", ""),
                "summary_topic": ai_res.get("topic", ""),
                "recipe": json_stringify(ai_res.get("recipe")),
                "workout": json_stringify(ai_res.get("workout")),
                "tools_list": ai_res.get("tools_list"),
                "location": ai_res.get("location"),
                "is_list": ai_res.get("is_list"),
                "list_count": ai_res.get("list_count"),
                "list_type": ai_res.get("list_type"),
                "list_subtype": ai_res.get("list_subtype"),
                "prompt": ai_res.get("prompt"),
                "transcription": transcription_data,
                "processing_strategy": "bookmark" if is_too_long else "full",
                "detected_language": ai_res.get(
                    "detected_language",
                    transcription_data.get("detected_language", "unknown"),
                ),
            }
        )

        if save_to_gcs and gcs_client.available:
            if not is_too_long:
                video_url = save_video_to_gcs(video_path, shortcode, platform_code)
            else:
                video_url = None
                logger.info("⏩ Bookmark mode: Skipping MP4 upload.")

            save_result_json_to_gcs(result, result["process_id"], temp_dir, shortcode, platform_code)
            base_url = f"https://storage.googleapis.com/{gcs_client.analysis_bucket_name}/"
            result["gcs_urls"].update(
                {
                    "result_json": base_url + gcs_paths["result_json"],
                    "video": video_url,
                }
            )
            _save_content_payload(content_payload, result["process_id"], gcs_paths, temp_dir, gcs_client)

        insert_reel_into_db(result)

        cleanup_file(video_path)
        if os.path.exists(thumbnail_path):
            cleanup_file(thumbnail_path)
        if temp_dir and os.path.exists(temp_dir):
            shutil.rmtree(temp_dir, ignore_errors=True)

    except Exception as e:
        logger.error("❌ Background Process Failed: %s", e, exc_info=True)
        result["status"] = "error"
        insert_reel_into_db(result)