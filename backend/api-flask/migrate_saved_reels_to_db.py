import os
import json
from datetime import datetime
from fetcher_api.adapters.db import execute

# Correct path to saved_reels inside fetcher_api
SAVE_DIR = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "fetcher_api",
    "saved_reels"
)

print("Using SAVE_DIR:", SAVE_DIR)

def load_json_files():
    for f in os.listdir(SAVE_DIR):
        if not f.endswith(".json"):
            continue
        full = os.path.join(SAVE_DIR, f)
        try:
            with open(full, "r", encoding="utf-8") as fp:
                yield json.load(fp)
        except Exception:
            continue

def migrate():
    for data in load_json_files():
        try:
            id = data.get("process_id")
            if not id:
                continue

            user_id = "temp_user"  # until auth system exists
            caption = data.get("caption", "")
            author_name = data.get("author_name", "")
            source_url = data.get("source_url", "")
            status = data.get("status", "done")

            summary = data.get("summary", {}) or {}
            summary_title = summary.get("title", "")
            summary_topic = summary.get("topic", "")
            summary_hashtags = summary.get("hashtags", [])
            summary_bullets = summary.get("bullets", [])

            transcription_full = data.get("transcription", {}) or {}
            transcription = transcription_full.get("transcript", "")

            folder_id = data.get("folder_id", "default")

            gcs = data.get("gcs_urls", {}) or {}
            gcs_video_url = gcs.get("video")
            gcs_thumbnail_url = gcs.get("thumbnail")
            gcs_preview_thumb_url = gcs.get("preview_thumbnail")
            gcs_caption_json_url = gcs.get("caption")
            gcs_transcription_url = gcs.get("transcription")
            gcs_result_json_url = gcs.get("result")

            created_at = data.get("created_at")
            if created_at:
                try:
                    created_at = datetime.fromisoformat(created_at)
                except:
                    created_at = datetime.utcnow()
            else:
                created_at = datetime.utcnow()

            sql = """
            INSERT INTO reels (
                id, user_id, source_url, caption, author_name, status,
                summary_title, summary_topic, summary_hashtags, summary_bullets,
                transcription, transcription_json,
                folder_id,
                gcs_video_url, gcs_thumbnail_url, gcs_preview_thumb_url,
                gcs_caption_json_url, gcs_transcription_url, gcs_result_json_url,
                created_at, updated_at
            )
            VALUES (
                %(id)s, %(user_id)s, %(source_url)s, %(caption)s, %(author_name)s, %(status)s,
                %(summary_title)s, %(summary_topic)s, %(summary_hashtags)s, %(summary_bullets)s,
                %(transcription)s, %(transcription_json)s,
                %(folder_id)s,
                %(gcs_video_url)s, %(gcs_thumbnail_url)s, %(gcs_preview_thumb_url)s,
                %(gcs_caption_json_url)s, %(gcs_transcription_url)s, %(gcs_result_json_url)s,
                %(created_at)s, %(created_at)s
            )
            ON CONFLICT (id) DO NOTHING;
            """

            execute(sql, {
                "id": id,
                "user_id": user_id,
                "source_url": source_url,
                "caption": caption,
                "author_name": author_name,
                "status": status,
                "summary_title": summary_title,
                "summary_topic": summary_topic,
                "summary_hashtags": summary_hashtags,
                "summary_bullets": json.dumps(summary_bullets),
                "transcription": transcription,
                "transcription_json": json.dumps(transcription_full),
                "folder_id": folder_id,
                "gcs_video_url": gcs_video_url,
                "gcs_thumbnail_url": gcs_thumbnail_url,
                "gcs_preview_thumb_url": gcs_preview_thumb_url,
                "gcs_caption_json_url": gcs_caption_json_url,
                "gcs_transcription_url": gcs_transcription_url,
                "gcs_result_json_url": gcs_result_json_url,
                "created_at": created_at,
            })

            print(f"Inserted: {id}")

        except Exception as e:
            print(f"Error migrating: {e}")

if __name__ == "__main__":
    migrate()
