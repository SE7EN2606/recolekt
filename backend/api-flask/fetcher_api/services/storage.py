# fetcher_api/services/storage.py
import os
import json
import logging
from fetcher_api.adapters.gcs_client import gcs_client
from fetcher_api.adapters.db import fetch_one

logger = logging.getLogger("storage")

def _get_user_id_for_shortcode(shortcode: str):
    """Fallback fetch user_id from DB if not provided."""
    try:
        row = fetch_one("SELECT user_id FROM reels WHERE id LIKE %s ORDER BY created_at DESC LIMIT 1", (f"{shortcode}%",))
        if row:
            return dict(row).get("user_id") if hasattr(row, "keys") else row._asdict().get("user_id")
    except Exception as e:
        logger.error(f"Error fetching user_id for shortcode {shortcode}: {e}")
    return None

def generate_gcs_paths(shortcode: str, platform: str = "IG", user_id: str = None):
    shortcode = shortcode.strip()
    
    # Prioritize passed user_id, fallback to DB lookup
    final_user_id = user_id or _get_user_id_for_shortcode(shortcode)

    folder_name = f"{shortcode}_{final_user_id}" if final_user_id else shortcode
    base_path = f"media/{platform}_reels/{folder_name}/"
    
    return {
        "preview_thumbnail": f"{base_path}{shortcode}_thumbnail.jpeg",
        "video": f"{base_path}{shortcode}_video.mp4",
        "result_json": f"{base_path}{shortcode}_result.json"
    }

def _safe_upload(local_path: str, bucket: str, blob_name: str, content_type=None):
    if not gcs_client.available: return None
    try:
        return gcs_client.upload_file(
            local_path, bucket, blob_name,
            content_type=content_type,
            timeout=600 
        )
    except Exception as e:
        logger.error(f"Failed upload: {e}")
        return None

def save_result_json_to_gcs(result: dict, process_id: str, temp_dir: str, shortcode: str = None, media_folder: str = "IG", user_id: str = None):
    try:
        if not shortcode:
            shortcode = process_id.split("--")[0] if "--" in process_id else process_id.split("_")[0]

        # Explicitly passing user_id prevents orphaned folders
        gcs_paths = generate_gcs_paths(shortcode, media_folder, user_id=user_id)
        
        local_json_path = os.path.join(temp_dir, f"{process_id}_result.json")
        with open(local_json_path, "w", encoding="utf-8") as f:
            json.dump(result, f, indent=2, ensure_ascii=False)

        return _safe_upload(
            local_json_path,
            gcs_client.analysis_bucket_name,
            gcs_paths["result_json"],
            content_type="application/json"
        )
    except Exception as e:
        logger.error(f"Error saving result JSON: {e}")
        return None

def save_video_to_gcs(video_path: str, shortcode: str, media_folder: str = "IG", user_id: str = None):
    gcs_paths = generate_gcs_paths(shortcode, media_folder, user_id=user_id)
    return _safe_upload(video_path, gcs_client.analysis_bucket_name, gcs_paths["video"], content_type="video/mp4")

# Redundant save_thumbnail functions removed/merged for simplicity
def save_thumbnail_to_gcs(thumbnail_path: str, shortcode: str, media_folder: str = "IG", user_id: str = None):
    gcs_paths = generate_gcs_paths(shortcode, media_folder, user_id=user_id)
    return _safe_upload(thumbnail_path, gcs_client.analysis_bucket_name, gcs_paths["preview_thumbnail"], content_type="image/jpeg")