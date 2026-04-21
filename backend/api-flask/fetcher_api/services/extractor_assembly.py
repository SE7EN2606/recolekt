"""
AssemblyMixin — builds the final output dict from parsed Call 1 + Call 2 results.

Output shape (result.json top-level keys):
  content_type, extractor_version, category, topic, title,
  summary, hashtags, emojis, prompt, items, tools_list,
  recipe, workout, location, detected_language,
  is_list, list_count, list_type, list_subtype, list_summary,
  structure_analysis

Phase 1 public semantics:
  Public content_type values are:
    "recipe" | "workout" | "location" | "products" | "software" | "finance" | "general"

Internal compatibility:
  - The structured compatibility field remains tools_list
  - Call 1 / Call 2 / parsers may still use legacy internal "tools" concepts
  - But public final payload should no longer expose content_type="tools"

v25:
  - Uses classify_structured_family() for public family routing of structured lists.
  - Treats place rankings/lists as public content_type="location" even when they are
    rendered as structured lists rather than map payloads.
  - Keeps location-first override only for credible extracted location payloads.
  - Preserves deterministic tier restoration / merged-tier repair from helpers.

v24:
  - Removes stale item_names= kwarg from make_summary_block() call — was causing
    TypeError crash. Structural paragraph guardrail now lives inside
    summary_formatter.validate_and_repair_summary_paragraph() and is called
    directly after make_summary_block() returns, using _extract_item_names_from_cats().

v23:
  - Uses analyze_structure() from extractor_tools_detection as source of truth.
  - Reuses parsed["structure_analysis"] when already computed.
  - Verdict/tier/grouped/ranking structured reels suppress fallback bullet headlines.
  - Unknown / weak structures fall back to standard bookmark mode.
  - Deduplicates emojis globally.
  - Clears software-only fields like free/url on clearly non-software product lists.
  - Repairs obviously wrong detected_language for clearly French captions.
  - Avoids misleading original=english fallback for non-English posts.
  - Location only takes precedence when the extracted location payload looks credible.
"""

from __future__ import annotations

import asyncio
import logging

from fetcher_api.services.extractor_tools_detection import (
    analyze_structure,
    classify_structured_family,
)
from fetcher_api.services.extractor_assembly_helpers import (
    dedupe_preserve_order,
    repair_language_if_obviously_wrong,
    normalize_nonsoftware_tool_fields,
    extract_list_count_and_type,
    filter_placeholder_headlines,
    sanitize_highlights,
    make_summary_block,
    build_tools_list,
    promote_items_to_tools_list,
    restore_tiers,
    count_valid_items,
)
from fetcher_api.services.instagram_bio_scraper import enrich_tools_with_instagram_locations
from fetcher_api.services.summary_formatter import validate_and_repair_summary_paragraph

logger = logging.getLogger(__name__)

_PUBLIC_CONTENT_TYPES = (
    "recipe",
    "workout",
    "location",
    "products",
    "software",
    "finance",
    "general",
)

_EMPTY_STRUCTURE_ANALYSIS = {
    "mode": "bookmark",
    "structure_type": "unknown",
    "render_hint": "bookmark",
    "list_subtype": "picks",
    "is_ranked": False,
    "confidence": 0.0,
    "global_ordered": False,
    "group_ordered": False,
    "reason": "No tools list available",
}


def _collect_tool_names(tools_categories: list[dict] | None) -> set[str]:
    names: set[str] = set()
    for cat in tools_categories or []:
        for item in cat.get("items", []) or []:
            name = (item.get("name") or "").strip().casefold()
            if name:
                names.add(name)
    return names


def _normalize_location_rows(location_data) -> list[dict]:
    if isinstance(location_data, list):
        return [row for row in location_data if isinstance(row, dict)]
    if isinstance(location_data, dict):
        return [location_data]
    return []


def _location_type_looks_generic_or_suspicious(type_value: str) -> bool:
    t = (type_value or "").strip().casefold()
    if not t:
        return True
    suspicious = {
        "town",
        "place",
        "location",
        "destination",
        "spot",
        "venue",
        "area",
        "region",
    }
    return t in suspicious


