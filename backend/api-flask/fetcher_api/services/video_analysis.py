# fetcher_api/services/video_analysis.py

import os
import logging
import subprocess
import tempfile
from typing import Dict, Optional

from fetcher_api.adapters.instagram_client import instagram_client
from fetcher_api.adapters.meta_client import meta_client

logger = logging.getLogger("video_analysis")


def generate_reel_thumbnail(video_path: str, output_path: str, time_offset: float = 0.0) -> bool:
    try:
        if not os.path.exists(video_path):
            logger.error(f"❌ Video file not found for thumbnail: {video_path}")
            return False
        cmd = ['ffmpeg', '-y', '-i', video_path, '-vframes', '1', '-ss', str(time_offset), '-q:v', '2', output_path]
        result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if result.returncode == 0 and os.path.exists(output_path):
            logger.info(f"✅ FFmpeg successfully extracted thumbnail to: {output_path}")
            return True
        logger.error(f"❌ FFmpeg failed: {result.stderr.decode('utf-8')}")
        return False
    except Exception as e:
        logger.error(f"❌ FFmpeg frame extraction error: {e}")
        return False


def download_instagram_thumbnail_bytes(post) -> Optional[bytes]:
    try:
        import requests
        thumbnail_url = None
        if hasattr(post, "url") and post.url:
            thumbnail_url = post.url
            logger.info("📸 Downloading Instagram's display thumbnail...")
        elif hasattr(post, "thumbnail_url") and post.thumbnail_url:
            thumbnail_url = post.thumbnail_url
            logger.info("📸 Using thumbnail_url...")
        if not thumbnail_url:
            logger.warning("⚠️ No thumbnail URL found in post metadata")
            return None
        response = requests.get(thumbnail_url, timeout=30)
        response.raise_for_status()
        return response.content
    except Exception as e:
        logger.error(f"❌ Thumbnail download error: {e}")
        return None


def download_instagram_thumbnail(post, output_path: str, source_url: str = None) -> bool:
    try:
        content = download_instagram_thumbnail_bytes(post)
        if not content:
            return False
        with open(output_path, "wb") as f:
            f.write(content)
        if os.path.exists(output_path):
            logger.info(f"✅ Instagram thumbnail downloaded ({os.path.getsize(output_path)} bytes)")
            return True
        return False
    except Exception as e:
        logger.error(f"❌ Thumbnail download error: {e}")
        return False


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
        if hasattr(post, 'video_duration') and post.video_duration:
            duration = int(post.video_duration)
            logger.info(f"✅ Video duration: {duration}s ({duration // 60}:{duration % 60:02d})")
            return duration
        logger.warning("⚠️ Duration not available in post metadata")
        return None
    except Exception as e:
        logger.error(f"❌ Duration check error: {e}")
        return None


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


def _download_youtube_audio(url: str, output_dir: str) -> Optional[str]:
    """
    Download audio-only from YouTube using yt-dlp with player_client bypass.
    Returns path to .mp3 file or None on failure.
    Much lighter than full video — ~1MB for a 60s Short.
    """
    try:
        import yt_dlp
        audio_path = os.path.join(output_dir, "yt_audio.mp3")
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

        # Use cookies if available
        cookies_path = _write_cookies("YT_COOKIES_CONTENT", "yt_cookies.txt")
        if cookies_path:
            ydl_opts["cookiefile"] = cookies_path

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])

        if os.path.exists(audio_path):
            size_kb = os.path.getsize(audio_path) // 1024
            logger.info(f"✅ YouTube audio downloaded: {audio_path} ({size_kb}KB)")
            if cookies_path and os.path.exists(cookies_path):
                os.unlink(cookies_path)
            return audio_path

        logger.warning("⚠️ YouTube audio download: file not found after yt-dlp")
        return None

    except Exception as e:
        logger.error(f"❌ YouTube audio download error: {e}")
        return None


