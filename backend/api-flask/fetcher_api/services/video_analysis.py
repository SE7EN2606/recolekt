import logging
import os
import subprocess
import tempfile
from typing import Dict, Optional

import requests

from fetcher_api.adapters.meta_client import meta_client

logger = logging.getLogger("video_analysis")


def ensure_dict_local(val) -> dict:
    if isinstance(val, dict):
        return val
    return {}


# ── PORTRAIT CROP — last-resort fallback only ─────────────────────────────────

def _crop_portrait_center(image_path: str) -> bool:
    try:
        from PIL import Image

        img = Image.open(image_path)
        w, h = img.size

        if w <= h * 1.2:
            logger.info("🖼️ Thumbnail %sx%s — already portrait/square, no crop needed", w, h)
            return True

        target_w = int(h * 9 / 16)
        if target_w > w:
            target_w = w

        left = (w - target_w) // 2
        right = left + target_w

        cropped = img.crop((left, 0, right, h))
        cropped.save(image_path, "JPEG", quality=95)
        logger.info("✂️ Cropped landscape thumbnail %sx%s → %sx%s", w, h, target_w, h)
        return True
    except Exception as e:
        logger.warning("⚠️ Could not crop thumbnail: %s", e)
        return False


# ── GENERIC THUMBNAIL DOWNLOADER ─────────────────────────────────────────────

def _download_thumbnail_from_url(
    url: str,
    output_path: str,
    min_size: int = 1000,
    crop_portrait: bool = False,
) -> bool:
    try:
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        response = requests.get(
            url,
            timeout=30,
            stream=True,
            headers={
                "User-Agent": (
                    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) "
                    "AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148"
                )
            },
        )
        response.raise_for_status()

        with open(output_path, "wb") as f:
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)

        size = os.path.getsize(output_path)
        if size < min_size:
            logger.warning("⚠️ Thumbnail too small (%d bytes), rejecting → %s", size, output_path)
            try:
                os.unlink(output_path)
            except Exception:
                pass
            return False

        logger.info("✅ Thumbnail downloaded (%d bytes) → %s", size, output_path)
        if crop_portrait:
            _crop_portrait_center(output_path)
        return True

    except Exception as e:
        logger.error("❌ Thumbnail URL download error: %s", e)
        return False


# ── YOUTUBE CDN THUMBNAIL ─────────────────────────────────────────────────────

def _download_youtube_thumbnail(video_id: str, output_path: str) -> bool:
    """
    Fetch YouTube thumbnail directly from CDN.

    Priority:
      1. oardefault.jpg  — native portrait Shorts thumbnail when available
      2. oar2.jpg        — alternate portrait key
      3. maxresdefault   — landscape, center-crop to 9:16
      4. sddefault       — landscape fallback, crop
      5. hqdefault       — landscape last resort, crop
    """
    portrait_candidates = [
        f"https://i.ytimg.com/vi/{video_id}/oardefault.jpg",
        f"https://i.ytimg.com/vi/{video_id}/oar2.jpg",
    ]
    for url in portrait_candidates:
        if _download_thumbnail_from_url(url, output_path, min_size=5_000, crop_portrait=False):
            logger.info("✅ YouTube portrait thumbnail from CDN: %s", url)
            return True

    landscape_candidates = [
        f"https://img.youtube.com/vi/{video_id}/maxresdefault.jpg",
        f"https://img.youtube.com/vi/{video_id}/sddefault.jpg",
        f"https://img.youtube.com/vi/{video_id}/hqdefault.jpg",
    ]
    for url in landscape_candidates:
        if _download_thumbnail_from_url(url, output_path, min_size=20_000, crop_portrait=True):
            logger.info("✅ YouTube landscape thumbnail (cropped): %s", url)
            return True

    logger.warning("⚠️ All YouTube CDN thumbnail URLs failed for video_id=%s", video_id)
    return False


# ── FFMPEG FALLBACK — non-YouTube only ───────────────────────────────────────

def generate_reel_thumbnail(video_path: str, output_path: str) -> bool:
    try:
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        cmd = [
            "ffmpeg", "-y",
            "-ss", "0",
            "-i", video_path,
            "-vframes", "1",
            "-vf", "scale=iw:ih",
            "-q:v", "1",
            output_path,
        ]
        result = subprocess.run(cmd, capture_output=True, timeout=30)
        if result.returncode != 0:
            logger.warning("⚠️ FFmpeg thumbnail stderr: %s", result.stderr.decode(errors="ignore")[:300])

        if os.path.exists(output_path) and os.path.getsize(output_path) > 1000:
            _crop_portrait_center(output_path)
            return True
        return False
    except Exception as e:
        logger.error("❌ FFmpeg thumbnail failed: %s", e)
        return False


