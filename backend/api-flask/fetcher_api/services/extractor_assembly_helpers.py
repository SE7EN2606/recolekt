from __future__ import annotations

import logging
import re
from collections import defaultdict

from fetcher_api.services.extractor_helpers import safe_str
from fetcher_api.services.summary_formatter import format_ai_summary

logger = logging.getLogger(__name__)


# ── Tool/item name validator ──────────────────────────────────────────────────


def is_valid_tool_name(name: str) -> bool:
    """
    Returns False for transcript fragments injected as item names.

    Defence-in-depth guard — the primary fix lives in extractor_call1_helpers.py,
    but this catch still protects old stored results.
    """
    if not name:
        return False
    name = name.strip()
    if len(name) > 80:
        return False
    if "\n" in name:
        return False
    if name.startswith("["):
        return False
    if len(name.split()) > 8:
        return False
    return True


# ── Generic helpers ──────────────────────────────────────────────────────────


def dedupe_preserve_order(values: list[str]) -> list[str]:
    seen = set()
    out: list[str] = []
    for v in values or []:
        sv = safe_str(v).strip()
        if not sv:
            continue
        key = sv.casefold()
        if key in seen:
            continue
        seen.add(key)
        out.append(sv)
    return out


_FRENCH_MARKERS = (
    " tu ", " le ", " la ", " les ", " des ", " une ", " un ", " avec ",
    " pour ", " donc ", " c'est ", " c est ", " j'", " qu'", " d'", " au ", " aux ",
    " pas ", " plus ", " moins ", " très ", " vrai ", " marque ", " produit ",
    " serviette ", " maison ", " fondée ", " équivalents ", " honnête ",
    " fabriqué ", " fabriquée ", " fibres ", " commentaire ", " enregistre ",
    " acheter ", " achètes ", " achète ", " bain ", " famille ", " vacances ",
    " hôtels ", " hotels ", " adresses ",
)


def looks_clearly_french(text: str) -> bool:
    t = f" {safe_str(text).lower()} "
    if not t.strip():
        return False

    hits = sum(1 for marker in _FRENCH_MARKERS if marker in t)
    accented = sum(ch in t for ch in "àâçéèêëîïôùûüÿœ")
    return hits >= 4 or (hits >= 2 and accented >= 1)


def repair_language_if_obviously_wrong(lang: str, prompt_trace: dict | None) -> str:
    """
    Final-output metadata repair only.
    This does NOT fix upstream Call 1/2 routing, but it prevents the final
    payload from claiming English when the caption is obviously French.
    """
    lang_norm = (lang or "").strip().lower()
    if lang_norm and lang_norm != "en":
        return lang

    caption = safe_str((prompt_trace or {}).get("caption", ""))
    transcript_preview = safe_str((prompt_trace or {}).get("transcript_preview", ""))

    if looks_clearly_french(caption) or looks_clearly_french(transcript_preview):
        logger.warning("🌍 Language repair: overriding detected_language 'en' -> 'fr'")
        return "fr"

    return lang or "en"


_SOFTWARE_CONTEXT_RE = re.compile(
    r"\b(app|apps|website|websites|tool|tools|software|plugin|plugins|api|apis|"
    r"saas|dashboard|browser|chrome|extension|workflow|automation|notion|figma|"
    r"slack|github|vercel|supabase|chatgpt|claude|canva|ai|llm|bot)\b",
    re.IGNORECASE,
)

_FINANCE_CONTEXT_RE = re.compile(
    r"\b(finance|financial|accounting|bookkeeping|tax|taxes|vat|invoice|invoicing|"
    r"payroll|budget|budgeting|cash\s*flow|p&l|profit and loss|broker|brokerage|"
    r"stocks|shares|etf|etfs|investing|investment|dividend|balance sheet|"
    r"expense ratio|retirement|banking|debt|loan|mortgage)\b",
    re.IGNORECASE,
)


def is_softwareish_context(parsed: dict, categories: list[dict]) -> bool:
    blob_parts = [
        safe_str(parsed.get("category")),
        safe_str(parsed.get("topic")),
        safe_str(parsed.get("title")),
        safe_str(parsed.get("brief_description")),
    ]

    has_url = False
    for cat in categories or []:
        blob_parts.append(safe_str(cat.get("name")))
        for item in cat.get("items", []):
            blob_parts.append(safe_str(item.get("name")))
            blob_parts.append(safe_str(item.get("description")))
            if item.get("url"):
                has_url = True

    blob = " ".join(blob_parts)
    return has_url or bool(_SOFTWARE_CONTEXT_RE.search(blob))


