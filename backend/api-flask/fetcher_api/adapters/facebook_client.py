# fetcher_api/adapters/facebook_client.py

import os
import re
import logging
import yt_dlp
from typing import Optional

logger = logging.getLogger("facebook")

class FacebookClient:
    """
    Facebook scraper built to mirror InstagramClient's interface.
    Uses yt-dlp to safely extract public metadata and video streams.
    """

    def __init__(self):
        self.supported = True

    # ------------------------------------------------
    # URL utilities
    # ------------------------------------------------
    def is_facebook_url(self, url: str) -> bool:
        url_lower = url.lower()
        return "facebook.com" in url_lower or "fb.watch" in url_lower or "fb.com" in url_lower

    def extract_shortcode(self, url: str) -> Optional[str]:
        """
        Extracts reel/video ID from Facebook URLs safely.
        """
        # Matches: facebook.com/reel/123456 or facebook.com/video/123456
        m1 = re.search(r'/(?:reel|reels|video|v|posts|videos|watch)/(?:[A-Za-z0-9_-]+/)?([0-9]+)', url)
        if m1:
            return m1.group(1)
        
        # Matches: v=12345 queries
        m2 = re.search(r'v=([0-9]+)', url)
        if m2:
            return m2.group(1)
            
        # Matches mobile share links: /share/r/ABCDEFG/
        m3 = re.search(r'/share/[a-z]/([A-Za-z0-9_-]+)', url)
        if m3:
            return m3.group(1)
            
        return None

    # ------------------------------------------------
    # Metadata fetch
    # ------------------------------------------------
    def get_post_info(self, url: str) -> Optional[dict]:
        """
        Fetches Facebook post metadata using yt-dlp:
            - shortcode
            - caption
            - username (author_name)
            - video_url
        """
        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'extract_flat': False, # Need to extract metadata
        }
        
        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=False)
                
            if not info:
                logger.warning("❌ Could not extract Facebook info.")
                return None

            shortcode = info.get('id') or self.extract_shortcode(url) or "unknown"
            username = info.get('uploader') or info.get('channel') or "Facebook User"
            caption = info.get('description') or info.get('title') or ""

            # Find the best mp4 video URL
            video_url = info.get('url')
            if not video_url and info.get('formats'):
                # Get best mp4 format that has video
                formats = [f for f in info['formats'] if f.get('ext') == 'mp4' and f.get('vcodec') != 'none']
                if formats:
                    video_url = formats[-1].get('url')

            logger.info(f"✅ Extracted FB metadata for '{username}' - shortcode: {shortcode}")

            return {
                "shortcode": shortcode,
                "caption": caption,
                "is_video": True,
                "video_url": video_url,
                "username": username,
                "likes": info.get('like_count', 0),
                "comments": info.get('comment_count', 0),
                "timestamp": info.get('upload_date')
            }

        except Exception as e:
            logger.error(f"⚠️ Error getting Facebook post info: {e}", exc_info=True)
            return None

    # ------------------------------------------------
    # Video download
    # ------------------------------------------------
    def download_facebook_video(self, url: str, output_path: str, post_info=None) -> dict:
        """
        Downloads the video using yt-dlp (handles complex Facebook streams better than direct requests).
        Returns a dict matching the instagram_client structure: {"success": bool, "metadata": dict}
        """
        try:
            if post_info is None:
                post_info = self.get_post_info(url)

            if not post_info:
                raise ValueError("No valid video found in metadata.")

            os.makedirs(os.path.dirname(output_path), exist_ok=True)
            logger.info(f"⬇️ Downloading Facebook video to: {output_path}")

            ydl_opts = {
                'outtmpl': output_path,
                'format': 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
                'quiet': True,
                'no_warnings': True,
            }
            
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.download([url])

            if os.path.exists(output_path):
                logger.info(f"✅ FB Video saved to {output_path}")
                return {
                    "success": True,
                    "metadata": post_info
                }
            else:
                raise ValueError("Download finished but file missing.")

        except Exception as e:
            logger.error(f"❌ Error downloading Facebook video: {e}")
            return {
                "success": False,
                "error": str(e)
            }

# Singleton instance
facebook_client = FacebookClient()
