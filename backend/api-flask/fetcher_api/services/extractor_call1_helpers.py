"""
Standalone helpers for Call 1 parsing — extracted from extractor_call1.py
for maintainability.

Contains:
  - ASR correction loading and application
  - Handle/@mention → display-name resolution
  - Tool name validation, canonicalisation, deduplication
  - Ranked-list transcript parsing (ordinals, rank pairs)
  - Transcript-driven rank enrichment and item recovery
  - Brand name normalisation micro-call (async, Mistral)
  - Location sanitisation
  - Core tools_categories parser
  - Flat items → tools_categories promotion
"""

from __future__ import annotations

import json
import logging
import pathlib
import re
from typing import Optional

from fetcher_api.services.extractor_helpers import safe_list, safe_str

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════════════
# ASR CORRECTIONS
# ═══════════════════════════════════════════════════════════════════════════════

_ASR_PATH = pathlib.Path(__file__).parent.parent / "data" / "asr_corrections.json"


def _load_asr_corrections() -> tuple[dict[str, str], list[tuple[str, str]]]:
    try:
        data = json.loads(_ASR_PATH.read_text(encoding="utf-8"))
        tool_names: dict[str, str] = data.get("tool_names", {})

        raw_pairs = data.get("text_replacements", [])
        text_replacements: list[tuple[str, str]] = []
        for pair in raw_pairs:
            if (
                isinstance(pair, list)
                and len(pair) == 2
                and isinstance(pair[0], str)
                and isinstance(pair[1], str)
            ):
                text_replacements.append((pair[0], pair[1]))
            else:
                logger.warning(
                    "asr_corrections: skipping malformed text_replacement entry: %r", pair
                )

        logger.debug(
            "asr_corrections loaded: %d tool_names, %d text_replacements",
            len(tool_names), len(text_replacements),
        )
        return tool_names, text_replacements
    except Exception as exc:
        logger.warning("Failed to load asr_corrections.json: %s — using empty maps", exc)
        return {}, []


CANONICAL_TOOL_NAMES, ASR_TEXT_REPLACEMENTS = _load_asr_corrections()


def fix_asr_in_text(text: str) -> str:
    """Apply known ASR text replacements to free text."""
    if not text:
        return text
    result = text
    for garbled, canonical in ASR_TEXT_REPLACEMENTS:
        if not isinstance(garbled, str) or not isinstance(canonical, str):
            logger.warning("fix_asr_in_text: skipping non-string pair (%r, %r)", garbled, canonical)
            continue
        if garbled.lower() in result.lower():
            result = re.sub(re.escape(garbled), canonical, result, flags=re.IGNORECASE)
    return result


# ═══════════════════════════════════════════════════════════════════════════════
# HANDLE / @MENTION RESOLUTION
# ═══════════════════════════════════════════════════════════════════════════════

_HANDLE_RE = re.compile(r"@([a-z0-9._]+)", re.IGNORECASE)

_CAPTION_HANDLE_LINE_RE = re.compile(
    r"^\s*@([a-z0-9._]+)\s*(?:→|->|[-–—:]|\.)",
    re.IGNORECASE,
)

_TRANSCRIPT_VERDICT_NAME_RE = re.compile(
    r"(?:(?:^)|(?:[\.!\?\n]\s*))"
    r"([A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÖØ-öø-ÿ0-9&'’\.\- ]{0,40}?)"
    r",\s*tu\s+ach[èe]tes?",
    re.IGNORECASE,
)

_HANDLE_WORD_SPLIT_RE = re.compile(r"[._]+")


def _titlecase_phrase(text: str) -> str:
    words = []
    for word in safe_str(text).strip().split():
        if not word:
            continue
        if word.upper() in {"H&M", "COS", "BMW", "IWC", "GOTS"}:
            words.append(word.upper())
            continue
        if len(word) <= 3 and word.isupper():
            words.append(word)
            continue
        words.append(word[:1].upper() + word[1:].lower())
    return " ".join(words).strip()


def _clean_transcript_name(name: str) -> str:
    s = safe_str(name).strip(" ,.-–—:;")
    s = re.sub(r"\s{2,}", " ", s)
    s = re.sub(r"^(?:la|le|les|des|du)\s+", lambda m: m.group(0).lower(), s, flags=re.IGNORECASE)

    special = {
        "cosse": "COS",
        "kos": "COS",
        "asphalt": "Asphalte",
        "rosin club": "Rosyne Club",
        "mammoth": "Mammut",
        "mammut": "Mammut",
        "vaud": "Vaude",
        "vod": "Vaude",
        "clattermussen": "Klättermusen",
        "klattermussen": "Klättermusen",
        "thru dark": "ThruDark",
        "henry lloyd": "Henri Lloyd",
        "hamali": "Hamali",
        "mont": "Mont",
        "peak performance": "Peak Performance",
        "arc teryx": "Arc'teryx",
        "arcteryx": "Arc'teryx",
        "arc'teryx": "Arc'teryx",
    }
    return special.get(s.lower(), s)