def is_financeish_context(parsed: dict, categories: list[dict]) -> bool:
    blob_parts = [
        safe_str(parsed.get("category")),
        safe_str(parsed.get("topic")),
        safe_str(parsed.get("title")),
        safe_str(parsed.get("brief_description")),
    ]

    for cat in categories or []:
        blob_parts.append(safe_str(cat.get("name")))
        for item in cat.get("items", []):
            blob_parts.append(safe_str(item.get("name")))
            blob_parts.append(safe_str(item.get("description")))

    blob = " ".join(blob_parts)
    return bool(_FINANCE_CONTEXT_RE.search(blob))


def normalize_nonsoftware_tool_fields(
    tools_list: dict | None,
    parsed: dict,
) -> dict | None:
    """
    Physical product / brand / finance comparisons should not inherit software defaults.
    In those cases:
      - free -> null
      - url stays only if it is genuinely present and useful
    """
    if not tools_list:
        return tools_list

    en_cats = (tools_list.get("en") or {}).get("categories", [])
    if not en_cats:
        return tools_list

    if is_softwareish_context(parsed, en_cats):
        return tools_list

    def _apply(categories: list[dict]) -> int:
        changed = 0
        for cat in categories or []:
            for item in cat.get("items", []):
                if item.get("free") is not None:
                    item["free"] = None
                    changed += 1
        return changed

    changed = _apply((tools_list.get("en") or {}).get("categories", []))
    changed += _apply((tools_list.get("original") or {}).get("categories", []))

    if changed:
        logger.info("🔧 Cleared %d non-software free flags", changed)

    return tools_list


# ── List detection helpers ───────────────────────────────────────────────────


_COUNT_WORDS: dict[str, int] = {
    "two": 2, "three": 3, "four": 4, "five": 5, "six": 6,
    "seven": 7, "eight": 8, "nine": 9, "ten": 10,
    "eleven": 11, "twelve": 12, "thirteen": 13, "fourteen": 14, "fifteen": 15,
    "sixteen": 16, "seventeen": 17, "eighteen": 18, "nineteen": 19, "twenty": 20,
}

_LIST_STOP_WORDS = frozenset({
    "best", "top", "most", "ways", "tips", "things", "steps", "must",
    "new", "old", "great", "good", "bad", "big", "the", "all", "any",
    "just", "only", "that", "this", "with", "from", "for", "and",
    "every", "each", "some", "many", "more", "less", "ever", "owes",
    "their", "your", "what", "when", "where",
    "parfaites", "parfait", "parfaits", "perfect", "perfectes",
    "meilleur", "meilleurs", "meilleures", "meilleure",
    "essentiels", "essentielles", "essentiel", "essentielle",
    "incontournables", "incontournable",
    "importantes", "importants", "important", "importante",
    "populaires", "populaire",
    "affordable", "stylish", "beautiful", "amazing", "perfect", "simple",
    "cheap", "expensive", "creative", "popular", "useful", "helpful",
    "incredible", "ultimate", "complete", "favorite", "favourite",
    "powerful", "effective", "proven", "tested", "rated", "ranked",
    "iconic", "famous", "trendy", "viral", "hidden", "underrated",
    "overrated", "honest", "brutal", "real", "true",
})

_LIST_NOUN_RE = re.compile(
    r"\b(\d+|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve"
    r"|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\s+"
    r"(?:(?:best|top|essential|great|favorite|must[\-\s]?have|key|famous|iconic)\s+)?"
    r"(?:\w+\s+)?"
    r"([a-z][a-z\-]{2,}(?:s|es)?)\b",
    re.IGNORECASE,
)

