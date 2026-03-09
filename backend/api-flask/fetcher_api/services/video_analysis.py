# fetcher_api/services/video_analysis.py

import os
import logging
import subprocess
from typing import Dict, Optional, Tuple

from fetcher_api.adapters.instagram_client import instagram_client

logger = logging.getLogger("video_analysis")

def generate_reel_thumbnail(video_path: str, output_path: str, time_offset: float = 0.0) -> bool:
    """
    Extracts the first frame of the video using FFmpeg as a lightweight WebP.
    """
    try:
        if not os.path.exists(video_path):
            logger.error(f"❌ Video file not found for thumbnail: {video_path}")
            return False

        # ✅ UPDATED: Run FFmpeg to extract frame as WebP
        cmd = [
        'ffmpeg',
        '-y',
        '-i', video_path,
        '-vframes', '1',
        '-ss', str(time_offset),
        '-c:v', 'libwebp',  # ✅ Tell FFmpeg to use WebP
        '-q:v', '75',       # ✅ Set quality (75-80 is sweet spot)
        output_path
        ]
        
        # Capture output silently
        result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        
        if result.returncode == 0 and os.path.exists(output_path):
            logger.info(f"✅ FFmpeg successfully extracted WebP thumbnail to: {output_path}")
            return True
        else:
            logger.error(f"❌ FFmpeg failed to extract thumbnail. Error: {result.stderr.decode('utf-8')}")
            return False

    except Exception as e:
        logger.error(f"❌ Exception during thumbnail generation: {e}")
        return False

def download_instagram_thumbnail_bytes(post) -> Optional[bytes]:
    """
    Download Instagram's ACTUAL display thumbnail bytes (the one shown in gallery).
    Returns raw bytes or None.
    """
    try:
        import requests

        thumbnail_url = None

        # Instagram provides display_url which is the poster/thumbnail
        if hasattr(post, "url") and post.url:
            thumbnail_url = post.url
            logger.info("📸 Downloading Instagram's display thumbnail...")

        # Fallback: Try thumbnail_url attribute
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


def download_instagram_thumbnail(post, output_path: str) -> bool:
    """
    Download Instagram's ACTUAL display thumbnail (the one shown in gallery).
    This is what you see before clicking play - not frame 0!
    """
    try:
        content = download_instagram_thumbnail_bytes(post)
        if not content:
            return False

        with open(output_path, "wb") as f:
            f.write(content)

        if os.path.exists(output_path):
            file_size = os.path.getsize(output_path)
            logger.info(f"✅ Instagram thumbnail downloaded ({file_size} bytes)")
            return True

        return False

    except Exception as e:
        logger.error(f"❌ Thumbnail download error: {e}")
        return False


def get_instagram_video_duration(url: str) -> Optional[int]:
    """
    Get video duration from Instagram WITHOUT downloading the video.
    This allows early duration checks before bandwidth usage.
    
    Args:
        url: Instagram video URL
    
    Returns:
        Duration in seconds, or None if failed
    """
    try:
        logger.info(f"🕒 Checking video duration for: {url}")

        # Check if Facebook
        url_lower = url.lower()
        if "facebook.com" in url_lower or "fb." in url_lower:
            # yt-dlp duration check for facebook
            from fetcher_api.adapters.facebook_client import facebook_client
            info = facebook_client.get_post_info(url)
            # yt-dlp sometimes extracts duration, but if not we skip it.
            return info.get("duration") if info else None

        # Extract shortcode from URL (Instagram path)
        shortcode = instagram_client.extract_shortcode(url)
        if not shortcode:
            logger.error("❌ Could not extract shortcode from URL")
            return None

        # Use Instaloader to get post metadata (lightweight, no download)
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

        # Check if it's a video
        if not post.is_video:
            logger.warning("⚠️ Post is not a video")
            return None

        # Get duration (Instaloader provides video_duration attribute)
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
    Universal downloader. Retained name 'download_instagram_video' 
    to not break existing background imports, but now routes Facebook
    URLs to the facebook_client.
    """
    url_lower = url.lower()
    if "facebook.com" in url_lower or "fb." in url_lower:
        # -------------------------------------
        # FACEBOOK FLOW
        # -------------------------------------
        try:
            logger.info(f"⬇️ Downloading Facebook video: {url}")
            from fetcher_api.adapters.facebook_client import facebook_client
            
            fb_result = facebook_client.download_facebook_video(url, output_path)
            
            if not fb_result.get("success"):
                return {"success": False, "metadata": {}, "post": None}
                
            # Facebook post object is just a dict for us, 
            # we can use CV2 fallback for thumbnail later.
            return {
                "success": True,
                "metadata": fb_result.get("metadata", {}),
                "post": None 
            }
        except Exception as e:
            logger.error(f"❌ Facebook download error: {e}")
            return {"success": False, "metadata": {}, "post": None}

    # -------------------------------------
    # INSTAGRAM FLOW (Unchanged)
    # -------------------------------------
    try:
        logger.info(f"⬇️ Downloading Instagram video: {url}")

        # Extract shortcode from URL
        shortcode = instagram_client.extract_shortcode(url)
        if not shortcode:
            logger.error("❌ Could not extract shortcode from URL")
            return {"success": False, "metadata": {}, "post": None}

        # Use Instaloader to get post
        from instaloader import Instaloader, Post

        L = Instaloader(
            download_videos=True,
            download_video_thumbnails=False,
            download_geotags=False,
            download_comments=False,
            save_metadata=False,
            compress_json=False,
        )

        try:
            post = Post.from_shortcode(L.context, shortcode)
        except Exception as e:
            logger.error(f"❌ Failed to fetch post: {e}")
            return {"success": False, "metadata": {}, "post": None}

        # Get video URL
        if not post.is_video or not post.video_url:
            logger.error("❌ Post is not a video or no video URL found")
            return {"success": False, "metadata": {}, "post": None}

        video_url = post.video_url

        # Download the video
        logger.info(f"⬇️ Downloading video from: {video_url}")

        import requests
        response = requests.get(video_url, stream=True, timeout=60)
        response.raise_for_status()

        with open(output_path, "wb") as f:
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)

        logger.info(f"✅ Video saved to {output_path}")

        # Proper username extraction with fallback
        username = ""
        if hasattr(post, 'owner_username') and post.owner_username:
            username = post.owner_username
            logger.info(f"🔍 Method 1: Got username from owner_username: '{username}'")
        elif hasattr(post, 'owner_profile'):
            try:
                username = post.owner_profile.username
                logger.info(f"🔍 Method 2: Got username from owner_profile: '{username}'")
            except:
                pass
        
        if not username:
            logger.warning(f"⚠️ Could not extract username for shortcode: {shortcode}")
            username = "Unknown"
        
        logger.info(f"✅ Final username: '{username}'")

        # Extract metadata
        metadata = {
            "username": username,
            "caption": post.caption if post.caption else "",
            "likes": getattr(post, "likes", 0),
            "comments": getattr(post, "comments", 0),
        }

        logger.info(f"📊 Metadata: @{metadata['username']} | ❤️ {metadata['likes']} | 💬 {metadata['comments']}")

        return {
            "success": True,
            "metadata": metadata,
            "post": post  # ✅ Return the post object for thumbnail extraction
        }

    except Exception as e:
        logger.error(f"❌ Download error: {e}")
        return {"success": False, "metadata": {}, "post": None}