def _humanize_handle(handle: str) -> str:
    raw = safe_str(handle).strip().lstrip("@")
    if not raw:
        return ""

    n = norm(raw)
    n8 = n[:8]
    if n in CANONICAL_TOOL_NAMES:
        return CANONICAL_TOOL_NAMES[n]
    if n8 in CANONICAL_TOOL_NAMES:
        return CANONICAL_TOOL_NAMES[n8]

    parts = [p for p in _HANDLE_WORD_SPLIT_RE.split(raw) if p]
    if not parts:
        parts = [raw]

    stop_suffixes = {"fr", "paris", "official", "store", "stores", "shop"}
    trimmed = list(parts)
    while len(trimmed) > 1 and trimmed[-1].lower() in stop_suffixes:
        trimmed.pop()

    if len(trimmed) == 1:
        token = trimmed[0]
        token_lower = token.lower()

        special_single = {
            "laredoute": "La Redoute",
            "monoprix": "Monoprix",
            "uniqlofr": "Uniqlo",
            "cosstores": "COS",
            "yvesdelormeparis": "Yves Delorme",
            "blanccerise": "Blanc Cerise",
            "actionfrance": "Action",
            "hmhome": "H&M Home",
            "vaude": "Vaude",
            "thrudark": "ThruDark",
            "arcteryx": "Arc'teryx",
            "mammut": "Mammut",
        }
        if token_lower in special_single:
            return special_single[token_lower]

    text = " ".join(trimmed)
    text = text.replace("hm ", "H&M ")
    text = text.replace("Hm ", "H&M ")
    return _titlecase_phrase(text)


def build_handle_display_map(caption: str, transcript: str) -> dict[str, str]:
    """
    Build a best-effort @handle -> display-name map.

    Primary strategy:
      - take caption verdict lines in order
      - take transcript verdict names in order
      - zip them when counts align enough

    Fallback:
      - humanize the handle itself
    """
    handle_order: list[str] = []
    seen_handles: set[str] = set()

    for line in safe_str(caption).splitlines():
        m = _CAPTION_HANDLE_LINE_RE.match(line)
        if not m:
            continue
        handle = m.group(1).strip().lower()
        if handle and handle not in seen_handles:
            seen_handles.add(handle)
            handle_order.append(handle)

    transcript_names: list[str] = []
    seen_names: set[str] = set()
    for m in _TRANSCRIPT_VERDICT_NAME_RE.finditer(safe_str(transcript)):
        candidate = _clean_transcript_name(m.group(1))
        n = norm(candidate)
        if not candidate or not n or n in seen_names:
            continue
        seen_names.add(n)
        transcript_names.append(candidate)

    result: dict[str, str] = {}

    if handle_order and transcript_names:
        usable = min(len(handle_order), len(transcript_names))
        if usable >= max(2, len(handle_order) - 1):
            for idx in range(usable):
                result[handle_order[idx]] = transcript_names[idx]

    for handle in handle_order:
        result.setdefault(handle, _humanize_handle(handle))

    return result


def resolve_tool_display_name(
    name: str,
    handle_display_map: dict[str, str] | None = None,
) -> str:
    """
    Convert raw tool/item names into display names.

    Handles:
      - @mentions from caption output
      - direct handle-like strings
      - ASR canonical corrections
    """
    original = clean_tool_name(name)
    if not original:
        return original

    s = original
    handle_display_map = handle_display_map or {}

    if s.startswith("@"):
        handle = s.lstrip("@").strip().lower()
        mapped = handle_display_map.get(handle)
        if mapped:
            return mapped
        return _humanize_handle(handle)

    if re.fullmatch(r"[a-z0-9._]+", s, flags=re.IGNORECASE) and ("." in s or "_" in s):
        handle = s.strip().lower()
        mapped = handle_display_map.get(handle)
        if mapped:
            return mapped
        return _humanize_handle(handle)

    canonical = canonicalize_tool_name(s)
    return canonical


# ═══════════════════════════════════════════════════════════════════════════════
# TOOL NAME VALIDATION
# ═══════════════════════════════════════════════════════════════════════════════

INVALID_TOOL_NAMES = frozenset({
    "", "i", "ia", "ai", "app", "tool", "platform", "software",
    "application", "service", "site", "website", "solution",
    "outil", "outils", "logiciel", "logiciels",
    "producto", "productos", "marca", "marcas",
    "produkt", "produkte", "marke", "marken",
})

TECH_SUFFIXES = frozenset({
    "ai", "lab", "labs", "app", "io", "clip", "magic", "finder",
    "chat", "bot", "hub", "flow", "cast", "kit", "sdk", "api",
    "cloud", "gen", "gpt", "llm", "ml", "studio", "engine", "pro",
    "plus", "max", "one", "go", "now", "live", "stream", "base",
    "suite", "run", "link", "site", "web", "box", "list",
})

_TEACHING_SIGNALS = (
    "teaches", "teach", "training", "formation", "cours ",
    "apprend", "enseigne", "income from social", "generate more",
    "generate income", "make money", "earn money",
    "coach", "mentor", "expert", "consultant",
)


def norm(name: str) -> str:
    """Lowercase + strip non-alphanumeric. Used as lookup key."""
    return re.sub(r"[^a-z0-9]", "", name.lower())


def norm8(name: str) -> str:
    return norm(name)[:8]


