import os
import json
import glob
import tempfile
import logging
import threading
import re
import stripe
from datetime import timezone
from datetime import datetime, timedelta
from flask import Blueprint, request, jsonify, session
from werkzeug.utils import secure_filename
from google.cloud import storage

from fetcher_api.adapters.db import execute, fetch_all, fetch_one
from fetcher_api.adapters.gcs_client import gcs_client
from fetcher_api.adapters.instagram_client import instagram_client
from fetcher_api.utils.files import allowed_file, save_uploaded_file, cleanup_file
from fetcher_api.utils.timestamps import get_timestamp, get_unique_id
from fetcher_api.services.video_analysis import (
    generate_reel_thumbnail,
    download_instagram_video,
    download_instagram_thumbnail,
)
from fetcher_api.api.helpers.processing import background_process
from fetcher_api.api.helpers.normalizers import get_video_duration
from fetcher_api.services.db_insert import check_duplicate_reel
from fetcher_api.services.storage import generate_gcs_paths

logger = logging.getLogger("api")

api_bp = Blueprint("api", __name__)

# Stripe config
stripe.api_key = os.getenv("STRIPE_SECRET_KEY", "")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "")
STRIPE_PRICE_PRO_MONTHLY = os.getenv("STRIPE_PRICE_PRO_MONTHLY", "")
FRONTEND_BASE_URL = os.getenv("FRONTEND_BASE_URL", "http://localhost:3000")

TEMP_DIR_BASE = os.path.join(tempfile.gettempdir(), "recolekt_processing")
os.makedirs(TEMP_DIR_BASE, exist_ok=True)


def _json_loads_maybe(v, default=None):
    """
    If v is a JSON string, parse it.
    If v is already dict/list, return it.
    Otherwise return default.
    """
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


def _ensure_dict(v):
    return v if isinstance(v, dict) else {}


def _ensure_list(v):
    return v if isinstance(v, list) else []


def _coerce_title_to_str(current_title):
    """
    summary_title should be text, but legacy rows can contain dict/json.
    Return a safe string.
    """
    if current_title is None:
        return ""
    if isinstance(current_title, str):
        return current_title.strip()

    # If someone accidentally stored bilingual JSON in summary_title
    if isinstance(current_title, dict):
        eng = current_title.get("english")
        if isinstance(eng, dict):
            t = eng.get("title")
            if isinstance(t, str):
                return t.strip()
        t = current_title.get("title")
        if isinstance(t, str):
            return t.strip()
        return ""

    try:
        return str(current_title).strip()
    except Exception:
        return ""


def _extract_english_preview_and_title(summary_text, current_title=None):
    """
    Handles various summary_text shapes:
    - dict with {"english": {...}, "original": {...}}
    - dict with {"english": "string summary", ...}
    - dict with {"title": "...", "summary": "..."}
    - plain string

    Returns: (english_preview_str, title_str)
    """
    title = _coerce_title_to_str(current_title)
    english_preview = ""

    if isinstance(summary_text, str):
        english_preview = summary_text.strip()
        return english_preview, title

    if not isinstance(summary_text, dict):
        return english_preview, title

    eng = summary_text.get("english", None)

    if isinstance(eng, dict):
        english_preview = (eng.get("summary") or eng.get("text") or "").strip()
        if not title:
            t = eng.get("title")
            if isinstance(t, str):
                title = t.strip()
        return english_preview, title

    if isinstance(eng, str):
        english_preview = eng.strip()
        if not title:
            maybe_title = summary_text.get("title")
            if isinstance(maybe_title, str):
                title = maybe_title.strip()
        return english_preview, title

    english_preview = (summary_text.get("summary") or summary_text.get("text") or "").strip()
    if not title:
        maybe_title = summary_text.get("title")
        if isinstance(maybe_title, str):
            title = maybe_title.strip()

    return english_preview, title


def _first_nonempty_line(text: str) -> str:
    if not isinstance(text, str):
        return ""
    for ln in text.splitlines():
        s = ln.strip()
        if s:
            return s
    return ""


def _strip_hashtags_line(line: str) -> str:
    if not isinstance(line, str):
        return ""
    # Keep text before hashtags section markers
    return line.strip()


def _extract_original_title_from_caption(caption: str) -> str:
    """
    Use first non-empty caption line as a human title candidate.
    """
    line = _first_nonempty_line(caption)
    if not line:
        return ""
    # Avoid CTA-only lines a bit
    low = line.lower()
    if low.startswith("commente") or low.startswith("abonne") or low.startswith("comment"):
        return ""
    return line[:90].strip()


