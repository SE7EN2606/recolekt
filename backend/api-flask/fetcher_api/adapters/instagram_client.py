# fetcher_api/adapters/instagram_client.py

import os
import re
import logging
import requests
import instaloader
from typing import Optional
from datetime import datetime

logger = logging.getLogger("instagram")


class InstagramClient:
    """
    Final clean version:

    ✔ Uses Instaloader ONLY for:
        - shortcode extraction
        - video_url
        - caption
        - owner username (author_name)
        - likes, comments, timestamp
    ✔ No profile picture scraping
    ✔ No HTML parsing
    ✔ No caching
    ✔ No blocked Instagram private APIs
    ✔ Minimal + safe + reliable
    """

    def __init__(self):
        self.supported = True
        self.loader = instaloader.Instaloader(
            download_video_thumbnails=False,
            save_metadata=False,
            dirname_pattern=""
        )

        # Login optional (if provided)
        username = os.getenv("INSTAGRAM_USERNAME")
        password = os.getenv("INSTAGRAM_PASSWORD")

        if username and password:
            try:
                self.loader.login(username, password)
                logger.info(f"✅ Logged into Instagram as {username}")
            except Exception as e:
                logger.warning(f"⚠️ Instagram login failed: {e}")
        else:
            logger.info("ℹ️ Running without Instagram login (public mode).")

    # ------------------------------------------------
    # URL utilities
    # ------------------------------------------------
    def is_instagram_url(self, url: str) -> bool:
        return "instagram.com" in url.lower()

    def extract_shortcode(self, url: str) -> Optional[str]:
        """
        Extracts reel/p/post shortcode safely.
        """
        patterns = [
            r"/reel/([^/]+)/",
            r"/reels/([^/]+)/",
            r"/p/([^/]+)/",
            r"/tv/([^/]+)/",
        ]
        for pattern in patterns:
            m = re.search(pattern, url)
            if m:
                return m.group(1)
        return None

    def extract_username_from_url(self, url: str) -> Optional[str]:
        """
        Fallback: Extract username from Instagram URL.
        Examples:
          - https://www.instagram.com/christelle_is_flabbergasting/reel/...
          - https://www.instagram.com/reel/DUbI8uHDGy1/
        """
        # Try to match: instagram.com/USERNAME/reel or instagram.com/USERNAME/p
        match = re.search(r'instagram\.com/([a-zA-Z0-9._]+)(?:/reel|/p|/tv|/reels)?/', url)
        if match:
            potential_username = match.group(1)
            # Filter out known non-username paths
            if potential_username not in ['reel', 'reels', 'p', 'tv', 'stories', 'explore']:
                return potential_username
        return None

    # ------------------------------------------------
    # Metadata fetch (NO profile pics)
    # ------------------------------------------------
    
    def get_post(self, shortcode: str):
        """
        Fast fetch of Post metadata object without downloading media.
        This is the method required by routes.py for the fast-path response.
        """
        try:
            return instaloader.Post.from_shortcode(self.loader.context, shortcode)
        except Exception as e:
            logger.error(f"Failed to get post metadata object: {e}")
            return None

    def get_post_info(self, url: str) -> Optional[dict]:
        """
        Fetches Instagram post metadata:
            - shortcode
            - caption
            - username (author_name)
            - video_url
            - likes
            - comments
            - timestamp

        Using ONLY Instaloader (safe).
        """

        try:
            shortcode = self.extract_shortcode(url)
            if not shortcode:
                logger.warning("❌ Could not extract shortcode.")
                return None

            post = instaloader.Post.from_shortcode(self.loader.context, shortcode)

            # ✅ FIXED: Try multiple ways to get username
            username = None
            
            # Method 1: Direct attribute
            if hasattr(post, 'owner_username') and post.owner_username:
                username = post.owner_username
                logger.info(f"🔍 Method 1: Got username from owner_username: '{username}'")
            
            # Method 2: Owner profile object
            if not username and hasattr(post, 'owner_profile'):
                try:
                    username = post.owner_profile.username
                    logger.info(f"🔍 Method 2: Got username from owner_profile: '{username}'")
                except:
                    pass
            
            # Method 3: Extract from URL (fallback)
            if not username:
                username = self.extract_username_from_url(url)
                if username:
                    logger.info(f"🔍 Method 3: Extracted username from URL: '{username}'")
            
            # Final fallback
            if not username:
                username = ""
                logger.warning(f"⚠️ Could not extract username for shortcode: {shortcode}")
            
            logger.info(f"✅ Final username: '{username}' for shortcode: {shortcode}")

            return {
                "shortcode": shortcode,
                "caption": post.caption or "",
                "is_video": post.is_video,
                "video_url": post.video_url if post.is_video else None,
                "username": username,              # <–– this is author_name
                "full_name": "",                   # removed (not used, always empty)
                "likes": getattr(post, "likes", 0),
                "comments": getattr(post, "comments", 0),
                "timestamp": (
                    post.date_utc.isoformat()
                    if getattr(post, "date_utc", None)
                    else None
                ),
            }

        except Exception as e:
            logger.error(f"⚠️ Error getting post info: {e}", exc_info=True)
            return None

    # ------------------------------------------------
    # Video download
    # ------------------------------------------------
    def download_instagram_video(self, url: str, output_path: str, post_info=None) -> str:
        """
        Downloads the video URL extracted from metadata.
        """

        try:
            if post_info is None:
                post_info = self.get_post_info(url)

            if not post_info or not post_info.get("video_url"):
                raise ValueError("No valid video found in metadata.")

            video_url = post_info["video_url"]
            os.makedirs(os.path.dirname(output_path), exist_ok=True)
            logger.info(f"⬇️ Downloading video from: {video_url}")

            headers = {
                "User-Agent": (
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/124.0.0.0 Safari/537.36"
                ),
                "Accept": "*/*",
                "Referer": "https://www.instagram.com/",
            }

            resp = requests.get(video_url, stream=True, headers=headers, timeout=30)
            if resp.status_code != 200:
                raise ValueError(f"Video download failed: {resp.status_code}")

            # write to disk
            with open(output_path, "wb") as f:
                for chunk in resp.iter_content(chunk_size=8192):
                    if chunk:
                        f.write(chunk)

            logger.info(f"✅ Video saved to {output_path}")
            return output_path

        except Exception as e:
            logger.error(f"❌ Error downloading Instagram video: {e}")
            raise ValueError(self.get_download_error_message()) from e

    # ------------------------------------------------
    # Errors
    # ------------------------------------------------
    def get_download_error_message(self) -> str:
        return (
            "Unable to download Instagram video. "
            "The video might be private, deleted, or temporarily inaccessible. "
            "Try again later or upload the file directly."
        )


# Singleton instance
instagram_client = InstagramClient()
