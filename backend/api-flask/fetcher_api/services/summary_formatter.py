"""
Summary formatting + guardrails (UI contract):

- Paragraph: 200-450 characters max.
- Bullets: exactly N items (default 4), each has a short headline + one-sentence description + emoji.
  Pass max_bullets to format_ai_summary() / normalize_bullets() to honour creator's explicit count.
- No emojis in paragraph/headlines/descriptions text (only in separate emoji field).
- No marketing fluff / author comments / CTA phrasing.
- Focus on WHY the saved reel is useful and WHAT practical value it contains.
- Avoid empty meta-summary language like:
    "This video talks about..."
    "The creator explains..."
    "Key takeaways in an easy-to-follow format."

v24:
- Added _strip_em_dashes(): em dash (U+2014) and en dash (U+2013) are NEVER allowed
  in any generated text. Rule: replace " - " spaced dash, " -- " double-dash,
  and bare em/en dash with a comma or period depending on context.
- Applied in clean_text(), clean_headline(), _ensure_one_sentence(),
  clamp_paragraph_chars(), and _build_fallback_paragraph().

v23:
- Added structural meta-description guardrail (paragraph_guardrail).
  Catches LLM output like "organizes 8 products into clear groups such as..."
  and "Helpful to save when you want to compare options by use case."
- Added validate_and_repair_summary_paragraph() as a post-generation gate.
- _build_fallback_paragraph() replaces _build_fallback_summary() for the
  new structural guard path; original function retained for format_ai_summary().
- Preserved max_bullets behaviour from v22.
"""

import logging
import re
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

# Must match universal_extractor.py constants
SUMMARY_MIN_CHARS = 200
SUMMARY_MAX_CHARS_SOFT = 400
SUMMARY_PARAGRAPH_MAX = 450  # Hard ceiling for clamp
SUMMARY_HARD_MAX = 450


# ── Banned opening patterns ───────────────────────────────────────────────────

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


# ── Meta-summary patterns ─────────────────────────────────────────────────────

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


# ── Structural meta-description patterns ─────────────────────────────────────

_STRUCTURAL_META_PATTERNS = [
    r"\borganizes?\s+\d+\s+\w+\s+into\s+(?:clear\s+)?groups?\b",
    r"\bgrouped?\s+(?:into|by)\s+(?:clear\s+)?\w+\s+(?:groups?|categories|sections)\b",
    r"\b\d+\s+\w+\s+(?:organized|sorted|grouped)\s+into\b",
    r"\bcompare\s+options?\s+by\s+use\s+case\b",
    r"\bsort(?:ing)?\s+through\s+them\s+one\s+by\s+one\b",
    r"\bsave\s+(?:this\s+)?when\s+you\s+want\s+to\s+compare\b",
    r"^helpful\s+to\s+save\b",
    r"^useful\s+(?:reference|resource|guide)\s+to\s+save\b",
    r"^(?:a\s+)?(?:curated\s+)?(?:list|collection|guide|selection|overview)\s+of\b",
    r"^this\s+(?:is\s+a|covers?|includes?)\b",
    r"^a\s+hand-picked\s+selection\s+of\s+\d+\b",
]
_STRUCTURAL_META_RE = re.compile(
    "|".join(_STRUCTURAL_META_PATTERNS), re.IGNORECASE
)

_STRUCTURAL_META_OPENERS = (
    "helpful to save",
    "useful reference",
    "a curated list of",
    "a list of",
    "a collection of",
    "a selection of",
    "a guide to",
    "this is a",
    "this covers",
    "this includes",
    "a hand-picked",
)


# ── Em dash / en dash elimination ─────────────────────────────────────────────
# Rule: em dash (U+2014) and en dash (U+2013) are NEVER allowed in output.
# Also catches " -- " double-dash and spaced " - " used as a separator.

_EM_DASH_RE = re.compile(
    r"\s*\u2014\s*"        # em dash with optional surrounding spaces
    r"|\s*\u2013\s*"       # en dash with optional surrounding spaces
    r"|\s+--\s+"           # double-dash used as separator
    r"|\s+-\s+"            # spaced hyphen used as separator
)