def _extract_intro_from_caption(caption: str, max_chars: int = 360) -> str:
    """
    Take the intro paragraph before ingredients/steps/hashtags as "original summary" candidate.
    """
    if not isinstance(caption, str) or not caption.strip():
        return ""
    stop_markers = [
        "ingrédients", "ingredients", "#", "1.", "1)", "étape", "etape"
    ]
    out_lines = []
    for ln in caption.splitlines():
        s = ln.strip()
        if not s:
            # keep one blank to separate paragraphs
            if out_lines and out_lines[-1] != "":
                out_lines.append("")
            continue
        low = s.lower()
        if any(m in low for m in stop_markers):
            break
        out_lines.append(s)

    text = "\n".join(out_lines).strip()
    if len(text) > max_chars:
        text = text[:max_chars].rsplit(" ", 1)[0].strip()
    return text


def _extract_ingredients_from_caption(caption: str):
    """
    Parse ingredient-looking lines after an 'Ingrédients' marker until steps/hashtags.
    Returns list of {item,name,quantity,unit,emoji}.
    """
    if not isinstance(caption, str) or not caption.strip():
        return []

    lines = [ln.strip() for ln in caption.splitlines()]
    if not lines:
        return []

    start = None
    for i, ln in enumerate(lines):
        low = ln.lower()
        if "ingrédient" in low or "ingredient" in low:
            start = i + 1
            break
    if start is None:
        return []

    ingredients = []
    qty_line_re = re.compile(r"^\s*(\d+([.,]\d+)?|\d+/\d+)\s+(.+)$")
    # Stop if we hit steps, hashtags, or obvious outro
    for ln in lines[start:]:
        if not ln:
            continue
        low = ln.lower()
        if low.startswith("#"):
            break
        if re.match(r"^\s*\d+\s*[\.\)]\s*", ln):
            break
        if low.startswith("abonne") or low.startswith("commente") or low.startswith("réussite") or low.startswith("reussite"):
            break

        # Keep only quantity-leading lines (matches your caption structure)
        if qty_line_re.match(ln):
            ingredients.append(
                {
                    "item": ln,
                    "name": ln,
                    "quantity": "",
                    "unit": "",
                    "emoji": "",
                }
            )
        # Also allow single-word items like "Sucre perlé"
        elif len(ln.split()) <= 4 and not ln.endswith(":") and not low.startswith("ingr"):
            ingredients.append(
                {
                    "item": ln,
                    "name": ln,
                    "quantity": "",
                    "unit": "",
                    "emoji": "",
                }
            )

    return ingredients


def _extract_numbered_steps_from_caption(caption: str):
    """
    Parse steps like:
    1. ...
    2. ...
    Keeps multiline paragraphs until next step number.
    Returns list[str]
    """
    if not isinstance(caption, str) or not caption.strip():
        return []

    lines = caption.splitlines()
    step_re = re.compile(r"^\s*(\d+)\s*[\.\)]\s*(.*)\s*$")

    steps = []
    current = None

    for raw in lines:
        ln = raw.strip()
        if not ln:
            # paragraph separation inside a step
            if current and not current.endswith("\n"):
                current += "\n"
            continue

        if ln.startswith("#"):
            break

        m = step_re.match(ln)
        if m:
            # finalize previous step
            if current:
                steps.append(current.strip())
            current = (m.group(2) or "").strip()
            continue

        # continuation line
        if current is not None:
            # Avoid adding big CTA blocks at end
            low = ln.lower()
            if low.startswith("abonne") or low.startswith("commente"):
                continue
            if current.endswith("\n"):
                current += ln
            else:
                current += " " + ln

    if current:
        steps.append(current.strip())

    # sanity: remove ultra-short junk
    steps = [s for s in steps if isinstance(s, str) and len(s.strip()) >= 8]
    return steps


def _instructions_look_unknown(instructions):
    """
    Detect the exact failure mode: translated into 'unknown' language => lots of 'unknown'.
    """
    if not isinstance(instructions, list) or not instructions:
        return True
    blob = " ".join([str(x) for x in instructions]).lower()
    # If a significant portion is "unknown", treat as broken
    return blob.count("unknown") >= 6


