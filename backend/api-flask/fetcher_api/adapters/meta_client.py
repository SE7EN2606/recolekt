# fetcher_api/adapters/meta_client.py
"""
Meta client — handles both Instagram and Facebook public posts.

Instagram:
  - Metadata via public unauthenticated oEmbed (no token, no app review)
  - Video download via instaloader (yt-dlp fallback available)

Facebook:
  - Metadata + video download via yt-dlp
"""

import os
import re
import logging
import requests
import yt_dlp
from typing import Optional

logger = logging.getLogger("meta_client")

INSTAGRAM_OEMBED_URL = "https://www.instagram.com/api/v1/oembed/"


class MetaClient:

    # ----------------------------------------------------------------
    # URL detection
    # ----------------------------------------------------------------
    def is_instagram_url(self, url: str) -> bool:
        return "instagram.com" in url.lower()

    def is_facebook_url(self, url: str) -> bool:
        url_lower = url.lower()
        return any(d in url_lower for d in ("facebook.com", "fb.watch", "fb.com"))

    def is_supported_url(self, url: str) -> bool:
        return self.is_instagram_url(url) or self.is_facebook_url(url)

    # ----------------------------------------------------------------
    # Shortcode / ID extraction
    # ----------------------------------------------------------------
    def extract_shortcode(self, url: str) -> Optional[str]:
        if self.is_instagram_url(url):
            for pattern in [r"/reel/([^/]+)/", r"/reels/([^/]+)/", r"/p/([^/]+)/", r"/tv/([^/]+)/"]:
                m = re.search(pattern, url)
                if m:
                    return m.group(1)

        elif self.is_facebook_url(url):
            m = re.search(r'/(?:reel|reels|video|v|posts|videos|watch)/(?:[A-Za-z0-9_-]+/)?([0-9]+)', url)
            if m:
                return m.group(1)
            m = re.search(r'v=([0-9]+)', url)
            if m:
                return m.group(1)
            m = re.search(r'/share/[a-z]/([A-Za-z0-9_-]+)', url)
            if m:
                return m.group(1)

        return None

    # ----------------------------------------------------------------
    # Instagram — oEmbed (public, no token)
    # ----------------------------------------------------------------
    def _get_instagram_oembed(self, url: str) -> Optional[dict]:
        try:
            resp = requests.get(INSTAGRAM_OEMBED_URL, params={"url": url}, timeout=10)
            if resp.status_code != 200:
                logger.warning(f"⚠️ Instagram oEmbed {resp.status_code}: {resp.text[:200]}")
                return None
            data = resp.json()
            logger.info(f"✅ Instagram oEmbed success: author={data.get('author_name')}")
            return data
        except Exception as e:
            logger.error(f"❌ Instagram oEmbed error: {e}")
            return None

    # ----------------------------------------------------------------
    # Facebook — yt-dlp metadata
    # ----------------------------------------------------------------
    def _get_facebook_info(self, url: str) -> Optional[dict]:
        try:
            with yt_dlp.YoutubeDL({"quiet": True, "no_warnings": True}) as ydl:
                info = ydl.extract_info(url, download=False)
            if not info:
                return None

            shortcode = info.get("id") or self.extract_shortcode(url) or "unknown"
            username = info.get("uploader") or info.get("channel") or "Facebook User"
            caption = info.get("description") or info.get("title") or ""

            video_url = info.get("url")
            if not video_url and info.get("formats"):
                formats = [f for f in info["formats"] if f.get("ext") == "mp4" and f.get("vcodec") != "none"]
                if formats:
                    video_url = formats[-1].get("url")

            logger.info(f"✅ Facebook yt-dlp metadata: author={username}, shortcode={shortcode}")
            return {
                "shortcode": shortcode,
                "caption": caption,
                "username": username,
                "video_url": video_url,
                "likes": info.get("like_count", 0),
                "comments": info.get("comment_count", 0),
                "timestamp": info.get("upload_date"),
            }
        except Exception as e:
            logger.error(f"❌ Facebook yt-dlp error: {e}", exc_info=True)
            return None

    # ----------------------------------------------------------------
    # get_post_info — unified interface
    # ----------------------------------------------------------------
    def get_post_info(self, url: str) -> Optional[dict]:
        shortcode = self.extract_shortcode(url)

        if self.is_instagram_url(url):
            oembed = self._get_instagram_oembed(url)
            if not oembed:
                return None
            return {
                "shortcode": shortcode,
                "caption": oembed.get("title", ""),
                "is_video": True,
                "video_url": None,          # instaloader handles download separately
                "username": oembed.get("author_name", ""),
                "full_name": "",
                "thumbnail_url": oembed.get("thumbnail_url", ""),
                "media_id": oembed.get("media_id", ""),
                "author_url": oembed.get("author_url", ""),
                "likes": 0,
                "comments": 0,
                "timestamp": None,
                "source": "instagram_oembed",
            }

        elif self.is_facebook_url(url):
            info = self._get_facebook_info(url)
            if not info:
                return None
            return {
                "shortcode": info["shortcode"],
                "caption": info["caption"],
                "is_video": True,
                "video_url": info.get("video_url"),
                "username": info["username"],
                "full_name": "",
                "thumbnail_url": "",
                "media_id": "",
                "author_url": "",
                "likes": info.get("likes", 0),
                "comments": info.get("comments", 0),
                "timestamp": info.get("timestamp"),
                "source": "facebook_ytdlp",
            }

        logger.warning(f"❌ Unsupported URL: {url}")
        return None

    # ----------------------------------------------------------------
    # download_video — routes by platform
    # Instagram: returns failure → caller uses instaloader
    # Facebook: downloads directly via yt-dlp
    # ----------------------------------------------------------------
    def download_video(self, url: str, output_path: str, post_info=None) -> dict:
        if self.is_instagram_url(url):
            logger.info("ℹ️ Instagram download delegated to instaloader")
            return {"success": False, "reason": "use_instaloader"}

        elif self.is_facebook_url(url):
            try:
                if not post_info:
                    post_info = self.get_post_info(url)
                if not post_info:
                    raise ValueError("No metadata available")

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
                    logger.info(f"✅ Facebook video saved to {output_path}")
                    return {"success": True, "metadata": post_info}
                raise ValueError("Download finished but file missing")

            except Exception as e:
                logger.error(f"❌ Facebook download error: {e}")
                return {"success": False, "error": str(e)}

        return {"success": False, "reason": "unsupported_platform"}


# Singleton
meta_client = MetaClient()
