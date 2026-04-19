# fetcher_api/services/summary_formatter.py

"""
Summary formatting + guardrails (UI contract):

- Paragraph: 200–450 characters max.
- Bullets: exactly N items (default 4), each has a short headline + one-sentence description + emoji.
  Pass max_bullets to format_ai_summary() / normalize_bullets() to honour creator's explicit count.
- No emojis in paragraph/headlines/descriptions text (only in separate emoji field).
- No marketing fluff / author comments / CTA phrasing.
- Focus on WHY the saved reel is useful and WHAT practical value it contains.
- Avoid empty meta-summary language like:
    "This video talks about..."
    "The creator explains..."
    "Key takeaways in an easy-to-follow format."

v22:
- Added meta-summary guardrails, not just banned openers.
- Reworked fallback paragraph generation to sound save-worthy and user-focused.
- Preserved max_bullets behaviour from v21.
"""

import logging
import re
from typing import Any, Dict, List, Tuple

logger = logging.getLogger(__name__)

# Must match universal_extractor.py constants
SUMMARY_PARAGRAPH_MAX = 450  # Hard ceiling for clamp

# Banned opening patterns — summaries must NEVER start with these
BANNED_SUMMARY_OPENERS = [
    r"^this\s+(content|video|recipe|guide|clip|post|reel)\s",
    r"^the\s+(content|video|recipe|guide|clip|post|reel)\s+(presents?|shows?|provides?|features?|covers?|is\s+about)",
    r"^here\s+(is|are)\s",
    r"^in\s+this\s+(content|video|recipe|guide|clip|post|reel)",
    r"^ce\s+(contenu|vidéo)\s",
    r"^cette\s+(vidéo|recette)\s",
    r"^voici\s",
    r"^este\s+(contenido|video)\s",
    r"^esta\s+(receta|guía)\s",
    r"^dieses\s+(video|rezept)\s",
    r"^dieser\s+inhalt\s",
    r"^questo\s+(contenuto|video)\s",
    r"^questa\s+(ricetta)\s",
]
BANNED_OPENER_RE = re.compile("|".join(BANNED_SUMMARY_OPENERS), re.IGNORECASE)

# Meta-summary patterns — even if they do not appear at the opening,
# these usually indicate a weak, self-referential summary that describes
# the content format rather than the viewer value.
META_SUMMARY_PATTERNS = [
    r"\bthe\s+creator\s+(talks?|explains?|discusses?|shares?|shows?)\b",
    r"\bthe\s+author\s+(talks?|explains?|discusses?|shares?|shows?)\b",
    r"\bthis\s+(video|post|reel|content|clip)\s+(talks?|shows?|explains?|covers?|is\s+about)\b",
    r"\bkey\s+takeaways?\b",
    r"\beasy-to-follow\s+format\b",
    r"\bshort,\s*easy-to-follow\s+format\b",
    r"\bcovered\s+in\s+a\s+short\b",
    r"\bsummary\s+of\b",
    r"\boverview\s+of\b",
]
META_SUMMARY_RE = re.compile("|".join(META_SUMMARY_PATTERNS), re.IGNORECASE)


def strip_emoji(text: str) -> str:
    emoji_pattern = re.compile(
        "["
        "\\U0001F1E0-\\U0001F1FF"
        "\\U0001F300-\\U0001F5FF"
        "\\U0001F600-\\U0001F64F"
        "\\U0001F680-\\U0001F6FF"
        "\\U0001F700-\\U0001F77F"
        "\\U0001F780-\\U0001F7FF"
        "\\U0001F800-\\U0001F8FF"
        "\\U0001F900-\\U0001F9FF"
        "\\U0001FA00-\\U0001FA6F"
        "\\U0001FA70-\\U0001FAFF"
        "\\U00002702-\\U000027B0"
        "\\U000024C2-\\U0001F251"
        "\\U0001F004"
        "\\U0001F0CF"
        "\\U0001F18E"
        "\\u3030"
        "\\u2B50"
        "\\u2705"
        "\\u203C"
        "\\u2049"
        "]+",
        flags=re.UNICODE,
    )
    s = emoji_pattern.sub("", text or "")
    s = re.sub(r"[—–•·●○◦▪▫►▻◄◅△▲▴▵▿▾▼▽]", "", s)
    return s.strip()


