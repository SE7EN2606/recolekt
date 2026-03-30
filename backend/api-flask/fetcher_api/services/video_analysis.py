import os
import logging
import subprocess
import tempfile
from typing import Dict, Optional

import requests

from fetcher_api.adapters.instagram_client import instagram_client
from fetcher_api.adapters.meta_client import meta_client

logger = logging.getLogger("video_analysis")


# ── GENERIC THUMBNAIL DOWNLOADER ─────────────────────────────────────────────

def _download_thumbnail_from_url(url: str, output_path: str) -> bool:
    """Download any thumbnail URL to disk. Returns True on success."""
    try:
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        response = requests.get(url, timeout=30, stream=True)
        response.raise_for_status()
        with open(output_path, "wb") as f:
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)
        size = os.path.getsize(output_path)
        logger.info(f"✅ Thumbnail downloaded ({size} bytes) → {output_path}")
        return size > 1000  # reject tiny/broken files
    except Exception as e:
        logger.error(f"❌ Thumbnail URL download error: {e}")
        return False


# ── FFMPEG FALLBACK ───────────────────────────────────────────────────────────

def generate_reel_thumbnail(video_path: str, output_path: str, time_offset: float = 0.0) -> bool:
    """
    Last-resort FFmpeg thumbnail extraction.
    -ss BEFORE -i = accurate input seek.
    -q:v 1 = max JPEG quality. No scale/pad = native resolution, no blurred sides.
    """
    try:
        if not os.path.exists(video_path):
            logger.error(f"❌ Video file not found for thumbnail: {video_path}")
            return False
        cmd = [
            "ffmpeg", "-y",
            "-ss", str(time_offset),   # BEFORE -i for accurate seek
            "-i", video_path,
            "-vframes", "1",
            "-q:v", "1",               # max quality
            "-vf", "crop=iw:iw*16/9",  # crop to 9:16 portrait, no letterbox
            output_path,
        ]
        result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if result.returncode == 0 and os.path.exists(output_path):
            logger.info(f"✅ FFmpeg extracted thumbnail → {output_path}")
            return True
        logger.error(f"❌ FFmpeg failed: {result.stderr.decode('utf-8')}")
        return False
    except Exception as e:
        logger.error(f"❌ FFmpeg frame extraction error: {e}")
        return False


# ── INSTAGRAM THUMBNAIL ───────────────────────────────────────────────────────

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
        logger.error(f"❌ Instagram thumbnail download error: {e}")
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
            logger.info(f"✅ Instagram thumbnail saved ({os.path.getsize(output_path)} bytes) → {output_path}")
            return True
        return False
    except Exception as e:
        logger.error(f"❌ Instagram thumbnail save error: {e}")
        return False


# ── DURATION HELPER ───────────────────────────────────────────────────────────

def get_instagram_video_duration(url: str) -> Optional[int]:
    try:
        logger.info(f"🕒 Checking video duration for: {url}")
        url_lower = url.lower()
        if "facebook.com" in url_lower or "fb." in url_lower:
            info = meta_client.get_post_info(url)
            return info.get("duration") if info else None
        shortcode = instagram_client.extract_shortcode(url)
        if not shortcode:
            logger.error("❌ Could not extract shortcode from URL")
            return None
        from instaloader import Post
        try:
            post = Post.from_shortcode(instagram_client.loader.context, shortcode)
        except Exception as e:
            logger.error(f"❌ Failed to fetch post metadata: {e}")
            return None
        if not post.is_video:
            logger.warning("⚠️ Post is not a video")
            return None
        if hasattr(post, "video_duration") and post.video_duration:
            duration = int(post.video_duration)
            logger.info(f"✅ Video duration: {duration}s ({duration // 60}:{duration % 60:02d})")
            return duration
        logger.warning("⚠️ Duration not available in post metadata")
        return None
    except Exception as e:
        logger.error(f"❌ Duration check error: {e}")
        return None