# ── YOUTUBE: transcript API + oEmbed, audio fallback ─────────────────────────
def fetch_youtube_data(url: str, temp_dir: Optional[str] = None) -> Dict:
    """
    For YouTube:
      1. Metadata via oEmbed (free, no auth)
      2. Transcript via youtube-transcript-api (no download needed)
      3. If no transcript → download audio only for Deepgram fallback
    """
    try:
        from fetcher_api.api.helpers.normalizers import extract_youtube_id
        import requests

        video_id = extract_youtube_id(url)
        if not video_id:
            logger.error("❌ Could not extract YouTube video ID")
            return {"success": False, "metadata": {}, "post": None, "transcript": ""}

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

        # ── 2. Transcript via youtube-transcript-api v1.x ────────────
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

        # ── 3. Audio fallback if no captions ────────────────────────
        audio_path = None
        if not transcript_text.strip():
            logger.info("⚠️ No captions found — falling back to audio download for Deepgram")
            audio_dir = temp_dir or tempfile.mkdtemp()
            audio_path = _download_youtube_audio(url, audio_dir)
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
            "audio_path":        audio_path,  # None if captions found, path if audio fallback
        }

    except Exception as e:
        logger.error(f"❌ fetch_youtube_data error: {e}")
        return {"success": False, "metadata": {}, "post": None, "transcript": "", "audio_path": None}


def _yt_dlp_download(url: str, output_path: str, platform: str) -> Dict:
    """Generic yt-dlp downloader for TikTok."""
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
        return {
            "success": True,
            "video_path": actual_path,
            "metadata": {
                "username": info.get("uploader") or info.get("channel") or "",
                "caption":  info.get("description") or info.get("title") or "",
                "likes":    info.get("like_count", 0) or 0,
                "comments": info.get("comment_count", 0) or 0,
            },
            "post": None
        }
    except Exception as e:
        logger.error(f"❌ {platform} yt-dlp download error: {e}")
        return {"success": False, "metadata": {}, "post": None}
    finally:
        if cookies_path and os.path.exists(cookies_path):
            try:
                os.unlink(cookies_path)
            except Exception:
                pass


def download_instagram_video(url: str, output_path: str) -> Dict:
    url_lower = url.lower()

    # ── YOUTUBE — transcript API, audio fallback ──────────────────────────────
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
                return {"success": False, "metadata": {}, "post": None}
            return {"success": True, "metadata": fb_result.get("metadata", {}), "post": None}
        except Exception as e:
            logger.error(f"❌ Facebook download error: {e}")
            return {"success": False, "metadata": {}, "post": None}

    # ── INSTAGRAM ─────────────────────────────────────────────────────────────
    try:
        logger.info(f"⬇️ Downloading Instagram video: {url}")
        shortcode = instagram_client.extract_shortcode(url)
        if not shortcode:
            logger.error("❌ Could not extract shortcode from URL")
            return {"success": False, "metadata": {}, "post": None}
        from instaloader import Post
        try:
            post = Post.from_shortcode(instagram_client.loader.context, shortcode)
        except Exception as e:
            logger.error(f"❌ Failed to fetch post: {e}")
            return {"success": False, "metadata": {}, "post": None}
        if not post.is_video or not post.video_url:
            logger.error("❌ Post is not a video or no video URL found")
            return {"success": False, "metadata": {}, "post": None}
        video_url = post.video_url
        logger.info(f"⬇️ Downloading video from: {video_url}")
        import requests
        response = requests.get(video_url, stream=True, timeout=60)
        response.raise_for_status()
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        with open(output_path, "wb") as f:
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)
        logger.info(f"✅ Video saved to {output_path}")
        username = ""
        if hasattr(post, 'owner_username') and post.owner_username:
            username = post.owner_username
            logger.info(f"🔍 Method 1: Got username from owner_username: '{username}'")
        elif hasattr(post, 'owner_profile'):
            try:
                username = post.owner_profile.username
                logger.info(f"🔍 Method 2: Got username from owner_profile: '{username}'")
            except Exception:
                pass
        if not username:
            logger.warning(f"⚠️ Could not extract username for shortcode: {shortcode}")
            username = "Unknown"
        logger.info(f"✅ Final username: '{username}'")
        metadata = {
            "username": username,
            "caption":  post.caption if post.caption else "",
            "likes":    getattr(post, "likes", 0),
            "comments": getattr(post, "comments", 0),
        }
        logger.info(f"📊 Metadata: @{metadata['username']} | ❤️ {metadata['likes']} | 💬 {metadata['comments']}")
        return {"success": True, "metadata": metadata, "post": post}
    except Exception as e:
        logger.error(f"❌ Download error: {e}")
        return {"success": False, "metadata": {}, "post": None}