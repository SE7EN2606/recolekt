# fetcher_api/services/video_analysis.py

import os
import logging
from typing import Dict, Optional, Tuple

from fetcher_api.adapters.instagram_client import instagram_client

logger = logging.getLogger("video_analysis")


def generate_reel_thumbnail(video_path: str, output_path: str, time_offset: float = 0.0) -> bool:
    """
    DEPRECATED: Use download_instagram_thumbnail() instead.
    This extracts frame 0, but Instagram uses custom thumbnails.
    """
    try:
        import cv2

        cap = cv2.VideoCapture(video_path)

        if not cap.isOpened():
            logger.error("❌ Could not open video file")
            cap.release()
            return False

        cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
        ret, frame = cap.read()

        if ret and frame is not None:
            success = cv2.imwrite(output_path, frame, [cv2.IMWRITE_JPEG_QUALITY, 95])
            cap.release()

            if success and os.path.exists(output_path):
                logger.info("✅ Fallback: Saved frame 0")
                return True

        cap.release()

    except Exception as e:
        logger.error(f"❌ Frame extraction error: {e}")

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

        # Extract shortcode from URL
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
    Download Instagram video using Instaloader.
    Returns the post object so we can extract the real thumbnail.
    """
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

        # ✅ FIXED: Proper username extraction with fallback
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
            "likes": post.likes,
            "comments": post.comments,
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
