"""
Call1Mixin — parses the raw JSON dict from Mistral Call 1.

Heavy reusable logic lives in extractor_call1_helpers.py.
This file only keeps Call 1 orchestration plus small local guards.

Parsed dict keys:
  title, category, topic, brief_description
  highlights
  hashtags
  emojis
  ai_prompt
  recipe
  workout
  location
  items
  tools_categories
  structure_analysis
  list_subtype
  is_ranked
"""

from __future__ import annotations

import logging
import re
from typing import Dict, List, Optional, Union

from fetcher_api.services.category_validator import validate_category
from fetcher_api.services.extractor_helpers import (
    clean_title,
    derive_best_title_from_caption,
    safe_list,
    safe_str,
)
from fetcher_api.services.extractor_call1_helpers import (
    add_missing_transcript_items,
    apply_normalized_names,
    build_handle_display_map,
    enrich_ranks_from_transcript,
    fix_asr_in_text,
    is_ranked_list_transcript,
    normalize_brand_names_via_llm,
    parse_tools_categories,
    parse_transcript_rank_pairs,
    promote_items_to_tools,
    sanitize_location,
)

logger = logging.getLogger(__name__)

_is_ranked_list_transcript = is_ranked_list_transcript
_parse_tools_categories = parse_tools_categories

_NON_LOCATION_FAMILIES = {"tools", "products", "software", "finance"}

_GARBAGE_NAME_START_RE = re.compile(
    r"^(?:is|are|was|were|the|a|an)\s"
    r"|^most\s"
    r"|^(?:number\s+\w+\s+)?(?:and\s+)?(?:the\s+)?most\s",
    re.IGNORECASE,
)