def _repair_recipe_from_caption(recipe_obj, caption: str):
    """
    Mutates recipe_obj in-place:
    - If original.instructions are missing/unknown, replace with numbered steps from caption.
    - If original.ingredients are missing, replace with ingredients parsed from caption.
    - If original.title looks junk, prefer first caption line.
    """
    if not isinstance(recipe_obj, dict):
        return recipe_obj

    recipe_obj.setdefault("english", {})
    recipe_obj.setdefault("original", {})

    eng = recipe_obj.get("english")
    orig = recipe_obj.get("original")
    if not isinstance(eng, dict):
        eng = {}
        recipe_obj["english"] = eng
    if not isinstance(orig, dict):
        orig = {}
        recipe_obj["original"] = orig

    # Fix instructions
    orig_instructions = orig.get("instructions")
    if _instructions_look_unknown(orig_instructions):
        steps = _extract_numbered_steps_from_caption(caption)
        if steps:
            orig["instructions"] = steps

    # Fix ingredients (prefer caption in original language if available)
    orig_ingredients = orig.get("ingredients")
    if not isinstance(orig_ingredients, list) or not orig_ingredients:
        ings = _extract_ingredients_from_caption(caption)
        if ings:
            orig["ingredients"] = ings

    # Fix original title (when it's empty or clearly nonsense)
    orig_title = orig.get("title")
    if not isinstance(orig_title, str):
        orig_title = ""
    orig_title = orig_title.strip()

    caption_title = _extract_original_title_from_caption(caption)
    # Replace if empty OR looks like generic “mystery” junk
    if (not orig_title) or ("mystery" in orig_title.lower()) or (orig_title.lower() == "untitled"):
        if caption_title:
            orig["title"] = caption_title

    return recipe_obj


def _build_bilingual_summary_object(summary_title, summary_text, bullets, hashtags, emojis, caption: str):
    """
    Build the bilingual summary object your UI expects:
    { english: {title, summary, headlines, hashtags, emojis}, original: {...} }

    If we don't have a true original-language summary, we at least provide a stable structure,
    and we use caption intro/title as "original" best-effort.
    """
    title_str = _coerce_title_to_str(summary_title)
    summary_str = summary_text.strip() if isinstance(summary_text, str) else ""
    bullets_list = bullets if isinstance(bullets, list) else []
    hashtags_list = hashtags if isinstance(hashtags, list) else []
    emojis_list = emojis if isinstance(emojis, list) else []

    orig_title = _extract_original_title_from_caption(caption) or title_str
    orig_summary = _extract_intro_from_caption(caption) or summary_str

    return {
        "english": {
            "title": title_str,
            "summary": summary_str,
            "headlines": bullets_list,
            "hashtags": hashtags_list,
            "emojis": emojis_list,
        },
        "original": {
            "title": orig_title,
            "summary": orig_summary,
            "headlines": bullets_list,
            "hashtags": hashtags_list,
            "emojis": emojis_list,
        },
    }


# Auth Helpers
def get_user_id_from_request():
    user_id = session.get("user_id")
    if not user_id:
        raise ValueError("User not authenticated")
    return user_id


def ensure_billing_customer(user_id: str):
    execute(
        "INSERT INTO billing_customers (user_id) VALUES (%s) ON CONFLICT (user_id) DO NOTHING;",
        (user_id,),
    )


def get_plan(user_id: str) -> str:
    ensure_billing_customer(user_id)
    row = fetch_one("SELECT plan FROM user_entitlements WHERE user_id=%s;", (user_id,))
    return (row or {}).get("plan", "free")


def count_saves(user_id: str) -> int:
    row = fetch_one("SELECT COUNT(*)::int AS c FROM reels WHERE user_id=%s;", (user_id,))
    return int((row or {}).get("c", 0))


def add_no_cache_headers(response):
    """Disable caching for dynamic lists"""
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response


# ---------------------------------------------------------
# SUMMARIZE (FAST RESPONSE)
# ---------------------------------------------------------

