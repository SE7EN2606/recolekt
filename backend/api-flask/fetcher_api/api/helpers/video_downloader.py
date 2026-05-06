import os
import logging
import requests
import tempfile
from typing import Dict, Optional

logger = logging.getLogger(__name__)


# ── COOKIE HELPER ─────────────────────────────────────────────────────────────

def _write_cookies(env_var: str, suffix: str) -> Optional[str]:
    content = os.environ.get(env_var, "").strip()
    if not content:
        return None
    try:
        tmp = tempfile.NamedTemporaryFile(
            mode="w", suffix=f"_{suffix}", delete=False, encoding="utf-8"
        )
        tmp.write(content)
        tmp.close()
        logger.info("Wrote %s cookies → %s", env_var, tmp.name)
        return tmp.name
    except Exception as e:
        logger.warning("⚠️ Could not write cookies file: %s", e)
        return None


# ── THUMBNAIL HELPER ───────────────────────────────────────────────────────────

def _crop_portrait_center(path: str) -> None:
    try:
        from PIL import Image
        img = Image.open(path)
        w, h = img.size
        target_ratio = 9 / 16
        current_ratio = w / h
        if current_ratio > target_ratio:
            new_w = int(h * target_ratio)
            left = (w - new_w) // 2
            img = img.crop((left, 0, left + new_w, h))
        img.save(path, "JPEG", quality=85)
    except Exception as e:
        logger.warning("⚠️ Portrait crop failed: %s", e)


def _download_thumbnail_from_url(
    url: str,
    output_path: str,
    min_size: int = 1_000,
    crop_portrait: bool = False,
) -> bool:
    try:
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        response = requests.get(url, timeout=30, stream=True)
        response.raise_for_status()
        with open(output_path, "wb") as f:
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)
        size = os.path.getsize(output_path)
        if size < min_size:
            logger.warning("⚠️ Thumbnail too small (%s bytes), rejecting", size)
            return False
        logger.info("✅ Thumbnail downloaded (%s bytes) → %s", size, output_path)
        if crop_portrait:
            _crop_portrait_center(output_path)
        return True
    except Exception as e:
        logger.error("❌ Thumbnail URL download error: %s", e)
        return False


# ── TIKTOK: yt-dlp downloader ─────────────────────────────────────────────────

def _fetch_tiktok_oembed(url: str) -> Dict:
    try:
        r = requests.get(
            "https://www.tiktok.com/oembed",
            params={"url": url},
            timeout=12,
            headers={
                "User-Agent": (
                    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) "
                    "AppleWebKit/605.1.15 (KHTML, like Gecko) "
                    "Version/17.0 Mobile/15E148 Safari/604.1"
                )
            },
        )
        if r.status_code != 200:
            logger.warning("⚠️ TikTok oEmbed returned %s", r.status_code)
            return {}

        data = r.json()
        return {
            "username": data.get("author_name", "") or "",
            "caption": data.get("title", "") or "",
            "thumbnail_url": data.get("thumbnail_url", "") or "",
            "html": data.get("html", "") or "",
        }
    except Exception as e:
        logger.warning("⚠️ TikTok oEmbed error: %s", e)
        return {}


def _resolve_redirect_url(url: str) -> str:
    try:
        r = requests.get(
            url,
            timeout=15,
            allow_redirects=True,
            headers={
                "User-Agent": (
                    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) "
                    "AppleWebKit/605.1.15 (KHTML, like Gecko) "
                    "Version/17.0 Mobile/15E148 Safari/604.1"
                )
            },
        )
        return r.url or url
    except Exception:
        return url


def _find_downloaded_media(output_path: str) -> Optional[str]:
    if os.path.exists(output_path) and os.path.getsize(output_path) > 10_000:
        return output_path

    base_dir = os.path.dirname(output_path)
    base_name = os.path.basename(output_path)
    stem = base_name.rsplit(".", 1)[0]

    for name in os.listdir(base_dir or "."):
        if not name.startswith(stem):
            continue
        candidate = os.path.join(base_dir, name)
        if os.path.isfile(candidate) and os.path.getsize(candidate) > 10_000:
            if candidate.lower().endswith((".mp4", ".mov", ".m4v", ".webm", ".mkv")):
                return candidate

    return None


