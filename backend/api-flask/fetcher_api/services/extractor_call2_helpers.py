"""
Pure helper functions for Call2Mixin — no API calls, no self references.

Covers:
  - JSON builders
  - Headline sanitizers
  - Structured-list flatteners
  - Deterministic summary builders
  - Public family inference
  - Enum field restoration after translation
"""

from __future__ import annotations

import json
import logging
import re

from fetcher_api.services.extractor_helpers import safe_str, safe_list

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# JSON / text helpers
# ─────────────────────────────────────────────────────────────────────────────


def build_headlines_json(highlights: list[dict]) -> str:
    return json.dumps(
        [{"headline": h["headline"], "description": h["description"]} for h in highlights],
        ensure_ascii=False,
    )


def build_tools_json(categories: list[dict]) -> str:
    return json.dumps({"categories": categories}, ensure_ascii=False, indent=2)


def safe_headlines(raw: list) -> list[dict]:
    result = []
    for h in raw:
        if not isinstance(h, dict):
            continue
        hl = safe_str(h.get("headline", "")).strip()
        desc = safe_str(h.get("description", "")).strip()
        if hl and desc:
            result.append({"headline": hl, "description": desc})
    return result


def copy_emojis_to_headlines(
    source_headlines: list[dict],
    target_headlines: list[dict],
) -> list[dict]:
    if not source_headlines or not target_headlines:
        return target_headlines
    result = []
    for i, tgt in enumerate(target_headlines):
        src_emoji = source_headlines[i].get("emoji") or "" if i < len(source_headlines) else ""
        result.append({**tgt, "emoji": tgt.get("emoji") or src_emoji})
    return result


def norm_tool_name(name: str) -> str:
    """Alphanumeric-only lowercase key for cross-category dedup."""
    return re.sub(r"[^a-z0-9]", "", (name or "").lower())


def one_sentence(text: str) -> str:
    s = safe_str(text).strip().replace("\n", " ")
    s = re.sub(r"\s+", " ", s)
    if s and s[-1] not in ".!?":
        s += "."
    return s


def clean_inline_text(text: str) -> str:
    s = safe_str(text).strip().replace("\n", " ")
    return re.sub(r"\s+", " ", s)


def join_names(names: list[str], limit: int = 2) -> str:
    chosen = [n for n in names[:limit] if n]
    if not chosen:
        return ""
    if len(chosen) == 1:
        return chosen[0]
    if len(chosen) == 2:
        return f"{chosen[0]} and {chosen[1]}"
    return ", ".join(chosen[:-1]) + f", and {chosen[-1]}"


def is_english_lang(lang: str) -> bool:
    return safe_str(lang).strip().lower().startswith("en")


def has_location_payload(parsed: dict) -> bool:
    location = parsed.get("location")
    if isinstance(location, list):
        return len(location) > 0
    return isinstance(location, dict) and bool(location)


# ─────────────────────────────────────────────────────────────────────────────
# Enum field restoration after translation
# ─────────────────────────────────────────────────────────────────────────────


def restore_item_enum_fields(
    translated_categories: list[dict] | None,
    source_categories: list[dict] | None,
) -> list[dict] | None:
    """
    Restore enum / machine fields that must remain stable across translation.
    Matched by normalized item name (preserved unchanged by prompt contract).
    """
    if not translated_categories or not source_categories:
        return translated_categories

    source_by_name: dict[str, dict] = {}
    for cat in source_categories or []:
        for item in cat.get("items", []) or []:
            name = safe_str(item.get("name") or "").strip()
            key = norm_tool_name(name)
            if key and key not in source_by_name:
                source_by_name[key] = item

    restored_categories: list[dict] = []
    restored_count = 0

    for cat in translated_categories:
        items_out = []
        for item in cat.get("items", []) or []:
            name = safe_str(item.get("name") or "").strip()
            key = norm_tool_name(name)
            src = source_by_name.get(key)
            if src:
                merged = dict(item)
                for field in ("creator_rating", "rank", "tier", "source", "free", "url"):
                    if field in src:
                        merged[field] = src.get(field)
                items_out.append(merged)
                restored_count += 1
            else:
                items_out.append(item)
        restored_categories.append({**cat, "items": items_out})

    logger.info("🔁 Restored enum/machine fields on %d translated structured-list items", restored_count)
    return restored_categories


