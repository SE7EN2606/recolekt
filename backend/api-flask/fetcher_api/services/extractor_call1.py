"""
Call1Mixin — parses the raw JSON dict from Mistral Call 1.

All standalone helper functions live in extractor_call1_helpers.py.
This file contains only the Call1Mixin class that orchestrates parsing.

Parsed dict keys:
  title, category, topic, brief_description
  highlights   -> list[{emoji, headline, description}]
  hashtags     -> list[str]
  emojis       -> list[str]
  ai_prompt    -> str | None
  recipe       -> dict | None
  workout      -> dict | None
  location     -> dict | list[dict] | None
  items        -> list[dict] | None
  tools_categories -> list[dict] | None

Hybrid-structure fields (filled later by universal_extractor.py, but present
here with safe defaults for pipeline stability):
  structure_analysis -> dict | None
  list_subtype       -> str | None
  is_ranked          -> bool
"""

from __future__ import annotations

import re
import logging
from typing import Dict, List, Optional, Union

from fetcher_api.services.extractor_helpers import (
    safe_str,
    safe_list,
    clean_title,
    derive_best_title_from_caption,
)
from fetcher_api.services.category_validator import validate_category

from fetcher_api.services.extractor_call1_helpers import (
    fix_asr_in_text,
    build_handle_display_map,
    parse_tools_categories,
    promote_items_to_tools,
    apply_normalized_names,
    normalize_brand_names_via_llm,
    is_ranked_list_transcript,
    parse_transcript_rank_pairs,
    enrich_ranks_from_transcript,
    add_missing_transcript_items,
    has_complete_rank_sequence,
    sanitize_location,
)

logger = logging.getLogger(__name__)

_is_ranked_list_transcript = is_ranked_list_transcript
_parse_tools_categories = parse_tools_categories

# Families that must never preserve location data.
_NON_LOCATION_FAMILIES = {"tools", "products", "software", "finance"}

_RECOVERY_LEADER_RE = re.compile(
    r"^(?:"
    r"(?:(?:\w+\s+){1,7})is\s+(?:obviously\s+)?"
    r"|(?:is|are|was|were)\s+"
    r")",
    re.IGNORECASE,
)

_GARBAGE_NAME_START_RE = re.compile(
    r"^(?:is|are|was|were|the|a|an)\s"
    r"|^most\s"
    r"|^(?:number\s+\w+\s+)?(?:and\s+)?(?:the\s+)?most\s",
    re.IGNORECASE,
)

# ── Location guards ───────────────────────────────────────────────────────────
_PLACE_TYPE_ALLOWLIST = {
    "restaurant",
    "brasserie",
    "café",
    "cafe",
    "hotel",
    "hostel",
    "museum",
    "beach",
    "lake",
    "mountain",
    "island",
    "park",
    "national park",
    "trail",
    "hiking trail",
    "viewpoint",
    "scenic viewpoint",
    "village",
    "city",
    "town",
    "destination",
    "ski resort",
    "resort",
    "bar",
    "bakery",
    "market",
    "temple",
    "church",
    "cathedral",
    "neighborhood",
    "neighbourhood",
}

_BRANDISH_LOCATION_NAME_RE = re.compile(
    r"\b("
    r"la roche(?:-|\s)?posay|neutrogena|nivea|banana boat|bondi sands|bondi|"
    r"ultra violette|ultraviolette|ultra violet|mecca|woolworths|"
    r"uniqlo|zara|cos|asphalte|casa|roxyne|rosyne|"
    r"mammut|vaude|klättermusen|klattermusen|arc'?teryx|thrudark|henri lloyd|millet"
    r")\b",
    re.IGNORECASE,
)

_BRANDISH_CONTEXT_RE = re.compile(
    r"\b("
    r"spf|sunscreen|sunscreens|sun screen|sun protection|uv|uv protection|"
    r"skincare|serum|moisturizer|beauty|cosmetic|cosmetics|"
    r"brand|brands|product|products|consumer test|independent test|lab test|"
    r"score|scores|rating|ratings|tier|tested|review|comparison|"
    r"jacket|jackets|pants|fashion|fragrance|perfume|watch|handbag|shoe|shoes|gear"
    r")\b",
    re.IGNORECASE,
)

_NON_LOCATION_TOPIC_RE = re.compile(
    r"\b("
    r"skincare|sunscreen|sunscreens|spf|sun protection|uv protection|beauty|cosmetic|"
    r"fashion|fragrance|perfume|watch|handbag|shoe|shoes|gear|outdoor gear|"
    r"product review|comparison|consumer test|lab test|tier list|ranking|"
    r"camera gear|headphones|supplement|protein|creatine"
    r")\b",
    re.IGNORECASE,
)