_LIST_TYPE_EMOJI: dict[str, str] = {
    "albums": "🎵", "songs": "🎵", "tracks": "🎵", "records": "🎵", "playlists": "🎵",
    "cars": "🚗", "vehicles": "🚗", "suvs": "🚗",
    "perfumes": "🌸", "fragrances": "🌸", "scents": "🌸",
    "movies": "🎬", "films": "🎬", "shows": "🎬", "series": "🎬",
    "books": "📚", "novels": "📚",
    "tools": "🛠️", "apps": "📱", "plugins": "🛠️",
    "restaurants": "🍽️", "dishes": "🍽️", "recipes": "🍽️",
    "exercises": "💪", "workouts": "💪",
    "destinations": "✈️", "places": "📍", "cities": "🏙️",
    "products": "🛍️", "brands": "🏷️",
    "sunscreens": "🧴", "skincare": "🧴",
    "speakers": "🔊", "headphones": "🎧", "monitors": "🔊",
    "resorts": "⛷️", "hotels": "🏨",
    "finance": "💼", "accounting": "📊", "taxes": "🧾", "investments": "📈",
    "software": "💻",
}


def list_item_emoji(list_type: str) -> str:
    key = (list_type or "").lower()
    return _LIST_TYPE_EMOJI.get(key, _LIST_TYPE_EMOJI.get(key.rstrip("s") + "s", "✨"))


def extract_list_count_and_type(
    brief_description: str,
    title: str,
    en_cats: list[dict],
    actual_item_count: int,
    caption: str = "",
) -> tuple[int, str]:
    list_count = actual_item_count
    list_type = ""

    for text in (brief_description, title, caption):
        if not text:
            continue
        for m in _LIST_NOUN_RE.finditer(text):
            raw_count = m.group(1).lower()
            noun = m.group(2).lower()
            if noun not in _LIST_STOP_WORDS and len(noun) > 3:
                if raw_count.isdigit():
                    list_count = int(raw_count)
                elif raw_count in _COUNT_WORDS:
                    list_count = _COUNT_WORDS[raw_count]
                list_type = noun
                break
        if list_type:
            break

    if not list_type and en_cats:
        cat_name = (en_cats[0].get("name") or "").lower()
        for suffix in (" picks", " recommendations", " list", " collection", " guide", " tips"):
            cat_name = cat_name.replace(suffix, "")
        words = [
            w for w in cat_name.strip().split()
            if len(w) > 3 and w not in _LIST_STOP_WORDS
        ]
        if words:
            list_type = words[-1]

    return list_count, list_type


# ── Placeholder headline filter ──────────────────────────────────────────────


_PLACEHOLDER_HEADLINES = frozenset({
    "key detail", "key takeaway", "key insight", "important detail",
    "notable detail", "main detail", "key point", "main point",
    "notable point", "key information", "important information",
    "additional detail", "extra detail", "more detail",
    "highlight", "key highlight", "main highlight",
    "listed item",
})

_PLACEHOLDER_HEADLINE_PREFIXES = (
    "key detail",
    "key takeaway",
    "key insight",
    "important detail",
    "notable detail",
    "main detail",
    "key point",
    "main point",
    "concrete detail",
    "a concrete detail",
    "a detail",
    "detail shown",
)

_PLACEHOLDER_TEXTS = (
    "a concrete detail shown in the clip",
    "concrete detail shown in",
    "shown in the clip",
    "detail from the video",
    "detail shown in the video",
    "a concrete detail",
    "specific detail from",
    "notable detail from",
    "key detail from",
    "insert detail",
    "placeholder",
    "[detail]",
    "[insert",
    "a named item included in the creator's list",
)


def filter_placeholder_headlines(headlines: list[dict]) -> list[dict]:
    clean = []
    for h in (headlines or []):
        hl = h.get("headline", "").lower().strip()
        tx = h.get("text", h.get("description", "")).lower().strip()

        if hl in _PLACEHOLDER_HEADLINES:
            logger.debug("🧹 Filtered placeholder headline (exact): '%s'", h.get("headline"))
            continue

        if any(hl.startswith(p) for p in _PLACEHOLDER_HEADLINE_PREFIXES):
            logger.debug("🧹 Filtered placeholder headline (prefix): '%s'", h.get("headline"))
            continue

        if any(p in tx for p in _PLACEHOLDER_TEXTS):
            logger.debug("🧹 Filtered placeholder headline (text match): '%s'", h.get("headline"))
            continue

        clean.append(h)
    return clean


# ── Engagement hook filter ───────────────────────────────────────────────────