def canonicalize_tool_name(name: str) -> str:
    raw = safe_str(name).strip()
    n = norm(raw)
    n8 = n[:8]

    special = {
        "arcteryx": "Arc'teryx",
        "mammoth": "Mammut",
        "mammut": "Mammut",
        "vaud": "Vaude",
        "vod": "Vaude",
        "vaude": "Vaude",
        "clattermussen": "Klättermusen",
        "klattermussen": "Klättermusen",
        "henrylloyd": "Henri Lloyd",
        "hamali": "Hamali",
        "thrudark": "ThruDark",
        "malay": "Millet",
        "millet": "Millet",
    }
    if n in special:
        return special[n]

    if n in CANONICAL_TOOL_NAMES:
        return CANONICAL_TOOL_NAMES[n]
    if n8 in CANONICAL_TOOL_NAMES:
        return CANONICAL_TOOL_NAMES[n8]
    return raw


def clean_tool_name(name: str) -> str:
    return (name or "").strip()


def is_valid_tool_name(name: str) -> bool:
    cleaned_raw = (name or "").strip()
    cleaned = cleaned_raw.lower()

    if cleaned in INVALID_TOOL_NAMES:
        return False
    if not cleaned_raw:
        return False
    if "\n" in cleaned_raw:
        return False
    if cleaned_raw.startswith("["):
        return False
    if len(cleaned_raw) > 80:
        return False
    if len(cleaned_raw.split()) > 8:
        return False
    if re.fullmatch(r"[^a-zA-Z0-9@&\-\. ]+", cleaned):
        return False
    if re.fullmatch(r"[A-Z0-9&\-\.]{2,6}", cleaned_raw):
        return True
    if cleaned_raw.startswith("@") and len(cleaned_raw) >= 3:
        return True
    if len(cleaned) < 2:
        return False
    return True


def looks_like_person_name(name: str, description: str = "") -> bool:
    words = name.strip().split()
    if len(words) != 2:
        return False
    first_w, last_w = words[0].lower(), words[1].lower()
    if first_w in TECH_SUFFIXES or last_w in TECH_SUFFIXES:
        return False
    both_proper = (
        re.match(r"^[A-ZÀ-ÖØ-Þ][a-zà-öø-ÿ]+$", words[0]) and
        re.match(r"^[A-ZÀ-ÖØ-Þ][a-zà-öø-ÿ]+$", words[1])
    )
    if not both_proper:
        return False
    desc_lower = description.lower()
    return any(sig in desc_lower for sig in _TEACHING_SIGNALS)


# ═══════════════════════════════════════════════════════════════════════════════
# CREATOR RATING
# ═══════════════════════════════════════════════════════════════════════════════

_VALID_CREATOR_RATINGS = {"best", "good", "bad"}


def parse_creator_rating(raw) -> str | None:
    if not raw:
        return None
    v = str(raw).strip().lower()
    return v if v in _VALID_CREATOR_RATINGS else None


def resolve_creator_rating(raw, rank=None) -> str | None:
    explicit = parse_creator_rating(raw)
    return explicit


# ═══════════════════════════════════════════════════════════════════════════════
# OPTIONAL BOOLEAN PARSING
# ═══════════════════════════════════════════════════════════════════════════════

_TRUE_VALUES = {"true", "1", "yes", "y", "free", "gratuit", "gratis"}
_FALSE_VALUES = {"false", "0", "no", "n", "paid", "premium", "payant"}


def parse_optional_bool(raw, default=None):
    if raw is None:
        return default
    if isinstance(raw, bool):
        return raw
    if isinstance(raw, (int, float)):
        return bool(raw)

    s = str(raw).strip().lower()
    if not s:
        return default
    if s in _TRUE_VALUES:
        return True
    if s in _FALSE_VALUES:
        return False
    return default


# ═══════════════════════════════════════════════════════════════════════════════
# DESCRIPTION SANITISATION — strip fabricated specs
# ═══════════════════════════════════════════════════════════════════════════════

_FABRICATED_SPEC_RE = re.compile(
    r",?\s*"
    r"(?:with\s+|featuring\s+|offering\s+|boasting\s+|spanning\s+"
    r"|covering\s+|totaling\s+|totalling\s+|connected\s+to\s+"
    r"|including\s+|comprising\s+)?"
    r"\d[\d,\.]*\s*"
    r"(?:km²?|kilometers?|km\b|miles?\b|m\b(?!\w)|meters?\b|hectares?\b|acres?\b)"
    r"(?:\s+of\s+[\w\s]{1,30}?)?"
    r"(?=\s*[,\.]|\s+and\b|$)",
    re.IGNORECASE,
)

_ALTITUDE_RE = re.compile(
    r",?\s*(?:at|above|reaching|sitting\s+at)\s+\d[\d,\.]*\s*"
    r"(?:m\b(?!\w)|meters?\b|km\b|kilometers?\b)",
    re.IGNORECASE,
)


def strip_fabricated_specs(description: str) -> str:
    if not description:
        return description
    cleaned = _FABRICATED_SPEC_RE.sub("", description)
    cleaned = _ALTITUDE_RE.sub("", cleaned)
    cleaned = re.sub(r"\s{2,}", " ", cleaned)
    cleaned = re.sub(r"^[\s,\.]+|[\s,\.]+$", "", cleaned)
    cleaned = re.sub(r",\s*,", ",", cleaned)
    if cleaned != description:
        logger.debug(
            "strip_fabricated_specs: '%s' → '%s'",
            description[:80], cleaned[:80],
        )
    return cleaned


# ═══════════════════════════════════════════════════════════════════════════════
# TIER VALIDATION
# ═══════════════════════════════════════════════════════════════════════════════

