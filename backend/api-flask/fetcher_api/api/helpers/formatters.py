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


def tokenize_words(text: str):
    """
    Simple tokenization for ingredient / caption strings:
    - lowercase
    - keep only alphabetic chars
    - split on non-letters
    - drop very short tokens (length < 3)
    """
    if not isinstance(text, str):
        return set()
    low = text.lower()
    cleaned = re.sub(r"[^a-zA-Zàâäéèêëîïôöùûüçœæ]+", " ", low)
    tokens = [t for t in cleaned.split() if len(t) >= 3]
    return set(tokens)


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
            if outlines and outlines[-1] != "":
                outlines.append("")
            continue
        
        low = s.lower()
        if any(m in low for m in stop_markers):
            break
        outlines.append(s)
    
    text = " ".join(outlines).strip()
    if len(text) > max_chars:
        text = text[:max_chars].rsplit(" ", 1)[0].strip()
    
    return text


def extract_servings_from_caption(caption: str):
    """
    Try to extract servings / yield from lines like:
    'Ingrédients pour 4 pâtes feuilletées inversées de 24 cm de diamètre (donc 2 galettes) :'
    or
    'Ingrédients pour une bûche roulée chocolat caramel de 10 personnes :'
    Returns an integer or None.
    """
    if not isinstance(caption, str):
        return None
    
    for ln in caption.splitlines():
        s = ln.strip()
        if not s:
            continue
        low = s.lower()
        if "ingr" in low and (
            "personne" in low or "people" in low or "pers" in low or "galette" in low
        ):
            m = re.search(r"(\d+)\s*(personnes?|people|pers?\.?|galettes?)", low)
            if m:
                try:
                    return int(m.group(1))
                except Exception:
                    continue
    return None


def _is_caption_cta_line(low: str) -> bool:
    """
    Heuristic to detect 'where to find full recipe', subscribe/comment, greetings, etc.
    These lines should NOT end up as ingredients.
    """
    if not low:
        return False
    
    if "abonne" in low or "subscribe" in low or "follow" in low:
        return True
    if "commente" in low or "comment" in low or "like" in low:
        return True
    if "où trouver la recette" in low or "ou trouver la recette" in low:
        return True
    if "recette complète" in low or "full recipe" in low:
        return True
    if "en story" in low or "story pendant" in low:
        return True
    if "lien en bio" in low or "link in bio" in low:
        return True
    if "message privé" in low or "message prive" in low or "direct message" in low or "dm" in low:
        return True
    if "bonnes recettes à tous" in low or "bonnes recettes a tous" in low:
        return True
    if "bonne et heureuse année" in low or "bonne annee" in low:
        return True
    if "recette" in low and ("abonne" in low or "commente" in low or "lien" in low or "story" in low):
        return True
    if "http://" in low or "https://" in low or "www." in low or "@" in low:
        return True
    if low.lstrip().startswith("- "):
        return True
    return False