def clean_text(text: str) -> str:
    s = strip_emoji(text or "")
    s = re.sub(r"\s+", " ", s).strip()
    return s


def _has_banned_opener(text: str) -> bool:
    """Check if the summary starts with a banned pattern like 'This content presents...'"""
    s = (text or "").strip()
    if not s:
        return False
    return bool(BANNED_OPENER_RE.match(s))


def _has_meta_summary_language(text: str) -> bool:
    """
    Detect weak meta-summary phrasing anywhere in the paragraph.
    """
    s = clean_text(text or "")
    if not s:
        return False
    return bool(META_SUMMARY_RE.search(s))


def _looks_like_recipe_dump(s: str, content_type: str = "general") -> bool:
    """
    Heuristic: if paragraph looks like ingredients/instructions list, treat as invalid.
    EXCEPTION: for content_type="recipe", allow recipe-descriptive language.
    """
    t = (s or "").lower()
    if not t:
        return True

    if content_type == "recipe":
        return False

    markers = [
        "ingrédient", "ingredients", "ingredient",
        "g", "kg", "ml", "l ", "tbsp", "tsp",
        "cuillère", "c. à", "c a", "gram", "grams",
        "oven", "preheat", "bake", "minutes",
        "recette", "recipe", "instructions",
        "étape", "step", "1.", "2.", "3.",
    ]
    hits = sum(1 for m in markers if m in t)
    if hits >= 4:
        return True

    qty_tokens = len(re.findall(r"(\b\d+([.,]\d+)?\b|\b\d+/\d+\b)", t))
    if qty_tokens >= 6:
        return True

    return False


def clamp_paragraph_chars(text: str, min_chars: int = 200, max_chars: int = SUMMARY_PARAGRAPH_MAX) -> str:
    """
    Clamp a paragraph to at most max_chars, keeping sentence integrity where possible.
    """
    s = clean_text(text)
    if not s:
        return ""

    if len(s) > max_chars:
        cut = s[:max_chars]

        # Try to find last complete sentence
        last_period = max(cut.rfind('. '), cut.rfind('! '), cut.rfind('? '))
        if cut.endswith('.') or cut.endswith('!') or cut.endswith('?'):
            last_period = max(last_period, len(cut) - 1)

        if last_period > max_chars * 0.6:
            s = s[:last_period + 1].strip()
        else:
            if " " in cut:
                cut = cut.rsplit(" ", 1)[0].rstrip()
            cut = cut.rstrip(" ,.;:!-–—")
            if cut and not cut.endswith((".", "!", "?")):
                cut += "."
            s = cut

    return s


def clean_headline(text: str) -> str:
    s = clean_text(text)
    s = re.sub(r"^[\-\*\u2022]\s*", "", s).strip()
    s = s.strip(" \t\r\n,.;:!-–—")
    return s


def _ensure_one_sentence(desc: str) -> str:
    s = clean_text(desc).strip(" \t\r\n")
    if not s:
        return ""
    if len(re.findall(r"[.!?]", s)) >= 2:
        parts = re.split(r"(?<=[.!?])\s+", s)
        s = parts[0].strip()
    s = s.rstrip(" ,;:")
    if s and not s.endswith((".", "!", "?")):
        s += "."
    return s


