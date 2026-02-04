# fetcher_api/api/helpers/normalizers.py

"""
Data normalization helpers for video URLs and metadata
"""
import re
import json
import logging
import subprocess
from typing import Optional
from urllib.parse import urlparse, parse_qs

logger = logging.getLogger("normalizers")


# ==================== JSON / TYPE HELPERS ====================

def json_loads_maybe(v, default=None):
    """If v is a JSON string, parse it. If v is already dict/list, return it. Otherwise return default."""
    if v is None:
        return default
    if isinstance(v, (dict, list)):
        return v
    if isinstance(v, str):
        s = v.strip()
        if not s:
            return default
        try:
            return json.loads(s)
        except Exception:
            return default
    return default


def json_stringify(v):
    """Safely convert value to JSON string"""
    if v is None:
        return None
    if isinstance(v, str):
        return v
    try:
        return json.dumps(v, ensure_ascii=False)
    except Exception:
        return str(v)


def ensure_dict(v):
    """Return v if it's a dict, otherwise return empty dict"""
    return v if isinstance(v, dict) else {}


def ensure_list(v):
    """Return v if it's a list, otherwise return empty list"""
    return v if isinstance(v, list) else []


def safe_str(v):
    """Safely convert to string"""
    if v is None:
        return ""
    if isinstance(v, str):
        return v
    return str(v)


def safe_int(v, default=0):
    """Safely convert to int"""
    if v is None:
        return default
    if isinstance(v, int):
        return v
    if isinstance(v, (float, str)):
        try:
            return int(float(v))
        except (ValueError, TypeError):
            return default
    return default


# ==================== URL NORMALIZATION ====================

def normalize_video_url(url: str) -> str:
    """Normalize video URL to standard format"""
    if not url:
        return url
    
    url = url.strip()
    
    # YouTube regular video
    if "youtube.com" in url or "youtu.be" in url:
        video_id = extract_youtube_id(url)
        if video_id:
            if "/shorts/" in url:
                return f"https://www.youtube.com/shorts/{video_id}"
            return f"https://www.youtube.com/watch?v={video_id}"
    
    # TikTok
    if "tiktok.com" in url:
        match = re.search(r"/video/(\d+)", url)
        if match:
            video_id = match.group(1)
            username_match = re.search(r"@([\w.]+)", url)
            if username_match:
                username = username_match.group(1)
                return f"https://www.tiktok.com/@{username}/video/{video_id}"
    
    # Instagram
    if "instagram.com" in url:
        match = re.search(r"/reel/([A-Za-z0-9_-]+)", url)
        if match:
            reel_id = match.group(1)
            return f"https://www.instagram.com/reel/{reel_id}/"
    
    return url


def extract_youtube_id(url: str) -> Optional[str]:
    """Extract YouTube video ID from various URL formats"""
    if not url:
        return None
    
    if "youtu.be/" in url:
        match = re.search(r"youtu\.be/([A-Za-z0-9_-]{11})", url)
        if match:
            return match.group(1)
    
    if "youtube.com/watch" in url:
        parsed = urlparse(url)
        query = parse_qs(parsed.query)
        video_id = query.get("v", [None])[0]
        if video_id:
            return video_id
    
    if "youtube.com/shorts/" in url:
        match = re.search(r"/shorts/([A-Za-z0-9_-]{11})", url)
        if match:
            return match.group(1)
    
    if "youtube.com/embed/" in url:
        match = re.search(r"/embed/([A-Za-z0-9_-]{11})", url)
        if match:
            return match.group(1)
    
    return None


def detect_platform(url: str) -> str:
    """Detect platform from URL"""
    if not url:
        return "unknown"
    
    url_lower = url.lower()
    
    if "youtube.com" in url_lower or "youtu.be" in url_lower:
        return "youtube"
    
    if "tiktok.com" in url_lower:
        return "tiktok"
    
    if "instagram.com" in url_lower:
        return "instagram"
    
    if "vimeo.com" in url_lower:
        return "vimeo"
    
    return "other"


# ==================== DURATION HELPERS ====================

def normalize_duration(duration: any) -> Optional[int]:
    """Normalize duration to integer seconds"""
    if duration is None:
        return None
    
    if isinstance(duration, int):
        return duration
    
    if isinstance(duration, float):
        return int(duration)
    
    if isinstance(duration, str):
        if duration.startswith("PT"):
            return parse_iso8601_duration(duration)
        
        if ":" in duration:
            return parse_time_duration(duration)
        
        try:
            return int(float(duration))
        except (ValueError, TypeError):
            return None
    
    return None


def parse_iso8601_duration(duration: str) -> Optional[int]:
    """Parse ISO 8601 duration (PT1M30S) to seconds"""
    try:
        seconds = 0
        
        hours_match = re.search(r"(\d+)H", duration)
        if hours_match:
            seconds += int(hours_match.group(1)) * 3600
        
        minutes_match = re.search(r"(\d+)M", duration)
        if minutes_match:
            seconds += int(minutes_match.group(1)) * 60
        
        seconds_match = re.search(r"(\d+)S", duration)
        if seconds_match:
            seconds += int(seconds_match.group(1))
        
        return seconds if seconds > 0 else None
    
    except Exception:
        return None


def parse_time_duration(duration: str) -> Optional[int]:
    """Parse time duration (1:30 or 1:30:45) to seconds"""
    try:
        parts = duration.split(":")
        
        if len(parts) == 2:
            minutes, seconds = map(int, parts)
            return minutes * 60 + seconds
        
        if len(parts) == 3:
            hours, minutes, seconds = map(int, parts)
            return hours * 3600 + minutes * 60 + seconds
        
        return None
    
    except Exception:
        return None


def get_video_duration(video_path: str) -> Optional[int]:
    """
    Get video duration in seconds using ffprobe.
    Returns None if ffprobe fails or video_path is invalid.
    """
    try:
        result = subprocess.run(
            [
                "ffprobe",
                "-v", "error",
                "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1",
                video_path
            ],
            capture_output=True,
            text=True,
            timeout=10
        )
        
        if result.returncode == 0 and result.stdout.strip():
            duration = float(result.stdout.strip())
            return int(duration)
        
        return None
    
    except (subprocess.TimeoutExpired, subprocess.SubprocessError, ValueError) as e:
        logger.warning(f"Failed to get video duration for {video_path}: {e}")
        return None
    except FileNotFoundError:
        logger.warning("ffprobe not found. Install ffmpeg to get video duration.")
        return None


# ==================== FILE NAME SANITIZATION ====================

def sanitize_filename(filename: str) -> str:
    """Sanitize filename by removing invalid characters"""
    if not filename:
        return "untitled"
    
    # Remove invalid characters
    filename = re.sub(r'[<>:"/\\|?*]', "", filename)
    
    # Replace spaces with underscores
    filename = filename.replace(" ", "_")
    
    # Limit length
    if len(filename) > 200:
        filename = filename[:200]
    
    return filename or "untitled"
