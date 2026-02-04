# fetcher_api/api/helpers/formatter.py

"""
Data formatting helpers for API responses
"""
import json
import logging
from typing import Any, Dict, List, Optional
from datetime import datetime

logger = logging.getLogger("formatters")


def format_reel_response(row: Dict) -> Dict:
    """Format database row into API response for a single reel"""
    
    # Parse JSON fields
    summary_text = _safe_json_parse(row.get("summary_text"))
    headlines = _safe_json_parse(row.get("summary_bullets"), [])
    recipe = _safe_json_parse(row.get("recipe"))
    workout = _safe_json_parse(row.get("workout"))
    
    return {
        "id": row.get("id"),
        "user_id": row.get("user_id"),
        "source_url": row.get("source_url"),
        "thumbnail_url": row.get("thumbnail_url"),
        "video_title": row.get("video_title"),
        "channel_name": row.get("channel_name"),
        "duration_seconds": row.get("duration_seconds"),
        "language": row.get("language"),
        
        # AI Analysis
        "content_type": row.get("content_type"),
        "category": row.get("category"),
        "topic": row.get("topic"),
        "title": row.get("title"),
        
        # Summary
        "summary_title": row.get("summary_title"),
        "summary_text": summary_text,
        "summary_bullets": headlines,
        "summary_hashtags": row.get("summary_hashtags", []),
        "summary_emojis": row.get("summary_emojis", []),
        
        # Structured data
        "recipe": recipe,
        "workout": workout,
        
        # Legacy fields (for backwards compatibility)
        "headlines": headlines,
        "hashtags": row.get("summary_hashtags", []),
        "emojis": row.get("summary_emojis", []),
        
        # Metadata
        "created_at": _format_timestamp(row.get("created_at")),
        "updated_at": _format_timestamp(row.get("updated_at")),
    }


def format_reels_list(rows: List[Dict]) -> List[Dict]:
    """Format list of database rows into API response"""
    return [format_reel_response(row) for row in rows]


def _safe_json_parse(value: Any, default: Any = None) -> Any:
    """Safely parse JSON string, return default if invalid"""
    if value is None:
        return default
    
    if isinstance(value, (dict, list)):
        return value
    
    if isinstance(value, str):
        try:
            return json.loads(value)
        except (json.JSONDecodeError, ValueError):
            logger.warning("Failed to parse JSON: %s", value[:100])
            return default
    
    return default


def _format_timestamp(ts: Any) -> Optional[str]:
    """Format timestamp to ISO string"""
    if ts is None:
        return None
    
    if isinstance(ts, datetime):
        return ts.isoformat()
    
    if isinstance(ts, str):
        return ts
    
    return str(ts)


def normalize_duration(duration: Any) -> Optional[int]:
    """Normalize duration to integer seconds"""
    if duration is None:
        return None
    
    if isinstance(duration, int):
        return duration
    
    if isinstance(duration, float):
        return int(duration)
    
    if isinstance(duration, str):
        try:
            return int(float(duration))
        except (ValueError, TypeError):
            return None
    
    return None


def safe_int(value: Any, default: int = 0) -> int:
    """Safely convert value to int"""
    if value is None:
        return default
    
    if isinstance(value, int):
        return value
    
    try:
        return int(value)
    except (ValueError, TypeError):
        return default


def safe_str(value: Any, default: str = "") -> str:
    """Safely convert value to string"""
    if value is None:
        return default
    
    if isinstance(value, str):
        return value
    
    return str(value)


def safe_list(value: Any, default: Optional[List] = None) -> List:
    """Safely convert value to list"""
    if default is None:
        default = []
    
    if value is None:
        return default
    
    if isinstance(value, list):
        return value
    
    return default