def normalize_bullets(highlights: Any, max_count: int = 4) -> List[Dict[str, str]]:
    """
    Normalise a raw highlights list into clean bullet dicts.

    max_count controls both the padding floor and the hard cap.
    Default is 4 (legacy behaviour). Pass a higher value (e.g. 5 or 6)
    when the creator explicitly promises more items.
    """
    bullets: List[Dict[str, str]] = []

    if isinstance(highlights, list):
        for h in highlights:
            headline = ""
            desc = ""
            emoji = ""

            if isinstance(h, dict):
                headline = clean_headline(str(h.get("headline") or h.get("title") or ""))
                desc = str(h.get("description") or h.get("text") or "")
                emoji = str(h.get("emoji") or "")
            elif isinstance(h, str):
                s = clean_text(h)
                if ":" in s:
                    a, b = s.split(":", 1)
                    headline, desc = clean_headline(a), b.strip()
                elif "—" in s:
                    a, b = s.split("—", 1)
                    headline, desc = clean_headline(a), b.strip()
                elif "-" in s:
                    a, b = s.split("-", 1)
                    headline, desc = clean_headline(a), b.strip()
                else:
                    headline, desc = clean_headline(s), ""
            else:
                continue

            desc = _ensure_one_sentence(desc)

            if headline and desc:
                bullets.append(
                    {
                        "headline": headline,
                        "description": desc,
                        "emoji": emoji,
                    }
                )

    # Pad to exactly max_count bullets. Placeholder entries will be filtered
    # downstream by _filter_placeholder_headlines in extractor_assembly.py.
    while len(bullets) < max_count:
        bullets.append(
            {
                "headline": "Key detail",
                "description": "A concrete detail shown in the clip.",
                "emoji": "",
            }
        )

    bullets = bullets[:max_count]

    # Final sanitation pass
    for b in bullets:
        b["headline"] = clean_headline(b.get("headline", "")) or "Key detail"
        b["description"] = (
            _ensure_one_sentence(b.get("description", ""))
            or "A concrete detail shown in the clip."
        )
        if "emoji" not in b:
            b["emoji"] = ""

    return bullets


def _build_fallback_summary(base: str, content_type: str = "general") -> str:
    """
    Build a save-worthy fallback summary that focuses on utility rather than
    describing the content format.
    """
    base = clean_text(base).strip(" \t\r\n,.;:!-–—") or "Saved content"

    if content_type == "recipe":
        return (
            f"{base} gives a practical recipe reference with enough detail to return to later, "
            f"including the core ingredients, overall preparation approach, and the kind of result to expect when cooking it yourself."
        )

    if content_type == "workout":
        return (
            f"{base} works as a reusable workout reference, making it easier to remember the exercise selection, training focus, "
            f"and overall structure when you want to repeat the session or adapt it later."
        )

    if content_type == "tools":
        return (
            f"{base} is useful to save as a comparison reference, helping sort through the main options, trade-offs, "
            f"and practical reasons one choice may fit better than another before trying or buying anything."
        )

    if content_type == "location":
        return (
            f"{base} is worth keeping as a travel reference, making it easier to revisit the main places, route ideas, "
            f"or stop-by-stop highlights when planning where to go later."
        )

    return (
        f"{base} is worth saving as a quick reference, keeping the main practical ideas, comparisons, or decision-making points "
        f"in one place so they are easier to reuse later."
    )


def format_ai_summary(
    title_en: str,
    summary_en_raw: str,
    highlights_raw: Any,
    content_type: str = "general",
    max_bullets: int = 4,
) -> Tuple[str, List[Dict[str, str]]]:
    """
    Produce (paragraph, bullets) in the strict UI contract.
    Each bullet includes: headline, description, emoji.

    max_bullets: pass the creator's promised item count (3–6) to honour
    their explicit count. Default is 4 for all standard content.
    Caller: extractor_assembly._make_summary_block._fmt_headlines
    """
    raw_clean = clean_text(summary_en_raw or "")
    paragraph = clamp_paragraph_chars(raw_clean, 200, SUMMARY_PARAGRAPH_MAX)
    bullets = normalize_bullets(highlights_raw, max_count=max_bullets)

    needs_replacement = (
        not paragraph
        or _looks_like_recipe_dump(paragraph, content_type)
        or _has_banned_opener(paragraph)
        or _has_meta_summary_language(paragraph)
    )

    if needs_replacement:
        reason = "empty"
        if paragraph and _looks_like_recipe_dump(paragraph, content_type):
            reason = "recipe_dump"
        elif paragraph and _has_banned_opener(paragraph):
            reason = "banned_opener"
        elif paragraph and _has_meta_summary_language(paragraph):
            reason = "meta_summary"

        logger.info(
            "Replacing AI summary paragraph due to guardrail (%s). "
            "content_type=%s, original_len=%d",
            reason,
            content_type,
            len(raw_clean),
        )

        fallback = _build_fallback_summary(title_en, content_type)
        paragraph = clamp_paragraph_chars(fallback, 200, SUMMARY_PARAGRAPH_MAX)
        if not paragraph:
            base = clean_text(title_en).strip(" \t\r\n,.;:!-–—") or "Saved content"
            paragraph = f"{base}."

    return paragraph, bullets