_VALID_TIERS = frozenset({"S", "A", "B", "C", "D", "F"})


def parse_tier(raw) -> str | None:
    if not raw:
        return None
    v = str(raw).strip().upper()
    return v if v in _VALID_TIERS else None


# ═══════════════════════════════════════════════════════════════════════════════
# ORDINALS & RANK PARSING
# ═══════════════════════════════════════════════════════════════════════════════

ORDINAL_TO_INT: dict[str, int] = {
    "one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
    "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
    "eleven": 11, "twelve": 12, "thirteen": 13, "fourteen": 14,
    "fifteen": 15, "sixteen": 16, "seventeen": 17, "eighteen": 18,
    "nineteen": 19, "twenty": 20,
    "first": 1, "second": 2, "third": 3, "fourth": 4, "fifth": 5,
    "sixth": 6, "seventh": 7, "eighth": 8, "ninth": 9, "tenth": 10,
}

ORDINAL_WORDS_RE = "|".join(re.escape(w) for w in ORDINAL_TO_INT)


def parse_rank(raw) -> int | None:
    if raw is None:
        return None
    if isinstance(raw, (int, float)):
        v = int(raw)
        return v if v > 0 else None
    s = str(raw).strip().lower()
    if not s:
        return None
    s = re.sub(r"(?:st|nd|rd|th)$", "", s)
    if s in ORDINAL_TO_INT:
        return ORDINAL_TO_INT[s]
    try:
        v = int(s)
        return v if v > 0 else None
    except (ValueError, TypeError):
        return None


def _strip_asr_source_headers(transcript: str) -> str:
    """
    Removes labels like [Deepgram], [Voxtral], and helper notes while keeping
    the actual transcript text.
    """
    if not transcript:
        return ""

    lines: list[str] = []
    for line in safe_str(transcript).splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.startswith("[") and stripped.endswith("]"):
            continue
        lines.append(stripped)

    return " ".join(lines).strip()


def _clean_rank_name_fragment(name: str) -> str:
    """
    Clean a name fragment found near a rank number.

    Important: do not over-normalize here. Canonical name repair is handled by
    resolve_tool_display_name/canonicalize_tool_name and, later, the LLM name
    normalization micro-call.
    """
    s = _clean_transcript_name(name)
    s = re.sub(r"\b(?:and|then|next|number|ranked?|rank)\b$", "", s, flags=re.IGNORECASE)
    s = re.sub(r"^(?:and|then|next)\s+", "", s, flags=re.IGNORECASE)
    s = re.sub(r"\s{2,}", " ", s)
    return s.strip(" ,.-–—:;")


def _add_rank_pair(
    pairs: list[tuple[str, int]],
    seen: set[tuple[str, int]],
    name: str,
    rank_raw,
) -> None:
    rank = parse_rank(rank_raw)
    if rank is None:
        return

    cleaned = _clean_rank_name_fragment(name)
    if not cleaned:
        return

    if len(cleaned) > 70 or len(cleaned.split()) > 8:
        return

    # Reject obvious garbage fragments.
    if re.search(r"^\d+$", cleaned):
        return
    if cleaned.lower() in {"number", "rank", "ranked", "and", "then", "next"}:
        return

    key = (norm(cleaned), rank)
    if not key[0] or key in seen:
        return

    seen.add(key)
    pairs.append((cleaned, rank))


def _dedupe_rank_pairs(pairs: list[tuple[str, int]]) -> list[tuple[str, int]]:
    """
    Deduplicate rank pairs.

    Prefer the more canonical-looking name when the same rank appears multiple
    times from multiple ASR sources.
    """
    by_rank: dict[int, str] = {}

    def score_name(name: str) -> tuple[int, int, int]:
        # Higher is better.
        has_space = 1 if " " in name else 0
        has_acronym = 1 if re.search(r"\b[A-Z]{2,}\b", name) else 0
        length_score = min(len(name), 40)
        return (has_space, has_acronym, length_score)

    for name, rank in pairs:
        existing = by_rank.get(rank)
        if not existing:
            by_rank[rank] = name
            continue

        if score_name(name) > score_name(existing):
            by_rank[rank] = name

    return sorted(
        [(name, rank) for rank, name in by_rank.items()],
        key=lambda x: x[1],
    )


