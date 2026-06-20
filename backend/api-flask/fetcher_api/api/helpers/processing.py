"""Background processing logic - Cleaned Transcription & Single-JSON Storage"""
import asyncio
import os
import json
import shutil
import logging
import requests

from fetcher_api.services.transcription import (
    transcribe_video,
    get_prompt_transcript,
    TranscriptionResult,
)
from fetcher_api.services.ai_service import analyze_instagram_video
from fetcher_api.services.db_insert import insert_reel_into_db
from fetcher_api.services.storage import (
    save_result_json_to_gcs,
    save_thumbnail_to_gcs,
    generate_gcs_paths,
)
from fetcher_api.utils.files import cleanup_file
from fetcher_api.adapters.db import execute
from fetcher_api.api.helpers.normalizers import (
    get_video_duration,
    ensure_dict,
    json_stringify,
)
from fetcher_api.api.helpers.video_downloader import get_instagram_video_duration
from fetcher_api.utils.ocr_utils import maybe_ocr_and_merge_text
from fetcher_api.services.video_analysis import (
    download_instagram_video,
    generate_reel_thumbnail,
    download_instagram_thumbnail,
    fetch_youtube_data,
)


logger = logging.getLogger("api")


FREE_MAX_DURATION = 180
PRO_MAX_DURATION = 360
MAX_DURATION_SECONDS = 300


_PUBLIC_CONTENT_TYPES = {
    "recipe",
    "workout",
    "location",
    "products",
    "software",
    "finance",
    "general",
}


def _normalize_content_type(raw: str | None) -> str:
    ct = (raw or "").strip().lower()

    if not ct or ct in {"generic", "summary"}:
        return "general"

    if ct == "tools":
        return "products"

    return ct if ct in _PUBLIC_CONTENT_TYPES else "general"


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
    def parse_json_recursively(value, depth=0):
        if depth > 3 or not isinstance(value, str):
            return value
        text = value.strip()
        if not text or text[0] not in "{[":
            return value
        try:
            return parse_json_recursively(json.loads(text), depth + 1)
        except Exception:
            return value

    def usable_text(value):
        if not isinstance(value, str):
            return ""
        text = value.strip()
        if not text or text == "[object Object]":
            return ""
        if text[0] in "{[":
            try:
                json.loads(text)
                return ""
            except Exception:
                pass
        return text

    parsed = parse_json_recursively(ai_summary)
    if not isinstance(parsed, dict):
        return usable_text(parsed)

    for path in (
        ("english", "title"),
        ("original", "title"),
        ("title",),
        ("summary", "english", "title"),
        ("summary", "original", "title"),
    ):
        current = parsed
        for key in path:
            if not isinstance(current, dict):
                current = None
                break
            current = current.get(key)
        title = usable_text(parse_json_recursively(current))
        if title:
            return title

    return ""


def _base_from_result_json_path(gcs_paths: dict) -> tuple[str, str]:
    result_json_path = gcs_paths["result_json"]
    folder = result_json_path.rsplit("/", 1)[0]
    filename = os.path.basename(result_json_path)
    base = filename.replace("_result.json", "")
    return folder, base


def _save_content_payload(content_payload, process_id, gcs_paths, temp_dir, gcs_client):
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

        folder, base = _base_from_result_json_path(gcs_paths)
        payload_gcs_path = f"{folder}/{base}_content_payload.json"

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

        folder, base = _base_from_result_json_path(gcs_paths)
        gcs_path = f"{folder}/{base}_input_payload.json"

        blob = gcs_client.client.bucket(gcs_client.analysis_bucket_name).blob(gcs_path)
        blob.upload_from_filename(local_path, content_type="application/json")

        logger.info("📋 Input payload saved → %s", gcs_path)
        cleanup_file(local_path)

    except Exception as e:
        logger.warning("⚠️ Could not save input payload: %s", e)