def extract_ingredients_from_caption(caption: str):
    """
    Parse ingredient-looking lines after an 'Ingrédients' marker until steps/hashtags/CTA.
    Returns EITHER:
      - a flat list of ingredient dicts [{item, name, quantity, unit, emoji, notes}], OR
      - a grouped structure:
        [
          {"name": "Biscuit cacao", "items": [ ... ]},
          {"name": "Compotée de myrtille", "items": [ ... ]},
          ...
        ]
    """
    if not isinstance(caption, str) or not caption.strip():
        return []
    
    lines = [ln.strip() for ln in caption.splitlines()]
    if not lines:
        return []
    
    # Find ingredients section start
    start = None
    for i, ln in enumerate(lines):
        low = ln.lower()
        if "ingr dient" in low or "ingrédients" in low or "ingredients" in low:
            start = i + 1
            break
    
    if start is None:
        return []
    
    group_header_re = re.compile(
        r"^(pour\s+la\s+.+|pour\s+le\s+.+|biscuit\s+.+|garniture|dorage|dorure|pâte\s+.+|pate\s+.+)\s*:?\s*$",
        re.IGNORECASE,
    )
    qty_line_re = re.compile(
        r"^(\d+[.,]?\d*)\s*([a-zA-Zµéèêàùïîôûç]+)?\s*(?:de\s+|d'|d’)?\s*(.*)$"
    )
    
    groups = []
    flat_items = []
    current_group = None
    seen_any_ingredient = False
    
    def is_potential_header_line(ln: str) -> bool:
        """
        Treat short, non-numeric lines ending with ':' as headers,
        unless they look like CTA.
        """
        if not ln:
            return False
        low = ln.lower()
        if _is_caption_cta_line(low):
            return False
        if any(ch.isdigit() for ch in ln):
            return False
        if not ln.rstrip().endswith(":"):
            return False
        if len(ln) > 80:
            return False
        return True
    
    def add_ingredient_to_current(name_line: str):
        nonlocal current_group, groups, flat_items, seen_any_ingredient
        
        if not name_line:
            return
        
        ln = name_line.strip()
        low = ln.lower()
        
        if low.startswith("#"):
            return "STOP"
        if re.match(r"^\d+\.", ln):
            return "STOP"
        if _is_caption_cta_line(low):
            return "STOP"
        
        if "?" in ln and not re.match(r"^\d", ln):
            return None
        
        m = qty_line_re.match(ln)
        if m:
            qty_raw = (m.group(1) or "").replace(",", ".").strip()
            unit_raw = (m.group(2) or "").strip()
            item_raw = (m.group(3) or "").strip()
        else:
            qty_raw = ""
            unit_raw = ""
            item_raw = ln
        
        low_item = item_raw.lower()
        if _is_caption_cta_line(low_item):
            return "STOP"
        
        ing = {
            "item": item_raw,
            "name": item_raw,
            "quantity": qty_raw,
            "unit": unit_raw,
            "emoji": "",
            "notes": "",
        }
        
        if current_group is not None:
            current_group.setdefault("items", []).append(ing)
        else:
            flat_items.append(ing)
        seen_any_ingredient = True
        return "OK"
    
    for ln in lines[start:]:
        if not ln:
            continue
        
        low = ln.lower()
        
        if low.startswith("#"):
            break
        if _is_caption_cta_line(low):
            if seen_any_ingredient:
                break
            else:
                continue
        
        if re.match(r"^\d+\.", ln):
            break
        
        if group_header_re.match(ln):
            group_name = ln.rstrip(":").strip()
            current_group = {"name": group_name, "items": []}
            groups.append(current_group)
            continue
        
        if is_potential_header_line(ln):
            group_name = ln.rstrip(":").strip()
            current_group = {"name": group_name, "items": []}
            groups.append(current_group)
            continue
        
        res = add_ingredient_to_current(ln)
        if res == "STOP":
            break
    
    total_group_items = sum(len(g.get("items", [])) for g in groups)
    if groups and total_group_items > 0:
        groups = [g for g in groups if g.get("items")]
        return groups
    
    return flat_items


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
            if current and not current.endswith(" "):
                current += " "
            continue
        
        if ln.startswith("#"):
            break
        
        m = step_re.match(ln)
        if m:
            if current is not None:
                steps.append(current.strip())
            current = m.group(2) or "".strip()
            continue
        
        if current is not None:
            low = ln.lower()
            if _is_caption_cta_line(low):
                continue
            if current.endswith(" "):
                current += ln
            else:
                current += " " + ln
    
    if current:
        steps.append(current.strip())
    
    steps = [s for s in steps if isinstance(s, str) and len(s.strip()) > 8]
    return steps


def instructions_look_unknown(instructions):
    """
    Detect clear failure mode: lots of 'unknown'.
    """
    if not isinstance(instructions, list) or not instructions:
        return True
    
    blob = " ".join(str(x) for x in instructions).lower()
    return blob.count("unknown") >= 6


def _iter_all_ingredients_for_lang(lang_dict):
    """
    Yield all ingredient dicts for a given language section (handles flat and grouped).
    """
    if not isinstance(lang_dict, dict):
        return []
    ings = lang_dict.get("ingredients")
    if not isinstance(ings, list):
        return []
    result = []
    if ings and isinstance(ings[0], dict) and "items" in ings[0]:
        for g in ings:
            for it in g.get("items", []):
                if isinstance(it, dict):
                    result.append(it)
    else:
        for it in ings:
            if isinstance(it, dict):
                result.append(it)
    return result