def parse_transcript_rank_pairs(transcript: str) -> list[tuple[str, int]]:
    """
    Parse explicit item/rank pairs from ASR transcript.

    Handles all of these patterns:

      "Rolex. 9. Breguet. 2."
      "Rolex 9 Breguet 2 Cartier 7"
      "number 9 Rolex"
      "ranked 9 Rolex"
      "Rolex is 9"
      "Rolex ninth"

    Critical behavior:
      In short ranked-list transcripts, the number immediately AFTER the name
      is treated as the rank. Mention order is never treated as rank.
    """
    if not transcript:
        return []

    t = _strip_asr_source_headers(transcript)
    if not t:
        return []

    pairs: list[tuple[str, int]] = []
    seen: set[tuple[str, int]] = set()

    # Pattern A: "number 9 Rolex" / "ranked 9 Rolex"
    rank_before_name_re = re.compile(
        rf"\b(?:number|ranked?|rank)\s+(\d+|{ORDINAL_WORDS_RE})[,\s:;-]+"
        rf"([A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÖØ-öø-ÿ0-9&'’\.\- ]{{1,70}}?)"
        rf"(?=(?:[,\.]|$|\s+(?:number|ranked?|rank)\s+\d|\s+[A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÖØ-öø-ÿ0-9&'’\.\- ]+\s+\d))",
        re.IGNORECASE,
    )
    for m in rank_before_name_re.finditer(t):
        _add_rank_pair(pairs, seen, m.group(2), m.group(1))

    # Pattern B: "Rolex. 9. Breguet. 2."
    tokens = [tok.strip().rstrip(".").strip() for tok in re.split(r"\.\s+", t.strip())]
    tokens = [tok for tok in tokens if tok]

    i = 0
    while i < len(tokens) - 1:
        current = tokens[i]
        nxt = tokens[i + 1]

        # name -> rank
        rank_after = parse_rank(nxt)
        if rank_after is not None:
            _add_rank_pair(pairs, seen, current, rank_after)
            i += 2
            continue

        # rank -> name
        rank_current = parse_rank(current)
        if rank_current is not None:
            _add_rank_pair(pairs, seen, nxt, rank_current)
            i += 2
            continue

        i += 1

    # Pattern C: inline compact list:
    # "Rolex 9 Breguet 2 GLC 4 Cartier 7 Patek 3 ..."
    #
    # This is the important one for the watch-ranking case.
    name_then_rank_re = re.compile(
        rf"(?<!\w)"
        rf"([A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÖØ-öø-ÿ0-9&'’\.\-]*(?:\s+[A-ZÀ-ÖØ-Þ]?[A-Za-zÀ-ÖØ-öø-ÿ0-9&'’\.\-]+){{0,4}}?)"
        rf"\s+(\d+|{ORDINAL_WORDS_RE})(?:st|nd|rd|th)?"
        rf"(?=(?:[\.,;:]|\s+[A-ZÀ-ÖØ-Þ]|\s*$))",
        re.IGNORECASE,
    )
    for m in name_then_rank_re.finditer(t):
        name = m.group(1)
        rank_raw = m.group(2)

        # Avoid false positives where the "name" starts too far back.
        name = re.sub(
            r"^.*?(?=([A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÖØ-öø-ÿ0-9&'’\.\-]*(?:\s|$)))",
            "",
            name,
        ).strip()

        _add_rank_pair(pairs, seen, name, rank_raw)

    # Pattern D: "Rolex is 9" / "Rolex is ninth"
    is_rank_re = re.compile(
        rf"\b([A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÖØ-öø-ÿ0-9&'’\.\- ]{{1,70}}?)\s+"
        rf"(?:is|was|comes|came|ranked)\s+"
        rf"(?:at\s+|in\s+)?(?:number\s+)?(\d+|{ORDINAL_WORDS_RE})(?:st|nd|rd|th)?\b",
        re.IGNORECASE,
    )
    for m in is_rank_re.finditer(t):
        _add_rank_pair(pairs, seen, m.group(1), m.group(2))

    return _dedupe_rank_pairs(pairs)


def is_ranked_list_transcript(transcript: str) -> bool:
    if not transcript:
        return False

    t = _strip_asr_source_headers(transcript).lower()
    if not t:
        return False

    marker_hits = len(re.findall(
        rf"\b(?:number|ranked?|rank)\s+(?:\d+|{ORDINAL_WORDS_RE})\b", t
    ))
    if marker_hits >= 2:
        return True

    pairs = parse_transcript_rank_pairs(transcript)
    if len(pairs) >= 3:
        return True

    # Compact ranked-list form: repeated "Name number" rhythm.
    compact_hits = len(re.findall(
        rf"\b[A-ZÀ-ÖØ-Þ]?[a-zà-öø-ÿA-Z0-9&'’\.\-]+\s+"
        rf"(?:\d+|{ORDINAL_WORDS_RE})(?:st|nd|rd|th)?"
        rf"(?=(?:[\.,;:]|\s+[A-ZÀ-ÖØ-Þ]|\s*$))",
        _strip_asr_source_headers(transcript),
        flags=re.IGNORECASE,
    ))
    return compact_hits >= 3


def has_complete_rank_sequence(tools_categories: list[dict]) -> bool:
    """
    Keep this function for compatibility, but do NOT use a complete 1..N sequence
    as proof that ranks are correct.

    Mistral often creates a fake complete sequence from mention order. In ranked
    transcripts, explicit transcript pairs must override LLM ranks.

    Returning False here forces Call1Mixin to run transcript rank enrichment
    instead of skipping it.
    """
    return False


# ═══════════════════════════════════════════════════════════════════════════════
# TRANSCRIPT-DRIVEN RANK ENRICHMENT
# ═══════════════════════════════════════════════════════════════════════════════

