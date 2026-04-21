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
    if s in ORDINAL_TO_INT:
        return ORDINAL_TO_INT[s]
    try:
        v = int(s)
        return v if v > 0 else None
    except (ValueError, TypeError):
        return None


def parse_transcript_rank_pairs(transcript: str) -> list[tuple[str, int]]:
    if not transcript:
        return []

    pairs: list[tuple[str, int]] = []
    seen_ranks: set[int] = set()

    inline_re = re.compile(
        rf"\b(?:number|ranked?)\s+(\d+|{ORDINAL_WORDS_RE})[,\s]+([A-Z][^,\.]+?)(?:[,\.]|$)",
        re.IGNORECASE,
    )
    for m in inline_re.finditer(transcript):
        rank_str = m.group(1).strip().lower()
        name_frag = m.group(2).strip()
        rank = ORDINAL_TO_INT.get(rank_str) or parse_rank(rank_str)
        if rank and name_frag and rank not in seen_ranks:
            if len(name_frag.split()) > 7 or len(name_frag) > 60:
                continue
            pairs.append((_clean_transcript_name(name_frag), rank))
            seen_ranks.add(rank)

    if len(pairs) >= 2:
        return sorted(pairs, key=lambda x: x[1])

    tokens = [t.strip().rstrip(".").strip() for t in re.split(r"\.\s+", transcript.strip())]
    tokens = [t for t in tokens if t]

    i = 0
    while i < len(tokens) - 1:
        name_tok = tokens[i]
        next_tok = tokens[i + 1].strip().lower()

        rank = ORDINAL_TO_INT.get(next_tok) or parse_rank(next_tok)
        if rank is not None and rank not in seen_ranks:
            if len(name_tok.split()) <= 7 and len(name_tok) <= 60:
                pairs.append((_clean_transcript_name(name_tok), rank))
                seen_ranks.add(rank)
            i += 2
            continue

        rank_self = ORDINAL_TO_INT.get(name_tok.strip().lower()) or parse_rank(name_tok.strip().lower())
        if rank_self is not None and rank_self not in seen_ranks:
            next_name = tokens[i + 1]
            if len(next_name.split()) <= 7 and len(next_name) <= 60:
                pairs.append((_clean_transcript_name(next_name), rank_self))
                seen_ranks.add(rank_self)
            i += 2
            continue

        i += 1

    return sorted(pairs, key=lambda x: x[1])


def is_ranked_list_transcript(transcript: str) -> bool:
    if not transcript:
        return False
    t = transcript.lower()

    marker_hits = len(re.findall(
        rf"\b(?:number|ranked?)\s+(?:\d+|{ORDINAL_WORDS_RE})\b", t
    ))
    if marker_hits >= 2:
        return True

    return len(parse_transcript_rank_pairs(transcript)) >= 3


def has_complete_rank_sequence(tools_categories: list[dict]) -> bool:
    """
    True when parsed items already contain a clean global 1..N sequence.
    Used to avoid polluting a valid ranked list with transcript_recovery items.
    """
    ranks: list[int] = []
    names_seen: set[str] = set()

    for cat in tools_categories or []:
        for item in cat.get("items", []) or []:
            name = safe_str(item.get("name")).strip()
            if not name:
                continue
            n = norm(name)
            if not n or n in names_seen:
                continue
            names_seen.add(n)

            rank = item.get("rank")
            if isinstance(rank, int) and rank > 0:
                ranks.append(rank)

    if len(ranks) < 3:
        return False

    unique_sorted = sorted(set(ranks))
    expected = list(range(1, len(unique_sorted) + 1))
    return unique_sorted == expected


# ═══════════════════════════════════════════════════════════════════════════════
# TRANSCRIPT-DRIVEN RANK ENRICHMENT
# ═══════════════════════════════════════════════════════════════════════════════

def match_item_to_rank(
    item_name: str,
    pairs: list[tuple[str, int]],
) -> int | None:
    n = norm(item_name)
    for frag, rank in pairs:
        frag_n = norm(frag)
        if n == frag_n:
            return rank
        if n.startswith(frag_n) or frag_n.startswith(n):
            return rank

        item_words = item_name.split()
        frag_words = frag.split()
        item_fw = norm(item_words[0]) if item_words else ""
        frag_fw = norm(frag_words[0]) if frag_words else ""
        if item_fw and frag_fw and (
            item_fw == frag_fw
            or item_fw.startswith(frag_fw)
            or frag_fw.startswith(item_fw)
        ):
            if len(item_fw) >= 3:
                return rank

        canonical_frag = canonicalize_tool_name(frag)
        canonical_n = norm(canonical_frag)
        if canonical_n == n:
            return rank
        if canonical_n and n and (canonical_n.startswith(n[:6]) or n.startswith(canonical_n[:6])):
            return rank
    return None


def enrich_ranks_from_transcript(
    tools_categories: list[dict],
    pairs: list[tuple[str, int]],
) -> list[dict]:
    if not pairs or not tools_categories:
        return tools_categories

    enriched = []
    for cat in tools_categories:
        new_items = []
        for item in cat.get("items", []):
            name = item.get("name", "")
            matched = match_item_to_rank(name, pairs)
            if matched is not None and matched != item.get("rank"):
                logger.info("enrich_ranks: '%s' → rank %d (from transcript)", name, matched)
                item = {**item, "rank": matched}
            new_items.append(item)
        enriched.append({**cat, "items": new_items})
    return enriched


def add_missing_transcript_items(
    tools_categories: list[dict],
    pairs: list[tuple[str, int]],
    handle_display_map: dict[str, str] | None = None,
) -> list[dict]:
    if not pairs or not tools_categories:
        return tools_categories

    existing_norms: set[str] = set()
    existing_ranks: set[int] = set()

    for cat in tools_categories:
        for item in cat.get("items", []):
            n = norm(item.get("name", ""))
            if n:
                existing_norms.add(n)
                existing_norms.add(n[:8])
                existing_norms.add(n[:6])

            rank = item.get("rank")
            if isinstance(rank, int) and rank > 0:
                existing_ranks.add(rank)

    added: list[dict] = []
    for frag, rank in pairs:
        if rank in existing_ranks:
            continue

        resolved = resolve_tool_display_name(frag, handle_display_map=handle_display_map)
        canonical = canonicalize_tool_name(resolved)
        cn = norm(canonical)
        already = (
            cn in existing_norms
            or cn[:8] in existing_norms
            or cn[:6] in existing_norms
            or norm(frag) in existing_norms
            or norm(frag)[:6] in existing_norms
        )
        if already:
            continue
        if not is_valid_tool_name(canonical):
            continue
        if (
            len(canonical) > 60
            or "\n" in canonical
            or canonical.startswith("[")
            or len(canonical.split()) > 6
        ):
            logger.debug(
                "add_missing: rejected long/garbage fragment '%s'", canonical[:50]
            )
            continue

        existing_norms.add(cn)
        existing_norms.add(cn[:8])
        existing_norms.add(cn[:6])
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
            "add_missing: recovered '%s' (rank %d) from transcript fragment '%s'",
            canonical, rank, frag,
        )

    if not added:
        return tools_categories

    enriched = list(tools_categories)
    first = enriched[0]
    enriched[0] = {**first, "items": first.get("items", []) + added}
    return enriched


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