# ─────────────────────────────────────────────────────────────────────────────
# Public family inference
# ─────────────────────────────────────────────────────────────────────────────


_FINANCE_RE = re.compile(
    r"\b(finance|financial|accounting|bookkeeping|tax|taxes|vat|invoice|invoicing|"
    r"payroll|budget|budgeting|cash\s*flow|p&l|profit and loss|broker|brokerage|"
    r"stocks|shares|etf|etfs|investing|investment|dividend|balance sheet|"
    r"expense ratio|retirement|banking|debt|loan|mortgage)\b",
    re.IGNORECASE,
)

_SOFTWARE_RE = re.compile(
    r"\b(app|apps|software|saas|platform|plugin|plugins|workflow|automation|"
    r"chatgpt|claude|canva|notion|figma|github|vercel|supabase|llm|api|browser|"
    r"extension|tool|tools)\b",
    re.IGNORECASE,
)


def infer_public_family(parsed: dict, categories: list[dict]) -> str:
    """Returns one of: software, finance, products."""
    parts = [
        clean_inline_text(parsed.get("category") or ""),
        clean_inline_text(parsed.get("topic") or ""),
        clean_inline_text(parsed.get("title") or ""),
        clean_inline_text(parsed.get("brief_description") or ""),
    ]
    for cat in categories or []:
        parts.append(clean_inline_text(cat.get("name") or ""))
        for item in cat.get("items", []) or []:
            parts.append(clean_inline_text(item.get("name") or ""))
            parts.append(clean_inline_text(item.get("description") or ""))
            if item.get("url"):
                parts.append("url-present")

    blob = " ".join(parts)
    if _FINANCE_RE.search(blob):
        return "finance"
    if _SOFTWARE_RE.search(blob):
        return "software"
    return "products"


def family_noun(parsed: dict, categories: list[dict]) -> str:
    f = infer_public_family(parsed, categories)
    if f == "software":
        return "software options"
    if f == "finance":
        return "finance options"
    return "products"


# ─────────────────────────────────────────────────────────────────────────────
# Summary subject helpers
# ─────────────────────────────────────────────────────────────────────────────


def summary_subject(parsed: dict, fallback: str) -> str:
    """
    Prefer a noun-like subject over a sentence fragment.
    Avoids brief_description openers like 'Comparing ...' which break grammar.
    """
    topic = clean_inline_text(parsed.get("topic") or "")
    title = clean_inline_text(parsed.get("title") or "")
    category = clean_inline_text(parsed.get("category") or "")
    if topic:
        return topic
    if title:
        return title.rstrip(".")
    if category:
        return category.rstrip(".")
    return fallback


def summary_context_phrase(parsed: dict) -> str:
    brief = clean_inline_text(parsed.get("brief_description") or "")
    title = clean_inline_text(parsed.get("title") or "")
    category = clean_inline_text(parsed.get("category") or "")
    text = brief or title or category
    if not text:
        return ""

    lowered = text.lower().strip(" .")
    replacements = [
        (r"^comparing\s+", ""),
        (r"^comparison of\s+", ""),
        (r"^comparison\s+of\s+", ""),
        (r"^a comparison of\s+", ""),
        (r"^guide to\s+", ""),
        (r"^guide for\s+", ""),
        (r"^overview of\s+", ""),
        (r"^ranking of\s+", ""),
    ]
    for pattern, repl in replacements:
        lowered = re.sub(pattern, repl, lowered, flags=re.IGNORECASE)

    lowered = lowered.strip(" .")
    if not lowered:
        return ""
    if lowered.startswith(("how ", "why ", "when ", "where ")):
        return ""
    if len(lowered) > 90:
        return ""
    return lowered


