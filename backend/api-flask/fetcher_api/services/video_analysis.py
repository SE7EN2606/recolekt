# fetcher_api/services/video_analysis.py

import os
import logging
import subprocess
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


def _yt_dlp_download(url: str, output_path: str, platform: str) -> Dict:
    """Generic yt-dlp downloader for YouTube and TikTok."""
    try:
        import yt_dlp
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        ydl_opts = {
            "outtmpl": output_path,
            "format": "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
            "quiet": True,
            "no_warnings": True,
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)

        # yt-dlp may add extension — find the actual file
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
                "caption": info.get("description") or info.get("title") or "",
                "likes": info.get("like_count", 0) or 0,
                "comments": info.get("comment_count", 0) or 0,
            },
            "post": None
        }
    except Exception as e:
        logger.error(f"❌ {platform} yt-dlp download error: {e}")
        return {"success": False, "metadata": {}, "post": None}


def download_instagram_video(url: str, output_path: str) -> Dict:
    url_lower = url.lower()

    # ── YOUTUBE FLOW ──────────────────────────────────────────────────
    if "youtube.com" in url_lower or "youtu.be" in url_lower:
        logger.info(f"⬇️ Downloading YouTube video: {url}")
        return _yt_dlp_download(url, output_path, "YouTube")

    # ── TIKTOK FLOW ───────────────────────────────────────────────────
    if "tiktok.com" in url_lower:
        logger.info(f"⬇️ Downloading TikTok video: {url}")
        return _yt_dlp_download(url, output_path, "TikTok")

    # ── FACEBOOK FLOW ─────────────────────────────────────────────────
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

    # ── INSTAGRAM FLOW ────────────────────────────────────────────────
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
            "caption": post.caption if post.caption else "",
            "likes": getattr(post, "likes", 0),
            "comments": getattr(post, "comments", 0),
        }
        logger.info(f"📊 Metadata: @{metadata['username']} | ❤️ {metadata['likes']} | 💬 {metadata['comments']}")
        return {"success": True, "metadata": metadata, "post": post}
    except Exception as e:
        logger.error(f"❌ Download error: {e}")
        return {"success": False, "metadata": {}, "post": None}