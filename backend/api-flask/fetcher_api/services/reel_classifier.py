# fetcher_api/services/reel_classifier.py

"""
Deterministic reel classification (language-agnostic, caption-first).

Detect "recipe-ness" via structural signals:
- A block of consecutive ingredient-like lines (quantity-based).
- A block of consecutive short dash/bullet lines (name-only ingredient list).
- Ingredient-like line can be:
  (A) quantity-first: "250 g lentils"
  (B) name-first with qty+unit: "새우 20마리", "감자전분 8큰술", "물 200ml"
  (C) name-only with dash prefix: "-scallops", "-garlic", "-butter"
- Do NOT stop scanning the whole caption due to URLs; treat them as boundaries.
"""

import re
import unicodedata
from typing import Dict, List, Optional, Tuple

# Lines we ignore as content (but keep scanning afterwards)
IGNORE_LINE_RE = re.compile(r"^\s*(?:#|@)|https?://|www\.", re.IGNORECASE)

# Bullet/checklist prefixes (language-agnostic-ish)
BULLET_PREFIX_RE = re.compile(r"^\s*(?:[-•*]|🔸|🔹|✔️|✅)\s*")

# ----------------------------
# Unit patterns (NO trailing |)
# ----------------------------
LATIN_UNIT_TOKENS = [
    "g", "kg", "mg", "gr",
    "ml", "cl", "l",
    "oz", "lb",
    "tsp", "tbsp",
    "cup", "cups",
    r"c\.?\s*a\.?\s*s",
    r"c\.?\s*a\.?\s*c",
    "cucchiaio", "cucchiai", "cucchiaino", "cucchiaini",
    r"cuill[eè]re(?:s)?",
]
LATIN_UNIT_PATTERN = r"(?:%s)" % "|".join(LATIN_UNIT_TOKENS)

KOREAN_UNIT_TOKENS = [
    "큰술", "작은술", "스푼", "숟가락", "티스푼", "테이블스푼",
    "마리", "개", "장", "쪽",
    "그램", "킬로그램", "밀리리터", "리터",
]
KOREAN_UNIT_PATTERN = r"(?:%s)" % "|".join(KOREAN_UNIT_TOKENS)

# Unit anywhere (Latin is word-ish; Korean isn't word-delimited)
UNIT_ANY_RE = re.compile(rf"(?:\b{LATIN_UNIT_PATTERN}\b|{KOREAN_UNIT_PATTERN})", re.IGNORECASE)

# ----------------------------
# Number patterns
# ----------------------------
NUMBER_RE = r"\d+(?:[.,]\d+)?"

# Fused quantity+unit token like "200ml", "20마리", "8큰술"
LATIN_FUSED_UNITS_PATTERN = r"(?:ml|cl|l|g|kg|mg|oz|lb)"
FUSED_QTY_RE = re.compile(rf"({NUMBER_RE})\s*(?:{KOREAN_UNIT_PATTERN}|{LATIN_FUSED_UNITS_PATTERN})", re.IGNORECASE)


def _normalize_caption(text: str) -> str:
    s = text or ""
    if "\\n" in s and "\n" not in s:
        s = s.replace("\\n", "\n")
    return s


def _clean_lines(text: str, max_lines: int = 250) -> List[str]:
    s = _normalize_caption(text)
    return [ln.strip() for ln in s.splitlines() if ln.strip()][:max_lines]


def _is_unicode_number_token(tok: str) -> bool:
    if not tok:
        return False
    if re.fullmatch(r"\d+(?:[.,]\d+)?", tok):
        return True
    if re.fullmatch(r"\d+\s*/\s*\d+", tok):
        return True
    if len(tok) == 1:
        try:
            unicodedata.numeric(tok)
            return True
        except Exception:
            return False
    if all(ch.isdigit() for ch in tok) and any(ch.isdigit() for ch in tok):
        return True
    return False


def _extract_leading_qty(line: str) -> Optional[str]:
    s = BULLET_PREFIX_RE.sub("", line or "").strip()
    if not s:
        return None
    first = s.split()[0]
    if _is_unicode_number_token(first):
        return first
    if re.fullmatch(r"\d+\s*[-–]\s*\d+", first):
        return first
    return None


