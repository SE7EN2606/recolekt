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

        # ✅ Run FFmpeg to extract frame as WebP
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

def download_instagram_thumbnail_bytes(post, source_url: str = None) -> Optional[bytes]:
    """
    Download Instagram's ACTUAL display thumbnail bytes (the gallery poster).
    We try scraping the og:image from the HTML first, as this contains the custom
    user-uploaded cover. If that fails, we fall back to Instaloader's display URL.
    """
    import requests
    import re
    
    thumbnail_url = None
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    }

    # 1. ATTEMPT 1: Scrape the 'og:image' from the raw HTML (This is the real poster)
    if source_url:
        try:
            logger.info("📸 Scraping HTML for official og:image poster...")
            res = requests.get(source_url, headers=headers, timeout=10)
            match = re.search(r'<meta property="og:image" content="([^"]+)"', res.text)
            if match:
                thumbnail_url = match.group(1).replace("&amp;", "&")
                logger.info(f"✅ Found official poster URL in HTML metadata.")
        except Exception as e:
            logger.warning(f"⚠️ Failed to scrape og:image: {e}")

    # 2. ATTEMPT 2: Fall back to Instaloader's display URL
    if not thumbnail_url and post:
        if hasattr(post, "url") and post.url:
            thumbnail_url = post.url
            logger.info("📸 Using Instaloader display_url...")
        elif hasattr(post, "thumbnail_url") and post.thumbnail_url:
            thumbnail_url = post.thumbnail_url
            logger.info("📸 Using Instaloader thumbnail_url...")

    if not thumbnail_url:
        logger.warning("⚠️ No thumbnail URL found by any method.")
        return None

    # Download the actual image bytes
    try:
        response = requests.get(thumbnail_url, timeout=30)
        response.raise_for_status()
        return response.content
    except Exception as e:
        logger.error(f"❌ Poster download error: {e}")
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
    """
    try:
        logger.info(f"🕒 Checking video duration for: {url}")

        # Check if Facebook
        url_lower = url.lower()
        if "facebook.com" in url_lower or "fb." in url_lower:
            from fetcher_api.adapters.facebook_client import facebook_client
            info = facebook_client.get_post_info(url)
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

        # Get duration
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
    Universal downloader. Handles Facebook, and uses Instaloader for Instagram
    with a pure HTML Regex fallback that detects Age-Restricted/Sensitive content blocks.
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
                return {"success": False, "metadata": {}, "post": None, "error_code": "GENERIC_ERROR"}
                
            return {
                "success": True,
                "metadata": fb_result.get("metadata", {}),
                "post": None 
            }
        except Exception as e:
            logger.error(f"❌ Facebook download error: {e}")
            return {"success": False, "metadata": {}, "post": None, "error_code": "GENERIC_ERROR"}

    # -------------------------------------
    # INSTAGRAM FLOW
    # -------------------------------------
    try:
        logger.info(f"⬇️ Downloading Instagram video: {url}")

        # Extract shortcode from URL
        shortcode = instagram_client.extract_shortcode(url)
        if not shortcode:
            logger.error("❌ Could not extract shortcode from URL")
            return {"success": False, "metadata": {}, "post": None, "error_code": "INVALID_URL"}

        video_url = None
        username = "Unknown"
        caption = ""
        likes = 0
        comments = 0
        post_obj = None

        # 1. Standard Instaloader attempt
        try:
            from instaloader import Instaloader, Post
            L = Instaloader(
                download_videos=True,
                download_video_thumbnails=False,
                download_geotags=False,
                download_comments=False,
                save_metadata=False,
                compress_json=False,
            )
            post_obj = Post.from_shortcode(L.context, shortcode)
            
            if post_obj.is_video:
                video_url = post_obj.video_url
                username = getattr(post_obj, 'owner_username', 'Unknown')
                if username == 'Unknown' and hasattr(post_obj, 'owner_profile'):
                    try: username = post_obj.owner_profile.username
                    except: pass
                caption = post_obj.caption if post_obj.caption else ""
                likes = getattr(post_obj, "likes", 0)
                comments = getattr(post_obj, "comments", 0)
                logger.info("✅ Instaloader parsed metadata successfully.")
                
        except Exception as e:
            logger.warning(f"⚠️ Instaloader crashed (likely empty/restricted reel): {e}")

        # 2. Pure HTML Fallback with Restriction Detection
        if not video_url:
            logger.info("🔄 Using pure HTML extraction fallback...")
            import requests
            import re
            
            headers = {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
            }
            res = requests.get(url, headers=headers, timeout=15)
            
            # 🚨 DETECT AGE-RESTRICTED / SENSITIVE CONTENT
            if "accounts/login" in res.url or "restricted" in res.text.lower() or "sensitive" in res.text.lower():
                logger.error("❌ Instagram blocked access (Age-Restricted, Sensitive, or Private).")
                return {
                    "success": False, 
                    "metadata": {}, 
                    "post": None,
                    "error_code": "RESTRICTED_CONTENT",
                    "error_message": "Instagram restricts this video (Sensitive, Private, or Age-Restricted)."
                }
            
            # Extract raw video URL from meta tags
            vid_match = re.search(r'<meta property="og:video" content="([^"]+)"', res.text)
            if vid_match:
                video_url = vid_match.group(1).replace("&amp;", "&")
                logger.info("✅ Extracted video URL directly from HTML.")
            
            # Extract username from schema
            user_match = re.search(r'"@type":"Person","name":"([^"]+)"', res.text)
            if user_match:
                username = user_match.group(1)

        # Ensure we got a URL
        if not video_url:
            logger.error("❌ No video URL found via Instaloader or HTML fallback.")
            return {"success": False, "metadata": {}, "post": None, "error_code": "NOT_FOUND"}

        # 3. Download the MP4
        logger.info(f"⬇️ Downloading video stream from: {video_url[:60]}...")
        import requests
        response = requests.get(video_url, stream=True, timeout=60)
        response.raise_for_status()

        with open(output_path, "wb") as f:
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)

        logger.info(f"✅ Video saved to {output_path}")

        metadata = {
            "username": username,
            "caption": caption,
            "likes": likes,
            "comments": comments,
        }

        return {
            "success": True,
            "metadata": metadata,
            "post": post_obj
        }

    except Exception as e:
        logger.error(f"❌ Ultimate Download error: {e}", exc_info=True)
        return {"success": False, "metadata": {}, "post": None, "error_code": "GENERIC_ERROR"}