def _loose_name_keys(name: str) -> set[str]:
    """
    Build forgiving keys for matching ASR fragments to canonical item names.

    This is not a global brand dictionary. It is a generic matching helper:
      - normalized full string
      - useful words
      - initials/acronyms
      - stems for common ASR endings
    """
    raw = safe_str(name).strip()
    n = norm(raw)

    keys: set[str] = set()
    if n:
        keys.add(n)
        if len(n) >= 8:
            keys.add(n[:8])
        if len(n) >= 6:
            keys.add(n[:6])

    words = re.findall(r"[A-Za-zÀ-ÖØ-öø-ÿ0-9]+", raw)
    useful_words = [
        w for w in words
        if len(norm(w)) >= 3 and norm(w) not in {"the", "and", "for", "with"}
    ]

    for word in useful_words:
        wn = norm(word)
        if wn:
            keys.add(wn)
            if len(wn) >= 5:
                keys.add(wn[:5])
            # Common ASR drift: "Langer" / "Langa" for "Lange".
            if len(wn) >= 5 and wn.endswith(("r", "a", "er")):
                keys.add(re.sub(r"(?:er|r|a)$", "e", wn))

    if len(useful_words) >= 2:
        initials = "".join(w[0] for w in useful_words if w)
        if len(initials) >= 2:
            keys.add(initials.lower())

    # For names like "A. Lange & Söhne", make "lange" very easy to match.
    if len(useful_words) >= 2 and len(norm(useful_words[0])) <= 2:
        second = norm(useful_words[1])
        if second:
            keys.add(second)
            if len(second) >= 5:
                keys.add(second[:5])

    return {k for k in keys if k}


def _names_match_loose(item_name: str, fragment: str) -> bool:
    item_keys = _loose_name_keys(item_name)
    frag_keys = _loose_name_keys(fragment)

    if not item_keys or not frag_keys:
        return False

    if item_keys & frag_keys:
        return True

    item_norm = norm(item_name)
    frag_norm = norm(fragment)

    if item_norm and frag_norm:
        if item_norm.startswith(frag_norm) or frag_norm.startswith(item_norm):
            return True

        # Prefix overlap for ASR-shortened fragments.
        if len(frag_norm) >= 4 and frag_norm[:4] in item_norm:
            return True

        if len(item_norm) >= 4 and item_norm[:4] in frag_norm:
            return True

    canonical_frag = canonicalize_tool_name(fragment)
    canonical_norm = norm(canonical_frag)
    if canonical_norm and item_norm:
        if canonical_norm == item_norm:
            return True
        if canonical_norm.startswith(item_norm[:6]) or item_norm.startswith(canonical_norm[:6]):
            return True

    return False


def match_item_to_rank(
    item_name: str,
    pairs: list[tuple[str, int]],
) -> int | None:
    if not item_name or not pairs:
        return None

    for frag, rank in pairs:
        if _names_match_loose(item_name, frag):
            return rank

    return None


def enrich_ranks_from_transcript(
    tools_categories: list[dict],
    pairs: list[tuple[str, int]],
) -> list[dict]:
    """
    Transcript rank pairs are authoritative.

    If the transcript says "Rolex 9", Rolex becomes rank 9 even if the LLM
    previously made Rolex rank 1 because it was mentioned first.
    """
    if not pairs or not tools_categories:
        return tools_categories

    enriched = []
    changed = 0

    for cat in tools_categories:
        new_items = []
        for item in cat.get("items", []):
            name = item.get("name", "")
            matched = match_item_to_rank(name, pairs)

            if matched is not None and matched != item.get("rank"):
                logger.info(
                    "enrich_ranks: '%s' rank %r → %d (explicit transcript pair)",
                    name,
                    item.get("rank"),
                    matched,
                )
                item = {**item, "rank": matched}
                changed += 1

            new_items.append(item)

        enriched.append({**cat, "items": new_items})

    if changed:
        logger.info("enrich_ranks: corrected %d item ranks from transcript", changed)

    return _sort_ranked_tools_categories(enriched)


def _sort_ranked_tools_categories(tools_categories: list[dict]) -> list[dict]:
    """
    Sort ranked items by rank when a category is clearly ranked.
    Keeps unranked items after ranked ones.
    """
    result = []
    for cat in tools_categories or []:
        items = list(cat.get("items", []) or [])
        ranked_count = sum(1 for item in items if isinstance(item.get("rank"), int))

        if ranked_count >= 2:
            items.sort(key=lambda x: (
                x.get("rank") is None,
                x.get("rank") if isinstance(x.get("rank"), int) else 9999,
                safe_str(x.get("name", "")).lower(),
            ))

        result.append({**cat, "items": items})

    return result


def add_missing_transcript_items(
    tools_categories: list[dict],
    pairs: list[tuple[str, int]],
    handle_display_map: dict[str, str] | None = None,
) -> list[dict]:
    """
    Add items present in explicit transcript rank pairs but missing from the
    LLM's structured output.

    This avoids relying on the LLM to list every ranked item correctly.
    """
    if not pairs or not tools_categories:
        return tools_categories

    existing_norms: set[str] = set()
    existing_ranks: set[int] = set()

    for cat in tools_categories:
        for item in cat.get("items", []):
            name = safe_str(item.get("name", "")).strip()
            if name:
                for key in _loose_name_keys(name):
                    existing_norms.add(key)

            rank = item.get("rank")
            if isinstance(rank, int) and rank > 0:
                existing_ranks.add(rank)

    added: list[dict] = []

    for frag, rank in pairs:
        resolved = resolve_tool_display_name(frag, handle_display_map=handle_display_map)
        canonical = canonicalize_tool_name(resolved)

        if not canonical or not is_valid_tool_name(canonical):
            continue

        frag_keys = _loose_name_keys(frag) | _loose_name_keys(canonical)
        already_by_name = bool(existing_norms & frag_keys)
        already_by_rank = rank in existing_ranks

        # If rank already exists and the name is only a weak ASR variant, do not add duplicate.
        if already_by_name:
            continue

        if already_by_rank:
            logger.debug(
                "add_missing: rank %d already exists; not adding weak extra fragment '%s'",
                rank,
                frag,
            )
            continue

        if len(canonical) > 60 or "\n" in canonical or canonical.startswith("[") or len(canonical.split()) > 6:
            logger.debug("add_missing: rejected long/garbage fragment '%s'", canonical[:50])
            continue

        for key in _loose_name_keys(canonical):
            existing_norms.add(key)
        existing_ranks.add(rank)

        added.append({
            "rank": rank,
            "tier": None,
            "name": canonical,
            "description": "",
            "score": None,
            "why_it_matters": "",
            "free": None,
            "url": None,
            "source": "transcript_recovery",
            "creator_rating": None,
        })

        logger.info(
            "add_missing: recovered '%s' rank %d from transcript fragment '%s'",
            canonical,
            rank,
            frag,
        )

    if not added:
        return _sort_ranked_tools_categories(tools_categories)

    enriched = list(tools_categories)
    first = enriched[0]
    enriched[0] = {**first, "items": first.get("items", []) + added}

    return _sort_ranked_tools_categories(enriched)