def _download_tiktok_video(url: str, output_path: str) -> Dict:
    """
    TikTok is hostile to server-side downloads. This uses compliant fallbacks:
      1. Resolve short URLs.
      2. Use TikTok oEmbed for metadata/thumbnail.
      3. Try yt-dlp with optional TT_COOKIES_CONTENT.
      4. Try multiple client/header strategies.
      5. Return useful metadata even if video download fails.
    """
    cookies_path = None
    try:
        import yt_dlp

        os.makedirs(os.path.dirname(output_path), exist_ok=True)

        resolved_url = _resolve_redirect_url(url)
        oembed_meta = _fetch_tiktok_oembed(resolved_url)

        cookies_path = _write_cookies("TT_COOKIES_CONTENT", "tt_cookies.txt")

        common_headers = {
            "User-Agent": (
                "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) "
                "AppleWebKit/605.1.15 (KHTML, like Gecko) "
                "Version/17.0 Mobile/15E148 Safari/604.1"
            ),
            "Referer": "https://www.tiktok.com/",
            "Accept-Language": "en-US,en;q=0.9",
        }

        base_opts = {
            "outtmpl": output_path,
            "format": "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/best",
            "merge_output_format": "mp4",
            "quiet": True,
            "no_warnings": True,
            "retries": 3,
            "fragment_retries": 3,
            "socket_timeout": 30,
            "sleep_interval": 1,
            "max_sleep_interval": 4,
            "http_headers": common_headers,
            "extractor_args": {"tiktok": {"api_hostname": "api22-normal-c-useast2a.tiktokv.com"}},
        }

        if cookies_path:
            base_opts["cookiefile"] = cookies_path
            logger.info("🍪 TikTok: using TT_COOKIES_CONTENT")

        attempts = [
            ("default", {}),
            ("force_generic", {"force_generic_extractor": False}),
            ("metadata_light", {"skip_download": False, "writesubtitles": False, "writeautomaticsub": False}),
        ]

        last_error = None
        info = None

        for label, extra in attempts:
            try:
                opts = dict(base_opts)
                opts.update(extra)
                logger.info("⬇️ TikTok yt-dlp attempt: %s", label)

                with yt_dlp.YoutubeDL(opts) as ydl:
                    info = ydl.extract_info(resolved_url, download=True)

                actual_path = _find_downloaded_media(output_path)
                if actual_path:
                    logger.info("✅ TikTok video saved → %s", actual_path)
                    break

                last_error = "yt-dlp completed but media file missing"
                logger.warning("⚠️ TikTok attempt %s produced no media file", label)

            except Exception as e:
                last_error = str(e)
                logger.warning("⚠️ TikTok attempt %s failed: %s", label, e)
                info = None

        actual_path = _find_downloaded_media(output_path)

        thumb_url = ""
        if isinstance(info, dict):
            thumb_url = (
                info.get("thumbnail")
                or ((info.get("thumbnails") or [{}])[-1] or {}).get("url")
                or ""
            )
        thumb_url = thumb_url or oembed_meta.get("thumbnail_url", "")

        thumbnail_path = None
        if thumb_url:
            thumb_out = os.path.join(os.path.dirname(output_path), "thumbnail.jpg")
            if _download_thumbnail_from_url(thumb_url, thumb_out, min_size=1_000, crop_portrait=True):
                thumbnail_path = thumb_out

        meta = {
            "username": "",
            "caption": "",
            "likes": 0,
            "comments": 0,
            "thumbnail_url": thumb_url,
        }

        if isinstance(info, dict):
            meta.update({
                "username": info.get("uploader") or info.get("channel") or info.get("creator") or "",
                "caption": info.get("description") or info.get("title") or "",
                "likes": info.get("like_count", 0) or 0,
                "comments": info.get("comment_count", 0) or 0,
                "thumbnail_url": thumb_url,
            })

        meta["username"] = meta["username"] or oembed_meta.get("username", "")
        meta["caption"] = meta["caption"] or oembed_meta.get("caption", "")

        if not actual_path:
            logger.error("❌ TikTok download failed after fallbacks: %s", last_error)
            return {
                "success": False,
                "metadata": meta,
                "post": None,
                "thumbnail_path": thumbnail_path,
                "video_path": None,
                "error": last_error,
            }

        return {
            "success": True,
            "video_path": actual_path,
            "thumbnail_path": thumbnail_path,
            "metadata": meta,
            "post": None,
        }

    except Exception as e:
        logger.error("❌ TikTok downloader error: %s", e)
        return {
            "success": False,
            "metadata": {},
            "post": None,
            "thumbnail_path": None,
            "video_path": None,
            "error": str(e),
        }
    finally:
        if cookies_path and os.path.exists(cookies_path):
            try:
                os.unlink(cookies_path)
            except Exception:
                pass


# ── GENERIC: yt-dlp downloader (Instagram, Facebook, etc.) ────────────────────

