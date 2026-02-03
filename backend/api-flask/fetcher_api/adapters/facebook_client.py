import os
import re
import logging
import subprocess
from typing import Optional

logger = logging.getLogger('facebook')

class FacebookClient:
    def __init__(self):
        self.supported = True

    def is_facebook_url(self, url: str) -> bool:
        return "facebook.com" in url.lower() or "fb.watch" in url.lower()

    def extract_shortcode(self, url: str) -> Optional[str]:
        try:
            match = re.search(r'/reel/([^/?]+)', url)
            if match:
                return match.group(1)
            return None
        except Exception as e:
            logger.error(f"Error extracting Facebook shortcode: {e}")
            return None

    def download_facebook_video(self, url: str, output_path: str) -> bool:
        """
        Download Facebook video as valid MP4 using yt-dlp
        """
        try:
            shortcode = self.extract_shortcode(url)
            direct_url = url if not shortcode else f"https://www.facebook.com/reel/{shortcode}/"
            logger.info(f"Downloading Facebook video: {direct_url}")

            yt_dlp_cmd = [
                "yt-dlp",
                "-f", "mp4",
                "-o", output_path,
                direct_url
            ]
            subprocess.run(yt_dlp_cmd, check=True)
            logger.info(f"Facebook video saved: {output_path}")
            return True

        except subprocess.CalledProcessError as e:
            logger.error(f"yt-dlp failed to download video: {e}")
            return False
        except Exception as e:
            logger.error(f"Unexpected error downloading Facebook video: {e}")
            return False

# Singleton
facebook_client = FacebookClient()