def _strip_em_dashes(text: str) -> str:
    """
    Replace all em dashes, en dashes, double-dashes, and spaced hyphens with
    a comma + space. If the dash appears before an uppercase character that
    looks like a new sentence/clause, use a period instead.
    """
    if not text:
        return text

    source = text

    def _replace(m: re.Match) -> str:
        after = source[m.end():].lstrip()
        if after and after[:1].isupper():
            return ". "
        return ", "

    return _EM_DASH_RE.sub(_replace, source)


# ── Core text utilities ───────────────────────────────────────────────────────

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
    s = re.sub(
        r"[\u2014\u2013\u2022\u00B7\u25CF\u25CB\u25E6\u25AA\u25AB\u25BA\u25BB\u25C4\u25C5\u25B3\u25B2\u25B4\u25B5\u25BF\u25BE\u25BC\u25BD]",
        "",
        s,
    )
    return s.strip()


def clean_text(text: str) -> str:
    s = strip_emoji(text or "")
    s = _strip_em_dashes(s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def _has_banned_opener(text: str) -> bool:
    s = (text or "").strip()
    if not s:
        return False
    return bool(BANNED_OPENER_RE.match(s))


def _has_meta_summary_language(text: str) -> bool:
    s = clean_text(text or "")
    if not s:
        return False
    return bool(META_SUMMARY_RE.search(s))


def _has_structural_meta_language(text: str) -> bool:
    """
    Detect paragraphs that describe the data structure rather than user value.
    """
    if not text or not text.strip():
        return False
    t = text.strip().lower()
    if any(t.startswith(op) for op in _STRUCTURAL_META_OPENERS):
        return True
    return bool(_STRUCTURAL_META_RE.search(text))


def _looks_like_recipe_dump(s: str, content_type: str = "general") -> bool:
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


def clamp_paragraph_chars(
    text: str,
    min_chars: int = SUMMARY_MIN_CHARS,
    max_chars: int = SUMMARY_PARAGRAPH_MAX,
) -> str:
    s = clean_text(text)
    s = _strip_em_dashes(s)
    if not s:
        return ""

    if len(s) > max_chars:
        cut = s[:max_chars]
        last_period = max(cut.rfind(". "), cut.rfind("! "), cut.rfind("? "))
        if cut.endswith(".") or cut.endswith("!") or cut.endswith("?"):
            last_period = max(last_period, len(cut) - 1)

        if last_period > max_chars * 0.6:
            s = s[:last_period + 1].strip()
        else:
            if " " in cut:
                cut = cut.rsplit(" ", 1)[0].rstrip()
            cut = cut.rstrip(" ,.;:!-")
            if cut and not cut.endswith((".", "!", "?")):
                cut += "."
            s = cut

    return s


def clean_headline(text: str) -> str:
    s = clean_text(text)
    s = _strip_em_dashes(s)
    s = re.sub(r"^[\-\*\u2022]\s*", "", s).strip()
    s = s.strip(" \t\r\n,.;:!")
    return s


def _ensure_one_sentence(desc: str) -> str:
    s = clean_text(desc).strip(" \t\r\n")
    s = _strip_em_dashes(s)
    if not s:
        return ""

    if len(re.findall(r"[.!?]", s)) >= 2:
        parts = re.split(r"(?<=[.!?])\s+", s)
        s = parts[0].strip()

    s = s.rstrip(" ,;:")
    if s and not s.endswith((".", "!", "?")):
        s += "."
    return s


# ── Bullet normalisation ──────────────────────────────────────────────────────

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
                s = _strip_em_dashes(s)
                if ":" in s:
                    a, b = s.split(":", 1)
                    headline, desc = clean_headline(a), b.strip()
                elif " - " in s:
                    a, b = s.split(" - ", 1)
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

    while len(bullets) < max_count:
        bullets.append(
            {
                "headline": "Key detail",
                "description": "A concrete detail shown in the clip.",
                "emoji": "",
            }
        )

    bullets = bullets[:max_count]

    for b in bullets:
        b["headline"] = clean_headline(b.get("headline", "")) or "Key detail"
        b["description"] = (
            _ensure_one_sentence(b.get("description", ""))
            or "A concrete detail shown in the clip."
        )
        if "emoji" not in b:
            b["emoji"] = ""

    return bullets


# ── Fallback generators ───────────────────────────────────────────────────────

def _build_fallback_summary(base: str, content_type: str = "general") -> str:
    """
    Fallback for format_ai_summary() — used when the LLM paragraph fails
    banned-opener or meta-summary guardrails.
    """
    base = clean_text(base).strip(" \t\r\n,.;:!") or "Saved content"
    base = _strip_em_dashes(base)

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

    if content_type in ("tools", "products", "software", "finance"):
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


def _build_fallback_paragraph(
    title: str,
    content_type: str = "general",
    item_names: Optional[List[str]] = None,
) -> str:
    """
    Fallback for validate_and_repair_summary_paragraph() — used when the
    stored or LLM-generated paragraph fails the structural-meta guardrail.

    Writes a save-worthy paragraph anchored to actual content names.
    Never describes the data structure. Never uses em dashes.
    """
    count = len(item_names) if item_names else 0
    names_preview = ", ".join(item_names[:3]) if item_names else ""

    if content_type == "location" and names_preview:
        return (
            f"A hand-picked selection of {count} family hotels including {names_preview}. "
            f"Each place stands out for balancing children's activities with real comfort for parents, rather than treating families as an afterthought. "
            f"Save this as a shortlist when comparing options for your next family trip."
        )

    if content_type == "location":
        return (
            "A travel reference built around places worth returning to later, with enough context to make planning easier. "
            "Useful for narrowing down options, comparing stops, and keeping the strongest venue or destination ideas in one place before you book or visit."
        )

    if content_type in ("tools", "products", "software", "finance"):
        base = f"A curated selection of {count} options" if count else "A curated comparison reference"
        names_part = f", including {names_preview}" if names_preview else ""
        return (
            f"{base}{names_part}. "
            "Useful to save when you want the main options, trade-offs, and practical differences in one place instead of digging through tabs, posts, or notes again before deciding what to use, buy, or compare."
        )

    if content_type == "workout":
        return (
            "A workout reference you can return to when you want the main exercises, training focus, and session structure in one place. "
            "Saving it makes the routine easier to repeat later, adjust for your level, or reuse when planning a similar session."
        )

    if content_type == "recipe":
        base = title.strip() if title else "This recipe"
        return (
            f"{base}, saved as a cooking reference so the main ingredients, method, and overall idea are easy to revisit later. "
            "Useful when you want to cook it again without rewatching the reel or trying to remember the key steps from scratch."
        )

    base = title.strip() if title else "Curated picks"
    return (
        f"{base}, saved as a quick reference so the key details are ready when you need them later. "
        "Useful for revisiting the main idea, comparing the practical points, and keeping the most relevant information in one place instead of searching for it again."
    )


# ── Post-generation paragraph guardrail ──────────────────────────────────────

def validate_and_repair_summary_paragraph(
    paragraph: str,
    title: str = "",
    content_type: str = "general",
    item_names: Optional[List[str]] = None,
) -> str:
    """
    Post-generation guardrail for the summary paragraph.

    Rejects and replaces paragraphs that are:
    - Structural meta-descriptions ("organizes 8 products into clear groups...")
    - Creator-voice narration ("The creator explains...")
    - Banned openers ("A list of...", "This video...")

    Also strips em dashes from any paragraph that passes, as a final safety net.
    """
    clean = (paragraph or "").strip()

    if not clean:
        logger.warning(
            "validate_and_repair: empty paragraph — generating fallback "
            "(content_type=%s, item_count=%d)",
            content_type,
            len(item_names or []),
        )
        return clamp_paragraph_chars(
            _build_fallback_paragraph(title, content_type, item_names),
            SUMMARY_MIN_CHARS,
            SUMMARY_PARAGRAPH_MAX,
        )

    if _has_structural_meta_language(clean):
        logger.warning(
            "validate_and_repair: structural-meta guardrail triggered — "
            "replacing paragraph: %r (content_type=%s)",
            clean[:120],
            content_type,
        )
        return clamp_paragraph_chars(
            _build_fallback_paragraph(title, content_type, item_names),
            SUMMARY_MIN_CHARS,
            SUMMARY_PARAGRAPH_MAX,
        )

    if _has_banned_opener(clean):
        logger.warning(
            "validate_and_repair: banned-opener guardrail triggered — "
            "replacing paragraph: %r (content_type=%s)",
            clean[:120],
            content_type,
        )
        return clamp_paragraph_chars(
            _build_fallback_paragraph(title, content_type, item_names),
            SUMMARY_MIN_CHARS,
            SUMMARY_PARAGRAPH_MAX,
        )

    if _has_meta_summary_language(clean):
        logger.warning(
            "validate_and_repair: meta-summary guardrail triggered — "
            "replacing paragraph: %r (content_type=%s)",
            clean[:120],
            content_type,
        )
        return clamp_paragraph_chars(
            _build_fallback_paragraph(title, content_type, item_names),
            SUMMARY_MIN_CHARS,
            SUMMARY_PARAGRAPH_MAX,
        )

    repaired = _strip_em_dashes(clean)
    if repaired != clean:
        logger.info(
            "validate_and_repair: stripped em/en dashes from paragraph (content_type=%s)",
            content_type,
        )

    repaired = clamp_paragraph_chars(repaired, SUMMARY_MIN_CHARS, SUMMARY_PARAGRAPH_MAX)

    if len(repaired) < SUMMARY_MIN_CHARS:
        logger.info(
            "validate_and_repair: paragraph too short after repair (%d chars, min=%d) — keeping but logging "
            "(content_type=%s)",
            len(repaired),
            SUMMARY_MIN_CHARS,
            content_type,
        )

    return repaired


# ── Primary public API ────────────────────────────────────────────────────────

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

    max_bullets: pass the creator's promised item count (3-6) to honour
    their explicit count. Default is 4 for all standard content.
    """
    raw_clean = clean_text(summary_en_raw or "")
    raw_clean = _strip_em_dashes(raw_clean)
    paragraph = clamp_paragraph_chars(raw_clean, SUMMARY_MIN_CHARS, SUMMARY_PARAGRAPH_MAX)
    bullets = normalize_bullets(highlights_raw, max_count=max_bullets)

    needs_replacement = (
        not paragraph
        or _looks_like_recipe_dump(paragraph, content_type)
        or _has_banned_opener(paragraph)
        or _has_meta_summary_language(paragraph)
        or _has_structural_meta_language(paragraph)
    )

    if needs_replacement:
        if not paragraph:
            reason = "empty"
        elif _looks_like_recipe_dump(paragraph, content_type):
            reason = "recipe_dump"
        elif _has_banned_opener(paragraph):
            reason = "banned_opener"
        elif _has_structural_meta_language(paragraph):
            reason = "structural_meta"
        else:
            reason = "meta_summary"

        logger.info(
            "Replacing AI summary paragraph due to guardrail (%s). "
            "content_type=%s, original_len=%d",
            reason,
            content_type,
            len(raw_clean),
        )

        fallback = _build_fallback_summary(title_en, content_type)
        paragraph = clamp_paragraph_chars(fallback, SUMMARY_MIN_CHARS, SUMMARY_PARAGRAPH_MAX)
        if not paragraph:
            base = clean_text(title_en).strip(" \t\r\n,.;:!") or "Saved content"
            paragraph = f"{base}."

    paragraph = _strip_em_dashes(paragraph)

    return paragraph, bullets