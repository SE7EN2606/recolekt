import logging
import re
from copy import deepcopy
from typing import Any, Dict, Iterable, List, Tuple

from fetcher_api.services.extractor_helpers import detect_caption_language, safe_str
from fetcher_api.services.extractor_list_detection import (
    classify_structured_family,
    count_mention_verdict_items,
    count_plain_mentions,
)
from fetcher_api.services.location_account_enrichment import account_to_enrichment_candidate

logger = logging.getLogger(__name__)

_STRUCTURED_PRODUCT_FAMILIES = {"products", "software", "finance"}
_PUBLIC_CONTENT_TYPES = {
    "recipe",
    "workout",
    "location",
    "products",
    "software",
    "finance",
    "general",
}

_ACCOUNT_CONTAINER_KEYS = (
    "mentioned_accounts",
    "instagram_accounts",
    "account_profiles",
    "accounts",
    "mentions",
    "mentioned_profiles",
    "venue_accounts",
    "place_accounts",
)

_LIST_NOUNS = (
    r"alternatives?|bags?|sacs?|handbags?|purses?|looks?|outfits?|styles?|"
    r"jackets?|coats?|shirts?|vestes?|manteaux?|serviettes?|towels?|"
    r"brands?|marques?|labels?|companies|"
    r"albums?|songs?|tracks?|records?|playlists?|"
    r"picks?|places?|spots?|destinations?|resorts?|h[oô]tels?|hotels?|"
    r"addresses?|adresses?|"
    r"tools?|apps?|products?|items?|things?|choses?|"
    r"tips?|conseils?|ideas?|id[ée]es?|ways?|fa[çc]ons?|reasons?|steps?|"
    r"movies?|films?|shows?|books?|livres?|recipes?|recettes?|"
    r"wines?|vins?|perfumes?|parfums?|fragrances?|sunscreens?|"
    r"restaurants?|dishes?|plats?|exercises?|workouts?|"
    r"options?|choices?|s[ée]lections?|recommendations?|favorites?|favoris?|favourites?|"
    r"gear|pieces?|essentials?|must.haves?"
)

_CAPTION_LIST_NOUN_RE = re.compile(
    r"\b(\d+)\s+(?:\w+\s+)?(?:" + _LIST_NOUNS + r")\b",
    re.IGNORECASE,
)

_TRANSCRIPT_LIST_OPENER_RE = re.compile(
    r"(?:here'?s?|top|best|ranked?|my)\s+(\d+)\s+(?:\w+\s+)?(?:" + _LIST_NOUNS + r")\b",
    re.IGNORECASE,
)

_SEQUENTIAL_RANK_RE = re.compile(
    r"number\s+(?:one|two|three|1|2|3).{0,400}?number\s+(?:two|three|four|2|3|4)"
    r"|(?:first|second|third).{0,400}?(?:second|third|fourth)",
    re.IGNORECASE | re.DOTALL,
)

_SPOKEN_ORDINAL_RE = re.compile(
    r"\b(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\b",
    re.IGNORECASE,
)

_NUMBERED_RANK_RE = re.compile(
    r"\bnumber\s+(?:one|two|three|four|five|six|seven|eight|nine|ten|1|2|3|4|5|6|7|8|9|10)\b",
    re.IGNORECASE,
)

_GARBAGE_NAME_START_RE = re.compile(
    r"^(?:is|are|was|were|the|a|an)\s"
    r"|^most\s"
    r"|^(?:number\s+\w+\s+)?(?:and\s+)?(?:the\s+)?most\s",
    re.IGNORECASE,
)

_CHEZ_BRAND_RE = re.compile(r"\bchez\s+[A-ZÉÈÀÂÎÔÙÛÄËÏ]", re.UNICODE)
_FASHION_PRODUCT_RE = re.compile(
    r"\b(sac|bag|bags|alternative|handbag|purse|pochette|tote|"
    r"v[êe]tement|robe|chaussure|parfum|cr[èe]me|montre|bijou|collier)\b",
    re.IGNORECASE,
)

