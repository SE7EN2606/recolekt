# fetcher_api/api/helpers/normalizers.py

"""Data normalization helpers"""
import json
import subprocess
import logging
import os

logger = logging.getLogger("api")


# -------------------------
# Shared JSON helpers
# -------------------------
def json_loads_maybe(v, default=None):
    """
    If v is a JSON string -> json.loads(v).
    If v is already dict/list -> return as-is.
    Else -> default.
    """
    if default is None:
        default = {}
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


def ensure_dict(v):
    return v if isinstance(v, dict) else {}


def ensure_list(v):
    return v if isinstance(v, list) else []


def json_stringify(v):
    """
    Ensure we store JSON as a string for Postgres JSON/JSONB columns when needed.
    - None -> None
    - str -> str (assumed already JSON text)
    - dict/list -> json.dumps(...)
    """
    if v is None:
        return None
    if isinstance(v, str):
        return v
    try:
        return json.dumps(v, ensure_ascii=False)
    except Exception:
        # last resort: stringify
        return json.dumps(str(v), ensure_ascii=False)


def get_video_duration(video_path):
    """Extract video duration using ffprobe with improved error handling"""
    try:
        # ✅ Check if file exists first
        if not os.path.exists(video_path):
            logger.error(f"❌ Video file not found: {video_path}")
            return None, 0

        # ✅ Check if file is not empty
        if os.path.getsize(video_path) == 0:
            logger.error(f"❌ Video file is empty: {video_path}")
            return None, 0

        cmd = ['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'json', video_path]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)

        if result.returncode != 0:
            logger.error(f"❌ ffprobe failed with code {result.returncode}: {result.stderr}")
            return None, 0

        if not result.stdout.strip():
            logger.error(f"❌ ffprobe returned empty output for: {video_path}")
            return None, 0

        data = json.loads(result.stdout)

        # ✅ Check if duration exists in response
        if 'format' not in data or 'duration' not in data['format']:
            logger.error(f"❌ No duration in ffprobe output: {data}")
            return None, 0

        duration_seconds = float(data['format']['duration'])

        # ✅ Sanity check duration
        if duration_seconds <= 0:
            logger.error(f"❌ Invalid duration: {duration_seconds}")
            return None, 0

        minutes = int(duration_seconds // 60)
        seconds = int(duration_seconds % 60)
        duration_str = f"{minutes}:{seconds:02d}"

        logger.info(f"✅ Extracted duration: {duration_str} from {video_path}")
        return duration_str, duration_seconds

    except FileNotFoundError:
        logger.error("❌ ffprobe not installed! Install with: apt-get install ffmpeg")
        return None, 0
    except subprocess.TimeoutExpired:
        logger.error(f"❌ ffprobe timeout for {video_path}")
        return None, 0
    except json.JSONDecodeError as e:
        logger.error(f"❌ Failed to parse ffprobe JSON output: {e}")
        return None, 0
    except Exception as e:
        logger.error(f"❌ Failed to get duration from {video_path}: {e}", exc_info=True)
        return None, 0


def normalize_summary(raw, caption: str = "", author_name: str = "", shortcode: str = "", content_text: str = "") -> dict:
    """
    Normalize AI summary response AND apply global category/topic refinement.
    """
    if not isinstance(raw, dict):
        raw = {}

    # Accept both schemas: (bullets) or (headlines)
    bullets = raw.get("bullets")
    if bullets is None:
        bullets = raw.get("headlines")
    if bullets is None:
        bullets = []

    category = raw.get("category") or "General"
    topic = raw.get("topic") or "General"

    title = raw.get("title") or raw.get("topic") or (caption[:80] if caption else "")

    if not title:
        if author_name:
            title = f"Reel from @{author_name}"
        elif shortcode:
            title = f"Instagram reel {shortcode}"
        else:
            title = "Saved Reel"

    hashtags = raw.get("hashtags") or ["general"]
    emojis = raw.get("emojis") or ["✨"]

    # Global refinement (safe: if import fails, keep AI values)
    try:
        from fetcher_api.services.classification import refine_category_topic, DEFAULT_REEL_CATEGORIES

        combined = (content_text or "").strip()
        if not combined:
            combined = f"{raw.get('summary','')}\\n\\n{caption}".strip()

        refined_cat, refined_topic = refine_category_topic(
            content=combined,
            ai_category=category,
            ai_topic=topic,
            candidate_categories=DEFAULT_REEL_CATEGORIES,
        )
        category = refined_cat
        topic = refined_topic
    except Exception as e:
        logger.warning(f"Category/topic refinement skipped: {e}")

    return {
        "category": category,
        "title": title,
        "topic": topic,
        "summary": raw.get("summary") or "",
        "bullets": bullets,
        "hashtags": hashtags,
        "emojis": emojis,
    }