def adjust_spoon_units_from_caption(recipe_obj, caption: str):
    """
    Post-process small ml quantities (5 ml, 15 ml) back into spoons when the caption
    clearly uses 'cuillère à café' or 'cuillère à soupe'.

    - 5 ml  -> 1 tsp / 1 cuillère à café
    - 15 ml -> 1 tbsp / 1 cuillère à soupe
    """
    if not isinstance(recipe_obj, dict) or not isinstance(caption, str):
        return
    
    low_cap = caption.lower()
    has_tsp = any(
        phrase in low_cap
        for phrase in [
            "cuillère à café",
            "cuillerée à café",
            "cuillere a cafe",
            "cuil. à café",
            "c. à c.",
            "c a c",
        ]
    )
    has_tbsp = any(
        phrase in low_cap
        for phrase in [
            "cuillère à soupe",
            "cuillerée à soupe",
            "cuillere a soupe",
            "cuil. à soupe",
            "c. à s.",
            "c a s",
        ]
    )
    
    if not (has_tsp or has_tbsp):
        return
    
    eng = recipe_obj.get("english")
    orig = recipe_obj.get("original")
    
    for lang_name, lang_dict in (("english", eng), ("original", orig)):
        if not isinstance(lang_dict, dict):
            continue
        
        for ing in _iter_all_ingredients_for_lang(lang_dict):
            qty = str(ing.get("quantity") or "").strip()
            unit = str(ing.get("unit") or "").strip().lower()
            if unit != "ml" or not qty:
                continue
            
            # Normalize numeric string
            try:
                val = float(qty.replace(",", "."))
            except Exception:
                continue
            
            # Teaspoon: ~5 ml
            if has_tsp and abs(val - 5.0) < 0.01:
                ing["quantity"] = "1"
                if lang_name == "english":
                    ing["unit"] = "tsp"
                else:
                    ing["unit"] = "cuillère à café"
            # Tablespoon: ~15 ml
            elif has_tbsp and abs(val - 15.0) < 0.01:
                ing["quantity"] = "1"
                if lang_name == "english":
                    ing["unit"] = "tbsp"
                else:
                    ing["unit"] = "cuillère à soupe"