_ENGLISH_PROSE_MARKERS = (
    " the ",
    " and ",
    " for ",
    " with ",
    " save ",
    " follow ",
    " our ",
    " road trip ",
    " best time to visit ",
    " must-see ",
    " hike ",
    " views ",
    " less than ",
    " through ",
    " without ",
    " one of the most ",
    " known as ",
    " arrive early ",
    " rent a rowboat ",
    " parking ",
    " take the cable car ",
    " short hike ",
    " worth it ",
    " hidden gem ",
)


def _looks_clearly_english(text: str) -> bool:
    t = f" {safe_str(text).lower()} "
    if len(t.strip()) < 120:
        return False

    hits = sum(1 for marker in _ENGLISH_PROSE_MARKERS if marker in t)
    ascii_ratio = sum(1 for ch in t if ord(ch) < 128) / max(1, len(t))

    return hits >= 4 and ascii_ratio >= 0.97


def _resolve_effective_language(
    upstream_lang: str,
    caption: str,
    transcript: str = "",
) -> str:
    """
    Conservative language resolution.

    Priority:
      1. If the caption/transcript is clearly English prose, force 'en'.
      2. Otherwise trust upstream when present.
      3. Otherwise fall back to caption detection.
      4. Otherwise return unknown.
    """
    upstream = (upstream_lang or "").strip().lower()
    caption = caption or ""
    transcript = transcript or ""

    combined = f"{caption[:2500]} {transcript[:1200]}".strip()

    if _looks_clearly_english(combined):
        if upstream not in ("", "unknown", "en"):
            logger.info(
                "🌍 Language override: %s -> en (clear English prose detected)",
                upstream,
            )
        return "en"

    if upstream and upstream != "unknown":
        return upstream

    text = caption.strip()
    if len(text) < 40:
        return "unknown"

    try:
        detected = (detect_caption_language(text) or "").strip().lower()
    except Exception:
        logger.warning("⚠️ detect_caption_language() failed", exc_info=True)
        return "unknown"

    return detected if detected and detected != "unknown" else "unknown"


def _caption_promised_count(caption: str) -> int:
    """
    Extract promised item count from caption with minimal deterministic logic.
    """
    text = caption or ""

    match = _CAPTION_LIST_NOUN_RE.search(text)
    if match:
        return int(match.group(1))

    mention_count = count_mention_verdict_items(text)
    if mention_count >= 3:
        return mention_count

    plain_mentions = count_plain_mentions(text)
    if plain_mentions >= 3:
        return plain_mentions

    return 0


def _transcript_promised_count(transcript: str) -> int:
    """
    Extract promised item count from transcript opener with minimal deterministic logic.
    """
    if not transcript:
        return 0

    head = transcript[:600]

    match = _TRANSCRIPT_LIST_OPENER_RE.search(head)
    if match:
        return int(match.group(1))

    match = _CAPTION_LIST_NOUN_RE.search(head)
    if match:
        return int(match.group(1))

    return 0


def _looks_like_global_ranking(transcript: str, caption: str) -> bool:
    """
    Minimal strong-signal ranking detector.

    Guards against false positives from:
    - Lists of @mention picks that repeat the same emoji
    - Captions where items are ordered by listing, not by true ranking
    """
    text = f"{transcript or ''} {caption or ''}"

    if not transcript.strip() and (
        count_mention_verdict_items(caption) >= 3 or count_plain_mentions(caption) >= 3
    ):
        return False

    if _SEQUENTIAL_RANK_RE.search(text):
        return True

    ordinal_hits = len(_SPOKEN_ORDINAL_RE.findall(text))
    numbered_hits = len(_NUMBERED_RANK_RE.findall(text))

    return ordinal_hits >= 3 or numbered_hits >= 3


