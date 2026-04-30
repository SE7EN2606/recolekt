"""
Recipe-specific normalization helpers.

This module assumes that the recipe objects were ALREADY structured by an LLM:
- It does NOT parse transcripts.
- It DOES use the caption headings to reconstruct ingredient groups when the
  model didn't group them (e.g. "Îles flottantes:", "Sauce mangue passion:", etc.).

We support BOTH:
1) Flat ingredients:
   "ingredients": [
       { "emoji": "🥛", "quantity": "125", "unit": "g", "name": "crème fraîche", "notes": "entière" },
       ...
   ]

2) Grouped ingredients from the model:
   "ingredients_groups": [
       {
           "name": "Garniture",
           "items": [ {...}, ... ]
       },
       {
           "name": "Déco",
           "items": [ {...}, ... ]
       }
   ]

3) Grouped ingredients inferred from caption headings:
   Caption:
       Ingrédients :
       Îles flottantes :
       4 blancs d'œuf
       60 g de sucre en poudre
       Sauce mangue passion :
       ...

   → we detect the section names and split the flat list of ingredients into
     groups of matching sizes.
"""

import re
import logging
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

LANG_KEYS = ("english", "original")


def split_name_and_note(text: str):
    """
    Split trailing '(...)' from an ingredient name into (base, note).

    Example:
        "gélatine (facultatif)" -> ("gélatine", "facultatif")

    This is language-agnostic and only looks at the last pair of parentheses.
    """
    if not isinstance(text, str):
        return text, ""
    s = text.strip()
    m = re.search(r"\s*\(([^()]*)\)\s*$", s)
    if not m:
        return s, ""
    base = s[:m.start()].rstrip()
    note = m.group(1).strip()
    return base, note


def _ensure_list(value: Any) -> List[Any]:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    return [value]


def _normalize_instruction_list(instructions: Any) -> List[Any]:
    """
    Ensure instructions/tips/notes are clean.

    Preserve dict objects so Sprint 1 trust metadata is not destroyed:
    {"instruction": "...", "source": "...", "confidence": "..."}
    """
    items = _ensure_list(instructions)
    out: List[Any] = []

    for it in items:
        if it is None:
            continue

        if isinstance(it, dict):
            cleaned = dict(it)

            for key in ("instruction", "text", "source", "confidence"):
                if key in cleaned and cleaned[key] is not None:
                    cleaned[key] = str(cleaned[key]).strip()

            main_text = cleaned.get("instruction") or cleaned.get("text")
            if main_text:
                out.append(cleaned)

            continue

        s = str(it).strip()
        if s:
            out.append(s)

    return out


