"""GCS storage helpers"""
import os
import json
import logging

from fetcher_api.adapters.gcs_client import gcs_client

logger = logging.getLogger("api")

def save_json_sidecars(temp_dir, shortcode, transcription, caption, result):
    """Save JSON sidecars to GCS"""
    if not gcs_client.available:
        return {}

    base = f"media/IG_reels/{shortcode}"
    urls = {}
    files = {
        "transcription.json": {"transcription": transcription},
        "caption.json": {"caption": caption},
        "result.json": result,
    }

    for fname, data in files.items():
        path = os.path.join(temp_dir, fname)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

        try:
            uploaded = gcs_client.upload_file(
                path,
                gcs_client.analysis_bucket_name,
                f"{base}/{fname}"
            )
            urls[fname.split(".")[0]] = uploaded
        except Exception as e:
            logger.error(f"Sidecar upload failed for {fname}: {e}")

    return urls

def upload_media(video_path, shortcode):
    """Upload video to GCS"""
    if not gcs_client.available:
        return {}

    base = f"media/IG_reels/{shortcode}"
    try:
        return {
            "video": gcs_client.upload_file(
                video_path,
                gcs_client.analysis_bucket_name,
                f"{base}/video.mp4"
            )
        }
    except Exception as e:
        logger.error(f"Video upload failed: {e}")
        return {}