def _strip_garbage_recovery_items(categories: list) -> list:
    """
    Remove transcript_recovery items whose names are clearly raw transcript
    fragments rather than clean names.
    """
    for cat in categories or []:
        items = cat.get("items") or []
        cleaned = []

        for item in items:
            if item.get("source") != "transcript_recovery":
                cleaned.append(item)
                continue

            name = (item.get("name") or "").strip()
            if not name or len(name) > 50 or _GARBAGE_NAME_START_RE.search(name):
                logger.debug("🗑️ Dropping garbage recovery item: %r", name)
                continue

            cleaned.append(item)

        cat["items"] = cleaned

    return categories


def _default_subtype_for_family(public_content_type: str) -> str:
    """
    Return the sensible default subtype hint for a given public family,
    before pre_detect_list_subtype() has a chance to override.
    """
    if public_content_type == "location":
        return "places"
    if public_content_type == "software":
        return "software"
    if public_content_type == "finance":
        return "grouped"
    if public_content_type == "products":
        return "picks"
    return "picks"


def _route_public_family(
    requested_content_type: str,
    transcript: str,
    caption: str,
    is_location_list: bool,
    is_tools: bool,
) -> str:
    """
    Resolve the public family earlier in the pipeline, before prompt selection.

    Public routing should be domain-first, but structured non-location families
    still share the internal legacy tools extractor during Phase 1.
    """
    requested = (requested_content_type or "").strip().lower()

    if requested in {"recipe", "workout", "location"}:
        return requested

    if is_location_list:
        return "location"

    if is_tools:
        if requested in _STRUCTURED_PRODUCT_FAMILIES:
            return requested

        inferred = classify_structured_family(
            transcript=transcript,
            caption=caption,
            category=requested if requested in _PUBLIC_CONTENT_TYPES else "",
            topic="",
        )

        if inferred == "places":
            return "location"
        if inferred in _STRUCTURED_PRODUCT_FAMILIES:
            return inferred
        return "products"

    if requested in _PUBLIC_CONTENT_TYPES:
        return requested

    return "general"


def _normalize_requested_public_content_type(classification: Dict[str, Any]) -> str:
    requested = (classification.get("label") or "general").strip().lower()
    if requested not in _PUBLIC_CONTENT_TYPES and requested != "tools":
        return "general"
    return requested


def _iter_account_like_values(container: Any) -> Iterable[Any]:
    if not container:
        return []

    if isinstance(container, dict):
        values: List[Any] = []
        for key in _ACCOUNT_CONTAINER_KEYS:
            value = container.get(key)
            if not value:
                continue
            if isinstance(value, list):
                values.extend(value)
            else:
                values.append(value)
        return values

    if isinstance(container, list):
        return container

    return []


def _dedupe_account_candidates(accounts: Iterable[Any]) -> List[Dict[str, Any]]:
    deduped: List[Dict[str, Any]] = []
    seen = set()

    for raw in accounts:
        normalized = account_to_enrichment_candidate(raw)
        if not normalized:
            continue

        identity = (
            normalized.get("username")
            or normalized.get("handle")
            or normalized.get("full_name")
            or normalized.get("name")
        )
        identity = safe_str(identity).strip().lower()
        if not identity or identity in seen:
            continue

        seen.add(identity)
        deduped.append(normalized)

    return deduped


def _coerce_locations_to_list(location_payload: Any) -> Tuple[List[Dict[str, Any]], bool]:
    if isinstance(location_payload, list):
        return deepcopy(location_payload), False
    if isinstance(location_payload, dict):
        return [deepcopy(location_payload)], True
    return [], False


def _count_location_enrichment_changes(
    before: List[Dict[str, Any]],
    after: List[Dict[str, Any]],
) -> int:
    watched_keys = ("address", "city", "region", "state", "country", "postal_code")
    changed = 0

    for before_item, after_item in zip(before, after):
        if not isinstance(before_item, dict) or not isinstance(after_item, dict):
            continue

        for key in watched_keys:
            old = safe_str(before_item.get(key)).strip()
            new = safe_str(after_item.get(key)).strip()
            if not old and new:
                changed += 1
                break

    return changed