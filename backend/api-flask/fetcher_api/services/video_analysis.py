import os
import logging
import subprocess
import tempfile
import yt_dlp
from typing import Dict, Optional
import requests
import re

from fetcher_api.adapters.meta_client import meta_client

logger = logging.getLogger("video_analysis")


# ── Cookie helpers ────────────────────────────────────────────────────────────

def _write_cookies_file(env_var: str, filename: str) -> Optional[str]:
    """Write cookie content from env var to a temp file, return path or None."""
    content = os.environ.get(env_var, "").strip()
    if not content:
        logger.warning(f"⚠️ {env_var} not set, skipping cookies")
        return None
    try:
        tmp = tempfile.NamedTemporaryFile(
            mode="w", suffix=f"_{filename}", delete=False, encoding="utf-8"
        )
        tmp.write(content)
        tmp.close()
        logger.info(f"🍪 Wrote cookies to {tmp.name}")
        return tmp.name
    except Exception as e:
        logger.warning(f"⚠️ Could not write cookies file: {e}")
        return None


def _cleanup_cookies_file(path: Optional[str]):
    try:
        if path and os.path.exists(path):
            os.unlink(path)
    except Exception:
        pass


# ── Thumbnail generation ──────────────────────────────────────────────────────

def generate_reel_thumbnail(video_path: str, output_path: str, time_offset: float = 0.0) -> bool:
    try:
        if not os.path.exists(video_path):
            logger.error(f"❌ Video file not found for thumbnail: {video_path}")
            return False

        cmd = [
            "ffmpeg", "-y", "-i", video_path,
            "-vframes", "1", "-ss", str(time_offset),
            "-c:v", "libwebp", "-q:v", "75",
            output_path,
        ]
        result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

        if result.returncode == 0 and os.path.exists(output_path):
            logger.info(f"✅ FFmpeg extracted WebP thumbnail to: {output_path}")
            return True
        else:
            logger.error(f"❌ FFmpeg failed: {result.stderr.decode('utf-8')}")
            return False

    except Exception as e:
        logger.error(f"❌ Exception during thumbnail generation: {e}")
        return False


# ── Thumbnail download ────────────────────────────────────────────────────────

def download_instagram_thumbnail_bytes(post: dict | None, source_url: str = None) -> Optional[bytes]:
    thumbnail_url = None
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        )
    }

    if source_url:
        try:
            logger.info(f"📸 Scraping HTML for og:image at {source_url}...")
            res = requests.get(source_url, headers=headers, timeout=10)
            match = re.search(r'<meta property="og:image" content="([^"]+)"', res.text)
            if match:
                thumbnail_url = match.group(1).replace("&amp;", "&")
                logger.info("✅ Found poster URL in HTML metadata.")
        except Exception as e:
            logger.warning(f"⚠️ Failed to scrape og:image: {e}")

    if not thumbnail_url and post:
        thumb = post.get("thumbnail_url") or post.get("preview_image_url")
        if thumb:
            thumbnail_url = thumb
            logger.info("📸 Using thumbnail_url from metadata...")

    if not thumbnail_url:
        logger.warning("⚠️ No thumbnail URL found.")
        return None

    try:
        response = requests.get(thumbnail_url, timeout=30)
        response.raise_for_status()
        return response.content
    except Exception as e:
        logger.error(f"❌ Poster download error: {e}")
        return None


def download_instagram_thumbnail(post: dict | None, output_path: str, source_url: str = None) -> bool:
    try:
        content = download_instagram_thumbnail_bytes(post, source_url)
        if not content:
            return False

        with open(output_path, "wb") as f:
            f.write(content)

        if os.path.exists(output_path):
            logger.info(f"✅ Poster downloaded ({os.path.getsize(output_path)} bytes)")
            return True
        return False

    except Exception as e:
        logger.error(f"❌ Poster save error: {e}")
        return False


# ── Video download ────────────────────────────────────────────────────────────

def download_instagram_video(url: str, output_path: str) -> Dict:
    """
    Downloads Instagram or Facebook video.

    Strategy:
      1. Metadata via meta_client (Instagram oEmbed or Facebook yt-dlp)
      2. Video download via yt-dlp with cookies (IG_COOKIES_CONTENT / FB_COOKIES_CONTENT env vars)
      3. Fallback: yt-dlp without cookies
    """
    shortcode = meta_client.extract_shortcode(url)
    is_facebook = meta_client.is_facebook_url(url)

    # ── Step 1: metadata ──────────────────────────────────────────────
    graph_meta = None
    try:
        graph_meta = meta_client.get_post_info(url)
        if graph_meta:
            logger.info(f"✅ Metadata fetched: author={graph_meta.get('username')}")
    except Exception as e:
        logger.warning(f"⚠️ Metadata fetch failed, continuing: {e}")

    # ── Step 2: pick cookies ──────────────────────────────────────────
    cookies_path = None
    if is_facebook:
        cookies_path = _write_cookies_file("FB_COOKIES_CONTENT", "fb_cookies.txt")
        logger.info("🔵 Using Facebook cookies")
    else:
        cookies_path = _write_cookies_file("IG_COOKIES_CONTENT", "ig_cookies.txt")
        logger.info("🟣 Using Instagram cookies")

    # ── Step 3: yt-dlp download ───────────────────────────────────────
    try:
        os.makedirs(os.path.dirname(output_path), exist_ok=True)

        ydl_opts = {
            "outtmpl": output_path,
            "format": "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
            "quiet": True,
            "no_warnings": True,
            "http_headers": {
                "User-Agent": (
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/124.0.0.0 Safari/537.36"
                )
            },
        }

        if cookies_path:
            ydl_opts["cookiefile"] = cookies_path
            logger.info(f"🍪 yt-dlp using cookies from {cookies_path}")

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])

        _cleanup_cookies_file(cookies_path)

        if os.path.exists(output_path):
            logger.info(f"✅ yt-dlp download saved to {output_path}")
            return {
                "success": True,
                "video_path": output_path,
                "metadata": {
                    "caption":       graph_meta.get("caption", "") if graph_meta else "",
                    "username":      graph_meta.get("username", "") if graph_meta else "",
                    "shortcode":     shortcode,
                    "thumbnail_url": graph_meta.get("thumbnail_url", "") if graph_meta else "",
                    "source":        "meta_oembed+ytdlp",
                },
            }

        raise ValueError("yt-dlp finished but file missing")

    except Exception as e:
        _cleanup_cookies_file(cookies_path)
        logger.error(f"❌ yt-dlp download failed: {e}", exc_info=True)
        return {
            "success": False,
            "error_code": "GENERIC_ERROR",
            "error": str(e),
            "metadata": {},
        }