# ── INSTAGRAM THUMBNAIL (legacy post object) ─────────────────────────────────

def download_instagram_thumbnail_bytes(post) -> Optional[bytes]:
    try:
        thumbnail_url = None
        if hasattr(post, "url") and post.url:
            thumbnail_url = post.url
            logger.info("📸 Instagram: using post.url as display thumbnail")
        elif hasattr(post, "thumbnail_url") and post.thumbnail_url:
            thumbnail_url = post.thumbnail_url
            logger.info("📸 Instagram: using thumbnail_url")

        if not thumbnail_url:
            logger.warning("⚠️ No thumbnail URL found in Instagram post metadata")
            return None

        response = requests.get(thumbnail_url, timeout=30)
        response.raise_for_status()
        return response.content

    except Exception as e:
        logger.error("❌ Instagram thumbnail download error: %s", e)
        return None


def download_instagram_thumbnail(post, output_path: str, source_url: str = None) -> bool:
    try:
        content = download_instagram_thumbnail_bytes(post)
        if not content:
            return False

        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        with open(output_path, "wb") as f:
            f.write(content)

        if os.path.exists(output_path) and os.path.getsize(output_path) > 1000:
            logger.info("✅ Instagram thumbnail saved (%d bytes) → %s", os.path.getsize(output_path), output_path)
            _crop_portrait_center(output_path)
            return True

        return False

    except Exception as e:
        logger.error("❌ Instagram thumbnail save error: %s", e)
        return False