def _yt_dlp_download(url: str, output_path: str, platform: str) -> Dict:
    """Generic yt-dlp downloader. Also downloads platform thumbnail."""
    cookies_path = None
    try:
        import yt_dlp

        os.makedirs(os.path.dirname(output_path), exist_ok=True)

        ydl_opts = {
            "outtmpl": output_path,
            "format": "bv*[ext=mp4]+ba[ext=m4a]/bv*+ba/b[ext=mp4]/best",
            "merge_output_format": "mp4",
            "quiet": True,
            "no_warnings": True,
        }

        if platform == "TikTok":
            ydl_opts.update({
                "http_headers": {
                    "User-Agent": (
                        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) "
                        "AppleWebKit/605.1.15 (KHTML, like Gecko) "
                        "Version/17.0 Mobile/15E148 Safari/604.1"
                    ),
                    "Referer": "https://www.tiktok.com/",
                },
                "sleep_interval": 1,
                "max_sleep_interval": 3,
            })
            cookies_path = _write_cookies("TT_COOKIES_CONTENT", "tt_cookies.txt")
            if cookies_path:
                ydl_opts["cookiefile"] = cookies_path
                logger.info("TikTok using cookies")

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)

        actual_path = output_path
        if not os.path.exists(actual_path):
            for ext in ("mp4", "webm", "mkv"):
                candidate = f"{output_path}.{ext}"
                if os.path.exists(candidate):
                    actual_path = candidate
                    break

        if not os.path.exists(actual_path):
            raise ValueError(f"yt-dlp finished but file missing at {output_path}")

        logger.info("%s video saved to %s", platform, actual_path)

        thumb_url = info.get("thumbnail") or (info.get("thumbnails") or [{}])[-1].get("url", "")
        thumbnail_path = None
        if thumb_url:
            thumb_out = os.path.join(os.path.dirname(output_path), "thumbnail.jpg")
            if _download_thumbnail_from_url(thumb_url, thumb_out, crop_portrait=True):
                thumbnail_path = thumb_out
                logger.info("%s thumbnail saved → %s", platform, thumb_out)
            else:
                logger.warning("%s thumbnail download failed", platform)

        return {
            "success": True,
            "video_path": actual_path,
            "thumbnail_path": thumbnail_path,
            "metadata": {
                "username": info.get("uploader") or info.get("channel") or "",
                "caption": info.get("description") or info.get("title") or "",
                "likes": info.get("like_count", 0) or 0,
                "comments": info.get("comment_count", 0) or 0,
            },
            "post": None,
        }

    except Exception as e:
        logger.error("%s yt-dlp download error: %s", platform, e)
        return {
            "success": False,
            "metadata": {},
            "post": None,
            "thumbnail_path": None,
        }
    finally:
        if cookies_path and os.path.exists(cookies_path):
            try:
                os.unlink(cookies_path)
            except Exception:
                pass


# ── YOUTUBE AUDIO FALLBACK ─────────────────────────────────────────────────────

def download_youtube_audio(url: str, output_dir: str) -> Optional[str]:
    """Download audio-only from YouTube using yt-dlp. ~1MB for a 60s Short."""
    try:
        import yt_dlp

        ydl_opts = {
            "outtmpl": os.path.join(output_dir, "yt_audio.%(ext)s"),
            "format": "bestaudio/best",
            "postprocessors": [{
                "key": "FFmpegExtractAudio",
                "preferredcodec": "mp3",
                "preferredquality": "128",
            }],
            "extractor_args": {"youtube": {"player_client": ["web_safari", "web_embedded", "web"]}},
            "quiet": True,
            "no_warnings": True,
        }

        cookies_path = _write_cookies("YT_COOKIES_CONTENT", "yt_cookies.txt")
        if cookies_path:
            ydl_opts["cookiefile"] = cookies_path

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])

        audio_path = os.path.join(output_dir, "yt_audio.mp3")
        if os.path.exists(audio_path):
            size_kb = os.path.getsize(audio_path) / 1024
            logger.info("YouTube audio downloaded → %s (%.0fKB)", audio_path, size_kb)
            if cookies_path and os.path.exists(cookies_path):
                os.unlink(cookies_path)
            return audio_path

        logger.warning("YouTube audio file not found after yt-dlp")
        return None

    except Exception as e:
        logger.error("YouTube audio download error: %s", e)
        return None


# ── DURATION HELPER ────────────────────────────────────────────────────────────