# ── COOKIES HELPER ────────────────────────────────────────────────────────────

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
        logger.info(f"🍪 Wrote {env_var} cookies to {tmp.name}")
        return tmp.name
    except Exception as e:
        logger.warning(f"⚠️ Could not write cookies file: {e}")
        return None


# ── YOUTUBE AUDIO FALLBACK ────────────────────────────────────────────────────

def _download_youtube_audio(url: str, output_dir: str) -> Optional[str]:
    """Download audio-only from YouTube using yt-dlp. ~1MB for a 60s Short."""
    try:
        import yt_dlp
        ydl_opts = {
            "outtmpl":   os.path.join(output_dir, "yt_audio.%(ext)s"),
            "format":    "bestaudio/best",
            "postprocessors": [{
                "key":            "FFmpegExtractAudio",
                "preferredcodec": "mp3",
                "preferredquality": "128",
            }],
            "extractor_args": {
                "youtube": {
                    "player_client": ["web_safari", "web_embedded", "web"],
                }
            },
            "quiet":       True,
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
            logger.info(f"✅ YouTube audio downloaded: {audio_path} ({size_kb}KB)")
            if cookies_path and os.path.exists(cookies_path):
                os.unlink(cookies_path)
            return audio_path
        logger.warning("⚠️ YouTube audio: file not found after yt-dlp")
        return None
    except Exception as e:
        logger.error(f"❌ YouTube audio download error: {e}")
        return None


# ── YOUTUBE: transcript + thumbnail ──────────────────────────────────────────

def fetch_youtube_data(url: str, temp_dir: Optional[str] = None) -> Dict:
    """
    For YouTube:
      1. Metadata + thumbnail via oEmbed / YouTube CDN
      2. Transcript via youtube-transcript-api
      3. If no transcript → download audio only for Deepgram fallback
    Returns thumbnail_path: path to downloaded platform thumbnail (maxresdefault).
    """
    try:
        from fetcher_api.api.helpers.normalizers import extract_youtube_id

        video_id = extract_youtube_id(url)
        if not video_id:
            logger.error("❌ Could not extract YouTube video ID")
            return {"success": False, "metadata": {}, "post": None, "transcript": "", "thumbnail_path": None}

        thumb_dir = temp_dir or tempfile.mkdtemp()

        # ── 1. Metadata via oEmbed ───────────────────────────────────
        metadata = {"username": "", "caption": "", "likes": 0, "comments": 0, "thumbnail_url": ""}
        try:
            oembed_url = f"https://www.youtube.com/oembed?url={url}&format=json"
            r = requests.get(oembed_url, timeout=10)
            if r.status_code == 200:
                oe = r.json()
                metadata["username"]      = oe.get("author_name", "")
                metadata["caption"]       = oe.get("title", "")
                metadata["thumbnail_url"] = oe.get("thumbnail_url", "")
                logger.info(f"✅ YouTube oEmbed: title='{metadata['caption']}' author='{metadata['username']}'")
            else:
                logger.warning(f"⚠️ YouTube oEmbed returned {r.status_code}")
        except Exception as e:
            logger.warning(f"⚠️ YouTube oEmbed error: {e}")

        # ── 2. Download platform thumbnail (maxresdefault → hqdefault → oEmbed) ──
        thumbnail_path = None
        thumb_out = os.path.join(thumb_dir, "thumbnail.jpg")
        thumb_candidates = [
            f"https://img.youtube.com/vi/{video_id}/maxresdefault.jpg",
            f"https://img.youtube.com/vi/{video_id}/sddefault.jpg",
            f"https://img.youtube.com/vi/{video_id}/hqdefault.jpg",
            metadata.get("thumbnail_url", ""),
        ]
        for thumb_url in thumb_candidates:
            if thumb_url and _download_thumbnail_from_url(thumb_url, thumb_out):
                thumbnail_path = thumb_out
                logger.info(f"✅ YouTube thumbnail saved from: {thumb_url}")
                break
        if not thumbnail_path:
            logger.warning("⚠️ Could not download any YouTube thumbnail")

        # ── 3. Transcript via youtube-transcript-api v1.x ────────────
        transcript_text   = ""
        detected_language = "en"
        try:
            from youtube_transcript_api import YouTubeTranscriptApi
            LANGS = ['en', 'fr', 'es', 'de', 'pt', 'it', 'nl', 'ar', 'ja', 'ko', 'zh']
            ytt_api = YouTubeTranscriptApi()
            try:
                transcript_list = ytt_api.list(video_id)
                transcript = transcript_list.find_transcript(LANGS)
                fetched = transcript.fetch()
                detected_language = transcript.language_code or "en"
                logger.info(f"✅ Transcript via list: lang={detected_language}, generated={transcript.is_generated}")
            except Exception:
                fetched = ytt_api.fetch(video_id, languages=LANGS)
                detected_language = getattr(fetched, 'language_code', 'en') or 'en'
                logger.info(f"✅ Transcript via direct fetch: lang={detected_language}")
            raw_data = fetched.to_raw_data() if hasattr(fetched, 'to_raw_data') else fetched
            transcript_text = " ".join(
                entry.get("text", "") if isinstance(entry, dict) else getattr(entry, "text", "")
                for entry in raw_data
            ).strip()
            logger.info(f"✅ YouTube transcript: {len(transcript_text)} chars, lang={detected_language}")
        except Exception as e:
            logger.warning(f"⚠️ youtube-transcript-api error: {e}")

        # ── 4. Audio fallback if no captions ────────────────────────
        audio_path = None
        if not transcript_text.strip():
            logger.info("⚠️ No captions — falling back to audio download for Deepgram")
            audio_path = _download_youtube_audio(url, thumb_dir)
            if audio_path:
                logger.info(f"✅ Audio fallback ready for Deepgram: {audio_path}")
            else:
                logger.warning("⚠️ Audio fallback also failed — will summarize from title only")

        return {
            "success":           True,
            "metadata":          metadata,
            "post":              None,
            "transcript":        transcript_text,
            "detected_language": detected_language,
            "is_youtube":        True,
            "audio_path":        audio_path,
            "thumbnail_path":    thumbnail_path,  # ← crisp platform thumbnail
        }

    except Exception as e:
        logger.error(f"❌ fetch_youtube_data error: {e}")
        return {"success": False, "metadata": {}, "post": None, "transcript": "", "audio_path": None, "thumbnail_path": None}


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

        logger.info(f"✅ {platform} video saved to {actual_path}")

        # ── Download platform thumbnail from yt-dlp info ────────────
        thumbnail_path = None
        thumb_url = (
            info.get("thumbnail")
            or (info.get("thumbnails") or [{}])[-1].get("url", "")
        )
        if thumb_url:
            thumb_out = os.path.join(os.path.dirname(output_path), "thumbnail.jpg")
            if _download_thumbnail_from_url(thumb_url, thumb_out):
                thumbnail_path = thumb_out
                logger.info(f"✅ {platform} thumbnail saved → {thumb_out}")
            else:
                logger.warning(f"⚠️ {platform} thumbnail download failed")

        return {
            "success": True,
            "video_path": actual_path,
            "thumbnail_path": thumbnail_path,  # ← crisp platform thumbnail
            "metadata": {
                "username": info.get("uploader") or info.get("channel") or "",
                "caption":  info.get("description") or info.get("title") or "",
                "likes":    info.get("like_count", 0) or 0,
                "comments": info.get("comment_count", 0) or 0,
            },
            "post": None,
        }
    except Exception as e:
        logger.error(f"❌ {platform} yt-dlp download error: {e}")
        return {"success": False, "metadata": {}, "post": None, "thumbnail_path": None}
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
        logger.info(f"🎬 YouTube URL — using transcript API (no download): {url}")
        output_dir = os.path.dirname(output_path)
        return fetch_youtube_data(url, temp_dir=output_dir)

    # ── TIKTOK ────────────────────────────────────────────────────────────────
    if "tiktok.com" in url_lower:
        logger.info(f"⬇️ Downloading TikTok video: {url}")
        return _yt_dlp_download(url, output_path, "TikTok")

    # ── FACEBOOK ──────────────────────────────────────────────────────────────
    if "facebook.com" in url_lower or "fb." in url_lower:
        try:
            logger.info(f"⬇️ Downloading Facebook video: {url}")
            fb_result = meta_client.download_video(url, output_path)
            if not fb_result.get("success"):
                return {"success": False, "metadata": {}, "post": None, "thumbnail_path": None}

            fb_meta = fb_result.get("metadata", {})

            # Download platform thumbnail if available
            thumbnail_path = None
            thumb_url = fb_meta.get("thumbnail_url") or fb_meta.get("picture")
            if thumb_url:
                thumb_out = os.path.join(os.path.dirname(output_path), "thumbnail.jpg")
                if _download_thumbnail_from_url(thumb_url, thumb_out):
                    thumbnail_path = thumb_out
                    logger.info(f"✅ Facebook thumbnail saved → {thumb_out}")

            return {
                "success": True,
                "metadata": fb_meta,
                "post": None,
                "thumbnail_path": thumbnail_path,  # ← crisp platform thumbnail
            }
        except Exception as e:
            logger.error(f"❌ Facebook download error: {e}")
            return {"success": False, "metadata": {}, "post": None, "thumbnail_path": None}

    # ── INSTAGRAM ─────────────────────────────────────────────────────────────
    try:
        logger.info(f"⬇️ Downloading Instagram video: {url}")
        shortcode = instagram_client.extract_shortcode(url)
        if not shortcode:
            logger.error("❌ Could not extract shortcode from URL")
            return {"success": False, "metadata": {}, "post": None, "thumbnail_path": None}

        from instaloader import Post
        try:
            post = Post.from_shortcode(instagram_client.loader.context, shortcode)
        except Exception as e:
            logger.error(f"❌ Failed to fetch post: {e}")
            return {"success": False, "metadata": {}, "post": None, "thumbnail_path": None}

        if not post.is_video or not post.video_url:
            logger.error("❌ Post is not a video or no video URL found")
            return {"success": False, "metadata": {}, "post": None, "thumbnail_path": None}

        # Download video
        video_url = post.video_url
        logger.info(f"⬇️ Downloading video from: {video_url}")
        response = requests.get(video_url, stream=True, timeout=60)
        response.raise_for_status()
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        with open(output_path, "wb") as f:
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)
        logger.info(f"✅ Video saved to {output_path}")

        # Download platform thumbnail immediately after video
        thumbnail_path = None
        thumb_out = os.path.join(os.path.dirname(output_path), "thumbnail.jpg")
        if download_instagram_thumbnail(post, thumb_out):
            thumbnail_path = thumb_out
            logger.info(f"✅ Instagram thumbnail saved → {thumb_out}")
        else:
            logger.warning("⚠️ Instagram thumbnail download failed")

        # Extract username
        username = ""
        if hasattr(post, "owner_username") and post.owner_username:
            username = post.owner_username
            logger.info(f"🔍 Got username from owner_username: '{username}'")
        elif hasattr(post, "owner_profile"):
            try:
                username = post.owner_profile.username
                logger.info(f"🔍 Got username from owner_profile: '{username}'")
            except Exception:
                pass
        if not username:
            logger.warning(f"⚠️ Could not extract username for shortcode: {shortcode}")
            username = "Unknown"

        metadata = {
            "username": username,
            "caption":  post.caption if post.caption else "",
            "likes":    getattr(post, "likes", 0),
            "comments": getattr(post, "comments", 0),
        }
        logger.info(f"📊 Metadata: @{metadata['username']} | ❤️ {metadata['likes']} | 💬 {metadata['comments']}")

        return {
            "success":        True,
            "metadata":       metadata,
            "post":           post,
            "thumbnail_path": thumbnail_path,  # ← crisp platform thumbnail
        }
    except Exception as e:
        logger.error(f"❌ Download error: {e}")
        return {"success": False, "metadata": {}, "post": None, "thumbnail_path": None}
