# fetcher_api/services/storage.py

import os
import json
import logging
from fetcher_api.adapters.gcs_client import gcs_client

logger = logging.getLogger("storage")

def generate_gcs_paths(shortcode: str, platform: str = "IG"):
    """
    Generate naming convention. 
    """
    # CRITICAL: Do NOT strip special characters like '-' or '_' from the end
    shortcode = shortcode.strip() 
    
    base_path = f"media/{platform}_reels/{shortcode}/"
    return {
        "preview_thumbnail": f"{base_path}{shortcode}_thumbnail.jpeg",
        "video": f"{base_path}{shortcode}_video.mp4",
        "caption_json": f"{base_path}{shortcode}_caption.json",
        "transcription": f"{base_path}{shortcode}_transcription.json",
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

# ✅ UPDATED: Now accepts 'shortcode' explicitly to avoid split errors
def save_result_json_to_gcs(result: dict, process_id: str, temp_dir: str, shortcode: str = None, media_folder: str = "IG"):
    try:
        # If shortcode not passed, try to extract safely, but explicit is better
        if not shortcode:
            if "--" in process_id:
                shortcode = process_id.split("--")[0]
            else:
                shortcode = process_id.split("_")[0]

        gcs_paths = generate_gcs_paths(shortcode, media_folder)
        
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

def save_video_to_gcs(video_path: str, shortcode: str, media_folder: str = "IG"):
    gcs_paths = generate_gcs_paths(shortcode, media_folder)
    return _safe_upload(
        video_path,
        gcs_client.analysis_bucket_name,
        gcs_paths["video"],
        content_type="video/mp4"
    )

def save_thumbnail_to_gcs(thumbnail_path: str, shortcode: str, media_folder: str = "IG"):
    gcs_paths = generate_gcs_paths(shortcode, media_folder)
    return _safe_upload(
        thumbnail_path,
        gcs_client.analysis_bucket_name,
        gcs_paths["preview_thumbnail"],
        content_type="image/jpeg"
    )

def save_preview_thumbnail_to_gcs(preview_path: str, shortcode: str):
    gcs_paths = generate_gcs_paths(shortcode, "IG")
    return _safe_upload(
        preview_path,
        gcs_client.analysis_bucket_name,
        gcs_paths["preview_thumbnail"],
        content_type="image/jpeg"
    )
