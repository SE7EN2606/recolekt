import os
import logging
import subprocess
import yt_dlp
from typing import Dict, Optional
import requests
import re

from fetcher_api.adapters.meta_client import meta_client

logger = logging.getLogger("video_analysis")


def generate_reel_thumbnail(video_path: str, output_path: str, time_offset: float = 0.0) -> bool:
    try:
        if not os.path.exists(video_path):
            logger.error(f"❌ Video file not found for thumbnail: {video_path}")
            return False

        cmd = [
            'ffmpeg', '-y', '-i', video_path,
            '-vframes', '1', '-ss', str(time_offset),
            '-c:v', 'libwebp', '-q:v', '75',
            output_path
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


def download_instagram_thumbnail_bytes(post, source_url: str = None) -> Optional[bytes]:
    thumbnail_url = None
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
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
        if hasattr(post, "thumbnail_url") and post.thumbnail_url:
            thumbnail_url = post.thumbnail_url
            logger.info("📸 Using thumbnail_url from post info...")

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


def download_instagram_thumbnail(post, output_path: str, source_url: str = None) -> bool:
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


def download_instagram_video(url: str, output_path: str) -> Dict:
    """
    Downloads Instagram or Facebook video.
    Strategy:
      1. oEmbed (Instagram) or yt-dlp metadata (Facebook) via meta_client
      2. yt-dlp for actual video download
    """
    shortcode = meta_client.extract_shortcode(url)

    # ── Step 1: metadata ──────────────────────────────────────────────
    graph_meta = None
    try:
        graph_meta = meta_client.get_post_info(url)
        if graph_meta:
            logger.info(f"✅ Metadata fetched: author={graph_meta.get('username')}")
    except Exception as e:
        logger.warning(f"⚠️ Metadata fetch failed, continuing: {e}")

    # ── Step 2: yt-dlp download ───────────────────────────────────────
    try:
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        ydl_opts = {
            "outtmpl": output_path,
            "format": "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
            "quiet": True,
            "no_warnings": True,
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])

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
        logger.error(f"❌ yt-dlp download failed: {e}", exc_info=True)
        return {
            "success": False,
            "error_code": "GENERIC_ERROR",
            "error": str(e),
            "metadata": {},
        }
