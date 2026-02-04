# fetcher_api/api/helpers/formatters.py

"""
Data formatting and recipe repair helpers
"""
import re
import json
import logging

logger = logging.getLogger("formatters")


# ==================== HELPER UTILITY FUNCTIONS ====================

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


# ==================== CAPTION / RECIPE REPAIR FUNCTIONS ====================

def first_nonempty_line(text: str) -> str:
    """Get first non-empty line from text"""
    if not isinstance(text, str):
        return ""
    for ln in text.splitlines():
        s = ln.strip()
        if s:
            return s
    return ""


def strip_hashtags_line(line: str) -> str:
    """Strip hashtags from line"""
    if not isinstance(line, str):
        return ""
    return line.strip()


def extract_original_title_from_caption(caption: str) -> str:
    """Use first non-empty caption line as a human title candidate."""
    line = first_nonempty_line(caption)
    if not line:
        return ""
    
    # Keep text before hashtags section markers
    low = line.lower()
    if low.startswith("commente") or low.startswith("abonne") or low.startswith("comment"):
        return ""
    
    return line[:90].strip()


def extract_intro_from_caption(caption: str, max_chars: int = 360) -> str:
    """
    Take the intro paragraph before ingredients/steps/hashtags as original summary candidate.
    """
    if not isinstance(caption, str) or not caption.strip():
        return ""
    
    stop_markers = ("ingr dients", "ingredients", "#", "1.", "1)", " tape", " etape")
    outlines = []
    
    for ln in caption.splitlines():
        s = ln.strip()
        if not s:
            # keep one blank to separate paragraphs
            if outlines and outlines[-1] != "":
                outlines.append("")
            continue
        
        low = s.lower()
        # Avoid CTA-only lines a bit
        if any(m in low for m in stop_markers):
            break
        outlines.append(s)
    
    text = " ".join(outlines).strip()
    if len(text) > max_chars:
        text = text[:max_chars].rsplit(" ", 1)[0].strip()
    
    return text


def extract_ingredients_from_caption(caption: str):
    """
    Parse ingredient-looking lines after an 'Ingrédients' marker until steps/hashtags.
    Returns list of {"item":..., "name":..., "quantity":"", "unit":"", "emoji":""}.
    """
    if not isinstance(caption, str) or not caption.strip():
        return []
    
    lines = [ln.strip() for ln in caption.splitlines()]
    if not lines:
        return []
    
    # Find ingredients section
    start = None
    for i, ln in enumerate(lines):
        low = ln.lower()
        if "ingr dient" in low or "ingredient" in low:
            start = i + 1
            break
    
    if start is None:
        return []
    
    ingredients = []
    qty_line_re = re.compile(r"^\d+\.?\d*\s")
    
    for ln in lines[start:]:
        if not ln:
            continue
        
        low = ln.lower()
        
        # Stop if we hit steps, hashtags, or obvious outro
        if low.startswith("#"):
            break
        if re.match(r"^\d+\.", ln):
            break
        if low.startswith("abonne") or low.startswith("commente") or low.startswith("r ussite") or low.startswith("reussite"):
            break
        
        # Keep only quantity-leading lines (matches your caption structure)
        if qty_line_re.match(ln):
            ingredients.append({
                "item": ln,
                "name": ln,
                "quantity": "",
                "unit": "",
                "emoji": ""
            })
        # Also allow single-word items like "Sucre" + "Perl..."
        elif len(ln.split()) <= 4 and not ln.endswith("!") and not low.startswith("ingr"):
            ingredients.append({
                "item": ln,
                "name": ln,
                "quantity": "",
                "unit": "",
                "emoji": ""
            })
    
    return ingredients


def extract_numbered_steps_from_caption(caption: str):
    """
    Parse steps like "1. ... 2. ..."
    Keeps multiline paragraphs until next step number.
    Returns list[str]
    """
    if not isinstance(caption, str) or not caption.strip():
        return []
    
    lines = caption.splitlines()
    step_re = re.compile(r"^(\d+)\.\s*(.*)")
    steps = []
    current = None
    
    for raw in lines:
        ln = raw.strip()
        if not ln:
            # paragraph separation inside a step
            if current and not current.endswith(" "):
                current += " "
            continue
        
        if ln.startswith("#"):
            break
        
        m = step_re.match(ln)
        if m:
            # finalize previous step
            if current is not None:
                steps.append(current.strip())
            current = m.group(2) or "".strip()
            continue
        
        # continuation line
        if current is not None:
            low = ln.lower()
            if low.startswith("abonne") or low.startswith("commente"):
                continue
            if current.endswith(" "):
                current += ln
            else:
                current += " " + ln
    
    if current:
        steps.append(current.strip())
    
    # Avoid adding big CTA blocks at end
    # sanity: remove ultra-short junk
    steps = [s for s in steps if isinstance(s, str) and len(s.strip()) > 8]
    return steps