@api_bp.route("/summarize", methods=["POST"])
def summarize():
    logger.info("📥 /summarize called")

    try:
        user_id = get_user_id_from_request()
    except ValueError:
        return jsonify({"error": "Authentication required"}), 401

    save_to_gcs = (request.form.get("save_to_gcs", "true").lower() == "true" and gcs_client.available)
    url = request.form.get("url")
    file = request.files.get("file")

    if not file and not url:
        return jsonify({"error": "Provide either file or URL"}), 400

    temp_dir = tempfile.mkdtemp(dir=TEMP_DIR_BASE)

    video_path = None
    caption = ""
    author_name = ""
    post = None

    result = {"process_id": "", "summary": "", "caption": ""}

    try:
        if file and file.filename:
            filename = secure_filename(file.filename)
            video_path = save_uploaded_file(file, temp_dir)
            shortcode = get_unique_id(filename.rstrip())
            result["process_id"] = f"{shortcode}--{get_timestamp()}--{get_unique_id(url)}"
            caption = request.form.get("caption", "") or ""
        else:
            shortcode = instagram_client.extract_shortcode(url) or "unknown"
            shortcode = shortcode.rstrip()

            result["process_id"] = f"{shortcode}--{get_timestamp()}--{get_unique_id(url)}"
            video_path = os.path.join(temp_dir, f"{result['process_id']}.mp4")

            try:
                logger.info(f"⚡️ Fetching metadata for {shortcode}...")
                post = instagram_client.get_post(shortcode)
                if post:
                    caption = post.caption or ""
                    author_name = post.owner_username or ""
            except Exception as e:
                logger.warning(f"⚠️ Metadata fetch failed: {e}")

        gcs_paths = generate_gcs_paths(shortcode, "IG")
        result["gcs_paths"] = gcs_paths

        preview_url = None
        try:
            thumb_path = os.path.join(temp_dir, f"{shortcode}_thumbnail.jpeg")
            thumbnail_success = False

            if post:
                thumbnail_success = download_instagram_thumbnail(post, thumb_path)

            if not thumbnail_success and video_path and os.path.exists(video_path):
                generate_reel_thumbnail(video_path, thumb_path, 0.0)

            if os.path.exists(thumb_path) and save_to_gcs:
                preview_url = gcs_client.upload_file(
                    thumb_path,
                    gcs_client.analysis_bucket_name,
                    gcs_paths["preview_thumbnail"],
                )
                cleanup_file(thumb_path)

            result["gcs_urls"] = {"preview_thumbnail": preview_url, "video": None}
        except Exception as e:
            logger.warning(f"Thumbnail generation failed: {e}")

        gcs_urls_json = json.dumps(result.get("gcs_urls", {}))

        execute(
            """
            INSERT INTO reels (
                id, user_id, source_url, status, folder_id,
                caption, author_name, summary_title,
                is_long_video, gcs_urls, created_at
            )
            VALUES (%s, %s, %s, 'processing', 'default', %s, %s, NULL, FALSE, %s, NOW())
            ON CONFLICT (id) DO UPDATE SET
                status = 'processing',
                summary_title = NULL,
                summary_text = NULL,
                summary_bullets = NULL,
                updated_at = NOW();
            """,
            (result["process_id"], user_id, url, caption, author_name, gcs_urls_json),
        )

        logger.info(f"✅ Fast response ready for {result['process_id']}")

    except Exception as e:
        logger.error(f"Error in /summarize: {e}", exc_info=True)
        return jsonify({"error": "Internal error"}), 500

    threading.Thread(
        target=background_process,
        args=(result, video_path, temp_dir, shortcode, caption, url, save_to_gcs, author_name, None, user_id),
        daemon=True,
    ).start()

    return jsonify(
        {
            "status": "preview_ready" if preview_url else "processing",
            "reel_id": result["process_id"],
            "preview_url": preview_url,
            "message": "Processing started",
        }
    )


# ---------------------------------------------------------
# LIST SAVED REELS
# ---------------------------------------------------------