def _stabilize_tiktok_caption_recipe(ai_res: dict, caption: str) -> None:
    """
    TikTok caption-only fallback can produce useful recipe shells from dish names,
    but post-processing may mislabel the cooking method. Keep the rich recipe UI,
    while tagging the recipe as inferred and correcting obvious hashtag-derived method.
    """
    if not isinstance(ai_res, dict):
        return

    recipe = ai_res.get("recipe")
    if not isinstance(recipe, dict):
        return

    text = (caption or "").lower()

    recipe["recipe_source"] = "caption_only_ai_inferred"
    recipe["source_confidence"] = "medium"

    if "slowcooker" in text or "slow cooker" in text or "#slowcooker" in text:
        recipe["cooking_style"] = "Slow cooking"
        if not recipe.get("style"):
            recipe["style"] = "Comfort food"

    if "bourguignon" in text:
        recipe["cuisine"] = "French"
        if not recipe.get("cooking_style") or recipe.get("cooking_style") == "Baking":
            recipe["cooking_style"] = "Slow cooking"


def _run_transcription(path: str) -> TranscriptionResult:
    try:
        return asyncio.run(transcribe_video(path))
    except RuntimeError:
        loop = asyncio.new_event_loop()
        try:
            asyncio.set_event_loop(loop)
            return loop.run_until_complete(transcribe_video(path))
        finally:
            asyncio.set_event_loop(None)
            loop.close()


def _single_transcript_to_dict(t) -> dict | None:
    if t is None:
        return None

    return {
        "status": getattr(t, "status", None),
        "transcript": getattr(t, "transcript", "") or "",
        "language": getattr(t, "language", None),
        "source": getattr(t, "source", None),
        "chars": getattr(t, "chars", 0),
    }


def _transcription_result_to_dict(t: TranscriptionResult | None) -> dict:
    if t is None:
        return {
            "status": "error",
            "transcript": "",
            "detected_language": "unknown",
            "transcription_source": "empty",
            "deepgram": None,
            "voxtral": None,
        }

    return {
        "status": t.status,
        "transcript": t.transcript or "",
        "detected_language": t.detected_language or "unknown",
        "transcription_source": t.transcription_source or "empty",
        "deepgram": _single_transcript_to_dict(getattr(t, "deepgram", None)),
        "voxtral": _single_transcript_to_dict(getattr(t, "voxtral", None)),
    }


def _is_silent_from_transcription_data(data: dict) -> bool:
    status = (data.get("status") or "").strip().lower()
    transcript = (data.get("transcript") or "").strip()
    source = (data.get("transcription_source") or "").strip().lower()

    return (
        status in {"empty/music", "empty", "music_only"}
        or source == "empty"
        or not transcript
    )


def _ensure_gcs_urls(result: dict) -> None:
    if "gcs_urls" not in result or not isinstance(result.get("gcs_urls"), dict):
        result["gcs_urls"] = {}

    result["gcs_urls"].setdefault("preview_thumbnail", None)
    result["gcs_urls"].setdefault("video", None)
    result["gcs_urls"].setdefault("result_json", None)


def _persist_gcs_urls(process_id: str, gcs_urls: dict) -> None:
    try:
        execute(
            "UPDATE reels SET gcs_urls = %s::jsonb WHERE id = %s",
            (json.dumps(gcs_urls), process_id),
            commit=True,
        )
    except Exception as exc:
        logger.warning("⚠️ Could not persist gcs_urls for %s: %s", process_id, exc)


def _upload_thumbnail_and_persist(
    *,
    thumbnail_path: str,
    shortcode: str,
    platform_code: str,
    user_id: str,
    gcs_paths: dict,
    result: dict,
    save_to_gcs: bool,
    gcs_client,
) -> None:
    if not os.path.exists(thumbnail_path) or not save_to_gcs or not gcs_client.available:
        return

    thumb_url = save_thumbnail_to_gcs(
        thumbnail_path,
        shortcode,
        platform_code,
        user_id=user_id,
        gcs_paths=gcs_paths,
    )

    if not thumb_url:
        logger.warning("⚠️ Thumbnail upload returned no URL for %s", result.get("process_id"))
        return

    _ensure_gcs_urls(result)
    result["gcs_urls"]["preview_thumbnail"] = thumb_url
    _persist_gcs_urls(result["process_id"], result["gcs_urls"])