def instructions_look_unknown(instructions):
    """
    Detect the exact failure mode: translated into "unknown language" lots of "unknown".
    If a significant portion is "unknown", treat as broken.
    """
    if not isinstance(instructions, list) or not instructions:
        return True
    
    blob = " ".join(str(x) for x in instructions).lower()
    return blob.count("unknown") >= 6


def repair_recipe_from_caption(recipe_obj, caption: str):
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
        eng = recipe_obj["english"] = {}
    if not isinstance(orig, dict):
        orig = recipe_obj["original"] = {}
    
    # Fix instructions
    orig_instructions = orig.get("instructions")
    if instructions_look_unknown(orig_instructions):
        steps = extract_numbered_steps_from_caption(caption)
        if steps:
            orig["instructions"] = steps
    
    # Fix ingredients (prefer caption in original language if available)
    orig_ingredients = orig.get("ingredients")
    if not isinstance(orig_ingredients, list) or not orig_ingredients:
        ings = extract_ingredients_from_caption(caption)
        if ings:
            orig["ingredients"] = ings
    
    # Fix original title when it's empty or clearly nonsense
    orig_title = orig.get("title")
    if not isinstance(orig_title, str):
        orig_title = ""
    orig_title = orig_title.strip()
    
    caption_title = extract_original_title_from_caption(caption)
    
    # Replace if empty OR looks like generic "mystery" junk
    if not orig_title or "mystery" in orig_title.lower() or orig_title.lower() == "untitled":
        if caption_title:
            orig["title"] = caption_title
    
    return recipe_obj


def coerce_title_to_str(current_title):
    """summary_title should be text, but legacy rows can contain dict/json. Return a safe string."""
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
    
    try:
        return str(current_title).strip()
    except Exception:
        return ""


def extract_english_preview_and_title(summary_text, current_title=None):
    """
    Handles various summary_text shapes:
    - dict with {english: {...}, original: {...}}
    - dict with {english: string summary, ...}
    - dict with {title: ..., summary: ...}
    - plain string

    Returns (english_preview:str, title:str)
    """
    title = coerce_title_to_str(current_title)
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


def build_bilingual_summary_object(summary_title, summary_text, bullets, hashtags, emojis, caption: str):
    """
    Build the bilingual summary object your UI expects:
    { 
      "english": {"title": ..., "summary": ..., "headlines": [], "hashtags": [], "emojis": []}, 
      "original": {...}
    }
    
    If we don't have a true original-language summary, we at least provide a stable structure,
    and we use caption intro/title as original best-effort.
    """
    title_str = coerce_title_to_str(summary_title)
    summary_str = summary_text.strip() if isinstance(summary_text, str) else ""
    
    bullets_list = bullets if isinstance(bullets, list) else []
    hashtags_list = hashtags if isinstance(hashtags, list) else []
    emojis_list = emojis if isinstance(emojis, list) else []
    
    orig_title = extract_original_title_from_caption(caption) or title_str
    orig_summary = extract_intro_from_caption(caption) or summary_str
    
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
        }
    }


# ==================== RESPONSE FORMATTERS ====================

def format_reel_response(row_dict):
    """
    Format a single reel database row for API response.
    Normalizes JSON fields, repairs recipes, builds bilingual summaries.
    """
    caption = row_dict.get("caption") or ""
    
    # Parse recipe/workout JSON if string
    row_dict["recipe"] = json_loads_maybe(row_dict.get("recipe"), default=row_dict.get("recipe"))
    row_dict["workout"] = json_loads_maybe(row_dict.get("workout"), default=row_dict.get("workout"))
    
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
    
    # If summarytext is already bilingual dict, keep it; else build stable bilingual shape
    if not isinstance(summary_text, dict):
        bilingual = build_bilingual_summary_object(
            summary_title=summary_title,
            summary_text=summary_text if isinstance(summary_text, str) else "",
            bullets=bullets,
            hashtags=hashtags,
            emojis=emojis,
            caption=caption
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
    
    # GCS URLs
    thumb = row_dict.get("preview_thumbnail")
    row_dict["gcs_urls"] = {
        "preview_thumbnail": thumb if thumb else None
    }
    
    row_dict["author_name"] = row_dict.get("author_name") or "Unknown"
    row_dict.pop("preview_thumbnail", None)
    
    return row_dict


def format_reels_list(db_rows):
    """
    Format list of reel database rows for API response.
    """
    transformed_rows = []
    
    for row in db_rows:
        # Convert to dict
        if hasattr(row, "keys"):
            row_dict = dict(row)
        elif hasattr(row, "as_dict"):
            row_dict = row.as_dict()
        else:
            continue
        
        formatted = format_reel_response(row_dict)
        transformed_rows.append(formatted)
    
    return transformed_rows