_HOOK_PATTERNS = [
    r"\bshare\b.{0,20}\bfavorite\b",
    r"\bcomment\b.{0,20}\bbelow\b",
    r"\bcomment\b.{0,20}\bjoin\b",
    r"\bdrop\b.{0,20}\bcomment\b",
    r"\blike\b.{0,20}\bfollow\b",
    r"\bfollow\b.{0,20}\bmore\b",
    r"\bsave\b.{0,20}\bvideo\b",
    r"\btag\b.{0,20}\bfriend\b",
    r"\blet\b.{0,10}\bknow\b",
    r"\bsubscribe\b",
    r"\bjoin\b.{0,20}\b(workshop|class|webinar|masterclass|challenge)\b",
    r"\bcomment\b.{0,20}\b(invest|yes|this|that|below|now)\b",
    r"\bchance\b.{0,20}\bfeatured\b",
    r"\bfeatured\b.{0,20}\bchance\b",
    r"\bfinal thoughts\b",
    r"\bwrap.?up\b",
    r"\bin conclusion\b",
    r"\bget started\b",
    r"\bstart today\b",
    r"\blearn more\b",
    r"\bcheck it out\b",
    r"\bnext video\b",
    r"\bsee you\b.{0,20}\bnext\b",
]

_HOOK_RE = re.compile("|".join(_HOOK_PATTERNS), re.IGNORECASE)


def is_engagement_hook(headline: str, description: str = "") -> bool:
    combined = f"{headline} {description}"
    return bool(_HOOK_RE.search(combined))


def sanitize_highlights(
    highlights: list[dict],
    named_item_count: int | None = None,
) -> list[dict]:
    if not isinstance(highlights, list):
        return []

    clean = [
        h for h in highlights
        if not is_engagement_hook(
            h.get("headline", ""),
            h.get("text", h.get("description", "")),
        )
    ]

    if not clean:
        logger.warning("🧹 All highlights were engagement hooks — returning empty list")
        return []

    # Only apply cap when named_item_count is a positive integer.
    if named_item_count is not None and named_item_count > 0:
        if named_item_count <= 3:
            cap = 3
        elif named_item_count <= 6:
            cap = named_item_count
        else:
            cap = 6
        if len(clean) > cap:
            logger.debug(
                "🧹 Trimmed highlights from %d → %d (named_item_count=%d)",
                len(clean), cap, named_item_count,
            )
        clean = clean[:cap]

    return clean


# ── Summary block ────────────────────────────────────────────────────────────


def make_summary_block(
    title_en: str,
    title_og: str,
    summary_en: str,
    summary_og: str,
    headlines_en: list[dict],
    headlines_og: list[dict],
    hashtags: list[str],
    emojis: list[str],
    content_type: str = "general",
    max_headlines: int | None = None,
    detected_language: str = "en",
) -> dict:
    def _fmt_headlines(highlights: list[dict]) -> list[dict]:
        if not highlights:
            return []
        effective_max = max_headlines if max_headlines is not None else 4
        _, bullets = format_ai_summary(
            title_en="",
            summary_en_raw="__SKIP__",
            highlights_raw=highlights,
            content_type=content_type,
            max_bullets=effective_max,
        )
        formatted = [
            {
                "headline": b["headline"],
                "text": b.get("description", b.get("text", "")),
                "emoji": b.get("emoji", ""),
            }
            for b in bullets
        ]
        result = filter_placeholder_headlines(formatted)
        if max_headlines is not None and len(result) > max_headlines:
            logger.debug("🧹 _fmt_headlines backstop: %d → %d", len(result), max_headlines)
            result = result[:max_headlines]
        return result

    lang_norm = (detected_language or "en").lower()
    is_english_content = lang_norm.startswith("en")

    # Whitespace-safe fallbacks — avoid emitting a blank title/summary
    # for non-English content when the LLM returned whitespace-only strings.
    original_title = (title_og or "").strip() or (title_en if is_english_content else "")
    original_summary = (summary_og or "").strip() or (summary_en if is_english_content else "")

    if is_english_content:
        original_headlines = _fmt_headlines(headlines_en)
    else:
        original_headlines = _fmt_headlines(headlines_og or headlines_en)

    return {
        "english": {
            "title": title_en,
            "summary": summary_en,
            "headlines": _fmt_headlines(headlines_en),
            "hashtags": hashtags,
            "emojis": emojis,
        },
        "original": {
            "title": original_title,
            "summary": original_summary,
            "headlines": original_headlines,
            "hashtags": hashtags,
            "emojis": emojis,
        },
    }


# ── Structured-list builders (internal compatibility field = tools_list) ────