# ═══════════════════════════════════════════════════════════════════════════════
# LOCATION SANITISATION
# ═══════════════════════════════════════════════════════════════════════════════

_DISH_RECIPE_RE = re.compile(
    r"\d+\s*[gG°%]"
    r"|\d+\s*(ml|cl|oz|tbsp|tsp|cup|cups)\b"
    r"|\bbake\b|\bcook\s+at\b|\bpreheat\b"
    r"|\d+[\s\-]+\d+\s*min"
    r"|\bdegrees?\b|\bcelsius\b|\bfahrenheit\b"
    r"|\boven\b|\bboil\b|\bfry\b|\bsimmer\b",
    re.IGNORECASE,
)


def sanitize_location(location: dict | None) -> dict | None:
    if not isinstance(location, dict):
        return location
    what_to_try = location.get("what_to_try")
    if not isinstance(what_to_try, list):
        return location
    cleaned = []
    for dish in what_to_try:
        if not isinstance(dish, dict):
            continue
        text = dish.get("text") or ""
        if text and _DISH_RECIPE_RE.search(text):
            logger.info("Stripped recipe instruction from location dish: %r", text[:60])
            dish = {**dish, "text": None}
        cleaned.append(dish)
    return {**location, "what_to_try": cleaned}


# ═══════════════════════════════════════════════════════════════════════════════
# CORE TOOLS PARSER
# ═══════════════════════════════════════════════════════════════════════════════

def parse_tools_categories(
    raw_tools: dict | None,
    handle_display_map: dict[str, str] | None = None,
) -> list[dict] | None:
    """Parse and sanitise the tools categories block from Mistral's response."""
    if not isinstance(raw_tools, dict):
        return None
    categories_raw = raw_tools.get("categories", [])
    if not isinstance(categories_raw, list) or not categories_raw:
        return None

    categories: list[dict] = []
    seen_globally: set[str] = set()

    for cat in categories_raw:
        if not isinstance(cat, dict):
            continue

        cat_name = safe_str(cat.get("name", "")).strip()
        cat_emoji = safe_str(cat.get("emoji", "")).strip()
        raw_items = cat.get("items", [])
        if not isinstance(raw_items, list):
            continue

        seen_in_cat: set[str] = set()
        clean_items: list[dict] = []

        for item in raw_items:
            if not isinstance(item, dict):
                continue

            raw_name = clean_tool_name(safe_str(item.get("name", "")))
            if not is_valid_tool_name(raw_name):
                continue

            name = resolve_tool_display_name(
                raw_name,
                handle_display_map=handle_display_map,
            )
            canonical = canonicalize_tool_name(name)
            if canonical != name or name != raw_name:
                logger.info("parse_tools: '%s' -> '%s'", raw_name, canonical)
                name = canonical

            desc = safe_str(item.get("description", "")).strip()
            desc = strip_fabricated_specs(desc)

            if looks_like_person_name(name, desc):
                logger.info("parse_tools: removed creator name '%s'", name)
                continue

            key_full = norm(name)
            key8 = key_full[:8]
            if (
                not key_full
                or key_full in seen_in_cat
                or key8 in seen_in_cat
                or key_full in seen_globally
                or key8 in seen_globally
            ):
                logger.info("parse_tools: removed duplicate '%s'", name)
                continue

            seen_in_cat.add(key_full)
            seen_in_cat.add(key8)
            seen_globally.add(key_full)
            seen_globally.add(key8)

            tier_str = parse_tier(item.get("tier"))
            rank_int = None if tier_str else parse_rank(item.get("rank"))

            clean_items.append({
                "rank": rank_int,
                "tier": tier_str,
                "name": name,
                "description": desc,
                "score": item.get("score"),
                "why_it_matters": safe_str(item.get("why_it_matters", "")).strip(),
                "free": parse_optional_bool(item.get("free"), default=None),
                "url": safe_str(item.get("url") or "").strip() or None,
                "source": safe_str(item.get("source", "transcript")).strip(),
                "creator_rating": resolve_creator_rating(item.get("creator_rating")),
            })

        if clean_items:
            categories.append({"name": cat_name, "emoji": cat_emoji, "items": clean_items})

    return categories if categories else None