def make_subject_line(parsed: dict, fallback: str, verb_phrase: str) -> str:
    subject = summary_subject(parsed, fallback)
    return f"{subject} {verb_phrase}."


# ─────────────────────────────────────────────────────────────────────────────
# Structured-list flatteners
# ─────────────────────────────────────────────────────────────────────────────


def tool_rank_value(item: dict) -> int:
    try:
        r = int(item.get("rank"))
        return r if r > 0 else 10**9
    except (TypeError, ValueError):
        return 10**9


def flatten_ranked_tools(categories: list[dict]) -> list[dict]:
    rows: list[dict] = []
    seen_norms: set[str] = set()
    for cat in (categories or []):
        if not isinstance(cat, dict):
            continue
        cat_name = safe_str(cat.get("name") or cat.get("title") or "").strip() or "Items"
        cat_emoji = safe_str(cat.get("emoji") or "").strip() or "🔧"
        for item in (cat.get("items") or []):
            if not isinstance(item, dict):
                continue
            name = safe_str(item.get("name") or "").strip()
            if not name:
                continue
            n = norm_tool_name(name)
            if not n or n in seen_norms:
                continue
            seen_norms.add(n)
            rows.append({
                "rank": tool_rank_value(item),
                "name": name,
                "description": safe_str(item.get("description") or "").strip(),
                "category": cat_name,
                "emoji": cat_emoji,
                "creator_rating": safe_str(item.get("creator_rating") or "").strip().lower() or None,
            })
    rows.sort(key=lambda x: (x["rank"], x["name"].lower()))
    return rows


def flatten_tools_in_category_order(categories: list[dict]) -> list[dict]:
    rows: list[dict] = []
    seen_norms: set[str] = set()
    for cat_index, cat in enumerate(categories or []):
        if not isinstance(cat, dict):
            continue
        cat_name = safe_str(cat.get("name") or cat.get("title") or "").strip() or "Items"
        cat_emoji = safe_str(cat.get("emoji") or "").strip() or "🔧"
        sorted_items = sorted(
            cat.get("items") or [],
            key=lambda item: (tool_rank_value(item), safe_str(item.get("name") or "").lower()),
        )
        for item in sorted_items:
            if not isinstance(item, dict):
                continue
            name = safe_str(item.get("name") or "").strip()
            if not name:
                continue
            n = norm_tool_name(name)
            if not n or n in seen_norms:
                continue
            seen_norms.add(n)
            rows.append({
                "rank": tool_rank_value(item),
                "name": name,
                "description": safe_str(item.get("description") or "").strip(),
                "category": cat_name,
                "emoji": cat_emoji,
                "category_index": cat_index,
            })
    return rows


def collect_category_names(categories: list[dict]) -> dict[str, list[str]]:
    out: dict[str, list[str]] = {}
    for cat in categories or []:
        cat_name = safe_str(cat.get("name") or "").strip()
        if not cat_name:
            continue
        names = []
        seen: set[str] = set()
        for item in (cat.get("items") or []):
            name = safe_str(item.get("name") or "").strip()
            n = norm_tool_name(name)
            if not name or not n or n in seen:
                continue
            seen.add(n)
            names.append(name)
        if names:
            out[cat_name.lower()] = names
    return out


def infer_ranking_axis(parsed: dict, categories: list[dict]) -> str:
    hay = " ".join([
        clean_inline_text(parsed.get("title") or ""),
        clean_inline_text(parsed.get("brief_description") or ""),
        clean_inline_text(parsed.get("topic") or ""),
        " ".join(clean_inline_text(cat.get("name") or "") for cat in categories or []),
    ]).lower()
    if "mainstream to niche" in hay or ("mainstream" in hay and "niche" in hay):
        return "mainstream_to_niche"
    if "cheap to expensive" in hay or ("budget" in hay and "premium" in hay):
        return "budget_to_premium"
    if "best to worst" in hay or "worst to best" in hay:
        return "quality_order"
    return "generic"


# ─────────────────────────────────────────────────────────────────────────────
# Verdict bucket fuzzy lookup
# ─────────────────────────────────────────────────────────────────────────────