def _is_credible_location_payload(location_data, tools_categories: list[dict] | None) -> bool:
    """
    Reject obvious hallucinated location arrays such as:
      - tool/product names copied into location.name
      - empty city/country/address on nearly all rows
      - generic fake types like 'Town' for brands
    """
    rows = _normalize_location_rows(location_data)
    if not rows:
        return False

    tool_names = _collect_tool_names(tools_categories)
    overlap_count = 0
    metadata_hits = 0
    suspicious_type_count = 0

    for row in rows:
        name = (row.get("name") or "").strip().casefold()
        if name and name in tool_names:
            overlap_count += 1

        if any(
            (row.get(field) or "").strip()
            for field in ("city", "country", "address", "neighborhood", "region")
            if isinstance(row.get(field), str)
        ):
            metadata_hits += 1

        if _location_type_looks_generic_or_suspicious(row.get("type", "")):
            suspicious_type_count += 1

    row_count = len(rows)
    overlap_ratio = overlap_count / row_count
    metadata_ratio = metadata_hits / row_count
    suspicious_type_ratio = suspicious_type_count / row_count

    if tool_names and overlap_ratio >= 0.6 and metadata_ratio < 0.4:
        logger.warning(
            "📍 Rejecting location payload: %.0f%% of rows overlap tool names and metadata is sparse",
            overlap_ratio * 100,
        )
        return False

    if metadata_ratio == 0 and suspicious_type_ratio >= 0.7:
        logger.warning(
            "📍 Rejecting location payload: no real place metadata and types look generic/suspicious"
        )
        return False

    return True


def _looks_like_finance_text(*parts: str) -> bool:
    text = " ".join((p or "") for p in parts).lower()
    signals = (
        "finance", "financial", "accounting", "bookkeeping",
        "tax", "taxes", "vat", "invoice", "invoicing", "payroll",
        "budgeting", "budget", "cash flow", "cashflow", "p&l",
        "profit and loss", "brokerage", "broker", "stocks", "shares",
        "etf", "etfs", "investing", "investment", "dividend",
        "balance sheet", "expense ratio", "retirement", "isa", "401k",
        "bookkeeper", "accountant", "banking", "credit card",
        "debt", "loan", "mortgage",
    )
    return any(sig in text for sig in signals)


def _infer_public_content_type(
    requested_content_type: str,
    parsed: dict,
    tools_list: dict | None,
    structure_analysis: dict | None,
    has_location: bool,
    transcript_preview: str = "",
    caption: str = "",
) -> str:
    """
    Map internal/legacy semantics into Phase 1 public content families.

    Priority:
      1. location / recipe / workout remain explicit
      2. explicit requested public families win when plausible
      3. structured legacy 'tools' is remapped via public family classifier
      4. fallback is general
    """
    requested = (requested_content_type or "").strip().lower()
    category = (parsed.get("category") or "").strip()
    topic = (parsed.get("topic") or "").strip()
    title = (parsed.get("title") or "").strip()
    brief_description = (parsed.get("brief_description") or "").strip()
    structure_type = ((structure_analysis or {}).get("structure_type") or "").strip().lower()
    list_subtype = ((structure_analysis or {}).get("list_subtype") or "").strip().lower()

    if has_location:
        return "location"

    if requested == "recipe" or parsed.get("recipe"):
        return "recipe"

    if requested == "workout" or parsed.get("workout"):
        return "workout"

    if requested in {"software", "products", "finance"}:
        return requested

    if requested == "location":
        return "location"

    # Structured place rankings/lists should still be public "location" family
    # even when they do not carry a separate location map payload.
    if structure_type == "places" or list_subtype == "places":
        return "location"

    if tools_list:
        family = classify_structured_family(
            transcript=transcript_preview,
            caption=caption,
            category=category,
            topic=topic,
        )

        if family == "places":
            return "location"
        if family in {"software", "finance"}:
            return family

        if _looks_like_finance_text(category, topic, title, brief_description):
            return "finance"

        return "products"

    if requested in _PUBLIC_CONTENT_TYPES:
        return requested

    return "general"


def _extract_item_names_from_cats(tools_cats_en: list[dict] | None, limit: int = 8) -> list[str]:
    """Pull flat item name list from EN categories for summary paragraph fallback context."""
    names: list[str] = []
    for cat in tools_cats_en or []:
        for item in cat.get("items", []) or []:
            name = (item.get("name") or "").strip()
            if name:
                names.append(name)
            if len(names) >= limit:
                return names
    return names


