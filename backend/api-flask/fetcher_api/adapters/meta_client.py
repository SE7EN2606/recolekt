"""
Meta client — handles both Instagram and Facebook public posts.

Instagram:
  - Metadata via public unauthenticated oEmbed (no token)
  - Video download via instaloader (safe, no cookies needed)

Facebook:
  - Metadata + video download via yt-dlp
"""

import os
import re
import logging
import requests
import instaloader
import yt_dlp
from typing import Optional

logger = logging.getLogger("meta_client")

INSTAGRAM_OEMBED_URL = "https://www.instagram.com/api/v1/oembed/"


class MetaClient:

    def __init__(self):
        self.loader = instaloader.Instaloader(
            download_video_thumbnails=False,
            save_metadata=False,
            dirname_pattern="",
        )
        logger.info("ℹ️ MetaClient: instaloader ready (public mode, no login)")

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

    def _extract_username_from_url(self, url: str) -> Optional[str]:
        match = re.search(r'instagram\.com/([a-zA-Z0-9._]+)(?:/reel|/p|/tv|/reels)?/', url)
        if match:
            candidate = match.group(1)
            if candidate not in ('reel', 'reels', 'p', 'tv', 'stories', 'explore'):
                return candidate
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
            username  = info.get("uploader") or info.get("channel") or "Facebook User"
            caption   = info.get("description") or info.get("title") or ""

            video_url = info.get("url")
            if not video_url and info.get("formats"):
                formats = [f for f in info["formats"] if f.get("ext") == "mp4" and f.get("vcodec") != "none"]
                if formats:
                    video_url = formats[-1].get("url")

            logger.info(f"✅ Facebook yt-dlp metadata: author={username}, shortcode={shortcode}")
            return {
                "shortcode": shortcode,
                "caption":   caption,
                "username":  username,
                "video_url": video_url,
                "likes":     info.get("like_count", 0),
                "comments":  info.get("comment_count", 0),
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
                "shortcode":     shortcode,
                "caption":       oembed.get("title", ""),
                "is_video":      True,
                "video_url":     None,
                "username":      oembed.get("author_name", ""),
                "full_name":     "",
                "thumbnail_url": oembed.get("thumbnail_url", ""),
                "media_id":      oembed.get("media_id", ""),
                "author_url":    oembed.get("author_url", ""),
                "likes":         0,
                "comments":      0,
                "timestamp":     None,
                "source":        "instagram_oembed",
            }

        elif self.is_facebook_url(url):
            info = self._get_facebook_info(url)
            if not info:
                return None
            return {
                "shortcode":     info["shortcode"],
                "caption":       info["caption"],
                "is_video":      True,
                "video_url":     info.get("video_url"),
                "username":      info["username"],
                "full_name":     "",
                "thumbnail_url": "",
                "media_id":      "",
                "author_url":    "",
                "likes":         info.get("likes", 0),
                "comments":      info.get("comments", 0),
                "timestamp":     info.get("timestamp"),
                "source":        "facebook_ytdlp",
            }

        logger.warning(f"❌ Unsupported URL: {url}")
        return None

    # ----------------------------------------------------------------
    # Instagram — instaloader download (no login, no cookies)
    # ----------------------------------------------------------------
    def _download_instagram_video_instaloader(self, url: str, output_path: str) -> dict:
        try:
            os.makedirs(os.path.dirname(output_path), exist_ok=True)

            shortcode = self.extract_shortcode(url)
            if not shortcode:
                raise ValueError(f"Could not extract shortcode from URL: {url}")

            post = instaloader.Post.from_shortcode(self.loader.context, shortcode)

            # Username — try multiple methods
            username = None
            if hasattr(post, "owner_username") and post.owner_username:
                username = post.owner_username
            if not username and hasattr(post, "owner_profile"):
                try:
                    username = post.owner_profile.username
                except Exception:
                    pass
            if not username:
                username = self._extract_username_from_url(url) or ""

            if not post.is_video or not post.video_url:
                raise ValueError("Post is not a video or has no video URL.")

            headers = {
                "User-Agent": (
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/124.0.0.0 Safari/537.36"
                ),
                "Accept":   "*/*",
                "Referer":  "https://www.instagram.com/",
            }

            resp = requests.get(post.video_url, stream=True, headers=headers, timeout=30)
            if resp.status_code != 200:
                raise ValueError(f"Video download failed: {resp.status_code}")

            with open(output_path, "wb") as f:
                for chunk in resp.iter_content(chunk_size=8192):
                    if chunk:
                        f.write(chunk)

            logger.info(f"✅ Instagram video saved via instaloader → {output_path}")

            # Thumbnail — use post object thumbnail URL
            thumbnail_path = None
            thumb_url = getattr(post, "url", None)  # post.url = display image / cover
            if thumb_url:
                thumb_out = os.path.join(os.path.dirname(output_path), f"{shortcode}_thumb.jpg")
                try:
                    r = requests.get(thumb_url, headers=headers, timeout=15)
                    if r.status_code == 200 and len(r.content) > 1000:
                        with open(thumb_out, "wb") as f:
                            f.write(r.content)
                        thumbnail_path = thumb_out
                        logger.info(f"✅ Instagram thumbnail saved → {thumb_out}")
                except Exception as e:
                    logger.warning(f"⚠️ Instagram thumbnail download failed: {e}")

            meta = {
                "username":      username,
                "caption":       post.caption or "",
                "likes":         getattr(post, "likes", 0) or 0,
                "comments":      getattr(post, "comments", 0) or 0,
                "thumbnail_url": thumb_url or "",
            }

            return {
                "success":        True,
                "video_path":     output_path,
                "thumbnail_path": thumbnail_path,
                "metadata":       meta,
                "post":           post,
            }

        except Exception as e:
            logger.error(f"❌ Instagram instaloader download error: {e}")
            return {
                "success":        False,
                "error":          str(e),
                "metadata":       {},
                "post":           None,
                "thumbnail_path": None,
            }

    # ----------------------------------------------------------------
    # download_video — routes by platform
    # Instagram: instaloader (no cookies, safe while awaiting Meta review)
    # Facebook:  yt-dlp
    # ----------------------------------------------------------------
    def download_video(self, url: str, output_path: str, post_info=None) -> dict:
        if self.is_instagram_url(url):
            logger.info(f"⬇️ Instagram download via instaloader: {url}")
            return self._download_instagram_video_instaloader(url, output_path)

        elif self.is_facebook_url(url):
            try:
                if not post_info:
                    post_info = self.get_post_info(url)
                if not post_info:
                    raise ValueError("No metadata available")

                os.makedirs(os.path.dirname(output_path), exist_ok=True)
                ydl_opts = {
                    "outtmpl":     output_path,
                    "format":      "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
                    "quiet":       True,
                    "no_warnings": True,
                }
                with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                    ydl.download([url])

                if os.path.exists(output_path):
                    logger.info(f"✅ Facebook video saved to {output_path}")
                    return {"success": True, "metadata": post_info, "thumbnail_path": None}
                raise ValueError("Download finished but file missing")

            except Exception as e:
                logger.error(f"❌ Facebook download error: {e}")
                return {"success": False, "error": str(e)}

        return {"success": False, "reason": "unsupported_platform"}


# Singleton
meta_client = MetaClient()
