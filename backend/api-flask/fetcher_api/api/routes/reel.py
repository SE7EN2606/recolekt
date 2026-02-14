# fetcher_api/api/routes/reel.py
"""
Reel management routes - list, update, delete, search
"""
import os
import json
import logging
from datetime import datetime, timedelta

from flask import Blueprint, request, jsonify
from google.cloud import storage

from fetcher_api.adapters.db import execute, fetch_all, fetch_one
from fetcher_api.api.helpers.auth import get_user_id_from_request
from fetcher_api.api.helpers.formatters import (
    json_loads_maybe,
    repair_recipe_from_caption,
    build_bilingual_summary_object,
    extract_english_preview_and_title,
)

logger = logging.getLogger("reels")

reel_bp = Blueprint("reels", __name__)


def add_no_cache_headers(response):
    """Disable caching for dynamic lists"""
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response


def parse_transcription(transcription_raw):
    """
    Extract clean transcript text from DB column.
    
    Input can be:
    - JSON string: '{"status": "ok", "transcript": "...", "detected_language": "fr"}'
    - Dict: {"status": "ok", "transcript": "...", "detected_language": "fr"}
    - Plain text: "Transcript text..."
    - None
    
    Returns: Clean transcript text or None
    """
    if not transcription_raw:
        return None
    
    # If it's already a dict
    if isinstance(transcription_raw, dict):
        return transcription_raw.get("transcript")
    
    # If it's a JSON string, parse it
    if isinstance(transcription_raw, str):
        try:
            parsed = json.loads(transcription_raw)
            if isinstance(parsed, dict) and "transcript" in parsed:
                return parsed["transcript"]
        except (json.JSONDecodeError, ValueError):
            pass
        
        # If parsing failed, return as-is (assume it's plain text)
        return transcription_raw
    
    return None