def _upload_result_json_and_attach(
    *,
    result: dict,
    temp_dir: str,
    shortcode: str,
    platform_code: str,
    user_id: str,
    gcs_paths: dict,
    save_to_gcs: bool,
    gcs_client,
) -> None:
    if not save_to_gcs or not gcs_client.available:
        return

    _ensure_gcs_urls(result)
    result["gcs_urls"]["video"] = None

    result_json_url = save_result_json_to_gcs(
        result,
        result["process_id"],
        temp_dir,
        shortcode,
        platform_code,
        user_id=user_id,
        gcs_paths=gcs_paths,
    )

    if not result_json_url:
        logger.warning("⚠️ Result JSON upload returned no URL for %s", result.get("process_id"))
        return

    result["gcs_urls"]["result_json"] = result_json_url


def _mark_forced_reprocess_failed(result: dict, message: str) -> None:
    process_id = result.get("process_id") or result.get("id")
    user_id = result.get("user_id")
    if not process_id or not user_id:
        insert_reel_into_db(result)
        return

    try:
        execute(
            """
            UPDATE reels
            SET status = 'error',
                error_message = %s,
                updated_at = NOW()
            WHERE id = %s AND user_id = %s
            """,
            (str(message or "refresh_failed")[:500], process_id, user_id),
        )
    except Exception:
        logger.exception("❌ Failed to mark forced reprocess error for %s", process_id)
        raise


def _fail_processing(result: dict, message: str, force: bool) -> None:
    result["status"] = "error"
    result["error_message"] = str(message or "processing_failed")[:500]
    if force:
        _mark_forced_reprocess_failed(result, result["error_message"])
        return
    insert_reel_into_db(result)