def repair_recipe_from_caption(recipe_obj, caption: str):
    """
    Mutates recipe_obj in-place:
    - If original.instructions are missing/unknown, replace with numbered steps from caption.
    - If caption has grouped ingredients (sections), assign each existing ingredient
      to the best-matching section by text similarity (keeps emojis/metadata) and
      mirror that grouping to english.ingredients where possible.
    - Else, if original.ingredients are missing, fill with flat ingredients parsed from caption.
    - Convert 5 ml / 15 ml back to spoon units when caption uses cuillères.
    - If original.title looks junk, prefer first caption line.
    - If servings/yield missing, extract from caption.
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
    
    # Parse ingredients from caption (may be grouped)
    parsed_ings = extract_ingredients_from_caption(caption)
    has_parsed = isinstance(parsed_ings, list) and len(parsed_ings) > 0
    looks_grouped = has_parsed and isinstance(parsed_ings[0], dict) and "items" in parsed_ings[0]
    
    orig_ingredients = orig.get("ingredients")
    
    if has_parsed:
        if looks_grouped:
            # If we already have a flat ingredient list with emojis from the extractor,
            # map each ingredient into the caption groups by similarity.
            if (
                isinstance(orig_ingredients, list)
                and orig_ingredients
                and not (isinstance(orig_ingredients[0], dict) and "items" in orig_ingredients[0])
            ):
                # Build flattened list of caption items with group indices
                parsed_flat = []
                flat_idx = 0
                for g_idx, g in enumerate(parsed_ings):
                    for it in g.get("items", []):
                        text = it.get("item") or it.get("name") or ""
                        parsed_flat.append({
                            "group": g_idx,
                            "text": text,
                            "flat_index": flat_idx,
                            "tokens": tokenize_words(text),
                        })
                        flat_idx += 1
                
                if parsed_flat:
                    group_assignments = [0] * len(orig_ingredients)
                    
                    for i, ing in enumerate(orig_ingredients):
                        name_text = ing.get("item") or ing.get("name") or ""
                        t1 = tokenize_words(name_text)
                        if not t1:
                            continue
                        
                        best_group = 0
                        best_score = 0.0
                        
                        for pf in parsed_flat:
                            inter = t1 & pf["tokens"]
                            if not inter:
                                continue
                            base = float(len(inter))
                            distance_penalty = 0.1 * abs(pf["flat_index"] - i)
                            score = base - distance_penalty
                            if score > best_score:
                                best_score = score
                                best_group = pf["group"]
                        
                        group_assignments[i] = best_group
                    
                    # Build grouped structure for ORIGINAL ingredients
                    new_groups = []
                    for g_idx, g in enumerate(parsed_ings):
                        group_indices = [i for i, assigned in enumerate(group_assignments) if assigned == g_idx]
                        if not group_indices:
                            continue
                        group_items = [orig_ingredients[i] for i in group_indices]
                        new_groups.append({
                            "name": g.get("name", ""),
                            "items": group_items,
                        })
                    
                    if new_groups:
                        orig["ingredients"] = new_groups
                    
                    # Mirror the same grouping onto ENGLISH ingredients when they match in length
                    eng_ingredients = eng.get("ingredients")
                    if (
                        isinstance(eng_ingredients, list)
                        and eng_ingredients
                        and not (isinstance(eng_ingredients[0], dict) and "items" in eng_ingredients[0])
                        and len(eng_ingredients) == len(orig_ingredients)
                    ):
                        eng_groups = []
                        for g_idx, g in enumerate(parsed_ings):
                            group_indices = [i for i, assigned in enumerate(group_assignments) if assigned == g_idx]
                            if not group_indices:
                                continue
                            eng_items = [eng_ingredients[i] for i in group_indices]
                            eng_groups.append({
                                "name": g.get("name", ""),
                                "items": eng_items,
                            })
                        if eng_groups:
                            eng["ingredients"] = eng_groups
                else:
                    # No caption items somehow; if we also have no original ingredients, at least use parsed groups
                    if not isinstance(orig_ingredients, list) or not orig_ingredients:
                        orig["ingredients"] = parsed_ings
            else:
                # No original ingredients: use parsed groups as-is
                if not isinstance(orig_ingredients, list) or not orig_ingredients:
                    orig["ingredients"] = parsed_ings
        else:
            # Flat list from caption: only use if original.ingredients is missing/empty
            if not isinstance(orig_ingredients, list) or not orig_ingredients:
                orig["ingredients"] = parsed_ings
    
    # Re-map 5 ml / 15 ml back to spoons when the caption uses cuillères
    adjust_spoon_units_from_caption(recipe_obj, caption)
    
    # Fix servings/yield if missing
    if not orig.get("servings") and not orig.get("yield"):
        sv = extract_servings_from_caption(caption)
        if sv:
            orig["servings"] = sv
            if not eng.get("servings") and not eng.get("yield"):
                eng["servings"] = sv
    
    # Fix original title when it's empty or clearly nonsense
    orig_title = orig.get("title")
    if not isinstance(orig_title, str):
        orig_title = ""
    orig_title = orig_title.strip()
    
    caption_title = extract_original_title_from_caption(caption)
    
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
    Build the bilingual summary object your UI expects.
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
    
    row_dict["recipe"] = json_loads_maybe(row_dict.get("recipe"), default=row_dict.get("recipe"))
    row_dict["workout"] = json_loads_maybe(row_dict.get("workout"), default=row_dict.get("workout"))
    
    if isinstance(row_dict.get("recipe"), dict):
        row_dict["recipe"] = repair_recipe_from_caption(row_dict["recipe"], caption)
    
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
    
    english_preview, summary_title_str = extract_english_preview_and_title(summary_text, summary_title)
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
        "bullets": bullets,
        "hashtags": hashtags,
        "emojis": emojis,
        "bilingual": summary_text if isinstance(summary_text, dict) else None,
    }
    
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
        if hasattr(row, "keys"):
            row_dict = dict(row)
        elif hasattr(row, "as_dict"):
            row_dict = row.as_dict()
        else:
            continue
        
        formatted = format_reel_response(row_dict)
        transformed_rows.append(formatted)
    
    return transformed_rows