def _topic_indicates_non_location(topic: str, category: str, brief_description: str = "") -> bool:
    blob = f"{topic} {category} {brief_description}".strip()
    if not blob:
        return False
    return bool(_NON_LOCATION_TOPIC_RE.search(blob))


def _location_entry_has_real_place_signal(entry: dict) -> bool:
    """
    Conservative place validator.

    We only keep location data when at least one real place signal exists:
      - explicit address / neighborhood / city / country / region
      - or a plausible place type from a narrow allowlist
    """
    if not isinstance(entry, dict):
        return False

    name = safe_str(entry.get("name", "")).strip()
    if not name:
        return False

    address = safe_str(entry.get("address", "")).strip()
    neighborhood = safe_str(entry.get("neighborhood", "")).strip()
    city = safe_str(entry.get("city", "")).strip()
    country = safe_str(entry.get("country", "")).strip()
    region = safe_str(entry.get("region", "")).strip()
    place_type = safe_str(entry.get("type", "")).strip().lower()

    if address or neighborhood or city or country or region:
        return True

    if place_type in _PLACE_TYPE_ALLOWLIST:
        return True

    return False


def _looks_like_brand_hallucinated_as_location(
    entry: dict,
    content_type: str,
    topic: str,
    category: str,
    brief_description: str = "",
) -> bool:
    """
    Detect obvious bogus location entries for tools/product content.

    Key idea:
    once topic/category clearly say product-review / skincare / ranking,
    ambiguous names like 'La Roche-Posay' or 'Bondi' should NOT be treated as places.
    """
    if not isinstance(entry, dict):
        return False

    name = safe_str(entry.get("name", "")).strip()
    desc = safe_str(entry.get("description", "")).strip()
    place_type = safe_str(entry.get("type", "")).strip().lower()

    contextual_blob = f"{topic} {category} {brief_description} {desc}".lower()
    non_location_topic = _topic_indicates_non_location(topic, category, brief_description)

    # Hard stop: structured product families should never preserve location.
    if content_type in _NON_LOCATION_FAMILIES:
        return True

    # If topic/category already tell us this is product / review / ranking content,
    # then brand-like names are not locations.
    if non_location_topic:
        if _BRANDISH_LOCATION_NAME_RE.search(name):
            return True
        if not _location_entry_has_real_place_signal(entry):
            return True
        if _BRANDISH_CONTEXT_RE.search(contextual_blob):
            return True

    # Generic product-context rejection.
    if _BRANDISH_LOCATION_NAME_RE.search(name):
        return True

    if _BRANDISH_CONTEXT_RE.search(contextual_blob) and not _location_entry_has_real_place_signal(entry):
        return True

    if place_type in {"town", "place", "location", "destination", "spot"} and not _location_entry_has_real_place_signal(entry):
        return True

    return False


def _parse_location_payload(
    raw_location,
    content_type: str,
    topic: str,
    category: str,
    brief_description: str = "",
) -> Optional[Union[dict, List[dict]]]:
    """
    Strict location parsing.

    Funnel:
      1. If content is a structured product family, reject location immediately.
      2. If topic/category clearly indicate product-review/ranking/skincare/etc,
         reject weak or brand-like location payloads.
      3. Only keep non-product location rows with real place signals.
    """
    if content_type in _NON_LOCATION_FAMILIES:
        if raw_location:
            logger.info(
                "📍 Dropping raw location block because content_type=%r",
                content_type,
            )
        return None

    non_location_topic = _topic_indicates_non_location(topic, category, brief_description)

    candidates: list[dict] = []

    if isinstance(raw_location, list):
        for loc in raw_location:
            if isinstance(loc, dict) and loc.get("name"):
                candidates.append(loc)
    elif isinstance(raw_location, dict) and raw_location.get("name"):
        candidates.append(raw_location)

    if not candidates:
        return None

    cleaned: list[dict] = []
    for loc in candidates:
        loc = sanitize_location(loc)

        if _looks_like_brand_hallucinated_as_location(
            loc,
            content_type=content_type,
            topic=topic,
            category=category,
            brief_description=brief_description,
        ):
            logger.info("📍 Dropping hallucinated non-place location entry: %r", loc.get("name"))
            continue

        if non_location_topic and not _location_entry_has_real_place_signal(loc):
            logger.info(
                "📍 Dropping weak location entry because topic/category indicate non-location content: %r",
                loc.get("name"),
            )
            continue

        if content_type != "location" and not _location_entry_has_real_place_signal(loc):
            logger.info(
                "📍 Dropping weak location entry outside location mode: %r",
                loc.get("name"),
            )
            continue

        cleaned.append(loc)

    if not cleaned:
        return None

    if content_type == "location":
        return cleaned

    return cleaned if len(cleaned) > 1 else cleaned[0]