def get_instagram_video_duration(url: str) -> Optional[int]:
    cookies_path = None
    try:
        import yt_dlp

        url_lower = url.lower()
        ydl_opts = {
            "quiet": True,
            "no_warnings": True,
            "skip_download": True,
        }

        if "tiktok.com" in url_lower:
            cookies_path = _write_cookies("TT_COOKIES_CONTENT", "tt_cookies.txt")
        elif "instagram.com" in url_lower:
            cookies_path = _write_cookies("IG_COOKIES_CONTENT", "ig_cookies.txt")

        if cookies_path:
            ydl_opts["cookiefile"] = cookies_path
            logger.info("Checking video duration for %s", url)

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            duration = info.get("duration") if info else None

        if duration:
            duration = int(duration)
            logger.info("Video duration: %ds (%d:%02d)", duration, duration // 60, duration % 60)
            return duration

        logger.warning("Duration not available in yt-dlp metadata")
        return None

    except Exception as e:
        logger.error("Duration check error: %s", e)
        return None
    finally:
        if cookies_path and os.path.exists(cookies_path):
            try:
                os.unlink(cookies_path)
            except Exception:
                pass


# ── MAIN DISPATCHER ────────────────────────────────────────────────────────────

def download_instagram_video(url: str, output_path: str) -> Dict:
    url_lower = url.lower()

    # YOUTUBE
    if "youtube.com" in url_lower or "youtu.be" in url_lower:
        logger.info("YouTube URL — using transcript API, no download: %s", url)
        output_dir = os.path.dirname(output_path)
        from fetcher_api.api.helpers.video_analysis import fetch_youtube_data
        return fetch_youtube_data(url, tempdir=output_dir)

    # INSTAGRAM / FACEBOOK — metaclient
    if "instagram.com" in url_lower:
        try:
            from fetcher_api.adapters.metaclient import metaclient
            logger.info("Downloading Instagram video via metaclient: %s", url)
            ig_result = metaclient.download_video(url, output_path)
            if not ig_result.get("success"):
                logger.error("Instagram metaclient download failed: %s", ig_result.get("error"))
                return {"success": False, "metadata": {}, "post": None, "thumbnail_path": None}
            actual_path = ig_result.get("video_path", output_path)
            if not actual_path or not os.path.exists(actual_path):
                for ext in ("mp4", "webm", "mkv"):
                    candidate = f"{output_path}.{ext}"
                    if os.path.exists(candidate):
                        actual_path = candidate
                        break
            thumbnail_path = ig_result.get("thumbnail_path")
            meta = _ensure_dict_local(ig_result.get("metadata", {}))
            logger.info(
                "Instagram downloaded: %s %s",
                meta.get("username"),
                "(thumb)" if thumbnail_path else "",
            )
            return {"success": True, "metadata": meta, "post": None, "thumbnail_path": thumbnail_path}
        except Exception as e:
            logger.error("Instagram download error: %s", e)
            return {"success": False, "metadata": {}, "post": None, "thumbnail_path": None}

    if "facebook.com" in url_lower or "fb." in url_lower:
        try:
            from fetcher_api.adapters.metaclient import metaclient
            logger.info("Downloading Facebook video: %s", url)
            fb_result = metaclient.download_video(url, output_path)
            if not fb_result.get("success"):
                return {"success": False, "metadata": {}, "post": None, "thumbnail_path": None}
            fb_meta = fb_result.get("metadata", {})
            thumbnail_path = fb_result.get("thumbnail_path")
            if not thumbnail_path:
                thumb_url = fb_meta.get("thumbnail_url") or fb_meta.get("picture")
                if thumb_url:
                    thumb_out = os.path.join(os.path.dirname(output_path), "thumbnail.jpg")
                    if _download_thumbnail_from_url(thumb_url, thumb_out, crop_portrait=True):
                        thumbnail_path = thumb_out
                        logger.info("Facebook thumbnail saved → %s", thumb_out)
            return {"success": True, "metadata": fb_meta, "post": None, "thumbnail_path": thumbnail_path}
        except Exception as e:
            logger.error("Facebook download error: %s", e)
            return {"success": False, "metadata": {}, "post": None, "thumbnail_path": None}

    # TIKTOK — dedicated resilient downloader
    if "tiktok.com" in url_lower:
        logger.info("⬇️ Downloading TikTok video: %s", url)
        return _download_tiktok_video(url, output_path)

    logger.warning("Unsupported URL: %s", url)
    return {"success": False, "metadata": {}, "post": None, "thumbnail_path": None}


def _ensure_dict_local(val) -> dict:
    if isinstance(val, dict):
        return val
    return {}
