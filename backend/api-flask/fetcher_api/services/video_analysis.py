import os
import logging
import subprocess
from typing import Dict, Optional
import requests
import re

from fetcher_api.adapters.instagram_client import instagram_client
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
        if hasattr(post, "url") and post.url:
            thumbnail_url = post.url
            logger.info("📸 Using Instaloader display_url...")
        elif hasattr(post, "thumbnail_url") and post.thumbnail_url:
            thumbnail_url = post.thumbnail_url
            logger.info("📸 Using Instaloader thumbnail_url...")

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
            logger.info(f"✅ Instagram poster downloaded ({os.path.getsize(output_path)} bytes)")
            return True
        return False

    except Exception as e:
        logger.error(f"❌ Poster save error: {e}")
        return False


def get_instagram_video_duration(url: str) -> Optional[int]:
    try:
        logger.info(f"🕒 Checking video duration for: {url}")

        if meta_client.is_facebook_url(url):
            info = meta_client.get_post_info(url)
            return info.get("duration") if info else None

        shortcode = instagram_client.extract_shortcode(url)
        if not shortcode:
            logger.error("❌ Could not extract shortcode from URL")
            return None

        from instaloader import Instaloader, Post
        L = Instaloader(
            download_videos=False,
            download_video_thumbnails=False,
            download_geotags=False,
            download_comments=False,
            save_metadata=False,
            compress_json=False,
        )

        try:
            post = Post.from_shortcode(L.context, shortcode)
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


def download_instagram_video(url: str, output_path: str) -> Dict:
    """
    Downloads Instagram video.
    Strategy:
      1. Try meta_client oEmbed for metadata (author, caption, thumbnail) — fast + reliable
      2. Always use instaloader for actual video download
      3. HTML fallback if instaloader fails
    """
    shortcode = instagram_client.extract_shortcode(url)

    # ── Step 1: Meta client metadata (best-effort) ────────────────────
    graph_meta = None
    try:
        graph_meta = meta_client.get_post_info(url)
        if graph_meta:
            logger.info(f"✅ Graph API metadata: author={graph_meta.get('username')}")
    except Exception as e:
        logger.warning(f"⚠️ Meta client metadata failed, continuing: {e}")

    # ── Step 2: instaloader for video URL + download ──────────────────
    try:
        post_info = instagram_client.get_post_info(url)

        if post_info and post_info.get("video_url"):
            if graph_meta:
                if graph_meta.get("username") and not post_info.get("username"):
                    post_info["username"] = graph_meta["username"]
                if graph_meta.get("caption") and not post_info.get("caption"):
                    post_info["caption"] = graph_meta["caption"]
                if graph_meta.get("thumbnail_url"):
                    post_info["thumbnail_url"] = graph_meta["thumbnail_url"]

            video_path = instagram_client.download_instagram_video(url, output_path, post_info)

            return {
                "success": True,
                "video_path": video_path,
                "metadata": {
                    "caption":       post_info.get("caption", ""),
                    "username":      post_info.get("username", ""),
                    "shortcode":     shortcode,
                    "thumbnail_url": post_info.get("thumbnail_url", ""),
                    "source":        "meta_oembed+instaloader" if graph_meta else "instaloader",
                },
            }

    except Exception as e:
        logger.warning(f"⚠️ instaloader failed, trying HTML fallback: {e}")

    # ── Step 3: HTML fallback ─────────────────────────────────────────
    try:
        logger.info("🔄 Using HTML extraction fallback...")
        headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
        }
        res = requests.get(url, headers=headers, timeout=15)

        if "accounts/login" in res.url or "restricted" in res.text.lower() or "sensitive" in res.text.lower():
            logger.error("❌ Instagram blocked access (restricted/private/sensitive).")
            return {
                "success": False,
                "error_code": "RESTRICTED_CONTENT",
                "error_message": "Instagram restricts this video.",
                "metadata": {},
            }

        vid_match = re.search(r'<meta property="og:video" content="([^"]+)"', res.text)
        if not vid_match:
            return {"success": False, "error_code": "NOT_FOUND", "metadata": {}}

        video_url = vid_match.group(1).replace("&amp;", "&")
        username = graph_meta.get("username", "") if graph_meta else ""
        user_match = re.search(r'"@type":"Person","name":"([^"]+)"', res.text)
        if user_match:
            username = user_match.group(1)

        response = requests.get(video_url, stream=True, timeout=60)
        response.raise_for_status()

        with open(output_path, "wb") as f:
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)

        logger.info(f"✅ HTML fallback download saved to {output_path}")
        return {
            "success": True,
            "video_path": output_path,
            "metadata": {
                "caption":   graph_meta.get("caption", "") if graph_meta else "",
                "username":  username,
                "shortcode": shortcode,
                "source":    "html_fallback",
            },
        }

    except Exception as e:
        logger.error(f"❌ HTML fallback failed: {e}", exc_info=True)
        return {"success": False, "error_code": "GENERIC_ERROR", "error": str(e), "metadata": {}}