_PLACE_TYPE_ALLOWLIST = {
    "hotel",
    "resort",
    "lodge",
    "venue",
    "hostel",
    "restaurant",
    "brasserie",
    "café",
    "cafe",
    "bar",
    "bakery",
    "market",
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
    "temple",
    "church",
    "cathedral",
    "museum",
    "neighborhood",
    "neighbourhood",
    "ski resort",
    "auberge",
    "guesthouse",
    "chalet",
    "inn",
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


def _norm(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", safe_str(value).lower())


def _topic_indicates_non_location(
    topic: str,
    category: str,
    brief_description: str = "",
) -> bool:
    blob = f"{topic} {category} {brief_description}".strip()
    return bool(blob and _NON_LOCATION_TOPIC_RE.search(blob))


def _location_entry_has_real_place_signal(entry: dict) -> bool:
    if not isinstance(entry, dict):
        return False

    name = safe_str(entry.get("name", "")).strip()
    if not name:
        return False

    if entry.get("source") == "instagram_bio":
        return True

    if any(
        safe_str(entry.get(field, "")).strip()
        for field in ("address", "neighborhood", "city", "country", "region")
    ):
        return True

    place_type = safe_str(entry.get("type", "")).strip().lower()
    return place_type in _PLACE_TYPE_ALLOWLIST


def _looks_like_brand_hallucinated_as_location(
    entry: dict,
    content_type: str,
    topic: str,
    category: str,
    brief_description: str = "",
) -> bool:
    if not isinstance(entry, dict):
        return False

    if entry.get("source") == "instagram_bio":
        return False

    if content_type in _NON_LOCATION_FAMILIES:
        return True

    name = safe_str(entry.get("name", "")).strip()
    desc = safe_str(entry.get("description", "")).strip()
    place_type = safe_str(entry.get("type", "")).strip().lower()

    contextual_blob = f"{topic} {category} {brief_description} {desc}".lower()
    non_location_topic = _topic_indicates_non_location(topic, category, brief_description)
    has_place_signal = _location_entry_has_real_place_signal(entry)

    if non_location_topic:
        if _BRANDISH_LOCATION_NAME_RE.search(name):
            return True
        if not has_place_signal:
            return True
        if _BRANDISH_CONTEXT_RE.search(contextual_blob):
            return True

    if _BRANDISH_LOCATION_NAME_RE.search(name):
        return True

    if _BRANDISH_CONTEXT_RE.search(contextual_blob) and not has_place_signal:
        return True

    return place_type in {"town", "place", "location", "destination", "spot"} and not has_place_signal


def _parse_location_payload(
    raw_location,
    content_type: str,
    topic: str,
    category: str,
    brief_description: str = "",
) -> Optional[Union[dict, List[dict]]]:
    if content_type in _NON_LOCATION_FAMILIES:
        if raw_location:
            logger.info("📍 Dropping raw location block because content_type=%r", content_type)
        return None

    if isinstance(raw_location, list):
        candidates = [loc for loc in raw_location if isinstance(loc, dict) and loc.get("name")]
    elif isinstance(raw_location, dict) and raw_location.get("name"):
        candidates = [raw_location]
    else:
        return None

    non_location_topic = _topic_indicates_non_location(topic, category, brief_description)
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
            logger.info("📍 Dropping weak location entry outside location mode: %r", loc.get("name"))
            continue

        cleaned.append(loc)

    if not cleaned:
        return None

    if content_type == "location":
        return cleaned

    return cleaned if len(cleaned) > 1 else cleaned[0]


def _clean_and_dedup_recovery_items(categories: list) -> list:
    for cat in categories or []:
        cleaned = []

        for item in cat.get("items") or []:
            if item.get("source") != "transcript_recovery":
                cleaned.append(item)
                continue

            name = safe_str(item.get("name", "")).strip()
            if not name or len(name) > 50 or _GARBAGE_NAME_START_RE.search(name):
                logger.debug("🗑️ Dropping garbage recovery item: %r", name)
                continue

            cleaned.append(item)

        cat["items"] = cleaned

    return categories


def _dedup_tools_categories(categories: list) -> list:
    seen: set[str] = set()

    for cat in categories or []:
        kept = []

        for item in cat.get("items") or []:
            name_key = _norm(item.get("name") or "")
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


def _normalize_ranked_descriptions_and_ratings(
    tools_categories: list[dict] | None,
    is_ranked: bool,
) -> list[dict] | None:
    if not tools_categories or not is_ranked:
        return tools_categories

    normalized_categories: list[dict] = []

    for cat in tools_categories:
        next_items: list[dict] = []

        for item in cat.get("items", []) or []:
            rank = item.get("rank")

            if isinstance(rank, int) and rank > 0:
                next_items.append({
                    **item,
                    "description": f"Ranked #{rank} in the creator's list.",
                    "creator_rating": "best" if rank == 1 else None,
                })
            else:
                next_items.append({
                    **item,
                    "creator_rating": None,
                })

        normalized_categories.append({**cat, "items": next_items})

    return normalized_categories


class Call1Mixin:
    """Parses the raw Call 1 Mistral response into a normalised parsed dict."""

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

        category = validate_category(
            safe_str(result_data.get("category", "")).strip(),
            content_type,
        )
        topic = safe_str(result_data.get("topic", "")).strip()
        brief_description = fix_asr_in_text(
            safe_str(result_data.get("brief_description", "")).strip()
        )

        highlights: List[Dict] = []
        for h in safe_list(result_data.get("highlights", [])):
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

        hashtags = [
            str(tag).lstrip("#").strip()
            for tag in safe_list(result_data.get("hashtags", []))
            if str(tag).strip()
        ][:5]

        emojis = [
            emoji.strip()
            for emoji in safe_list(result_data.get("emojis", []))
            if isinstance(emoji, str) and emoji.strip()
        ][:4]

        raw_prompt = result_data.get("prompt")
        ai_prompt: Optional[str] = raw_prompt.strip() if isinstance(raw_prompt, str) and raw_prompt.strip() else None

        recipe = result_data.get("recipe") if isinstance(result_data.get("recipe"), dict) else None
        workout = result_data.get("workout") if isinstance(result_data.get("workout"), dict) else None

        raw_items = result_data.get("items")
        items: Optional[List[Dict]] = None
        if isinstance(raw_items, list) and raw_items:
            items = [item for item in raw_items if isinstance(item, dict) and item.get("name")]

        handle_display_map = build_handle_display_map(caption=caption, transcript=transcript)
        if handle_display_map:
            logger.info("🔤 Built handle display map with %d entries", len(handle_display_map))

        raw_tools = None if content_type == "location" else result_data.get("tools")
        tools_categories = parse_tools_categories(
            raw_tools,
            handle_display_map=handle_display_map,
        )

        if tools_categories:
            logger.info(
                "Parsed tools: %d categories, %d items total",
                len(tools_categories),
                sum(len(cat["items"]) for cat in tools_categories),
            )

        if content_type != "location" and tools_categories is None and items and len(items) >= 2:
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
                    sum(len(cat["items"]) for cat in tools_categories),
                )

        is_ranked = False
        list_subtype: Optional[str] = None

        if tools_categories and transcript:
            rank_pairs = parse_transcript_rank_pairs(transcript)
            is_ranked = bool(is_ranked_list_transcript(transcript) or len(rank_pairs) >= 3)

            if rank_pairs:
                tools_categories = enrich_ranks_from_transcript(tools_categories, rank_pairs)

                if is_ranked:
                    tools_categories = add_missing_transcript_items(
                        tools_categories,
                        rank_pairs,
                        handle_display_map=handle_display_map,
                    )
                    tools_categories = _normalize_ranked_descriptions_and_ratings(
                        tools_categories,
                        is_ranked=True,
                    )

                    list_subtype = "ranking"
                    highlights = []

                    logger.info(
                        "transcript post-processing: %d items after transcript rank enrichment + recovery",
                        sum(len(cat.get("items", [])) for cat in tools_categories or []),
                    )

        if tools_categories:
            before = sum(len(cat.get("items", [])) for cat in tools_categories)
            tools_categories = _clean_and_dedup_recovery_items(tools_categories)
            after = sum(len(cat.get("items", [])) for cat in tools_categories)

            if before != after:
                logger.info(
                    "🗑️ Recovery cleanup: %d → %d items (%d removed)",
                    before,
                    after,
                    before - after,
                )

        if tools_categories:
            before = sum(len(cat.get("items", [])) for cat in tools_categories)
            tools_categories = _dedup_tools_categories(tools_categories)
            after = sum(len(cat.get("items", [])) for cat in tools_categories)

            if before != after:
                logger.info(
                    "🗑️ Cross-category dedup: %d → %d items (%d removed)",
                    before,
                    after,
                    before - after,
                )

        location = _parse_location_payload(
            raw_location=result_data.get("location"),
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

        if content_type == "location":
            tools_categories = None
            list_subtype = None
            is_ranked = False

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
            "list_subtype": list_subtype,
            "is_ranked": is_ranked,
        }

    async def _normalize_tool_names(
        self,
        parsed: dict,
        mistral_client,
        model: str = "mistral-small-latest",
    ) -> dict:
        tools_categories = parsed.get("tools_categories")
        if not tools_categories:
            return parsed

        all_names: List[str] = [
            item.get("name", "")
            for cat in tools_categories
            for item in cat.get("items", [])
            if item.get("name")
        ]

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
            original: fixed
            for original, fixed in zip(all_names, corrected)
            if original != fixed
        }

        if name_map:
            parsed = {
                **parsed,
                "tools_categories": apply_normalized_names(tools_categories, name_map),
            }

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