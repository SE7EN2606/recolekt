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


v28:
  - Sanitizes merged/promoted location rows before final promotion.
  - Strengthens venue/account matching with accent folding, separator cleanup,
    common venue suffix removal, and conservative containment matching.
  - Preserves full base row coverage while allowing IG enrichment to fill only
    missing fields.
  - Repairs final public count claims for location lists so summaries/titles do
    not say "Top 10" when only 9 real places were extracted.
"""


from __future__ import annotations


import asyncio
import logging
import re
import unicodedata


from fetcher_api.adapters.meta_client import meta_client
from fetcher_api.services.extractor_list_detection import (
    analyze_structure,
    classify_structured_family,
)
from fetcher_api.services.extractor_assembly_helpers import (
    build_tools_list,
    count_valid_items,
    dedupe_preserve_order,
    extract_list_count_and_type,
    filter_placeholder_headlines,
    make_summary_block,
    normalize_nonsoftware_tool_fields,
    promote_items_to_tools_list,
    repair_language_if_obviously_wrong,
    restore_tiers,
    sanitize_highlights,
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


_FAKE_REGION_TERMS = {
    "europe", "europa", "alps", "alpine", "dolomites", "mediterranean",
    "scandinavia", "middle east", "southeast asia", "asia", "africa",
    "north america", "south america", "latin america", "oceania",
    "caribbean", "balkans", "nordics", "benelux", "central europe",
    "eastern europe", "western europe", "northern europe", "southern europe",
}


_COMMON_VENUE_SUFFIXES = (
    "family resort",
    "familyresort",
    "boutique hotel",
    "hotel",
    "resort",
    "lodge",
    "chalet",
    "villa",
    "apartments",
    "apartment",
    "suites",
    "suite",
    "spa",
)


_MARKETING_HINTS = (
    "seit",
    "since",
    "urban",
    "lifestyle",
    "retreat",
    "escape",
    "hideaway",
    "grosszügig",
    "großzügig",
    "unkompliziert",
    "family time",
    "experience",
)


_ADDRESS_HINTS = (
    "street", "st", "st.", "road", "rd", "rd.", "avenue", "ave", "ave.",
    "boulevard", "blvd", "blvd.", "lane", "ln", "ln.", "drive", "dr", "dr.",
    "rue", "via", "platz", "plaza", "piazza", "straße", "strasse", "route",
    "weg", "allee", "quai", "cours", "promenade",
)


_PLACE_COUNT_NOUN_PATTERN = (
    r"(?:"
    r"top[- ]rated\s+)?"
    r"(?:"
    r"resorts?|hotels?|hôtels?|places?|destinations?|properties|venues?|spots?|"
    r"picks?|options?|complexes(?:\s+hôteliers)?|établissements|lieux|adresses"
    r")"
)


def _fold_accents(value: str) -> str:
    text = unicodedata.normalize("NFKD", value or "")
    return "".join(ch for ch in text if not unicodedata.combining(ch))


def _clean_text(value) -> str:
    if value is None:
        return ""
    text = str(value)
    text = text.replace("\u00a0", " ").replace("\u200b", " ")
    text = re.sub(r"\s+", " ", text)
    text = re.sub(r"(?:\s*\.\s*){2,}", ". ", text)
    return text.strip(" ,;\n\t.-|•·")


def _contains_letters(value: str) -> bool:
    return any(ch.isalpha() for ch in value or "")


def _looks_like_symbol_only(value: str) -> bool:
    return bool(value) and not any(ch.isalnum() for ch in value)


def _looks_like_marketing_tagline(text: str) -> bool:
    if not text:
        return False

    lowered = f" {_fold_accents(text).lower()} "

    if any(f" {hint} " in lowered for hint in _MARKETING_HINTS):
        return True

    if (" - " in text or " – " in text) and not any(ch.isdigit() for ch in text):
        parts = [p.strip() for p in re.split(r"\s+[–-]\s+", text) if p.strip()]
        if len(parts) >= 2:
            return True

    if len(text.split()) >= 5 and not any(ch.isdigit() for ch in text) and "," not in text:
        return True

    return False


def _looks_like_address(text: str) -> bool:
    lowered = f" {_fold_accents(text).lower()} "
    if any(f" {hint} " in lowered for hint in _ADDRESS_HINTS):
        return True
    if re.search(r"\d", text) and _contains_letters(text):
        return True
    if "," in text and any(ch.isdigit() for ch in text):
        return True
    return False


def _strip_flag_emoji(text: str) -> str:
    if not text:
        return ""
    text = re.sub(r"[\U0001F1E6-\U0001F1FF]{2}", " ", text)
    text = re.sub(r"[\U0001F1E6-\U0001F1FF]", " ", text)
    return text


def _strip_leading_markers(text: str) -> str:
    if not text:
        return ""
    i = 0
    while i < len(text) and not text[i].isalnum():
        i += 1
    return text[i:]


def _clean_geo_value(value) -> str:
    text = _clean_text(value)
    if not text:
        return ""
    text = _strip_flag_emoji(text)
    text = _strip_leading_markers(text)
    text = re.sub(r"[|•·]+", ", ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip(" ,;\n\t.-")


def _clean_name_value(value) -> str | None:
    text = _clean_geo_value(value)
    if not text:
        return None
    return text


def _clean_city_value(value) -> str | None:
    text = _clean_geo_value(value)
    if not text:
        return None
    if _looks_like_symbol_only(text):
        return None
    if _looks_like_marketing_tagline(text):
        return None
    lowered = _fold_accents(text).lower()
    if lowered in _FAKE_REGION_TERMS:
        return None
    if not _contains_letters(text):
        return None
    if any(ch.isdigit() for ch in text):
        return None
    if len(text.split()) > 4:
        return None
    return text


def _clean_region_value(value) -> str | None:
    text = _clean_geo_value(value)
    if not text:
        return None
    if _looks_like_symbol_only(text):
        return None
    if _looks_like_marketing_tagline(text):
        return None
    lowered = _fold_accents(text).lower()
    if lowered in _FAKE_REGION_TERMS:
        return None
    if not _contains_letters(text):
        return None
    return text


def _clean_country_value(value) -> str | None:
    text = _clean_geo_value(value)
    if not text:
        return None
    if _looks_like_symbol_only(text):
        return None
    lowered = _fold_accents(text).lower()
    if lowered in _FAKE_REGION_TERMS:
        return None
    if _looks_like_marketing_tagline(text):
        return None
    if not _contains_letters(text):
        return None
    return text


def _clean_address_value(value) -> str | None:
    text = _clean_geo_value(value)
    if not text:
        return None
    if _looks_like_symbol_only(text):
        return None
    if _looks_like_marketing_tagline(text) and not _looks_like_address(text):
        return None
    if not _looks_like_address(text):
        return None
    return text


def _clean_postal_code_value(value, *, country: str | None = None, context: str = "") -> str | None:
    text = _clean_geo_value(value).replace(" ", "")
    if not text:
        return None

    if not re.fullmatch(r"[A-Za-z0-9\-]{3,10}", text):
        return None

    if not any(ch.isdigit() for ch in text):
        return None

    if re.fullmatch(r"(1[5-9]\d{2}|20\d{2})", text):
        combined = f"{country or ''} {context or ''}".lower()
        if not any(hint in combined for hint in _ADDRESS_HINTS) and "," not in combined:
            return None

    return text


def _sanitize_location_row(row: dict) -> dict:
    out = dict(row or {})

    name = _clean_name_value(out.get("name"))
    address = _clean_address_value(out.get("address"))
    neighborhood = _clean_region_value(out.get("neighborhood"))
    city = _clean_city_value(out.get("city"))
    region = _clean_region_value(out.get("region"))
    country = _clean_country_value(out.get("country"))
    postal_code = _clean_postal_code_value(
        out.get("postal_code"),
        country=country,
        context=" ".join(x for x in [address, city, region, country] if x),
    )

    if country and region and _normalize_place_key(country) == _normalize_place_key(region):
        region = None

    if country and city and _normalize_place_key(country) == _normalize_place_key(city):
        city = None

    out["name"] = name
    out["address"] = address
    out["neighborhood"] = neighborhood
    out["city"] = city
    out["region"] = region
    out["country"] = country
    out["postal_code"] = postal_code

    for key in (
        "description",
        "instagram_username",
        "instagram_account_name",
        "google_place_id",
        "maps_url",
        "type",
        "place_type",
    ):
        value = _clean_text(out.get(key)) or None
        out[key] = value

    if not out.get("type") and out.get("place_type"):
        out["type"] = out["place_type"]

    if not out.get("place_type") and out.get("type"):
        out["place_type"] = out["type"]

    if out.get("lat") == "":
        out["lat"] = None
    if out.get("lng") == "":
        out["lng"] = None

    return out


def _sanitize_location_rows(location_data) -> list[dict]:
    rows = _normalize_location_rows(location_data)
    sanitized: list[dict] = []

    for row in rows:
        clean = _sanitize_location_row(row)
        if clean.get("name"):
            sanitized.append(clean)

    return sanitized


def _count_locations(location_data) -> int:
    rows = _normalize_location_rows(location_data)
    return len([row for row in rows if isinstance(row, dict) and row.get("name")])


def _repair_count_claims(text: str, actual_count: int) -> str:
    if not text or actual_count <= 0:
        return text

    def replace_top(match: re.Match) -> str:
        prefix = match.group(1)
        claimed = int(match.group(2))
        return f"{prefix}{actual_count}" if claimed != actual_count else match.group(0)

    def replace_numbered_place_noun(match: re.Match) -> str:
        claimed = int(match.group(1))
        suffix = match.group(2)
        return f"{actual_count}{suffix}" if claimed != actual_count else match.group(0)

    repaired = re.sub(
        r"\b([Tt]op\s+|TOP\s+)(\d+)\b",
        replace_top,
        text,
    )

    repaired = re.sub(
        rf"\b(\d+)(\s+{_PLACE_COUNT_NOUN_PATTERN}\b)",
        replace_numbered_place_noun,
        repaired,
        flags=re.IGNORECASE,
    )

    return repaired


def _repair_location_count_claims_in_highlights(highlights, actual_count: int):
    if not isinstance(highlights, list) or actual_count <= 0:
        return highlights

    repaired = []
    for item in highlights:
        if not isinstance(item, dict):
            repaired.append(item)
            continue

        next_item = dict(item)
        for key in ("headline", "description", "text"):
            if isinstance(next_item.get(key), str):
                next_item[key] = _repair_count_claims(next_item[key], actual_count)

        repaired.append(next_item)

    return repaired


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
    rows = _sanitize_location_rows(location_data)
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


def _call_classify_structured_family(
    transcript: str,
    caption: str,
    category: str = "",
    topic: str = "",
) -> str:
    """
    Compatibility wrapper for extractor_list_detection.classify_structured_family().
    """
    try:
        return classify_structured_family(
            transcript=transcript,
            caption=caption,
            category=category,
            topic=topic,
        )
    except TypeError:
        return classify_structured_family(transcript, caption)


def _guess_place_type_from_name(name: str) -> str:
    n = (name or "").strip().lower()

    if "resort" in n:
        return "Resort"
    if "hotel" in n or "hôtel" in n:
        return "Hotel"
    if "lodge" in n:
        return "Lodge"
    if "chalet" in n:
        return "Chalet"
    if "villa" in n:
        return "Villa"
    if "domaine" in n:
        return "Estate"

    return "Hotel"


def _normalize_place_key(value: str) -> str:
    text = _fold_accents(value or "").lower()
    text = text.replace("&", " and ")
    text = text.replace("@", "")
    text = text.replace("_", " ")
    text = text.replace("-", " ")
    text = re.sub(r"[^a-z0-9]+", " ", text).strip()
    text = re.sub(r"\s+", " ", text)

    for suffix in sorted(_COMMON_VENUE_SUFFIXES, key=len, reverse=True):
        if text.endswith(f" {suffix}"):
            text = text[: -len(suffix)].strip()
            break

    return text


def _tool_items_to_location_rows(tools_categories: list[dict] | None) -> list[dict]:
    rows: list[dict] = []

    for cat in tools_categories or []:
        for item in cat.get("items", []) or []:
            name = (item.get("name") or "").strip()
            if not name:
                continue

            row = {
                "name": name,
                "type": _guess_place_type_from_name(name),
                "description": (item.get("description") or "").strip() or None,
                "address": None,
                "neighborhood": None,
                "city": None,
                "region": None,
                "country": None,
                "postal_code": None,
                "instagram_username": None,
                "instagram_account_name": None,
                "lat": None,
                "lng": None,
                "google_place_id": None,
                "maps_url": None,
            }
            rows.append(_sanitize_location_row(row))

    return rows


def _keys_match(base_keys: list[str], enriched_keys: list[str]) -> bool:
    if not base_keys or not enriched_keys:
        return False

    for bk in base_keys:
        for ek in enriched_keys:
            if bk == ek:
                return True
            if len(bk) >= 6 and bk in ek:
                return True
            if len(ek) >= 6 and ek in bk:
                return True

    return False


def _merge_tool_rows_with_enriched_locations(
    base_rows: list[dict],
    enriched_rows: list[dict] | None,
) -> list[dict]:
    if not base_rows:
        return _sanitize_location_rows(enriched_rows or [])

    if not enriched_rows:
        return _sanitize_location_rows(base_rows)

    def _candidate_keys(row: dict) -> list[str]:
        raw = [
            row.get("name"),
            row.get("instagram_account_name"),
            row.get("instagram_username"),
        ]
        keys = [_normalize_place_key(v) for v in raw if v]
        return [k for k in keys if k]

    merged: list[dict] = []
    used_indexes: set[int] = set()

    clean_base_rows = _sanitize_location_rows(base_rows)
    clean_enriched_rows = _sanitize_location_rows(enriched_rows)

    for base in clean_base_rows:
        base_keys = _candidate_keys(base)
        match_index = None

        for idx, enriched in enumerate(clean_enriched_rows):
            if idx in used_indexes:
                continue

            enriched_keys = _candidate_keys(enriched)
            if _keys_match(base_keys, enriched_keys):
                match_index = idx
                break

        out = dict(base)

        if match_index is not None:
            used_indexes.add(match_index)
            enriched = clean_enriched_rows[match_index]

            for field in (
                "type",
                "description",
                "address",
                "neighborhood",
                "city",
                "region",
                "country",
                "postal_code",
                "instagram_username",
                "instagram_account_name",
                "google_place_id",
                "maps_url",
            ):
                if not out.get(field) and enriched.get(field):
                    out[field] = enriched[field]

            if out.get("lat") is None and enriched.get("lat") is not None:
                out["lat"] = enriched["lat"]

            if out.get("lng") is None and enriched.get("lng") is not None:
                out["lng"] = enriched["lng"]

        merged.append(_sanitize_location_row(out))

    return merged


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


    if structure_type == "places" or list_subtype == "places":
        return "location"


    if tools_list:
        family = _call_classify_structured_family(
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


        if tools_list:
            tools_list = normalize_nonsoftware_tool_fields(tools_list, parsed)


        raw_location_data = parsed.get("location")
        if raw_location_data:
            sanitized_existing_locations = _sanitize_location_rows(raw_location_data)
            parsed["location"] = sanitized_existing_locations or None


        has_location = _is_credible_location_payload(parsed.get("location"), tools_cats_en)


        if parsed.get("location") and not has_location:
            logger.info("📍 Dropping non-credible location payload before final assembly")
            parsed["location"] = None


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
                                fetch_account=meta_client.get_instagram_profile,
                            )
                        )
                    finally:
                        asyncio.set_event_loop(None)
                        loop.close()


                    if ig_locations:
                        base_locations = _tool_items_to_location_rows(tools_cats_en)
                        merged_locations = _merge_tool_rows_with_enriched_locations(
                            base_rows=base_locations,
                            enriched_rows=ig_locations,
                        )
                        merged_locations = _sanitize_location_rows(merged_locations)


                        merged_is_credible = _is_credible_location_payload(
                            merged_locations,
                            tools_cats_en,
                        )


                        if merged_is_credible and len(merged_locations) >= len(base_locations):
                            parsed["location"] = merged_locations
                            has_location = True
                            logger.info(
                                "📍 IG bio enrichment merged %d enriched rows into %d total location entries, promoting to location",
                                len(ig_locations),
                                len(merged_locations),
                            )
                        else:
                            logger.info(
                                "📍 IG bio enrichment returned %d rows but merged payload was not credible enough to promote",
                                len(ig_locations),
                            )
                except Exception as _ig_err:
                    logger.warning("📍 IG bio enrichment failed (non-fatal): %s", _ig_err)


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


        if structured_tools_mode:
            headlines_en = []
            headlines_og = []
            logger.info("🧹 Structured list detected, suppressing summary headlines")
        else:
            headlines_en = summary_result.get("headlines_en") or parsed.get("highlights", [])
            headlines_og = summary_result.get("headlines_og") or []


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


        headlines_en = filter_placeholder_headlines(headlines_en)
        headlines_og = filter_placeholder_headlines(headlines_og)


        max_headlines: int | None = None


        promised_count = (prompt_trace or {}).get("caption_promised_count")
        if not is_list:
            if promised_count is not None and promised_count >= 4:
                max_headlines = min(promised_count, 6)
            elif named_item_count is not None and named_item_count >= 4:
                max_headlines = min(named_item_count, 6)


        transcript_preview = (prompt_trace or {}).get("transcript_preview", "")
        caption_text = (prompt_trace or {}).get("caption", "")


        public_content_type = _infer_public_content_type(
            requested_content_type=content_type,
            parsed=parsed,
            tools_list=tools_list,
            structure_analysis=structure_analysis,
            has_location=has_location,
            transcript_preview=transcript_preview,
            caption=caption_text,
        )


        if has_location:
            public_content_type = "location"
            parsed["location"] = _sanitize_location_rows(parsed.get("location"))


            location_count = _count_locations(parsed.get("location"))
            if location_count:
                title_en = _repair_count_claims(title_en, location_count)
                title_og = _repair_count_claims(title_og, location_count)
                summary_en = _repair_count_claims(summary_en, location_count)
                summary_og = _repair_count_claims(summary_og, location_count)
                headlines_en = _repair_location_count_claims_in_highlights(headlines_en, location_count)
                headlines_og = _repair_location_count_claims_in_highlights(headlines_og, location_count)


            is_list = False
            list_count = 0
            list_type = ""
            list_summary = ""
            list_subtype = ""
            structure_analysis = None
            logger.info("📍 Credible location present, forcing location-first render semantics")


        if public_content_type not in _PUBLIC_CONTENT_TYPES:
            public_content_type = "general"


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


        final_list_subtype = None
        if not has_location and is_list:
            final_list_subtype = (structure_analysis or {}).get("list_subtype") or None


        summary.setdefault("english", {})
        summary.setdefault("original", {})


        english_summary = str(summary.get("english", {}).get("summary") or "").strip()
        if not english_summary:
            fallback = validate_and_repair_summary_paragraph(
                paragraph=str(title_en or parsed.get("brief_description") or "Saved content"),
                title=title_en,
                content_type=public_content_type,
                item_names=_extract_item_names_from_cats(tools_cats_en),
            )
            summary["english"]["summary"] = fallback


        original_summary = str(summary.get("original", {}).get("summary") or "").strip()
        if not original_summary:
            summary["original"]["summary"] = summary["english"]["summary"]


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
            "recipe": (
                {"english": parsed.get("recipe"), "original": summary_result.get("recipe_og")}
                if parsed.get("recipe") and summary_result.get("recipe_og")
                else parsed.get("recipe")
            ),
            "workout": (
                {"english": parsed.get("workout"), "original": summary_result.get("workout_og")}
                if parsed.get("workout") and summary_result.get("workout_og")
                else parsed.get("workout")
            ),
            "location": parsed.get("location"),
            "detected_language": lang,
            "is_list": False if has_location else is_list,
            "list_count": None if has_location or not is_list else list_count,
            "list_type": None if has_location or not is_list else list_type,
            "list_summary": None if has_location or not is_list else list_summary,
            "list_subtype": final_list_subtype,
            "structure_analysis": structure_analysis if (tools_list and not has_location and is_list) else None,
        }