def _fuzzy_cat_lookup(cat_map: dict[str, list[str]], *candidates: str) -> list[str]:
    """
    Case- and phrasing-tolerant bucket lookup.
    Checks if any candidate string appears in or contains a cat_map key.
    """
    for key in cat_map:
        for candidate in candidates:
            if candidate in key or key in candidate:
                return cat_map[key]
    return []


# ─────────────────────────────────────────────────────────────────────────────
# Deterministic summary builders
# ─────────────────────────────────────────────────────────────────────────────


def build_ranked_summary(parsed: dict) -> str:
    categories = parsed.get("tools_categories") or []
    ranked = flatten_ranked_tools(categories)
    total = len(ranked)
    axis = infer_ranking_axis(parsed, categories)
    fn = family_noun(parsed, categories)

    favorites = [r["name"] for r in ranked if r.get("creator_rating") == "best"]
    favorites_text = join_names(favorites, limit=2)

    if axis == "mainstream_to_niche":
        line1 = make_subject_line(
            parsed,
            fallback="This ranking",
            verb_phrase=f"orders {total} named {fn} from more mainstream choices to more niche alternatives",
        )
        if favorites_text:
            line2 = (
                f"Useful to save when comparing alternatives across the spectrum, "
                f"with standout picks like {favorites_text} appearing deeper in the list."
            )
        else:
            mid_names = join_names([r["name"] for r in ranked[1:4]], limit=3)
            line2 = (
                f"Useful to save when you want alternatives beyond the obvious names"
                f"{f', including {mid_names}' if mid_names else ''}."
            )
        return f"{line1}\n\n{line2}"

    explicit = [r for r in ranked if r["rank"] < 10**9]
    preview = join_names([r["name"] for r in explicit[:3]], limit=3)

    line1 = make_subject_line(
        parsed,
        fallback="This ranking",
        verb_phrase=f"compares {total} named {fn} in a clear ranked order",
    )
    if favorites_text:
        line2 = f"Worth saving for the ordering itself and for standout picks like {favorites_text}."
    else:
        line2 = (
            f"Worth saving when you want a compact ranking reference"
            f"{f' featuring {preview}' if preview else ''}."
        )
    return f"{line1}\n\n{line2}"


def build_tier_summary(parsed: dict) -> str:
    categories = parsed.get("tools_categories") or []
    fn = family_noun(parsed, categories)
    cat_names = [
        safe_str(cat.get("name") or "").strip()
        for cat in categories
        if safe_str(cat.get("name") or "").strip()
    ]
    cat_preview = join_names(cat_names, limit=3)
    line1 = make_subject_line(
        parsed,
        fallback="This tier list",
        verb_phrase=(
            f"sorts the {fn} into clear tiers"
            f"{f' such as {cat_preview}' if cat_preview else ''}"
        ),
    )

    top_items = []
    bottom_items = []
    for cat in categories:
        cat_name = safe_str(cat.get("name") or "").strip().upper()
        names = [
            safe_str(i.get("name") or "").strip()
            for i in (cat.get("items") or [])
            if safe_str(i.get("name") or "").strip()
        ]
        if not names:
            continue
        if cat_name.startswith("S") or "S TIER" in cat_name or "A TIER" in cat_name:
            top_items.extend(names)
        elif cat_name.startswith("F") or "F TIER" in cat_name or "D TIER" in cat_name:
            bottom_items.extend(names)

    top_text = join_names(top_items, limit=2)
    bottom_text = join_names(bottom_items, limit=1)

    if top_text and bottom_text:
        line2 = (
            f"Worth saving before buying — {top_text} rank at the top "
            f"while {bottom_text} sits at the bottom."
        )
    elif top_text:
        line2 = (
            f"Worth saving before buying — {top_text} rank at the top of the list."
        )
    else:
        line2 = (
            "Useful to save when you want a quick sense of what stands out, "
            "what sits in the middle, and what is worth skipping."
        )
    return f"{line1}\n\n{line2}"