@api_bp.route("/saved_reels", methods=["GET"])
def list_saved_reels():
    try:
        try:
            user_id = get_user_id_from_request()
        except ValueError:
            return jsonify({"error": "Authentication required"}), 401

        page = int(request.args.get("page", 1))
        per_page = int(request.args.get("per_page", 30))
        offset = (page - 1) * per_page

        sql = """
        SELECT id, source_url, folder_id, is_favorite, status,
               summary_category, summary_title, summary_topic,
               summary_text, summary_bullets,
               summary_hashtags, summary_emojis,
               content_type, created_at, caption, author_name,
               is_long_video, duration, recipe, workout,
               (gcs_urls::jsonb->'preview_thumbnail') as preview_thumbnail
        FROM reels
        WHERE user_id = %s
        ORDER BY created_at DESC
        LIMIT %s OFFSET %s;
        """

        db_rows = fetch_all(sql, (user_id, per_page, offset))
        transformed_rows = []

        for row in db_rows:
            if hasattr(row, "keys"):
                row_dict = dict(row)
            elif hasattr(row, "_asdict"):
                row_dict = row._asdict()
            else:
                continue

            caption = row_dict.get("caption") or ""

            # Parse recipe/workout JSON if string
            row_dict["recipe"] = _json_loads_maybe(row_dict.get("recipe"), default=row_dict.get("recipe"))
            row_dict["workout"] = _json_loads_maybe(row_dict.get("workout"), default=row_dict.get("workout"))

            # Repair recipe bilingual blocks from caption when needed
            if isinstance(row_dict.get("recipe"), dict):
                row_dict["recipe"] = _repair_recipe_from_caption(row_dict["recipe"], caption)

            # Normalize JSON-ish DB columns
            summary_text_raw = row_dict.get("summary_text")
            summary_text = _json_loads_maybe(summary_text_raw, default=summary_text_raw)

            bullets = _json_loads_maybe(row_dict.get("summary_bullets"), default=row_dict.get("summary_bullets"))
            hashtags = _json_loads_maybe(row_dict.get("summary_hashtags"), default=row_dict.get("summary_hashtags"))
            emojis = _json_loads_maybe(row_dict.get("summary_emojis"), default=row_dict.get("summary_emojis"))

            if not isinstance(bullets, list):
                bullets = []
            if not isinstance(hashtags, list):
                hashtags = []
            if not isinstance(emojis, list):
                emojis = []

            summary_title = row_dict.get("summary_title")

            # If summary_text is already bilingual dict, keep it; else build stable bilingual shape
            if not isinstance(summary_text, dict):
                bilingual = _build_bilingual_summary_object(
                    summary_title=summary_title,
                    summary_text=summary_text if isinstance(summary_text, str) else "",
                    bullets=bullets,
                    hashtags=hashtags,
                    emojis=emojis,
                    caption=caption,
                )
                summary_text = bilingual

            # Extract english preview & title (for list cards)
            english_preview, summary_title_str = _extract_english_preview_and_title(summary_text, summary_title)

            if not summary_title_str and caption:
                summary_title_str = caption[:50]

            # Keep normalized values in row
            row_dict["summary_title"] = summary_title_str
            row_dict["summary_text"] = summary_text
            row_dict["summary_bullets"] = bullets
            row_dict["summary_hashtags"] = hashtags
            row_dict["summary_emojis"] = emojis

            # Backward compatible summary wrapper
            row_dict["summary"] = {
                "category": row_dict.get("summary_category", "General"),
                "title": summary_title_str,
                "topic": row_dict.get("summary_topic", ""),
                "summary": english_preview if english_preview else "",
                "bullets": bullets,
                "hashtags": hashtags,
                "emojis": emojis,
                "bilingual": summary_text if isinstance(summary_text, dict) else None,
            }

            thumb = row_dict.get("preview_thumbnail")
            row_dict["gcs_urls"] = {"preview_thumbnail": thumb} if thumb else {}

            row_dict["author_name"] = row_dict.get("author_name") or "Unknown"
            row_dict.pop("preview_thumbnail", None)

            transformed_rows.append(row_dict)

        response = jsonify(
            {
                "reels": transformed_rows,
                "page": page,
                "per_page": per_page,
                "has_more": len(transformed_rows) == per_page,
            }
        )
        return add_no_cache_headers(response)

    except Exception as e:
        logger.error(f"Error in /saved_reels: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


# ---------------------------------------------------------
# UPDATE REEL
# ---------------------------------------------------------

@api_bp.route("/update_reel/<process_id>", methods=["PUT"])
def update_reel(process_id):
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
        UPDATE reels SET {', '.join(updates)}
        WHERE id = %(process_id)s AND user_id = %(user_id)s
        RETURNING id, folder_id, is_favorite;
        """

        result = fetch_all(sql, params)

        if not result:
            return jsonify({"error": "Reel not found"}), 404

        updated = dict(result[0]) if hasattr(result[0], "keys") else result[0]._asdict()

        logger.info(f"✅ Updated reel {process_id}: {data}")

        return jsonify(
            {
                "status": "updated",
                "id": updated.get("id"),
                "folder_id": updated.get("folder_id"),
                "is_favorite": updated.get("is_favorite"),
            }
        )

    except Exception as e:
        logger.error(f"Error updating reel {process_id}: {e}", exc_info=True)
        return jsonify({"error": "Internal error"}), 500


# ---------------------------------------------------------
# DELETE REEL
# ---------------------------------------------------------

@api_bp.route("/reel/<process_id>", methods=["DELETE", "OPTIONS"])
def delete_reel(process_id):
    """Delete reel from DB + Google Cloud Storage"""
    if request.method == "OPTIONS":
        return "", 200

    try:
        try:
            user_id = get_user_id_from_request()
        except ValueError:
            return jsonify({"error": "Authentication required"}), 401

        if "--" in process_id:
            shortcode = process_id.split("--")[0]
        else:
            shortcode = process_id.split("_")[0]
        shortcode = shortcode.rstrip("-_")

        reel_data = fetch_one(
            """
            SELECT id, gcs_urls, source_url FROM reels
            WHERE user_id = %s
            AND (id = %s OR id LIKE %s OR source_url LIKE %s)
            LIMIT 1;
            """,
            (user_id, process_id, f"{shortcode}%", f"%{shortcode}%"),
        )

        if not reel_data:
            logger.warning(f"⚠️ Reel {process_id} not found for user {user_id}")
            return jsonify({"error": "Reel not found"}), 404

        if hasattr(reel_data, "keys"):
            reel_dict = dict(reel_data)
        elif hasattr(reel_data, "_asdict"):
            reel_dict = reel_data._asdict()
        else:
            reel_dict = {"id": reel_data[0], "gcs_urls": reel_data[1]}

        actual_id = reel_dict["id"]
        logger.info(f"🗑️ Found reel to delete: {actual_id}")

        try:
            storage_client = storage.Client()
            bucket_name = os.getenv("GCS_BUCKET_NAME", "recolekt-analysis")
            bucket = storage_client.bucket(bucket_name)

            deleted_count = 0
            gcs_urls_raw = reel_dict.get("gcs_urls")
            folder_path = None

            gcs_urls = _json_loads_maybe(gcs_urls_raw, default=gcs_urls_raw)

            if isinstance(gcs_urls, dict) and gcs_urls.get("preview_thumbnail"):
                sample_path = gcs_urls["preview_thumbnail"]
                if "/media/IG_reels/" in sample_path:
                    parts = sample_path.split("/media/IG_reels/")[1].split("/")
                    if len(parts) >= 1:
                        folder_name = parts[0]
                        folder_path = f"media/IG_reels/{folder_name}/"
                        logger.info(f"🔍 Extracted folder from gcs_urls: {folder_path}")

            if not folder_path:
                logger.warning("⚠️ No folder extracted from gcs_urls, trying fallback patterns")
                folder_paths = [
                    f"media/IG_reels/{shortcode}/",
                    f"media/IG_reels/{shortcode}-/",
                    f"media/IG_reels/{shortcode}_/",
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
                        logger.info(f"  ✅ Deleted GCS file: {blob.name}")
                    break

            if deleted_count > 0:
                logger.info(f"🗑️ Deleted {deleted_count} files from GCS")
            else:
                logger.warning(f"⚠️ No GCS files found for {process_id}")

        except Exception as gcs_error:
            logger.error(f"❌ GCS deletion error: {gcs_error}", exc_info=True)

        execute("DELETE FROM reels WHERE user_id = %s AND id = %s;", (user_id, actual_id))
        logger.info(f"✅ Deleted reel {actual_id} from NeonDB")

        return jsonify({"status": "deleted", "id": actual_id}), 200

    except Exception as e:
        logger.error(f"❌ Error deleting reel {process_id}: {e}", exc_info=True)
        return jsonify({"error": "Internal error", "details": str(e)}), 500


# ---------------------------------------------------------
# CLEANUP STUCK VIDEOS
# ---------------------------------------------------------

@api_bp.route("/cleanup_stuck", methods=["POST"])
def cleanup_stuck_videos():
    """Delete processing videos older than 30 minutes from the DB"""
    try:
        user_id = get_user_id_from_request()
    except ValueError:
        return jsonify({"error": "Authentication required"}), 401

    cutoff = datetime.utcnow() - timedelta(minutes=30)

    sql = """
    DELETE FROM reels
    WHERE user_id = %s
      AND status = 'processing'
      AND created_at < %s
    RETURNING id;
    """

    result = fetch_all(sql, (user_id, cutoff))
    deleted_ids = (
        [row["id"] if hasattr(row, "keys") else row[0] for row in result] if result else []
    )

    logger.info(f"🧹 Cleaned up {len(deleted_ids)} stuck videos for user {user_id}")

    return jsonify({"status": "cleaned", "deleted": len(deleted_ids), "ids": deleted_ids})


# ---------------------------------------------------------
# ADMIN: CLEANUP DUPLICATE ENTRIES
# ---------------------------------------------------------

@api_bp.route("/admin/cleanup_duplicates", methods=["POST"])
def cleanup_duplicates():
    """Remove duplicate entries by source_url"""
    try:
        user_id = get_user_id_from_request()

        sql = """
        DELETE FROM reels
        WHERE id IN (
            SELECT id FROM (
                SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id, source_url ORDER BY created_at DESC) as rn
                FROM reels
                WHERE user_id = %s
            ) t
            WHERE rn > 1
        )
        RETURNING id;
        """

        deleted = fetch_all(sql, (user_id,))
        deleted_ids = [row[0] if not hasattr(row, "keys") else row["id"] for row in deleted]

        logger.info(f"🧹 Cleaned {len(deleted_ids)} duplicate entries for user {user_id}")

        return jsonify({"cleaned": len(deleted_ids), "ids": deleted_ids})

    except Exception as e:
        logger.error(f"Cleanup failed: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


# ---------------------------------------------------------
# USER PREFERENCES
# ---------------------------------------------------------

@api_bp.route("/user/preferences", methods=["PATCH"])
def update_user_preferences():
    try:
        user_id = get_user_id_from_request()
        data = request.get_json()

        if "language" in data:
            execute("UPDATE users SET language = %s WHERE id = %s", (data["language"], user_id))

        if "darkMode" in data:
            execute("UPDATE users SET dark_mode = %s WHERE id = %s", (data["darkMode"], user_id))

        return jsonify({"success": True})
    except Exception as e:
        logger.error(f"Error saving prefs: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


# ---------------------------------------------------------
# SEARCH REELS
# ---------------------------------------------------------

@api_bp.route("/search", methods=["GET"])
def search_reels():
    q = request.args.get("q", "").strip()
    if not q:
        return jsonify([])

    try:
        try:
            user_id = get_user_id_from_request()
        except ValueError:
            return jsonify({"error": "Authentication required"}), 401

        sql = """
        SELECT id, source_url, folder_id, is_favorite, status,
               summary_category, summary_title, summary_topic, summary_text,
               summary_bullets, summary_hashtags, summary_emojis,
               content_type, recipe, workout, created_at, caption, author_name,
               is_long_video, duration, gcs_urls::jsonb as gcs_urls
        FROM reels
        WHERE user_id = %s
          AND search_vector @@ plainto_tsquery('simple', %s)
        ORDER BY created_at DESC
        LIMIT 200;
        """

        rows = fetch_all(sql, (user_id, q))
        transformed = []

        for row in rows:
            if hasattr(row, "keys"):
                row_dict = dict(row)
            elif hasattr(row, "_asdict"):
                row_dict = row._asdict()
            else:
                continue

            caption = row_dict.get("caption") or ""

            bullets = _json_loads_maybe(row_dict.get("summary_bullets"), default=row_dict.get("summary_bullets"))
            if not isinstance(bullets, list):
                bullets = []

            summary_text_raw = row_dict.get("summary_text")
            summary_text = _json_loads_maybe(summary_text_raw, default=summary_text_raw)

            hashtags = _json_loads_maybe(row_dict.get("summary_hashtags"), default=row_dict.get("summary_hashtags"))
            emojis = _json_loads_maybe(row_dict.get("summary_emojis"), default=row_dict.get("summary_emojis"))
            if not isinstance(hashtags, list):
                hashtags = []
            if not isinstance(emojis, list):
                emojis = []

            recipe = _json_loads_maybe(row_dict.get("recipe"), default=row_dict.get("recipe"))
            workout = _json_loads_maybe(row_dict.get("workout"), default=row_dict.get("workout"))

            if isinstance(recipe, dict):
                recipe = _repair_recipe_from_caption(recipe, caption)

            summary_title = row_dict.get("summary_title")

            if not isinstance(summary_text, dict):
                summary_text = _build_bilingual_summary_object(
                    summary_title=summary_title,
                    summary_text=summary_text if isinstance(summary_text, str) else "",
                    bullets=bullets,
                    hashtags=hashtags,
                    emojis=emojis,
                    caption=caption,
                )

            english_preview, summary_title_str = _extract_english_preview_and_title(summary_text, summary_title)
            if not summary_title_str and caption:
                summary_title_str = caption[:50]

            row_dict["summary_title"] = summary_title_str
            row_dict["summary_text"] = summary_text
            row_dict["summary_bullets"] = bullets
            row_dict["summary_hashtags"] = hashtags
            row_dict["summary_emojis"] = emojis

            row_dict["summary"] = {
                "category": row_dict.get("summary_category", "General"),
                "title": summary_title_str,
                "topic": row_dict.get("summary_topic", ""),
                "summary": english_preview if english_preview else "",
                "hashtags": hashtags,
                "bullets": bullets,
                "emojis": emojis,
                "bilingual": summary_text if isinstance(summary_text, dict) else None,
            }

            row_dict["content_type"] = row_dict.get("content_type", "generic")
            row_dict["recipe"] = recipe
            row_dict["workout"] = workout

            transformed.append(row_dict)

        return jsonify(transformed)

    except Exception as e:
        logger.error(f"Error in /search: {e}", exc_info=True)
        return jsonify({"error": "Internal error"}), 500


# ---------------------------------------------------------
# ROOT
# ---------------------------------------------------------

@api_bp.route("/", methods=["GET"])
def root():
    return jsonify({"ok": True, "message": "Reel API active"})


# ---------------------------------------------------------
# BILLING ROUTES (Stripe)
# ---------------------------------------------------------

@api_bp.route("/billing/create-checkout-session", methods=["POST"])
def billing_create_checkout_session():
    try:
        user_id = get_user_id_from_request()
    except ValueError:
        return jsonify({"error": "Authentication required"}), 401

    ensure_billing_customer(user_id)

    if not stripe.api_key:
        return jsonify({"error": "Missing STRIPE_SECRET_KEY"}), 500

    if not STRIPE_PRICE_PRO_MONTHLY:
        return jsonify({"error": "Missing STRIPE_PRICE_PRO_MONTHLY"}), 500

    session_obj = stripe.checkout.Session.create(
        mode="subscription",
        line_items=[{"price": STRIPE_PRICE_PRO_MONTHLY, "quantity": 1}],
        success_url=f"{FRONTEND_BASE_URL}/billing/success",
        cancel_url=f"{FRONTEND_BASE_URL}/billing/cancel",
        client_reference_id=user_id,
        subscription_data={"trial_period_days": 7},
    )

    return jsonify({"url": session_obj.url})


@api_bp.route("/billing/webhook", methods=["POST"])
def billing_webhook():
    if not STRIPE_WEBHOOK_SECRET:
        return jsonify({"error": "Missing STRIPE_WEBHOOK_SECRET"}), 500

    payload = request.get_data()
    sig_header = request.headers.get("Stripe-Signature", "")

    try:
        event = stripe.Webhook.construct_event(payload, sig_header, STRIPE_WEBHOOK_SECRET)
    except Exception as e:
        logger.error(f"Stripe webhook signature verification failed: {e}", exc_info=True)
        return jsonify({"error": "invalid signature"}), 400

    etype = event.get("type")
    obj = (event.get("data") or {}).get("object") or {}

    def ts(unix_seconds):
        if not unix_seconds:
            return None
        return datetime.fromtimestamp(int(unix_seconds), tz=timezone.utc)

    if etype == "checkout.session.completed":
        user_id = obj.get("client_reference_id")
        customer_id = obj.get("customer")
        subscription_id = obj.get("subscription")

        if user_id:
            ensure_billing_customer(user_id)
            if customer_id:
                execute(
                    "UPDATE billing_customers SET stripe_customer_id=%s, updated_at=now() WHERE user_id=%s;",
                    (customer_id, user_id),
                )

            if subscription_id:
                sub = stripe.Subscription.retrieve(subscription_id)
                execute(
                    """
                    INSERT INTO subscriptions (user_id, stripe_subscription_id, status, plan, trial_ends_at, current_period_end, cancel_at_period_end)
                    VALUES (%s,%s,%s,'pro',%s,%s,%s)
                    ON CONFLICT (stripe_subscription_id) DO UPDATE
                    SET status=EXCLUDED.status,
                        trial_ends_at=EXCLUDED.trial_ends_at,
                        current_period_end=EXCLUDED.current_period_end,
                        cancel_at_period_end=EXCLUDED.cancel_at_period_end,
                        updated_at=now();
                    """,
                    (
                        user_id,
                        sub.get("id"),
                        sub.get("status"),
                        ts(sub.get("trial_end")),
                        ts(sub.get("current_period_end")),
                        bool(sub.get("cancel_at_period_end", False)),
                    ),
                )

    if etype in ("customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"):
        subscription_id = obj.get("id")
        customer_id = obj.get("customer")

        row = fetch_one("SELECT user_id FROM billing_customers WHERE stripe_customer_id=%s;", (customer_id,))
        user_id = (row or {}).get("user_id")

        if user_id:
            execute(
                """
                INSERT INTO subscriptions (user_id, stripe_subscription_id, status, plan, trial_ends_at, current_period_end, cancel_at_period_end)
                VALUES (%s,%s,%s,'pro',%s,%s,%s)
                ON CONFLICT (stripe_subscription_id) DO UPDATE
                SET status=EXCLUDED.status,
                    trial_ends_at=EXCLUDED.trial_ends_at,
                    current_period_end=EXCLUDED.current_period_end,
                    cancel_at_period_end=EXCLUDED.cancel_at_period_end,
                    updated_at=now();
                """,
                (
                    user_id,
                    subscription_id,
                    obj.get("status"),
                    ts(obj.get("trial_end")),
                    ts(obj.get("current_period_end")),
                    bool(obj.get("cancel_at_period_end", False)),
                ),
            )

    return jsonify({"received": True})