# ── DURATION HELPER ───────────────────────────────────────────────────────────

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

        logger.info("🕒 Checking video duration for: %s", url)
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)

        duration = info.get("duration") if info else None
        if duration:
            duration = int(duration)
            logger.info("✅ Video duration: %ss (%s:%02d)", duration, duration // 60, duration % 60)
            return duration

        logger.warning("⚠️ Duration not available in yt-dlp metadata")
        return None

    except Exception as e:
        logger.error("❌ Duration check error: %s", e)
        return None
    finally:
        if cookies_path and os.path.exists(cookies_path):
            try:
                os.unlink(cookies_path)
            except Exception:
                pass


# ── COOKIES HELPER ────────────────────────────────────────────────────────────

def _write_cookies(env_var: str, suffix: str) -> Optional[str]:
    content = os.environ.get(env_var, "").strip()
    if not content:
        return None

    try:
        tmp = tempfile.NamedTemporaryFile(
            mode="w",
            suffix=f"_{suffix}",
            delete=False,
            encoding="utf-8",
        )
        tmp.write(content)
        tmp.close()
        logger.info("🍪 Wrote %s cookies to %s", env_var, tmp.name)
        return tmp.name
    except Exception as e:
        logger.warning("⚠️ Could not write cookies file: %s", e)
        return None


# ── YOUTUBE AUDIO FALLBACK ────────────────────────────────────────────────────

def _download_youtube_audio(url: str, output_dir: str) -> Optional[str]:
    """Download audio-only from YouTube using yt-dlp."""
    cookies_path = None
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
            "extractor_args": {
                "youtube": {
                    "player_client": ["web_safari", "web_embedded", "web"],
                }
            },
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
            size_kb = os.path.getsize(audio_path) // 1024
            logger.info("✅ YouTube audio downloaded: %s (%dKB)", audio_path, size_kb)
            return audio_path

        logger.warning("⚠️ YouTube audio: file not found after yt-dlp")
        return None

    except Exception as e:
        logger.error("❌ YouTube audio download error: %s", e)
        return None
    finally:
        if cookies_path and os.path.exists(cookies_path):
            try:
                os.unlink(cookies_path)
            except Exception:
                pass


# ── YOUTUBE: transcript + thumbnail ──────────────────────────────────────────

def fetch_youtube_data(url: str, temp_dir: Optional[str] = None) -> Dict:
    """
    For YouTube:
      1. Metadata via oEmbed
      2. Thumbnail via direct CDN hit
      3. Transcript via youtube-transcript-api
      4. If no transcript → download audio only
    """
    try:
        from fetcher_api.api.helpers.normalizers import extract_youtube_id

        video_id = extract_youtube_id(url)
        if not video_id:
            logger.error("❌ Could not extract YouTube video ID")
            return {
                "success": False,
                "metadata": {},
                "post": None,
                "transcript": "",
                "thumbnail_path": None,
                "audio_path": None,
            }

        thumb_dir = temp_dir or tempfile.mkdtemp()

        # ── 1. Metadata via oEmbed ───────────────────────────────────
        metadata = {"username": "", "caption": "", "likes": 0, "comments": 0, "thumbnail_url": ""}
        try:
            oembed_url = f"https://www.youtube.com/oembed?url={url}&format=json"
            r = requests.get(oembed_url, timeout=10)
            if r.status_code == 200:
                oe = r.json()
                metadata["username"] = oe.get("author_name", "")
                metadata["caption"] = oe.get("title", "")
                metadata["thumbnail_url"] = oe.get("thumbnail_url", "")
                logger.info("✅ YouTube oEmbed: title='%s' author='%s'", metadata["caption"], metadata["username"])
            else:
                logger.warning("⚠️ YouTube oEmbed returned %s", r.status_code)
        except Exception as e:
            logger.warning("⚠️ YouTube oEmbed error: %s", e)

        # ── 2. Thumbnail ─────────────────────────────────────────────
        thumb_out = os.path.join(thumb_dir, "thumbnail.jpg")
        thumbnail_path = thumb_out if _download_youtube_thumbnail(video_id, thumb_out) else None
        if not thumbnail_path:
            logger.warning("⚠️ Could not download any valid YouTube thumbnail")

        # ── 3. Transcript via youtube-transcript-api ────────────────
        transcript_text = ""
        detected_language = "en"
        try:
            from youtube_transcript_api import YouTubeTranscriptApi

            langs = ["en", "fr", "es", "de", "pt", "it", "nl", "ar", "ja", "ko", "zh"]
            ytt_api = YouTubeTranscriptApi()

            try:
                transcript_list = ytt_api.list(video_id)
                transcript = transcript_list.find_transcript(langs)
                fetched = transcript.fetch()
                detected_language = transcript.language_code or "en"
                logger.info("✅ Transcript via list: lang=%s, generated=%s", detected_language, transcript.is_generated)
            except Exception:
                fetched = ytt_api.fetch(video_id, languages=langs)
                detected_language = getattr(fetched, "language_code", "en") or "en"
                logger.info("✅ Transcript via direct fetch: lang=%s", detected_language)

            raw_data = fetched.to_raw_data() if hasattr(fetched, "to_raw_data") else fetched
            transcript_text = " ".join(
                entry.get("text", "") if isinstance(entry, dict) else getattr(entry, "text", "")
                for entry in raw_data
            ).strip()

            logger.info("✅ YouTube transcript: %d chars, lang=%s", len(transcript_text), detected_language)

        except Exception as e:
            logger.warning("⚠️ youtube-transcript-api error: %s", e)

        # ── 4. Audio fallback if no captions ────────────────────────
        audio_path = None
        if not transcript_text.strip():
            logger.info("⚠️ No captions — falling back to audio download")
            audio_path = _download_youtube_audio(url, thumb_dir)
            if audio_path:
                logger.info("✅ Audio fallback ready: %s", audio_path)
            else:
                logger.warning("⚠️ Audio fallback also failed — downstream will summarize from title/caption")

        return {
            "success": True,
            "metadata": metadata,
            "post": None,
            "transcript": transcript_text,
            "detected_language": detected_language,
            "is_youtube": True,
            "audio_path": audio_path,
            "thumbnail_path": thumbnail_path,
        }

    except Exception as e:
        logger.error("❌ fetch_youtube_data error: %s", e)
        return {
            "success": False,
            "metadata": {},
            "post": None,
            "transcript": "",
            "audio_path": None,
            "thumbnail_path": None,
        }


# ── TIKTOK: yt-dlp downloader ─────────────────────────────────────────────────

def _yt_dlp_download(url: str, output_path: str, platform: str) -> Dict:
    """Generic yt-dlp downloader for TikTok. Also downloads platform thumbnail."""
    cookies_path = None
    try:
        import yt_dlp

        os.makedirs(os.path.dirname(output_path), exist_ok=True)

        ydl_opts = {
            "outtmpl": output_path,
            "format": "bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best[ext=mp4]/best",
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
                logger.info("🍪 TikTok: using cookies")

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)

        actual_path = output_path
        if not os.path.exists(actual_path):
            for ext in ["mp4", "webm", "mkv"]:
                candidate = f"{output_path}.{ext}"
                if os.path.exists(candidate):
                    actual_path = candidate
                    break

        if not os.path.exists(actual_path):
            raise ValueError(f"yt-dlp finished but file missing at {output_path}")

        logger.info("✅ %s video saved to %s", platform, actual_path)

        thumbnail_path = None
        thumb_url = info.get("thumbnail") or (info.get("thumbnails") or [{}])[-1].get("url", "")
        if thumb_url:
            thumb_out = os.path.join(os.path.dirname(output_path), "thumbnail.jpg")
            if _download_thumbnail_from_url(thumb_url, thumb_out, crop_portrait=True):
                thumbnail_path = thumb_out
                logger.info("✅ %s thumbnail saved → %s", platform, thumb_out)
            else:
                logger.warning("⚠️ %s thumbnail download failed", platform)

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
        logger.error("❌ %s yt-dlp download error: %s", platform, e)
        return {"success": False, "metadata": {}, "post": None, "thumbnail_path": None, "video_path": None}
    finally:
        if cookies_path and os.path.exists(cookies_path):
            try:
                os.unlink(cookies_path)
            except Exception:
                pass


# ── MAIN DISPATCHER ───────────────────────────────────────────────────────────

def download_instagram_video(url: str, output_path: str) -> Dict:
    url_lower = url.lower()

    # ── YOUTUBE ───────────────────────────────────────────────────────────────
    if "youtube.com" in url_lower or "youtu.be" in url_lower:
        logger.info("🎬 YouTube URL — using transcript API path: %s", url)
        output_dir = os.path.dirname(output_path)
        return fetch_youtube_data(url, temp_dir=output_dir)

    # ── TIKTOK ────────────────────────────────────────────────────────────────
    if "tiktok.com" in url_lower:
        logger.info("⬇️ Downloading TikTok video: %s", url)
        return _yt_dlp_download(url, output_path, "TikTok")

    # ── FACEBOOK ──────────────────────────────────────────────────────────────
    if "facebook.com" in url_lower or "fb." in url_lower:
        try:
            logger.info("⬇️ Downloading Facebook video: %s", url)
            fb_result = meta_client.download_video(url, output_path)
            if not fb_result.get("success"):
                return {"success": False, "metadata": {}, "post": None, "thumbnail_path": None, "video_path": None}

            fb_meta = ensure_dict_local(fb_result.get("metadata", {}))
            thumbnail_path = fb_result.get("thumbnail_path")
            actual_path = fb_result.get("video_path", output_path)

            if not thumbnail_path:
                thumb_url = fb_meta.get("thumbnail_url") or fb_meta.get("picture")
                if thumb_url:
                    thumb_out = os.path.join(os.path.dirname(output_path), "thumbnail.jpg")
                    if _download_thumbnail_from_url(thumb_url, thumb_out, crop_portrait=True):
                        thumbnail_path = thumb_out
                        logger.info("✅ Facebook thumbnail saved → %s", thumb_out)

            return {
                "success": True,
                "metadata": fb_meta,
                "post": None,
                "thumbnail_path": thumbnail_path,
                "video_path": actual_path,
            }
        except Exception as e:
            logger.error("❌ Facebook download error: %s", e)
            return {"success": False, "metadata": {}, "post": None, "thumbnail_path": None, "video_path": None}

    # ── INSTAGRAM — meta_client ──────────────────────────────────────────────
    try:
        logger.info("⬇️ Downloading Instagram video via meta_client: %s", url)
        ig_result = meta_client.download_video(url, output_path)

        if not ig_result.get("success"):
            logger.error("❌ Instagram meta_client download failed: %s", ig_result.get("error"))
            return {"success": False, "metadata": {}, "post": None, "thumbnail_path": None, "video_path": None}

        actual_path = ig_result.get("video_path", output_path)
        if not actual_path or not os.path.exists(actual_path):
            for ext in ["mp4", "webm", "mkv"]:
                candidate = f"{output_path}.{ext}"
                if os.path.exists(candidate):
                    actual_path = candidate
                    break

        thumbnail_path = ig_result.get("thumbnail_path")
        meta = ensure_dict_local(ig_result.get("metadata", {}))

        logger.info(
            "✅ Instagram downloaded: @%s | thumb=%s | video=%s",
            meta.get("username"),
            "✅" if thumbnail_path else "❌",
            actual_path,
        )

        return {
            "success": True,
            "metadata": meta,
            "post": None,
            "thumbnail_path": thumbnail_path,
            "video_path": actual_path,
        }

    except Exception as e:
        logger.error("❌ Instagram download error: %s", e)
        return {"success": False, "metadata": {}, "post": None, "thumbnail_path": None, "video_path": None}