def build_verdict_summary(parsed: dict) -> str:
    categories = parsed.get("tools_categories") or []
    topic = safe_str(parsed.get("topic") or "").strip().lower()
    fn = family_noun(parsed, categories)
    cat_map = collect_category_names(categories)
    buy_brand = _fuzzy_cat_lookup(cat_map, "buy the brand", "brand")
    buy_product = _fuzzy_cat_lookup(cat_map, "buy the product", "product")
    buy_both = _fuzzy_cat_lookup(cat_map, "buy both", "both")
    subject = topic if topic else fn

    line1 = make_subject_line(
        parsed,
        fallback="This verdict breakdown",
        verb_phrase=(
            "separates where you are mostly paying for brand image, "
            "where the product itself carries the value, and where both align"
        ),
    )

    parts: list[str] = []
    if buy_product:
        parts.append(f"product-led picks like {join_names(buy_product)}")
    if buy_brand:
        parts.append(f"brand-led picks like {join_names(buy_brand)}")
    if buy_both:
        parts.append(f"balanced choices like {join_names(buy_both)}")

    if not parts:
        for cat_key, names in cat_map.items():
            if names:
                parts.append(f"{cat_key} ({join_names(names)})")
            if len(parts) >= 3:
                break

    if parts:
        line2 = (
            f"Worth saving before choosing {subject} because it turns the comparison into a clear buying lens, covering "
            + "; ".join(parts)
            + "."
        )
    else:
        line2 = (
            f"Worth saving before choosing {subject} because it gives a clearer way to judge value, positioning, and product quality."
        )
    return f"{line1}\n\n{line2}"


def build_grouped_summary(parsed: dict) -> str:
    categories = parsed.get("tools_categories") or []
    rows = flatten_tools_in_category_order(categories)
    total = len(rows)
    fn = family_noun(parsed, categories)
    cat_names = [
        safe_str(cat.get("name") or "").strip()
        for cat in categories
        if safe_str(cat.get("name") or "").strip()
    ]
    cat_preview = join_names(cat_names, limit=3)
    line1 = make_subject_line(
        parsed,
        fallback="Curated comparison",
        verb_phrase=(
            f"organizes {total} {fn} into clear groups"
            f"{f' such as {cat_preview}' if cat_preview else ''}"
        ),
    )
    line2 = (
        "Helpful to save when you want to compare options by use case instead of sorting through them one by one."
    )
    return f"{line1}\n\n{line2}"


# ─────────────────────────────────────────────────────────────────────────────
# Structure resolution helpers
# ─────────────────────────────────────────────────────────────────────────────


def get_structure_info(parsed: dict) -> dict:
    return parsed.get("structure_analysis") or {}


def is_structured_mode(parsed: dict) -> bool:
    if has_location_payload(parsed):
        return False
    return get_structure_info(parsed).get("mode") == "structured"


def get_structure_type(parsed: dict) -> str:
    structure = get_structure_info(parsed)
    stype = safe_str(structure.get("structure_type") or "").strip().lower()
    if stype:
        return stype

    subtype = safe_str(parsed.get("list_subtype") or "").strip().lower()
    is_ranked = bool(parsed.get("is_ranked"))

    if subtype == "verdict":
        return "verdict"
    if subtype == "ranking" or is_ranked:
        return "ranking"
    if subtype == "tier":
        return "tier"
    if subtype == "places":
        return "places"
    if subtype in {"grouped", "picks", "software", "lifestyle", "gear", "food", "finance"}:
        return "grouped"
    return "unknown"


def build_structured_output(parsed: dict, tools_categories: list[dict]) -> dict:
    structure_type = get_structure_type(parsed)
    if structure_type == "verdict":
        summary_en = build_verdict_summary(parsed)
    elif structure_type == "ranking":
        summary_en = build_ranked_summary(parsed)
    elif structure_type == "tier":
        summary_en = build_tier_summary(parsed)
    else:
        summary_en = build_grouped_summary(parsed)

    return {
        "summary_en": summary_en,
        "summary_original": summary_en,
        "title_original": parsed.get("title", ""),
        "headlines_en": [],
        "headlines_og": [],
    }