def _line_is_qty_like(line: str) -> Tuple[bool, bool]:
    raw = line or ""
    s = BULLET_PREFIX_RE.sub("", raw).strip()
    if not s:
        return (False, False)

    lead = _extract_leading_qty(s)
    if lead:
        return (True, bool(UNIT_ANY_RE.search(s)))

    if FUSED_QTY_RE.search(s) and len(s) <= 90:
        return (True, True)

    has_number = bool(re.search(NUMBER_RE, s))
    has_unit = bool(UNIT_ANY_RE.search(s))
    if has_number and has_unit and len(s) <= 120:
        return (True, True)

    return (False, False)


def _count_qty_features(caption: str) -> Dict[str, int]:
    lines = _clean_lines(caption)

    strong = 0
    weak = 0
    max_consecutive = 0
    cur_consecutive = 0

    for ln in lines:
        if IGNORE_LINE_RE.search(ln):
            cur_consecutive = 0
            continue

        is_qty, is_strong = _line_is_qty_like(ln)

        if is_qty:
            cur_consecutive += 1
            max_consecutive = max(max_consecutive, cur_consecutive)
            if is_strong:
                strong += 1
            else:
                weak += 1
        else:
            cur_consecutive = 0

    return {
        "qty_strong": strong,
        "qty_weak": weak,
        "qty_total": strong + weak,
        "qty_max_consecutive": max_consecutive,
    }


def _has_ingredient_name_list(caption: str) -> bool:
    """
    Detect ingredient lists that use short name-only lines with a leading
    dash, bullet, or similar marker — no quantities required.

    Works for any language because it only checks line structure:
      - Line starts with a dash/bullet/star
      - Line is short (< 80 chars after stripping the prefix)
      - Line doesn't start with # or @ (those are hashtags/mentions)
      - At least 3 consecutive such lines found

    Examples that match:
      -scallops 干貝
      -garlic 大蒜
      -lime 青檸檬
      -butter 奶油

      • chicken
      • rice
      • soy sauce
      • ginger
    """
    lines = _clean_lines(caption)

    max_consecutive = 0
    cur_consecutive = 0

    for ln in lines:
        stripped = ln.strip()

        # Skip empty, hashtags, mentions, URLs
        if not stripped:
            cur_consecutive = 0
            continue
        if IGNORE_LINE_RE.search(stripped):
            cur_consecutive = 0
            continue

        # Check if line starts with a dash/bullet prefix
        # and is short enough to be an ingredient (not a sentence)
        prefix_match = re.match(r'^[-•*–—]\s*', stripped)
        if prefix_match:
            content_after_prefix = stripped[prefix_match.end():].strip()
            # Must have some content, and be short (ingredient-length, not a paragraph)
            if content_after_prefix and len(content_after_prefix) < 80:
                cur_consecutive += 1
                max_consecutive = max(max_consecutive, cur_consecutive)
                continue

        # Not a dash-ingredient line — reset
        cur_consecutive = 0

    # 3+ consecutive short dash lines = likely an ingredient list
    return max_consecutive >= 3


def caption_looks_like_recipe(caption: str) -> bool:
    cap = caption or ""
    if not cap.strip():
        return False

    f = _count_qty_features(cap)

    # Ingredient block shape (consecutive quantity lines)
    if f["qty_max_consecutive"] >= 3 and f["qty_total"] >= 4:
        return True

    # Strong measurement evidence
    if f["qty_strong"] >= 2 and f["qty_total"] >= 3:
        return True

    # Weaker lists need more lines
    if f["qty_strong"] == 0 and f["qty_weak"] >= 7:
        return True

    # Name-only ingredient lists (no quantities, just dashes)
    if _has_ingredient_name_list(cap):
        return True

    return False


def classify_reel_content(transcript: str, caption: str) -> Dict:
    transcript = transcript or ""
    caption = caption or ""

    f = _count_qty_features(caption)
    is_recipe = caption_looks_like_recipe(caption)

    if is_recipe:
        return {
            "label": "recipe",
            "score": 900,
            "reason": "FORCED:caption_structure",
            "signals": {
                **f,
                "has_ingredient_name_list": _has_ingredient_name_list(caption),
                "has_transcript": bool(transcript.strip()),
            },
        }

    return {
        "label": "general",
        "score": 0,
        "reason": "no_recipe_signals",
        "signals": {
            **f,
            "has_transcript": bool(transcript.strip()),
        },
    }