def _clean_and_dedup_recovery_items(categories: list) -> list:
    """
    Remove transcript_recovery items whose names are clearly raw transcript
    fragments rather than clean product/brand names.
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


def _dedup_tools_categories(categories: list) -> list:
    """
    Remove duplicate items across categories, keeping the first occurrence.

    Mistral sometimes places the same item in multiple tiers or categories.
    First occurrence wins — it is assumed to be the intentional placement.
    """
    seen: set[str] = set()
    for cat in categories or []:
        kept = []
        for item in cat.get("items") or []:
            name_key = (item.get("name") or "").strip().lower()
            if not name_key:
                kept.append(item)
                continue
            if name_key in seen:
                logger.info(
                    "🗑️ Dedup: dropping duplicate item %r from category %r",
                    item.get("name"),
                    cat.get("name"),
                )
                continue
            seen.add(name_key)
            kept.append(item)
        cat["items"] = kept
    return categories


class Call1Mixin:
    """Parses the raw Call 1 Mistral response into a normalised `parsed` dict."""

    def _parse_call1(
        self,
        result_data: dict,
        caption: str,
        content_type: str,
        transcript: str = "",
    ) -> dict:
        if not isinstance(result_data, dict):
            result_data = {}

        raw_title = safe_str(result_data.get("title", "")).strip()
        title = (
            clean_title(raw_title)
            or derive_best_title_from_caption(caption)
            or "Saved Content"
        )

        raw_category = safe_str(result_data.get("category", "")).strip()
        category = validate_category(raw_category, content_type)

        topic = safe_str(result_data.get("topic", "")).strip()
        brief_description = fix_asr_in_text(
            safe_str(result_data.get("brief_description", "")).strip()
        )

        raw_highlights = safe_list(result_data.get("highlights", []))
        highlights: List[Dict] = []
        for h in raw_highlights:
            if not isinstance(h, dict):
                continue
            headline = fix_asr_in_text(safe_str(h.get("headline", "")).strip())
            description = fix_asr_in_text(safe_str(h.get("description", "")).strip())
            emoji = safe_str(h.get("emoji", "")).strip()
            if headline and description:
                highlights.append({
                    "emoji": emoji,
                    "headline": headline,
                    "description": description,
                })

        raw_tags = safe_list(result_data.get("hashtags", []))
        hashtags = [str(t).lstrip("#").strip() for t in raw_tags if str(t).strip()][:5]

        raw_emojis = safe_list(result_data.get("emojis", []))
        emojis = [e.strip() for e in raw_emojis if isinstance(e, str) and e.strip()][:4]

        ai_prompt: Optional[str] = None
        raw_prompt = result_data.get("prompt")
        if isinstance(raw_prompt, str) and raw_prompt.strip():
            ai_prompt = raw_prompt.strip()

        recipe = result_data.get("recipe") if isinstance(result_data.get("recipe"), dict) else None
        workout = result_data.get("workout") if isinstance(result_data.get("workout"), dict) else None

        raw_items = result_data.get("items")
        items: Optional[List[Dict]] = None
        if isinstance(raw_items, list) and raw_items:
            items = [i for i in raw_items if isinstance(i, dict) and i.get("name")]

        handle_display_map = build_handle_display_map(caption=caption, transcript=transcript)
        if handle_display_map:
            logger.info("🔤 Built handle display map with %d entries", len(handle_display_map))

        raw_tools = result_data.get("tools")
        tools_categories = parse_tools_categories(
            raw_tools,
            handle_display_map=handle_display_map,
        )
        if tools_categories:
            total = sum(len(c["items"]) for c in tools_categories)
            logger.info("Parsed tools: %d categories, %d items total", len(tools_categories), total)

        if tools_categories is None and items and len(items) >= 2:
            tools_categories = promote_items_to_tools(
                items,
                category_name=topic or category or "Items",
                category_emoji="",
                transcript=transcript,
                handle_display_map=handle_display_map,
            )
            if tools_categories:
                logger.info(
                    "promote_items_to_tools: %d items promoted with transcript rank inference",
                    sum(len(c["items"]) for c in tools_categories),
                )

        if tools_categories and transcript:
            pairs = parse_transcript_rank_pairs(transcript)
            already_complete_ranking = has_complete_rank_sequence(tools_categories)

            if pairs and is_ranked_list_transcript(transcript):
                if already_complete_ranking:
                    logger.info(
                        "transcript post-processing skipped: existing rank sequence already complete"
                    )
                else:
                    tools_categories = enrich_ranks_from_transcript(tools_categories, pairs)
                    tools_categories = add_missing_transcript_items(
                        tools_categories,
                        pairs,
                        handle_display_map=handle_display_map,
                    )
                    total = sum(len(c["items"]) for c in tools_categories)
                    logger.info(
                        "transcript post-processing: %d items after rank enrichment + recovery",
                        total,
                    )
            elif pairs and not already_complete_ranking:
                tools_categories = enrich_ranks_from_transcript(tools_categories, pairs)

        if tools_categories:
            before = sum(len(c.get("items", [])) for c in tools_categories)
            tools_categories = _clean_and_dedup_recovery_items(tools_categories)
            after = sum(len(c.get("items", [])) for c in tools_categories)
            if before != after:
                logger.info(
                    "🗑️ Recovery cleanup: %d → %d items (%d removed)",
                    before, after, before - after,
                )

        if tools_categories:
            before = sum(len(c.get("items", [])) for c in tools_categories)
            tools_categories = _dedup_tools_categories(tools_categories)
            after = sum(len(c.get("items", [])) for c in tools_categories)
            if before != after:
                logger.info(
                    "🗑️ Cross-category dedup: %d → %d items (%d removed)",
                    before, after, before - after,
                )

        raw_location = result_data.get("location")
        location = _parse_location_payload(
            raw_location=raw_location,
            content_type=content_type,
            topic=topic,
            category=category,
            brief_description=brief_description,
        )

        if location is not None and recipe is not None:
            loc_name = location[0].get("name", "?") if isinstance(location, list) else location.get("name", "?")
            logger.info("Discarding hallucinated recipe — location content (name=%r)", loc_name)
            recipe = None

        if location is not None and workout is not None:
            loc_name = location[0].get("name", "?") if isinstance(location, list) else location.get("name", "?")
            logger.info("Discarding hallucinated workout — location content (name=%r)", loc_name)
            workout = None

        if location is not None and content_type == "location":
            logger.info(
                "📍 Valid location payload preserved (%d entries)",
                len(location) if isinstance(location, list) else 1,
            )

        return {
            "title": title,
            "category": category,
            "topic": topic,
            "brief_description": brief_description,
            "highlights": highlights,
            "hashtags": hashtags,
            "emojis": emojis,
            "ai_prompt": ai_prompt,
            "recipe": recipe,
            "workout": workout,
            "location": location,
            "items": items,
            "tools_categories": tools_categories,
            "structure_analysis": None,
            "list_subtype": None,
            "is_ranked": False,
        }

    async def _normalize_tool_names(
        self,
        parsed: dict,
        mistral_client,
        model: str = "mistral-small-latest",
    ) -> dict:
        """
        Async micro-call: corrects brand/product name misspellings in
        tools_categories using a focused Mistral prompt.

        Silent no-op when tools_categories is empty or the call fails.
        """
        tools_categories = parsed.get("tools_categories")
        if not tools_categories:
            return parsed

        all_names: List[str] = []
        for cat in tools_categories:
            for item in cat.get("items", []):
                all_names.append(item.get("name", ""))

        if not all_names:
            return parsed

        category_ctx = parsed.get("category", "") or parsed.get("topic", "") or "products"

        corrected = await normalize_brand_names_via_llm(
            names=all_names,
            category=category_ctx,
            mistral_client=mistral_client,
            model=model,
        )

        name_map = {
            orig: fixed
            for orig, fixed in zip(all_names, corrected)
            if orig != fixed
        }

        if name_map:
            tools_categories = apply_normalized_names(tools_categories, name_map)
            parsed = {**parsed, "tools_categories": tools_categories}

        return parsed

    @staticmethod
    def _parse_tools_categories(
        raw_tools: Optional[dict] = None,
        handle_display_map: Optional[dict[str, str]] = None,
    ) -> Optional[List[dict]]:
        return parse_tools_categories(
            raw_tools,
            handle_display_map=handle_display_map,
        )