def _normalize_string_or_empty(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    return str(value).strip()


def _normalize_ingredient(ing: Any) -> Dict[str, Any]:
    """
    Normalize a single ingredient dict into a stable shape:

    - Always has keys: emoji, quantity, unit, name, notes.
    - If name contains trailing "(...)" and notes is empty, moves that into notes.
    """
    if not isinstance(ing, dict):
        base = _normalize_string_or_empty(ing)
        name, note = split_name_and_note(base)
        return {
            "emoji": "",
            "quantity": "",
            "unit": "",
            "name": name,
            "notes": note,
        }

    emoji = _normalize_string_or_empty(ing.get("emoji"))
    quantity = None if ing.get("quantity") is None else _normalize_string_or_empty(ing.get("quantity"))
    unit = None if ing.get("unit") is None else _normalize_string_or_empty(ing.get("unit"))

    # Prefer "name" if provided, otherwise "item"
    raw_name = ing.get("name")
    if not isinstance(raw_name, str) or not raw_name.strip():
        raw_name = ing.get("item")
    name_str = _normalize_string_or_empty(raw_name)

    # Notes can come from model, but we also allow trailing (...) in the name
    existing_notes = _normalize_string_or_empty(ing.get("notes"))
    base_name, note_from_paren = split_name_and_note(name_str)

    notes_parts = []
    if existing_notes:
        notes_parts.append(existing_notes)
    if note_from_paren:
        if not existing_notes or note_from_paren not in existing_notes:
            notes_parts.append(note_from_paren)
    notes = "; ".join(notes_parts) if notes_parts else ""

    # Preserve Sprint 1 trust metadata and any future ingredient fields.
    # Do not let normalization strip source/confidence/needs_review/quantityRange.
    out = dict(ing)

    out.update({
        "emoji": emoji,
        "quantity": quantity,
        "unit": unit,
        "name": base_name,
        "notes": notes,
    })

    # Keep item for backward compatibility if it existed; otherwise mirror name.
    out.setdefault("item", base_name)

    return out


def _normalize_ingredient_list(ingredients: Any) -> List[Dict[str, Any]]:
    """
    Normalize a list of ingredients; supports:
    - Flat list of ingredient dicts.
    - Flat list of strings.
    """
    items = _ensure_list(ingredients)
    out: List[Dict[str, Any]] = []
    for it in items:
        norm = _normalize_ingredient(it)
        if norm["name"] or norm["quantity"] or norm["unit"]:
            out.append(norm)
    return out


def _normalize_ingredient_groups(groups: Any) -> List[Dict[str, Any]]:
    """
    Normalize grouped ingredients structure:

    Input (from LLM):
        [
            { "name": "Génoise au chocolat", "items": [...] },
            { "name": "Imbibage", "items": [...] },
            ...
        ]

    Output:
        Same, but each item in "items" is normalized.
    """
    raw_groups = _ensure_list(groups)
    out: List[Dict[str, Any]] = []

    for g in raw_groups:
        if not isinstance(g, dict):
            continue

        group_name = _normalize_string_or_empty(g.get("name"))
        items = _normalize_ingredient_list(g.get("items"))

        if not items:
            continue

        out.append({
            "name": group_name,
            "items": items,
        })

    return out


def _extract_caption_sections(caption: Optional[str]) -> List[Tuple[str, int]]:
    """
    From a caption string, detect ingredient section headings and counts.

    Example caption:
        Ingrédients :
        Îles flottantes :
        4 blancs d'œuf
        60 g de sucre en poudre
        Sauce mangue passion :
        ...
        Déco :
        1 morceau de noix de coco fraîche

    Returns (name, count_of_ingredient_lines_below_it):
        [("Îles flottantes", 2),
         ("Sauce mangue passion", 5),
         ("Tuiles coco", 4),
         ("Déco", 1)]
    """
    if not caption or not isinstance(caption, str):
        return []

    lines = [ln.strip() for ln in caption.splitlines()]
    if not any(lines):
        return []

    # Find the first "Ingrédients" line (French) or generic "Ingredients"
    start_idx = 0
    for i, line in enumerate(lines):
        if re.search(r"ingr[eé]dients?", line, re.IGNORECASE):
            start_idx = i + 1
            break

    sections: List[Tuple[str, int]] = []
    current_name: Optional[str] = None
    current_count = 0

    def flush():
        nonlocal current_name, current_count
        if current_name and current_count > 0:
            sections.append((current_name, current_count))
        current_name = None
        current_count = 0

    for raw in lines[start_idx:]:
        s = raw.strip()
        if not s:
            continue

        # Skip global "Ingrédients :" if it appears again
        if re.search(r"ingr[eé]dients?", s, re.IGNORECASE):
            continue

        # Heading: ends with ":" and does NOT contain digits
        if s.endswith(":") and not re.search(r"\d", s):
            flush()
            name = s.rstrip(":").strip()
            current_name = name
            current_count = 0
        else:
            # Ingredient line inside a current section
            if current_name:
                current_count += 1

    flush()

    # Need at least 2 sections to be worth grouping
    if len(sections) < 2:
        return []

    return sections


def normalize_recipe(recipe_obj: Any, caption: Optional[str] = None) -> Any:
    """
    Normalize a full recipe object returned by the LLM.

    Per language ("english", "original"):
    - If `ingredients_groups` exists:
        - normalize groups + items
        - set `ingredients_groups`
        - set flat `ingredients` = concatenation of all group items
    - Else if `ingredients` itself looks like groups (list of dicts with 'items'):
        - treat it as groups, create `ingredients_groups` + flat `ingredients`
    - Else if `ingredients` is flat:
        - normalize flat list

    Additionally, if caption provides clear sections like:
        "Îles flottantes :", "Sauce mangue passion :", "Tuiles coco :", "Déco :"
    and there is NO `ingredients_groups` yet, we:
        - infer group names + counts from caption
        - split the flat `ingredients` list into matching groups, per language.

    If the caption has fewer ingredient lines than the actual ingredient count,
    leftover ingredients are appended to the last group so nothing is lost.
    We only skip grouping if the caption claims MORE lines than we have
    ingredients (to avoid truncation).
    """
    if not isinstance(recipe_obj, dict):
        return recipe_obj

    # First pass: normalize ingredients / groups / instructions / tips / notes / title
    for lang in LANG_KEYS:
        lang_block = recipe_obj.get(lang)
        if lang_block is None:
            continue
        if not isinstance(lang_block, dict):
            lang_block = {"raw": lang_block}
            recipe_obj[lang] = lang_block

        # ---- INGREDIENTS & GROUPS (from model) ----
        raw_groups = lang_block.get("ingredients_groups", None)
        raw_ings = lang_block.get("ingredients", None)

        if raw_groups is not None:
            # Explicit groups from model
            groups = _normalize_ingredient_groups(raw_groups)
            lang_block["ingredients_groups"] = groups

            flat: List[Dict[str, Any]] = []
            for g in groups:
                flat.extend(g.get("items", []))
            lang_block["ingredients"] = flat

        elif isinstance(raw_ings, list) and raw_ings and isinstance(raw_ings[0], dict) and "items" in raw_ings[0]:
            # Backward-compat: ingredients field itself is grouped
            groups = _normalize_ingredient_groups(raw_ings)
            lang_block["ingredients_groups"] = groups

            flat: List[Dict[str, Any]] = []
            for g in groups:
                flat.extend(g.get("items", []))
            lang_block["ingredients"] = flat

        elif raw_ings is not None:
            # Simple flat list
            lang_block["ingredients"] = _normalize_ingredient_list(raw_ings)
            # No ingredients_groups in this case yet

        # ---- OTHER FIELDS ----
        if "instructions" in lang_block:
            lang_block["instructions"] = _normalize_instruction_list(lang_block.get("instructions"))

        if "tips" in lang_block:
            lang_block["tips"] = _normalize_instruction_list(lang_block.get("tips"))

        if "notes" in lang_block:
            lang_block["notes"] = _normalize_instruction_list(lang_block.get("notes"))

        if "title" in lang_block:
            lang_block["title"] = _normalize_string_or_empty(lang_block.get("title"))

    # Second pass: if there are no groups but caption has clear sections,
    # infer groups by slicing each language's ingredients.
    sections = _extract_caption_sections(caption)
    if sections:
        total_lines = sum(count for _, count in sections)
        if total_lines <= 0:
            return recipe_obj

        for lang in LANG_KEYS:
            lang_block = recipe_obj.get(lang)
            if not isinstance(lang_block, dict):
                continue

            # Skip if groups already exist (from model)
            if "ingredients_groups" in lang_block:
                continue

            ings = lang_block.get("ingredients")
            if not isinstance(ings, list) or not ings:
                continue

            if len(ings) < total_lines:
                # Caption claims more lines than we have ingredients — expected
                # for non-recipe content, not a real error. Log at DEBUG only.
                logger.debug(
                    f"[recipe] Caption sections ({total_lines} lines) "
                    f"exceed ingredient count ({len(ings)}) for '{lang}', skipping grouping."
                )
                continue

            idx = 0
            groups: List[Dict[str, Any]] = []

            for name, count in sections:
                if idx >= len(ings):
                    break
                take = min(count, len(ings) - idx)
                if take <= 0:
                    continue
                group_items = ings[idx: idx + take]
                idx += take
                groups.append({
                    "name": name,
                    "items": group_items,
                })

            # Any leftover ingredients go into the last group, if present
            if idx < len(ings) and groups:
                leftover = ings[idx:]
                groups[-1]["items"].extend(leftover)

            if groups:
                lang_block["ingredients_groups"] = groups
                logger.info(
                    f"[recipe] Inferred {len(groups)} ingredient groups from caption for '{lang}'."
                )

    return recipe_obj