def _abort_if_forced_extraction_failed(result: dict, ai_res: dict, force: bool) -> bool:
    if not force or not isinstance(ai_res, dict) or not ai_res.get("_extraction_failed"):
        return False

    logger.error(
        "❌ Forced refresh extraction failed for %s; preserving existing content",
        result.get("process_id"),
    )
    _fail_processing(result, "extraction_failed", force)
    return True


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
    gcs_paths = generate_gcs_paths(shortcode, platform_code, user_id=user_id)

    if force:
        logger.info("🔄 FORCED re-process for %s (user=%s)", url, user_id)

    try:
        result["user_id"] = user_id
        result["source_url"] = url
        result["caption"] = caption
        result["author_name"] = author_name
        result["gcs_paths"] = gcs_paths
        _ensure_gcs_urls(result)

        if is_youtube:
            logger.info("🎬 YouTube path: fetching transcript + metadata (no download)")

            yt = fetch_youtube_data(url, temp_dir=temp_dir)
            if not yt.get("success"):
                _fail_processing(result, "youtube_extraction_failed", force)
                return

            meta = yt.get("metadata", {}) or {}
            caption = caption or meta.get("caption", "")
            author_name = author_name or meta.get("username", "")
            result["caption"] = caption
            result["author_name"] = author_name

            transcript_text = yt.get("transcript", "") or ""
            detected_language = yt.get("detected_language", "en") or "en"
            audio_path = yt.get("audio_path")
            yt_video_path = yt.get("video_path")
            yt_duration = None
            yt_duration_seconds = 0
            if yt_video_path and os.path.exists(yt_video_path):
                yt_duration, yt_duration_seconds = get_video_duration(yt_video_path)
            if not yt_duration_seconds:
                try:
                    _yt_meta_dur = (meta.get("duration") or meta.get("duration_seconds"))
                    if _yt_meta_dur:
                        yt_duration_seconds = int(float(_yt_meta_dur))
                    if not yt_duration_seconds:
                        _yt_fetched = get_instagram_video_duration(url)
                        if _yt_fetched:
                            yt_duration_seconds = _yt_fetched
                    if yt_duration_seconds:
                        _m, _s = divmod(yt_duration_seconds, 60)
                        yt_duration = f"{_m}:{_s:02d}"
                except Exception:
                    pass
            processing_strategy = "youtube_captions_with_video" if yt_video_path else "youtube_captions"
            t_result = None

            if not transcript_text.strip() and audio_path and os.path.exists(audio_path):
                logger.info(f"🎵 No captions — running parallel transcription on audio: {audio_path}")
                try:
                    t_result = _run_transcription(audio_path)
                    transcript_text = t_result.transcript or ""
                    detected_language = t_result.detected_language or "en"
                    processing_strategy = (
                        f"youtube_audio_{t_result.transcription_source}_with_video"
                        if yt_video_path
                        else f"youtube_audio_{t_result.transcription_source}"
                    )
                    logger.info(
                        f"✅ Transcription: {len(transcript_text)} chars, "
                        f"lang={detected_language}, source={t_result.transcription_source}"
                    )
                except Exception as e:
                    logger.error(f"❌ Transcription on YouTube audio failed: {e}")
                    t_result = None
                finally:
                    try:
                        if audio_path and os.path.exists(audio_path):
                            os.unlink(audio_path)
                    except Exception:
                        pass

            transcription_data = (
                _transcription_result_to_dict(t_result)
                if t_result
                else {
                    "status": processing_strategy,
                    "transcript": transcript_text,
                    "detected_language": detected_language,
                    "transcription_source": "youtube_captions",
                    "deepgram": None,
                    "voxtral": None,
                }
            )

            is_silent_input = _is_silent_from_transcription_data(transcription_data)

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
                        logger.warning(f"⚠️ YouTube thumbnail download failed: {e}")

            if thumb_success and not force:
                _upload_thumbnail_and_persist(
                    thumbnail_path=thumbnail_path,
                    shortcode=shortcode,
                    platform_code=platform_code,
                    user_id=user_id,
                    gcs_paths=gcs_paths,
                    result=result,
                    save_to_gcs=save_to_gcs,
                    gcs_client=gcs_client,
                )

            prompt_transcript = get_prompt_transcript(t_result) if t_result else transcript_text
            merged_text = prompt_transcript
            if caption and caption not in merged_text:
                merged_text = f"{merged_text}\n\n{caption}".strip()

            if save_to_gcs and gcs_client.available:
                _save_input_payload(
                    result["process_id"],
                    gcs_paths,
                    temp_dir,
                    gcs_client,
                    caption,
                    transcript_text,
                    "",
                    merged_text,
                )

            ai_res = ensure_dict(
                analyze_instagram_video(
                    merged_text,
                    caption,
                    detected_language,
                    video_path=yt_video_path if yt_video_path and os.path.exists(yt_video_path) else None,
                    duration_seconds=yt_duration_seconds,
                    is_silent=is_silent_input,
                    fail_on_extractor_error=force,
                    source_platform=platform_code,
                )
            )
            if _abort_if_forced_extraction_failed(result, ai_res, force):
                return

            if thumb_success and force:
                _upload_thumbnail_and_persist(
                    thumbnail_path=thumbnail_path,
                    shortcode=shortcode,
                    platform_code=platform_code,
                    user_id=user_id,
                    gcs_paths=gcs_paths,
                    result=result,
                    save_to_gcs=save_to_gcs,
                    gcs_client=gcs_client,
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

            result.update({
                "status": "done",
                "user_id": user_id,
                "source_url": url,
                "duration": yt_duration,
                "duration_seconds": yt_duration_seconds,
                "caption": caption,
                "author_name": author_name,
                "summary": ai_summary,
                "summary_title": summary_title,
                "content_type": _normalize_content_type(ai_res.get("content_type")),
                "summary_category": ai_res.get("category", ""),
                "summary_topic": ai_res.get("topic", ""),
                "recipe": json_stringify(ai_res.get("recipe")),
                "workout": json_stringify(ai_res.get("workout")),
                "tools_list": ai_res.get("tools_list"),
                "location": ai_res.get("location"),
                "prompt": ai_res.get("prompt"),
                "debug": ai_res.get("debug"),
                "is_list": ai_res.get("is_list", False),
                "list_subtype": ai_res.get("list_subtype"),
                "list_count": ai_res.get("list_count"),
                "list_type": ai_res.get("list_type"),
                "transcription": transcription_data,
                "processing_strategy": processing_strategy,
                "detected_language": ai_res.get("detected_language", detected_language),
            })

            _upload_result_json_and_attach(
                result=result,
                temp_dir=temp_dir,
                shortcode=shortcode,
                platform_code=platform_code,
                user_id=user_id,
                gcs_paths=gcs_paths,
                save_to_gcs=save_to_gcs,
                gcs_client=gcs_client,
            )

            _save_content_payload(content_payload, result["process_id"], gcs_paths, temp_dir, gcs_client)

            insert_reel_into_db(result)

            if os.path.exists(thumbnail_path):
                cleanup_file(thumbnail_path)
            if temp_dir and os.path.exists(temp_dir):
                shutil.rmtree(temp_dir, ignore_errors=True)

            logger.info(f"✅ YouTube processing complete: {result['process_id']}")
            return

        dl_result = {}
        if not os.path.exists(video_path):
            if is_tiktok:
                if str(os.getenv("TIKTOK_TRY_VIDEO_DOWNLOAD", "")).lower() not in {"1", "true", "yes"}:
                    logger.info("TikTok video download skipped; using caption/thumbnail fallback")
                    dl_result = {"ok": False, "path": None, "error": "tiktok_video_download_disabled"}
                else:
                    dl_result = ensure_dict(meta_client.download_video(url, video_path))
            else:
                dl_result = ensure_dict(download_instagram_video(url, video_path))

            if not dl_result.get("success"):
                meta = ensure_dict(dl_result.get("metadata", {}))
                caption = caption or meta.get("caption", "")
                author_name = author_name or meta.get("username", "")

                if is_tiktok and caption:
                    logger.info("TikTok video unavailable; using caption-only recipe fallback")

                    thumbnail_path = os.path.join(os.path.dirname(video_path), f"{shortcode}_thumb.jpg")
                    platform_thumb = dl_result.get("thumbnail_path")
                    if platform_thumb and os.path.exists(platform_thumb):
                        shutil.copy2(platform_thumb, thumbnail_path)

                    transcription_data = {
                        "status": "caption_only",
                        "transcript": "",
                        "detected_language": "en",
                        "transcription_source": "caption_only",
                        "deepgram": None,
                        "voxtral": None,
                    }

                    merged_text = caption

                    if not force:
                        _upload_thumbnail_and_persist(
                            thumbnail_path=thumbnail_path,
                            shortcode=shortcode,
                            platform_code=platform_code,
                            user_id=user_id,
                            gcs_paths=gcs_paths,
                            result=result,
                            save_to_gcs=save_to_gcs,
                            gcs_client=gcs_client,
                        )

                    if save_to_gcs and gcs_client.available:
                        _save_input_payload(
                            result["process_id"],
                            gcs_paths,
                            temp_dir,
                            gcs_client,
                            caption,
                            "",
                            "",
                            merged_text,
                        )

                    ai_res = ensure_dict(
                        analyze_instagram_video(
                            merged_text,
                            caption,
                            "en",
                            video_path=None,
                            duration_seconds=0,
                            is_silent=False,
                            fail_on_extractor_error=force,
                            source_platform=platform_code,
                        )
                    )
                    if _abort_if_forced_extraction_failed(result, ai_res, force):
                        return

                    if force:
                        _upload_thumbnail_and_persist(
                            thumbnail_path=thumbnail_path,
                            shortcode=shortcode,
                            platform_code=platform_code,
                            user_id=user_id,
                            gcs_paths=gcs_paths,
                            result=result,
                            save_to_gcs=save_to_gcs,
                            gcs_client=gcs_client,
                        )

                    content_payload = ai_res.pop("_content_payload", None)
                    _stabilize_tiktok_caption_recipe(ai_res, caption)

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

                    _tt_dur_secs = 0
                    _tt_dur_fmt = None
                    try:
                        _meta_dur = meta.get("duration") or meta.get("duration_seconds")
                        if _meta_dur:
                            _tt_dur_secs = int(float(_meta_dur))
                        if not _tt_dur_secs:
                            _fetched = get_instagram_video_duration(url)
                            if _fetched:
                                _tt_dur_secs = _fetched
                        if _tt_dur_secs:
                            m, s = divmod(_tt_dur_secs, 60)
                            _tt_dur_fmt = f"{m}:{s:02d}"
                    except Exception:
                        pass
                    result.update({
                        "status": "done",
                        "user_id": user_id,
                        "source_url": url,
                        "duration": _tt_dur_fmt,
                        "duration_seconds": _tt_dur_secs,
                        "caption": caption,
                        "author_name": author_name,
                        "summary": ai_summary,
                        "summary_title": summary_title,
                        "content_type": _normalize_content_type(ai_res.get("content_type")),
                        "summary_category": ai_res.get("category", ""),
                        "summary_topic": ai_res.get("topic", ""),
                        "recipe": json_stringify(ai_res.get("recipe")),
                        "workout": json_stringify(ai_res.get("workout")),
                        "tools_list": ai_res.get("tools_list"),
                        "location": ai_res.get("location"),
                        "prompt": ai_res.get("prompt"),
                        "debug": ai_res.get("debug"),
                        "is_list": ai_res.get("is_list", False),
                        "list_subtype": ai_res.get("list_subtype"),
                        "list_count": ai_res.get("list_count"),
                        "list_type": ai_res.get("list_type"),
                        "transcription": transcription_data,
                        "processing_strategy": "tiktok_caption_only",
                        "detected_language": ai_res.get("detected_language", "en"),
                    })

                    _upload_result_json_and_attach(
                        result=result,
                        temp_dir=temp_dir,
                        shortcode=shortcode,
                        platform_code=platform_code,
                        user_id=user_id,
                        gcs_paths=gcs_paths,
                        save_to_gcs=save_to_gcs,
                        gcs_client=gcs_client,
                    )

                    _save_content_payload(content_payload, result["process_id"], gcs_paths, temp_dir, gcs_client)

                    insert_reel_into_db(result)

                    if os.path.exists(thumbnail_path):
                        cleanup_file(thumbnail_path)
                    if temp_dir and os.path.exists(temp_dir):
                        shutil.rmtree(temp_dir, ignore_errors=True)
                    return

                download_error_message = (
                    dl_result.get("error")
                    if dl_result.get("error_code") == "facebook_download_failed_after_3_attempts"
                    else dl_result.get("error_code") or dl_result.get("error")
                )
                _fail_processing(
                    result,
                    download_error_message or "social_extraction_failed",
                    force,
                )
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
            logger.info(f"⏳ Video > 5min ({duration_seconds}s). Smart Bookmark Fallback.")
            t_result = None
            transcription_data = {
                "status": "bookmark_only",
                "transcript": "",
                "detected_language": "unknown",
                "transcription_source": "none",
                "deepgram": None,
                "voxtral": None,
            }
        else:
            t_result = _run_transcription(video_path)
            transcription_data = _transcription_result_to_dict(t_result)
            logger.info(
                "transcription: 📊 Final — status=%s source=%s chars=%d",
                t_result.status,
                t_result.transcription_source,
                len(t_result.transcript),
            )

        if (
            not transcription_data["detected_language"]
            or transcription_data["detected_language"] == "unknown"
        ):
            transcription_data["detected_language"] = (
                "en" if transcription_data["transcript"].strip() else "unknown"
            )

        is_silent_input = _is_silent_from_transcription_data(transcription_data)

        thumbnail_path = os.path.join(os.path.dirname(video_path), f"{shortcode}_thumb.jpg")
        thumb_success = False

        platform_thumb = dl_result.get("thumbnail_path")
        if platform_thumb and os.path.exists(platform_thumb):
            if platform_thumb != thumbnail_path:
                shutil.copy2(platform_thumb, thumbnail_path)
            thumb_success = True
            logger.info(f"✅ Using platform thumbnail → {thumbnail_path}")
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
                logger.warning(f"⚠️ Failed to download Facebook thumbnail: {e}")

        if not thumb_success:
            generate_reel_thumbnail(video_path, thumbnail_path)

        if not force:
            _upload_thumbnail_and_persist(
                thumbnail_path=thumbnail_path,
                shortcode=shortcode,
                platform_code=platform_code,
                user_id=user_id,
                gcs_paths=gcs_paths,
                result=result,
                save_to_gcs=save_to_gcs,
                gcs_client=gcs_client,
            )

        prompt_transcript = get_prompt_transcript(t_result) if t_result else ""
        merged_text = prompt_transcript
        ocr_text = ""

        if not is_too_long:
            try:
                merged_text, ocr_text = maybe_ocr_and_merge_text(
                    prompt_transcript, caption, None, None, "document"
                )
            except Exception:
                pass

        if save_to_gcs and gcs_client.available:
            _save_input_payload(
                result["process_id"],
                gcs_paths,
                temp_dir,
                gcs_client,
                caption,
                transcription_data.get("transcript", ""),
                ocr_text,
                merged_text,
            )

        ai_res = ensure_dict(
            analyze_instagram_video(
                merged_text,
                caption,
                transcription_data["detected_language"],
                video_path=video_path,
                duration_seconds=duration_seconds,
                is_silent=is_silent_input,
                fail_on_extractor_error=force,
                source_platform=platform_code,
            )
        )
        if _abort_if_forced_extraction_failed(result, ai_res, force):
            return

        if force:
            _upload_thumbnail_and_persist(
                thumbnail_path=thumbnail_path,
                shortcode=shortcode,
                platform_code=platform_code,
                user_id=user_id,
                gcs_paths=gcs_paths,
                result=result,
                save_to_gcs=save_to_gcs,
                gcs_client=gcs_client,
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

        result.update({
            "status": "done",
            "user_id": user_id,
            "source_url": url,
            "duration": duration,
            "duration_seconds": duration_seconds,
            "caption": caption,
            "author_name": author_name,
            "summary": ai_summary,
            "summary_title": summary_title,
            "content_type": _normalize_content_type(ai_res.get("content_type")),
            "summary_category": ai_res.get("category", ""),
            "summary_topic": ai_res.get("topic", ""),
            "recipe": json_stringify(ai_res.get("recipe")),
            "workout": json_stringify(ai_res.get("workout")),
            "tools_list": ai_res.get("tools_list"),
            "location": ai_res.get("location"),
            "prompt": ai_res.get("prompt"),
            "debug": ai_res.get("debug"),
            "is_list": ai_res.get("is_list", False),
            "list_subtype": ai_res.get("list_subtype"),
            "list_count": ai_res.get("list_count"),
            "list_type": ai_res.get("list_type"),
            "transcription": transcription_data,
            "processing_strategy": "bookmark" if is_too_long else "full",
            "detected_language": ai_res.get(
                "detected_language",
                transcription_data.get("detected_language", "unknown"),
            ),
        })

        _upload_result_json_and_attach(
            result=result,
            temp_dir=temp_dir,
            shortcode=shortcode,
            platform_code=platform_code,
            user_id=user_id,
            gcs_paths=gcs_paths,
            save_to_gcs=save_to_gcs,
            gcs_client=gcs_client,
        )

        _save_content_payload(content_payload, result["process_id"], gcs_paths, temp_dir, gcs_client)

        insert_reel_into_db(result)

        cleanup_file(video_path)
        if os.path.exists(thumbnail_path):
            cleanup_file(thumbnail_path)
        if temp_dir and os.path.exists(temp_dir):
            shutil.rmtree(temp_dir, ignore_errors=True)

    except Exception as e:
        logger.error(f"❌ Background Process Failed: {e}", exc_info=True)
        _fail_processing(result, str(e), force)