@reel_bp.route("/saved_reels", methods=["GET"])
def list_saved_reels():
    """Get paginated list of user's saved reels"""
    try:
        try:
            user_id = get_user_id_from_request()
        except ValueError:
            return jsonify({"error": "Authentication required"}), 401
        
        page = int(request.args.get("page", 1))
        per_page = int(request.args.get("per_page", 30))
        offset = (page - 1) * per_page
        
        sql = """
            SELECT 
                id, source_url, folder_id, is_favorite, status,
                summary_category, summary_title, summary_topic, summary_text,
                summary_bullets, summary_hashtags, summary_emojis,
                content_type, created_at, caption, author_name,
                is_long_video, duration, recipe, workout, transcription,
                gcs_urls::jsonb->'preview_thumbnail' as preview_thumbnail
            FROM reels
            WHERE user_id = %s
            ORDER BY created_at DESC
            LIMIT %s OFFSET %s
        """
        
        db_rows = fetch_all(sql, (user_id, per_page, offset))
        transformed_rows = []
        
        for row in db_rows:
            if hasattr(row, 'keys'):
                row_dict = dict(row)
            elif hasattr(row, '_asdict'):
                row_dict = row._asdict()
            else:
                continue
            
            caption = row_dict.get("caption") or ""
            
            # Parse recipe/workout JSON if string
            row_dict["recipe"] = json_loads_maybe(row_dict.get("recipe"), default=row_dict.get("recipe"))
            row_dict["workout"] = json_loads_maybe(row_dict.get("workout"), default=row_dict.get("workout"))
            
            # ✅ Parse transcription and extract clean text
            transcription_raw = row_dict.get("transcription")
            transcription_clean = parse_transcription(transcription_raw)
            row_dict["transcription"] = transcription_clean
            
            # ✅ DEBUG: Log what we're sending
            if transcription_clean:
                logger.info(f"✅ Sending transcript for {row_dict.get('id')}: {transcription_clean[:100]}...")
            else:
                logger.debug(f"⚠️ No transcript for {row_dict.get('id')}")
            
            # Repair recipe bilingual blocks from caption when needed
            if isinstance(row_dict.get("recipe"), dict):
                row_dict["recipe"] = repair_recipe_from_caption(row_dict["recipe"], caption)
            
            # Normalize JSON-ish DB columns
            summary_text_raw = row_dict.get("summary_text")
            summary_text = json_loads_maybe(summary_text_raw, default=summary_text_raw)
            bullets = json_loads_maybe(row_dict.get("summary_bullets"), default=row_dict.get("summary_bullets"))
            hashtags = json_loads_maybe(row_dict.get("summary_hashtags"), default=row_dict.get("summary_hashtags"))
            emojis = json_loads_maybe(row_dict.get("summary_emojis"), default=row_dict.get("summary_emojis"))
            
            if not isinstance(bullets, list):
                bullets = []
            if not isinstance(hashtags, list):
                hashtags = []
            if not isinstance(emojis, list):
                emojis = []
            
            summary_title = row_dict.get("summary_title")
            
            # If summary_text is already bilingual dict, keep it; else build stable bilingual shape
            if not isinstance(summary_text, dict):
                bilingual = build_bilingual_summary_object(
                    summary_title=summary_title,
                    summary_text=summary_text if isinstance(summary_text, str) else "",
                    bullets=bullets,
                    hashtags=hashtags,
                    emojis=emojis,
                    caption=caption,
                )
                summary_text = bilingual
            
            # Extract english preview + title for list cards
            english_preview, summary_title_str = extract_english_preview_and_title(summary_text, summary_title)
            if not summary_title_str and caption:
                summary_title_str = caption[:50]
            
            # Keep normalized values in row
            row_dict["summary_title"] = summary_title_str
            row_dict["summary_text"] = summary_text
            row_dict["summary_bullets"] = bullets
            row_dict["summary_hashtags"] = hashtags
            row_dict["summary_emojis"] = emojis
            
            # ✅ FIXED: Keep the bilingual structure in summary
            row_dict["summary"] = summary_text if isinstance(summary_text, dict) else {
                "category": row_dict.get("summary_category", "General"),
                "title": summary_title_str,
                "topic": row_dict.get("summary_topic", ""),
                "english": {
                    "summary": english_preview if english_preview else "",
                    "headlines": bullets,
                    "hashtags": hashtags,
                    "emojis": emojis,
                },
                "original": {
                    "summary": "",
                    "headlines": bullets,
                    "hashtags": hashtags,
                    "emojis": emojis,
                }
            }
            
            thumb = row_dict.get("preview_thumbnail")
            row_dict["gcs_urls"] = {"preview_thumbnail": thumb if thumb else None}
            row_dict["author_name"] = row_dict.get("author_name") or "Unknown"
            row_dict.pop("preview_thumbnail", None)
            
            transformed_rows.append(row_dict)
        
        response = jsonify({
            "reels": transformed_rows,
            "page": page,
            "per_page": per_page,
            "has_more": len(transformed_rows) == per_page,
        })
        
        return add_no_cache_headers(response)
    
    except Exception as e:
        logger.error(f"Error in /saved_reels: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@reel_bp.route("/update/<process_id>", methods=["PUT"])
def update_reel(process_id):
    """Update reel folder or favorite status"""
    try:
        try:
            user_id = get_user_id_from_request()
        except ValueError:
            return jsonify({"error": "Authentication required"}), 401
        
        data = request.get_json()
        if not data:
            return jsonify({"error": "No data provided"}), 400
        
        updates = []
        params = {}
        
        if data.get("folder_id") is not None:
            updates.append("folder_id = %(folder_id)s")
            params["folder_id"] = data["folder_id"]
        
        if data.get("is_favorite") is not None:
            updates.append("is_favorite = %(is_favorite)s")
            params["is_favorite"] = data["is_favorite"]
        
        if not updates:
            return jsonify({"error": "No valid fields to update"}), 400
        
        updates.append("updated_at = NOW()")
        params["process_id"] = process_id
        params["user_id"] = user_id
        
        sql = f"""
            UPDATE reels
            SET {', '.join(updates)}
            WHERE id = %(process_id)s AND user_id = %(user_id)s
            RETURNING id, folder_id, is_favorite
        """
        
        result = fetch_all(sql, params)
        
        if not result:
            return jsonify({"error": "Reel not found"}), 404
        
        updated = dict(result[0]) if hasattr(result[0], 'keys') else result[0]._asdict()
        
        logger.info(f"✅ Updated reel {process_id}: {data}")
        
        return jsonify({
            "status": "updated",
            "id": updated.get("id"),
            "folder_id": updated.get("folder_id"),
            "is_favorite": updated.get("is_favorite"),
        })
    
    except Exception as e:
        logger.error(f"Error updating reel {process_id}: {e}", exc_info=True)
        return jsonify({"error": "Internal error"}), 500


@reel_bp.route("/reel/<process_id>", methods=["DELETE", "OPTIONS"])
def delete_reel(process_id):
    """Delete reel from DB + Google Cloud Storage"""
    if request.method == "OPTIONS":
        return "", 200
    
    try:
        try:
            user_id = get_user_id_from_request()
        except ValueError:
            return jsonify({"error": "Authentication required"}), 401
        
        # Extract shortcode from process_id
        if "--" in process_id:
            shortcode = process_id.split("--")[0]
        else:
            shortcode = process_id.split("-")[0]
        shortcode = shortcode.rstrip("-")
        
        # Fetch reel data
        reel_data = fetch_one(
            """
            SELECT id, gcs_urls, source_url
            FROM reels
            WHERE user_id = %s AND (id = %s OR id LIKE %s OR source_url LIKE %s)
            LIMIT 1
            """,
            (user_id, process_id, f"{shortcode}%", f"%{shortcode}%"),
        )
        
        if not reel_data:
            logger.warning(f"⚠️ Reel {process_id} not found for user {user_id}")
            return jsonify({"error": "Reel not found"}), 404
        
        if hasattr(reel_data, 'keys'):
            reel_dict = dict(reel_data)
        elif hasattr(reel_data, '_asdict'):
            reel_dict = reel_data._asdict()
        else:
            reel_dict = {"id": reel_data[0], "gcs_urls": reel_data[1]}
        
        actual_id = reel_dict["id"]
        logger.info(f"🗑️ Found reel to delete: {actual_id}")
        
        # Delete from GCS
        try:
            storage_client = storage.Client()
            bucket_name = os.getenv("GCS_BUCKET_NAME", "recolekt-analysis")
            bucket = storage_client.bucket(bucket_name)
            deleted_count = 0
            
            gcs_urls_raw = reel_dict.get("gcs_urls")
            folder_path = None
            gcs_urls = json_loads_maybe(gcs_urls_raw, default=gcs_urls_raw)
            
            # Extract folder path from gcs_urls
            if isinstance(gcs_urls, dict) and gcs_urls.get("preview_thumbnail"):
                sample_path = gcs_urls["preview_thumbnail"]
                if "media/IG_reels" in sample_path:
                    parts = sample_path.split("media/IG_reels/")[1].split("/")
                    if len(parts) >= 1:
                        folder_name = parts[0]
                        folder_path = f"media/IG_reels/{folder_name}/"
                        logger.info(f"📂 Extracted folder from gcs_urls: {folder_path}")
            
            if not folder_path:
                logger.warning("⚠️ No folder extracted from gcs_urls, trying fallback patterns")
                folder_paths = [
                    f"media/IG_reels/{shortcode}/",
                    f"media/IG_reels/{shortcode}-/",
                    f"media/IG_reels/{shortcode}",
                ]
            else:
                folder_paths = [folder_path]
            
            for folder in folder_paths:
                logger.info(f"🔍 Checking GCS folder: {folder}")
                blobs = list(bucket.list_blobs(prefix=folder))
                if blobs:
                    for blob in blobs:
                        blob.delete()
                        deleted_count += 1
                        logger.info(f"🗑️ Deleted GCS file: {blob.name}")
                    break
            
            if deleted_count > 0:
                logger.info(f"✅ Deleted {deleted_count} files from GCS")
            else:
                logger.warning(f"⚠️ No GCS files found for {process_id}")
        
        except Exception as gcs_error:
            logger.error(f"❌ GCS deletion error: {gcs_error}", exc_info=True)
        
        # Delete from DB
        execute("DELETE FROM reels WHERE user_id = %s AND id = %s", (user_id, actual_id))
        logger.info(f"✅ Deleted reel {actual_id} from NeonDB")
        
        return jsonify({"status": "deleted", "id": actual_id}), 200
    
    except Exception as e:
        logger.error(f"❌ Error deleting reel {process_id}: {e}", exc_info=True)
        return jsonify({"error": "Internal error", "details": str(e)}), 500


@reel_bp.route("/search", methods=["GET"])
def search_reels():
    """Search user's reels using PostgreSQL full-text search"""
    q = request.args.get("q", "").strip()
    if not q:
        return jsonify([])
    
    try:
        try:
            user_id = get_user_id_from_request()
        except ValueError:
            return jsonify({"error": "Authentication required"}), 401
        
        sql = """
            SELECT 
                id, source_url, folder_id, is_favorite, status,
                summary_category, summary_title, summary_topic, summary_text,
                summary_bullets, summary_hashtags, summary_emojis,
                content_type, recipe, workout, created_at,
                caption, author_name, is_long_video, duration, transcription,
                gcs_urls::jsonb as gcs_urls
            FROM reels
            WHERE user_id = %s
            AND search_vector @@ plainto_tsquery('simple', %s)
            ORDER BY created_at DESC
            LIMIT 200
        """
        
        rows = fetch_all(sql, (user_id, q))
        transformed = []
        
        for row in rows:
            if hasattr(row, 'keys'):
                row_dict = dict(row)
            elif hasattr(row, '_asdict'):
                row_dict = row._asdict()
            else:
                continue
            
            caption = row_dict.get("caption") or ""
            
            bullets = json_loads_maybe(row_dict.get("summary_bullets"), default=row_dict.get("summary_bullets"))
            if not isinstance(bullets, list):
                bullets = []
            
            summary_text_raw = row_dict.get("summary_text")
            summary_text = json_loads_maybe(summary_text_raw, default=summary_text_raw)
            
            hashtags = json_loads_maybe(row_dict.get("summary_hashtags"), default=row_dict.get("summary_hashtags"))
            emojis = json_loads_maybe(row_dict.get("summary_emojis"), default=row_dict.get("summary_emojis"))
            
            if not isinstance(hashtags, list):
                hashtags = []
            if not isinstance(emojis, list):
                emojis = []
            
            recipe = json_loads_maybe(row_dict.get("recipe"), default=row_dict.get("recipe"))
            workout = json_loads_maybe(row_dict.get("workout"), default=row_dict.get("workout"))
            
            # ✅ Parse transcription and extract clean text
            transcription_raw = row_dict.get("transcription")
            transcription_clean = parse_transcription(transcription_raw)
            row_dict["transcription"] = transcription_clean
            
            if isinstance(recipe, dict):
                recipe = repair_recipe_from_caption(recipe, caption)
            
            summary_title = row_dict.get("summary_title")
            
            if not isinstance(summary_text, dict):
                summary_text = build_bilingual_summary_object(
                    summary_title=summary_title,
                    summary_text=summary_text if isinstance(summary_text, str) else "",
                    bullets=bullets,
                    hashtags=hashtags,
                    emojis=emojis,
                    caption=caption,
                )
            
            english_preview, summary_title_str = extract_english_preview_and_title(summary_text, summary_title)
            if not summary_title_str and caption:
                summary_title_str = caption[:50]
            
            row_dict["summary_title"] = summary_title_str
            row_dict["summary_text"] = summary_text
            row_dict["summary_bullets"] = bullets
            row_dict["summary_hashtags"] = hashtags
            row_dict["summary_emojis"] = emojis
            
            # ✅ FIXED: Keep the bilingual structure in summary
            row_dict["summary"] = summary_text if isinstance(summary_text, dict) else {
                "category": row_dict.get("summary_category", "General"),
                "title": summary_title_str,
                "topic": row_dict.get("summary_topic", ""),
                "english": {
                    "summary": english_preview if english_preview else "",
                    "headlines": bullets,
                    "hashtags": hashtags,
                    "emojis": emojis,
                },
                "original": {
                    "summary": "",
                    "headlines": bullets,
                    "hashtags": hashtags,
                    "emojis": emojis,
                }
            }
            
            row_dict["content_type"] = row_dict.get("content_type", "generic")
            row_dict["recipe"] = recipe
            row_dict["workout"] = workout
            
            transformed.append(row_dict)
        
        return jsonify(transformed)
    
    except Exception as e:
        logger.error(f"Error in /search: {e}", exc_info=True)
        return jsonify({"error": "Internal error"}), 500


@reel_bp.route("/cleanup_stuck", methods=["POST"])
def cleanup_stuck_videos():
    """Delete 'processing' videos older than 30 minutes from the DB"""
    try:
        user_id = get_user_id_from_request()
    except ValueError:
        return jsonify({"error": "Authentication required"}), 401
    
    cutoff = datetime.utcnow() - timedelta(minutes=30)
    
    sql = """
        DELETE FROM reels
        WHERE user_id = %s AND status = 'processing' AND created_at < %s
        RETURNING id
    """
    
    result = fetch_all(sql, (user_id, cutoff))
    deleted_ids = [row["id"] if hasattr(row, 'keys') else row[0] for row in result] if result else []
    
    logger.info(f"🧹 Cleaned up {len(deleted_ids)} stuck videos for user {user_id}")
    
    return jsonify({
        "status": "cleaned",
        "deleted": len(deleted_ids),
        "ids": deleted_ids
    })