class AssemblyMixin:
    """Assembles the final output dictionary for UniversalExtractor.extract()."""

    def _assemble_output(
        self,
        parsed: dict,
        summary_result: dict,
        content_type: str,
        lang: str,
        is_english_content: bool,
        prompt_trace: dict | None = None,
        call1_raw_tools: list[dict] | None = None,
    ) -> dict:
        lang = repair_language_if_obviously_wrong(lang, prompt_trace)
        is_english_content = (lang or "").lower().startswith("en")

        title_en = parsed["title"]
        title_og = summary_result.get("title_original") or ""

        summary_en = summary_result.get("summary_en", "")
        summary_og = summary_result.get("summary_original", "")

        hashtags = dedupe_preserve_order(parsed.get("hashtags", []))
        emojis = dedupe_preserve_order(parsed.get("emojis", []))

        # ── tools_list (internal compatibility field) ────────────────────
        tools_cats_en = parsed.get("tools_categories") or (
            (parsed.get("tools") or {}).get("categories")
        )

        tools_og_data = summary_result.get("tools_og")
        tools_cats_og = None
        if isinstance(tools_og_data, dict):
            tools_cats_og = tools_og_data.get("categories")
        elif isinstance(tools_og_data, list):
            tools_cats_og = tools_og_data

        if not tools_cats_og:
            translated = summary_result.get("translated_categories")
            if isinstance(translated, list):
                tools_cats_og = translated

        tools_list = build_tools_list(
            tools_categories_en=tools_cats_en,
            tools_categories_og=tools_cats_og,
            lang=lang,
            is_english_content=is_english_content,
        )

        if tools_list:
            logger.info("🔧 Assembled tools_list with %d EN categories", len(tools_cats_en or []))

        # ── Restore tier values lost during Call 2 translation ───────────
        if tools_list:
            tools_list = restore_tiers(
                tools_list=tools_list,
                source_cats=tools_cats_en or [],
                call1_raw_tools=call1_raw_tools,
                list_subtype=(parsed.get("list_subtype") or ""),
            )
            tier_count = sum(
                1
                for cat in (tools_list.get("en") or {}).get("categories", [])
                for item in cat.get("items", [])
                if item.get("tier")
            )
            if tier_count:
                logger.info("🔧 %d items have tier values in final tools_list", tier_count)
            else:
                logger.warning(
                    "🔧 restore_tiers found no tier values, "
                    "pass call1_raw_tools= to _assemble_output() to fix this"
                )

        # ── Normalize non-software product comparisons ───────────────────
        if tools_list:
            tools_list = normalize_nonsoftware_tool_fields(tools_list, parsed)

        # ── Location credibility check ────────────────────────────────────
        raw_location_data = parsed.get("location")
        has_location = _is_credible_location_payload(raw_location_data, tools_cats_en)

        if raw_location_data and not has_location:
            logger.info("📍 Dropping non-credible location payload before final assembly")
            parsed["location"] = None

        # ── Instagram bio location enrichment for venue lists ────────────
        if not has_location and tools_list and tools_cats_en:
            caption_text = (prompt_trace or {}).get("caption", "")
            if caption_text:
                try:
                    loop = asyncio.new_event_loop()
                    try:
                        asyncio.set_event_loop(loop)
                        ig_locations = loop.run_until_complete(
                            enrich_tools_with_instagram_locations(
                                tools_categories=tools_cats_en,
                                caption=caption_text,
                            )
                        )
                    finally:
                        asyncio.set_event_loop(None)
                        loop.close()

                    if ig_locations:
                        parsed["location"] = ig_locations
                        has_location = True
                        logger.info(
                            "📍 IG bio enrichment produced %d location entries, promoting to location",
                            len(ig_locations),
                        )
                except Exception as _ig_err:
                    logger.warning("📍 IG bio enrichment failed (non-fatal): %s", _ig_err)

        # ── Fallback: promote vision-extracted items → tools_list ────────
        promoted = False
        if not tools_list and parsed.get("items") and not has_location:
            tools_list = promote_items_to_tools_list(parsed["items"])
            if tools_list:
                promoted = True
                content_type = "products"
                tools_cats_en = (tools_list.get("en") or {}).get("categories", [])
                logger.info(
                    "🔧 Promoted %d vision items → tools_list (%d categories)",
                    len(parsed["items"]),
                    len(tools_cats_en),
                )

        # ── Structure analysis ────────────────────────────────────────────
        structure_analysis = _EMPTY_STRUCTURE_ANALYSIS.copy()
        list_subtype = ""
        is_ranked = False

        if tools_list:
            prior = parsed.get("structure_analysis")

            if prior and not promoted:
                structure_analysis = prior
                logger.info(
                    "🔧 Reusing prior structure_analysis: mode=%s type=%s subtype=%s",
                    prior.get("mode"),
                    prior.get("structure_type"),
                    prior.get("list_subtype"),
                )
            else:
                active_cats = tools_cats_en or (tools_list.get("en") or {}).get("categories", [])
                pre_hint = (prompt_trace or {}).get("pre_detected_subtype", "")

                structure_analysis = analyze_structure(
                    tools_categories=active_cats,
                    category=parsed.get("category", ""),
                    topic=parsed.get("topic", ""),
                    transcript=(prompt_trace or {}).get("transcript_preview", ""),
                    pre_detected_hint=pre_hint or "",
                )
                logger.info(
                    "🔧 Re-ran structure_analysis: mode=%s type=%s subtype=%s",
                    structure_analysis.get("mode"),
                    structure_analysis.get("structure_type"),
                    structure_analysis.get("list_subtype"),
                )

            list_subtype = structure_analysis.get("list_subtype", "")
            is_ranked = bool(structure_analysis.get("is_ranked"))

            tools_list["list_subtype"] = list_subtype
            tools_list["is_ranked"] = is_ranked

            logger.info(
                "🔧 structure mode=%s type=%s subtype=%s is_ranked=%s conf=%.2f",
                structure_analysis.get("mode"),
                structure_analysis.get("structure_type"),
                list_subtype,
                is_ranked,
                structure_analysis.get("confidence", 0.0),
            )

        structure_mode = structure_analysis.get("mode")
        structure_type = structure_analysis.get("structure_type")

        structured_tools_mode = (
            bool(tools_list)
            and structure_mode == "structured"
            and structure_type in {"verdict", "ranking", "tier", "grouped", "places"}
        )

        # ── Headlines ─────────────────────────────────────────────────────
        if structured_tools_mode:
            headlines_en = []
            headlines_og = []
            logger.info("🧹 Structured list detected, suppressing summary headlines")
        else:
            headlines_en = summary_result.get("headlines_en") or parsed.get("highlights", [])
            headlines_og = summary_result.get("headlines_og") or []

        # ── List metadata: is_list, list_count, list_type, list_summary ──
        is_list = False
        list_count = 0
        list_type = ""
        list_summary = ""

        if tools_list and structure_mode == "structured" and not has_location:
            en_cats_active = (tools_list.get("en") or {}).get("categories", [])
            actual_count = count_valid_items(en_cats_active)

            if actual_count >= 2:
                is_list = True
                brief_description = parsed.get("brief_description", "")
                caption = (prompt_trace or {}).get("caption", "")
                list_summary = summary_en or brief_description or title_en

                if structure_type == "verdict":
                    list_count = actual_count
                    list_type = "verdict"
                    logger.info(
                        "🗂️ Verdict structure: count=%d summary='%.50s...'",
                        list_count,
                        list_summary,
                    )

                elif structure_type in {"tier", "grouped", "ranking", "places"}:
                    list_count = actual_count
                    list_type = structure_type
                    logger.info(
                        "🗂️ Structured list: type=%s count=%d summary='%.50s...'",
                        structure_type,
                        list_count,
                        list_summary,
                    )

                else:
                    list_count, list_type = extract_list_count_and_type(
                        brief_description=brief_description,
                        title=title_en,
                        en_cats=en_cats_active,
                        actual_item_count=actual_count,
                        caption=caption,
                    )
                    logger.info(
                        "🗂️ Structured list: mode=%s type=%s count=%d list_type='%s'",
                        structure_mode,
                        structure_type,
                        list_count,
                        list_type,
                    )

        # ── Sanitize headlines: bookmark mode only ────────────────────────
        named_item_count: int | None = None

        if not is_list:
            _location_count = (
                len(parsed["location"])
                if isinstance(parsed.get("location"), list)
                else (1 if parsed.get("location") else 0)
            )
            _promised = (prompt_trace or {}).get("caption_promised_count")
            named_item_count = (
                _promised if _promised is not None else (_location_count if _location_count > 0 else None)
            )

            headlines_en = sanitize_highlights(headlines_en, named_item_count)
            headlines_og = sanitize_highlights(headlines_og, named_item_count)

            if named_item_count:
                logger.debug(
                    "🧹 sanitize_highlights: named_item_count=%d → en=%d og=%d",
                    named_item_count,
                    len(headlines_en),
                    len(headlines_og),
                )

        # ── Filter placeholder headlines always ───────────────────────────
        headlines_en = filter_placeholder_headlines(headlines_en)
        headlines_og = filter_placeholder_headlines(headlines_og)

        # ── Headline cap ──────────────────────────────────────────────────
        max_headlines: int | None = None

        promised_count = (prompt_trace or {}).get("caption_promised_count")
        if not is_list:
            if promised_count is not None and promised_count >= 4:
                max_headlines = min(promised_count, 6)
            elif named_item_count is not None and named_item_count >= 4:
                max_headlines = min(named_item_count, 6)

        transcript_preview = (prompt_trace or {}).get("transcript_preview", "")
        caption_text = (prompt_trace or {}).get("caption", "")

        # ── Determine public content type before summary block ───────────
        public_content_type = _infer_public_content_type(
            requested_content_type=content_type,
            parsed=parsed,
            tools_list=tools_list,
            structure_analysis=structure_analysis,
            has_location=has_location,
            transcript_preview=transcript_preview,
            caption=caption_text,
        )

        # ── Build summary block ───────────────────────────────────────────
        summary = make_summary_block(
            title_en=title_en,
            title_og=title_og,
            summary_en=summary_en,
            summary_og=summary_og,
            headlines_en=headlines_en,
            headlines_og=headlines_og,
            hashtags=hashtags,
            emojis=emojis,
            content_type=public_content_type,
            max_headlines=max_headlines,
            detected_language=lang,
        )

        # ── Post-generation paragraph guardrail ───────────────────────────
        item_names = _extract_item_names_from_cats(tools_cats_en)

        for lang_key in ("english", "original"):
            block = summary.get(lang_key)
            if not isinstance(block, dict):
                continue
            raw_para = block.get("summary", "")
            if not raw_para:
                continue
            repaired = validate_and_repair_summary_paragraph(
                paragraph=raw_para,
                title=title_en,
                content_type=public_content_type,
                item_names=item_names,
            )
            if repaired != raw_para:
                logger.info(
                    "📝 Paragraph guardrail fired on summary[%s] — replaced %d chars with %d chars",
                    lang_key,
                    len(raw_para),
                    len(repaired),
                )
                block["summary"] = repaired

        # ── Final public content_type guard ───────────────────────────────
        if has_location:
            public_content_type = "location"
            is_list = False
            list_count = 0
            list_type = ""
            list_summary = ""
            list_subtype = ""
            structure_analysis = None
            logger.info("📍 Credible location present, forcing location-first render semantics")

        if public_content_type not in _PUBLIC_CONTENT_TYPES:
            public_content_type = "general"

        final_list_subtype = None
        if not has_location and is_list:
            final_list_subtype = (structure_analysis or {}).get("list_subtype") or None

        return {
            "content_type": public_content_type,
            "extractor_version": getattr(self, "EXTRACTOR_VERSION", ""),
            "category": parsed.get("category", ""),
            "topic": parsed.get("topic", ""),
            "title": title_en,
            "summary": summary,
            "hashtags": hashtags,
            "emojis": emojis,
            "prompt": parsed.get("ai_prompt"),
            "debug": prompt_trace or {},
            "items": parsed.get("items"),
            "tools_list": tools_list,
            "recipe": parsed.get("recipe"),
            "workout": parsed.get("workout"),
            "location": parsed.get("location"),
            "detected_language": lang,
            "is_list": False if has_location else is_list,
            "list_count": None if has_location or not is_list else list_count,
            "list_type": None if has_location or not is_list else list_type,
            "list_summary": None if has_location or not is_list else list_summary,
            "list_subtype": final_list_subtype,
            "structure_analysis": structure_analysis if (tools_list and not has_location and is_list) else None,
        }