# ═══════════════════════════════════════════════════════════════════════════════
# PROMOTE FLAT ITEMS → TOOLS CATEGORIES
# ═══════════════════════════════════════════════════════════════════════════════

def promote_items_to_tools(
    items: list[dict] | None,
    category_name: str = "Items",
    category_emoji: str = "",
    transcript: str = "",
    handle_display_map: dict[str, str] | None = None,
) -> list[dict] | None:
    """
    Converts a flat items[] list into tools_categories[] format.
    """
    if not items or not isinstance(items, list):
        return None

    pairs = parse_transcript_rank_pairs(transcript) if transcript else []

    seen: set[str] = set()
    clean: list[dict] = []
    for idx, item in enumerate(items):
        if not isinstance(item, dict):
            continue
        raw_name = clean_tool_name(safe_str(item.get("name", "")))
        if not is_valid_tool_name(raw_name):
            continue

        name = resolve_tool_display_name(
            raw_name,
            handle_display_map=handle_display_map,
        )
        canonical = canonicalize_tool_name(name)
        if canonical != name or name != raw_name:
            logger.info("promote_items: '%s' -> '%s'", raw_name, canonical)
            name = canonical

        key_full = norm(name)
        key8 = key_full[:8]
        if key_full in seen or key8 in seen:
            continue
        seen.add(key_full)
        seen.add(key8)

        tier_str = parse_tier(item.get("tier"))
        rank_int = None if tier_str else parse_rank(item.get("rank"))

        if tier_str is None and rank_int is None and pairs:
            rank_int = match_item_to_rank(name, pairs)
            if rank_int is not None:
                logger.info("promote_items: '%s' inferred rank %d from transcript", name, rank_int)

        desc = safe_str(item.get("description", "")).strip()
        desc = strip_fabricated_specs(desc)

        clean.append({
            "rank": rank_int,
            "tier": tier_str,
            "name": name,
            "description": desc,
            "score": item.get("score"),
            "why_it_matters": safe_str(item.get("why_it_matters", "")).strip(),
            "free": parse_optional_bool(item.get("free"), default=None),
            "url": safe_str(item.get("url") or "").strip() or None,
            "source": safe_str(item.get("source", "items")).strip(),
            "creator_rating": resolve_creator_rating(item.get("creator_rating")),
        })

    if len(clean) < 2:
        return None

    clean.sort(key=lambda x: ((x["rank"] is None), x["rank"] or 999, x["name"].lower()))

    logger.info("promote_items_to_tools: promoted %d items -> category '%s'", len(clean), category_name)
    return [{"name": category_name, "emoji": category_emoji, "items": clean}]


# ═══════════════════════════════════════════════════════════════════════════════
# BRAND NAME NORMALISATION MICRO-CALL (async)
# ═══════════════════════════════════════════════════════════════════════════════

_NORMALIZATION_PROMPT = """You are a brand and product name expert.
The names below were extracted from a "{category}" video via automatic speech-to-text (ASR).
ASR frequently misspells brand names, product names, and proper nouns.

Your only job: return the canonical, correctly spelled name for each entry.
Use your knowledge of brands in the "{category}" space to correct errors.

Rules:
- Return EXACTLY the same number of names, in the SAME order.
- If a name is already correct, return it unchanged.
- Correct obvious ASR misspellings (e.g. "black croves" -> "Black Crows", "stockly" -> "Stöckli").
- Never invent, add, or remove names.
- Never merge two names into one.

Names to correct:
{names_json}

Respond with ONLY valid JSON — no explanation, no markdown:
{{"corrected": ["Name1", "Name2", ...]}}"""


async def normalize_brand_names_via_llm(
    names: list[str],
    category: str,
    mistral_client,
    model: str = "mistral-small-latest",
) -> list[str]:
    """
    Focused micro-call to correct brand/product name misspellings.
    Returns the corrected list (same order, same length).
    Falls back to originals on any error.
    """
    if not names:
        return names

    prompt = _NORMALIZATION_PROMPT.format(
        category=category,
        names_json=json.dumps(names, ensure_ascii=False),
    )

    try:
        response = await mistral_client.chat(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.0,
            max_tokens=512,
        )
        raw = response.choices[0].message.content.strip()

        if raw.startswith("```"):
            raw = re.sub(r"^```[a-z]*\n?", "", raw)
            raw = re.sub(r"\n?```$", "", raw)

        data = json.loads(raw)
        corrected = data.get("corrected", [])

        if (
            isinstance(corrected, list)
            and len(corrected) == len(names)
            and all(isinstance(n, str) for n in corrected)
        ):
            for orig, fixed in zip(names, corrected):
                if orig != fixed:
                    logger.info("normalize_brands: '%s' -> '%s'", orig, fixed)
            return corrected

        logger.warning("normalize_brands: unexpected response shape, using originals")
        return names

    except Exception as exc:
        logger.warning("normalize_brands: micro-call failed (%s), using originals", exc)
        return names


def apply_normalized_names(
    tools_categories: list[dict],
    name_map: dict[str, str],
) -> list[dict]:
    result = []
    for cat in tools_categories:
        new_items = []
        for item in cat.get("items", []):
            orig = item.get("name", "")
            fixed = name_map.get(orig)
            if fixed and fixed != orig:
                item = {**item, "name": fixed}
            new_items.append(item)
        result.append({**cat, "items": new_items})
    return result