def build_tools_list(
    tools_categories_en: list[dict] | None,
    tools_categories_og: list[dict] | None,
    lang: str,
    is_english_content: bool,
) -> dict | None:
    """
    Internal compatibility container for structured comparison/list content.

    Public semantics no longer rely on content_type='tools', but this field
    remains the structured payload carrier for products / software / finance.
    """
    if not tools_categories_en:
        return None

    og_cats = (
        tools_categories_og
        if (not is_english_content and tools_categories_og)
        else tools_categories_en
    )

    return {
        "list_type": "categorized_list",
        "en": {"categories": tools_categories_en},
        "original": {"categories": og_cats},
    }


def promote_items_to_tools_list(items: list[dict]) -> dict | None:
    valid = [i for i in (items or []) if i.get("name")]
    if not valid:
        return None

    cats: dict[str, list[dict]] = defaultdict(list)
    for idx, item in enumerate(valid, start=1):
        label = safe_str(item.get("category") or "Items").strip() or "Items"
        cats[label].append({
            "rank": idx,
            "tier": item.get("tier"),
            "name": item.get("name", ""),
            "description": item.get("description", ""),
            "why_it_matters": item.get("why_it_matters", ""),
            "free": item.get("free"),
            "url": item.get("url"),
            "source": item.get("source") or "frames",
            "creator_rating": item.get("creator_rating"),
        })

    categories = [
        {"name": cat, "title_og": cat, "emoji": "", "items": tool_items}
        for cat, tool_items in cats.items()
    ]

    return {
        "list_type": "categorized_list",
        "en": {"categories": categories},
        "original": {"categories": categories},
    }


# ── Tier helpers ─────────────────────────────────────────────────────────────


_TIER_CAT_RE = re.compile(r"^([SABCDF])\s+[Tt]ier$", re.IGNORECASE)
_TIER_ORDER: dict[str, int] = {"S": 1, "A": 2, "B": 3, "C": 4, "D": 5, "F": 6}


def build_tier_lookup(source_cats: list[dict]) -> dict[str, str]:
    lookup: dict[str, str] = {}
    for cat in (source_cats or []):
        cat_name = (cat.get("name") or "").strip()
        m = _TIER_CAT_RE.match(cat_name)
        inferred_tier = m.group(1).upper() if m else None

        for item in cat.get("items", []):
            name = (item.get("name") or "").lower().strip()
            if not name:
                continue
            explicit_tier = item.get("tier")
            if explicit_tier and isinstance(explicit_tier, str) and explicit_tier.strip():
                lookup[name] = explicit_tier.strip().upper()
            elif inferred_tier:
                lookup[name] = inferred_tier
    return lookup


def restore_tiers(
    tools_list: dict,
    source_cats: list[dict],
    call1_raw_tools: list[dict] | None = None,
    list_subtype: str = "",
) -> dict:
    """
    Restore tier values lost during Call 2 translation.

    list_subtype should be passed so rank is only cleared for actual tier-list
    content. For ranked lists, rank values must be preserved.
    """
    if not tools_list:
        return tools_list

    tier_lookup = build_tier_lookup(call1_raw_tools or [])
    if not tier_lookup:
        tier_lookup = build_tier_lookup(source_cats or [])

    if not tier_lookup:
        logger.debug("restore_tiers: no tier values found in source — skipping")
        return tools_list

    is_tier_list = (list_subtype or "").strip().lower() == "tier"

    def _apply(categories: list[dict]) -> int:
        restored = 0
        for cat in categories:
            for item in cat.get("items", []):
                name = (item.get("name") or "").lower().strip()
                if name in tier_lookup:
                    item["tier"] = tier_lookup[name]
                    # Only clear rank for true tier-list content.
                    if is_tier_list:
                        item["rank"] = None
                    restored += 1
        return restored

    en_cats = (tools_list.get("en") or {}).get("categories", [])
    og_cats = (tools_list.get("original") or {}).get("categories", [])
    n = _apply(en_cats) + _apply(og_cats)
    logger.info("restore_tiers: restored %d tier values", n)
    return tools_list


# ── Structured list helpers ──────────────────────────────────────────────────


def count_valid_items(categories: list[dict]) -> int:
    return sum(
        1
        for cat in categories or []
        for item in cat.get("items", [])
        if is_valid_tool_name(item.get("name", ""))
    )