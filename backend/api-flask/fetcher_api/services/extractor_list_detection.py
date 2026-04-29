"""
Structured list detection helpers, subtype detection, and structure analysis.

Routing only:
- location vs structured-list
- ranking vs tier vs verdict vs grouped
- public family classification for Phase 2

Prompt builders/constants live in extractor_list_prompts.py
"""

from __future__ import annotations

import re


_TIER_VALUES = {"S", "A", "B", "C", "D", "F"}

_TIER_CAT_RE = re.compile(r"^\s*([SABCDF])\s*(?:-| )?\s*tier\s*$", re.IGNORECASE)
_SIMPLE_TIER_RE = re.compile(r"^\s*([SABCDF])\s*$", re.IGNORECASE)
_MERGED_TIER_CAT_RE = re.compile(
    r"^\s*([SABCDF])\s*&\s*([SABCDF])\s*tier\s*$",
    re.IGNORECASE,
)

_MENTION_VERDICT_RE = re.compile(r"@[\w.]+\s*(?:→|->|—|–|-|:)\s*\S", re.MULTILINE)
_PLAIN_MENTION_RE = re.compile(r"@([A-Za-z0-9._]+)")

_RANKED_TRANSCRIPT_RE = re.compile(
    r"\b(?:number|ranked?|#)\s*(?:one|two|three|four|five|six|seven|eight|nine|ten|\d{1,2})\b",
    re.IGNORECASE,
)
_ORDINAL_TRANSCRIPT_RE = re.compile(
    r"\b(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\b",
    re.IGNORECASE,
)
_TIER_TRANSCRIPT_RE = re.compile(r"\b[sabcdf][\s-]tier\b", re.IGNORECASE)
_TESTED_TRANSCRIPT_RE = re.compile(r"tested\s+at\s+(?:spf\s*)?\d+", re.IGNORECASE)
_FRENCH_TIER_TRANSCRIPT_RE = re.compile(r"(?:dans\s+le|en)\s+[sabcdf]\b", re.IGNORECASE)

_MAINSTREAM_TO_NICHE_RE = re.compile(
    r"\b(?:from|ranked?\s+from)\s+the\s+most\s+mainstream\s+to\s+(?:more\s+)?niche\b",
    re.IGNORECASE,
)
_WORST_BEST_AXIS_RE = re.compile(
    r"\b(?:worst\s+to\s+best|best\s+to\s+worst)\b",
    re.IGNORECASE,
)

_LOCATION_WHOLE_WORDS = frozenset({
    "itinerary", "road trip", "roadtrip", "travel guide", "travel inspo",
    "places to visit", "must-see", "must see", "must visit",
    "stops", "viewpoint", "scenic", "waterfall",
    "national park", "hiking trail", "trek", "trekking",
    "hostel", "airbnb",
    "city guide", "day trip", "bucket list",
    "hotel", "hotels", "resort", "resorts",
    "family hotel", "family hotels", "family resort", "family resorts",
    "address", "addresses", "travel planner",
    "itinéraire", "randonnée", "lac", "montagne", "château", "cathédrale",
    "musée", "quartier", "belvédère", "hôtel", "hôtels", "adresse", "adresses",
    "percorso", "sentiero", "lago", "monte", "castello",
    "wanderung", "ausflug", "sehenswürdigkeit",
})

_LOCATION_PATTERNS = [
    r"[1-9]️⃣\s+\w",
    r"🔟\s+\w",
    r"(?:^|[\n\r])\s*\d{1,2}[.)]\s+[A-Z\"']",
    r"stop\s+\d+",
    r"day\s+\d+",
    r"places?\s+to\s+visit",
    r"must[\s-]see\s+stops?",
    r"road\s*trip",
    r"travel\s+(?:guide|inspo|inspiration)",
    r"best\s+(?:places?|spots?|locations?|destinations?)\s+(?:in|to|for|near)",
    r"(?:best|top)\s+\d*\s*(?:beach|island|lake)\s+resorts?\s+to\s+visit",
    r"\b\d+\s+(?:addresses?|adresses?)\b",
    r"\b\d+\s+h[oô]tels?\b",
    r"\b\d+\s+resorts?\b",
]

_TOOL_KEYWORDS = (
    "outils gratuits", "free tools", "bons outils", "outils", "tools", "apps",
    "applications", "logiciels", "software", "ressources", "resources",
    "classement", "ranking", "favoris", "favorites", "préférés",
    "indispensables", "essentiels", "must-have", "sélection", "selection",
    "marques", "brands", "s-tier", "a-tier", "b-tier", "c-tier", "d-tier", "f-tier",
    "s tier", "a tier", "b tier", "c tier", "d tier", "f tier",
    "tier list", "tierlist", "independent test", "independent study", "lab test",
    "tested", "tested at", "spf test", "spf testing", "uv test",
    "consumer test", "consumer report", "ranked", "ranked them", "ranking them",
    "which is best", "which one is best", "which is better", "worst to best",
    "best to worst", "i tested", "we tested", "i tried", "we tried",
    "tested all", "tried all", "reviewed all", "comparison", "compared",
    "score", "scores", "rating", "ratings", "sunscreen", "spf", "spf 50", "spf50",
    "moisturizer", "serum", "product review", "worst", "overrated", "underrated",
    "worth it", "not worth it", "waste of money", "buy this", "don't buy", "avoid",
    "finance", "financial", "accounting", "bookkeeping", "tax", "taxes", "vat",
    "invoice", "invoicing", "budget", "cash flow", "etf", "etfs", "investing",
    "investment", "broker", "payroll",
)

_TOOL_PATTERNS = [
    r"pour .{2,30} utilise",
    r"for .{2,30} use",
    r"pour .{2,30} voici",
    r"liste d[e'] ",
    r"list of ",
    r"meilleurs outils",
    r"best tools",
    r"top tools",
    r"top apps",
    r"outils gratuits",
    r"top \d+ (?:tools|apps|outils|ressources|logiciels)",
    r"mes \d+ (?:outils|apps|tools|logiciels)",
    r"my \d+ (?:tools|apps|picks|favorites|recommendations)",
    r"\d+ (?:best|meilleurs|indispensables|essentiels) (?:tools|apps|outils)",
    r"(?:voici|here are) (?:les|my|the) \d+ (?:outils|tools|apps|sites|ressources)",
    r"\b[sabcdf][\s-]tier\b",
    r"tier\s+list",
    r"going\s+(?:straight\s+to\s+)?[sabcdf][\s-]?tier",
    r"put\s+(?:that|this|them)\s+(?:at|in)\s+[sabcdf][\s-]?tier",
    r"tested\s+at\s+(?:spf|uv|level)?\s*\d+",
    r"claim(?:s)?\s+to\s+be\s+(?:at\s+least\s+)?(?:spf|uv)\s*\d+",
    r"\d+\s+(?:products?|brands?|sunscreens?|items?)\s+(?:tested|compared|reviewed|ranked)",
    r"(?:only|just)\s+\d+\s+of\s+them\s+(?:actually\s+)?(?:tested|passed|worked|scored)",
    r"(?:which|let'?s\s+(?:reveal|find\s+out))\s+(?:sunscreens?|products?|brands?)\s+(?:tested|are\s+best|ranked)",
    r"out\s+of\s+(?:these|all)\s+\d*\s*products?",
    r"(?:number|ranked)\s+(?:one|two|three|1|2|3)\b",
    r"(?:worst|best)\s+to\s+(?:best|worst)",
    r"(?:i|we)\s+(?:tested|tried|reviewed|ranked)\s+(?:all|every|\d+)",
    r"(?:on\s+(?:les?\s+)?met|je\s+(?:les?\s+)?mets|ça\s+va)\s+(?:dans\s+le|en)\s+[sabcdf]\b",
    r"clairement\s+dans\s+le\s+[sabcdf]\b",
    r"(?:dans\s+le\s+[sabcdf])\s*[,.]",
    r"top\s+\d+\s+ski\s+resorts?",
    r"top\s+\d+\s+(?:resorts?|hotels?|restaurants?|destinations?)",
    r"best\s+\d+\s+(?:resorts?|hotels?|restaurants?|destinations?)",
    r"ranking\s+(?:of\s+)?(?:ski\s+)?resorts?",
    r"\b(?:top|best)\s+\d+\s+(?:etfs?|stocks?|funds?|brokers?|accounting\s+tools?)\b",
]

_SOFTWARE_SIGNALS = frozenset({
    "app ", " app,", " apps", "website", " tool ", "tools ", "platform",
    "software", "extension", "plugin", "saas", "dashboard",
    "chrome ", "browser", "automation", "workflow", "integration",
    "ai tool", "gpt", "llm", "chatbot",
    "notion", "figma", "slack", "github", "vercel", "supabase",
    "logiciel", "application ", "site web",
})

_FINANCE_SIGNALS = frozenset({
    "finance", "financial", "accounting", "bookkeeping", "tax", "taxes", "vat",
    "invoice", "invoicing", "budget", "budgeting", "cash flow",
    "p&l", "profit and loss", "expense ratio", "dividend", "holdings",
    "broker", "brokerage", "payroll", "retirement", "banking", "loan",
    "mortgage", "etf", "etfs", "stock", "stocks", "fund", "funds",
    "investing", "investment", "balance sheet",
})

_LIFESTYLE_SIGNALS = frozenset({
    "fragrance", "perfume", "scent", "cologne", "parfum", "eau de ",
    "skincare", " beauty ", "makeup", "cosmetic", "serum", "moisturizer",
    "foundation", "lipstick", "mascara", "sunscreen", "spf",
    "sun protection", "uv protection", "fashion brand", "outfit", "streetwear",
    "sneaker", " shoes", "handbag", " purse", "luxury brand",
    "lifestyle brand", "marque de mode", "vêtement", "montre de luxe",
})

_GEAR_SIGNALS = frozenset({
    "ski brand", "snowboard brand", "surf brand", "cycling gear", "running gear",
    "climbing gear", "golf gear", "camera gear", "camera lens", "drone ",
    "microphone ", "headphone", "keyboard ", "gaming setup", "supplement",
    "protein powder", "creatine", "matériel de sport", "équipement ",
    "rain jacket", "rain jackets", "shell jacket", "shell jackets",
    "outdoor apparel", "outdoor gear", "hiking jacket", "backpacking gear",
})

_FOOD_SIGNALS = frozenset({
    "wine brand", "whisky brand", "whiskey brand", "bourbon brand",
    "coffee brand", "specialty coffee", "best restaurant", "restaurant ranking",
    "top restaurant", "food brand", "street food",
    "marque de vin", "meilleur restaurant",
})

_RANKING_SIGNALS = frozenset({
    "s-tier", "a-tier", "b-tier", "c-tier", "d-tier", "f-tier",
    "s tier", "a tier", "b tier", "c tier", "d tier", "f tier",
    "tier list", "tested at", "independent test", "lab test",
    "worst to best", "best to worst", "ranked",
    "mainstream to niche", "most mainstream", "most niche",
    "from mainstream to niche", "from the most mainstream to niche",
    "number one", "number two", "number three",
    "dans le s", "dans le a", "dans le b", "dans le c", "dans le d",
    "dans le f", "tier s", "tier a", "tier b",
    "classement des", "mon classement",
})

_VERDICT_SIGNALS = frozenset({
    "buy the brand", "buy the product", "buy both",
    "tu achètes la marque", "tu achètes le produit", "tu achètes les deux",
    "worth it", "not worth it", "overpriced", "underrated", "overrated",
    "avoid", "skip", "à éviter", "vaut le coup", "surcoté", "sous-coté",
})

_VERDICT_LABEL_PATTERNS = [
    r"\bbuy\s+the\s+brand\b",
    r"\bbuy\s+the\s+product\b",
    r"\bbuy\s+both\b",
    r"\bworth\s+it\b",
    r"\bnot\s+worth\s+it\b",
    r"\boverpriced\b",
    r"\bunderrated\b",
    r"\boverrated\b",
    r"\bavoid\b",
    r"\bskip\b",
    r"\btu\s+achètes\s+la\s+marque\b",
    r"\btu\s+achètes\s+le\s+produit\b",
    r"\btu\s+achètes\s+les\s+deux\b",
    r"\bà\s+éviter\b",
    r"\bvaut\s+le\s+coup\b",
    r"\bsurcot[ée]\b",
    r"\bsous-cot[ée]\b",
]

_GROUPED_SIGNALS = frozenset({
    "budget", "premium", "luxury", "affordable",
    "beginner", "intermediate", "advanced",
    "casual", "formal", "workwear", "seasonal",
    "for beginners", "for pros", "by category",
    "par catégorie", "débutant", "avancé",
})

_RANKING_LABEL_HINTS = frozenset({
    "mainstream", "mid-tier", "midtier", "niche",
    "entry-level", "entry level", "budget", "premium",
    "top 10", "top ten", "honorable mentions", "honourable mentions",
    "favorites", "favourites",
})

_PLACE_RANKING_KEYWORDS = frozenset({
    "resort", "resorts", "ski resort", "ski resorts",
    "restaurant", "restaurants", "hotel", "hotels",
    "beach", "beaches", "city", "cities", "destination", "destinations",
    "village", "villages", "island", "islands", "country", "countries",
    "park", "parks", "museum", "museums", "café", "cafes",
    "hiking", "trail", "trails", "mountain", "mountains",
    "lake", "lakes", "coast", "coastal", "spot", "spots",
    "station de ski", "domaine skiable", "stazione sciistica",
    "lieu", "lieux", "endroit", "endroits", "hôtel", "hôtels",
})

_PRODUCT_TEST_SIGNALS = frozenset({
    "independent test", "independent study", "lab test", "consumer test",
    "consumer report", "tested at", "tested above", "tested below",
    "claim to be", "claims to be", "spf test", "spf testing",
    "uv test", "score", "scores", "rating", "ratings",
    "pulled from the market", "margin of error",
    "choice", "choice's", "choice australia",
})

_SUNSCREEN_PRODUCT_TEST_SIGNALS = frozenset({
    "sunscreen", "sunscreens", "spf", "spf50", "spf 50",
    "uv protection", "sun protection",
})

_PRODUCT_TEST_CATEGORY_HINTS = frozenset({
    "tested above 50", "failed", "best value", "s tier", "a tier", "b tier", "c tier", "d tier", "f tier",
})


def _safe_text(value) -> str:
    return str(value or "").strip()


def _norm_label(text: str) -> str:
    return re.sub(r"\s+", " ", _safe_text(text).lower()).strip()


def _contains_any(text: str, terms) -> bool:
    return any(term in text for term in terms)


def _count_contains(text: str, terms) -> int:
    return sum(1 for term in terms if term in text)


def _matches_any(text: str, patterns, flags=0) -> bool:
    return any(re.search(p, text, flags) for p in patterns)


def _looks_like_tier_label(label: str) -> bool:
    label = _safe_text(label)
    return bool(
        _TIER_CAT_RE.match(label)
        or _SIMPLE_TIER_RE.match(label)
        or _MERGED_TIER_CAT_RE.match(label)
    )


def _looks_like_product_test_context(text: str) -> bool:
    text = _safe_text(text).lower()
    return (
        _count_contains(text, _PRODUCT_TEST_SIGNALS) >= 2
        or (
            _count_contains(text, _SUNSCREEN_PRODUCT_TEST_SIGNALS) >= 2
            and (
                _contains_any(text, _RANKING_SIGNALS)
                or _count_contains(text, _PRODUCT_TEST_SIGNALS) >= 1
                or len(_TESTED_TRANSCRIPT_RE.findall(text)) >= 2
            )
        )
    )


def _looks_like_strong_tier_text(transcript: str, caption: str) -> bool:
    text = f"{transcript or ''} {caption or ''}".lower()
    return (
        len(_TIER_TRANSCRIPT_RE.findall(text)) >= 2
        or len(_FRENCH_TIER_TRANSCRIPT_RE.findall(text)) >= 2
        or _count_contains(text, {
            "s-tier", "a-tier", "b-tier", "c-tier", "d-tier", "f-tier",
            "s tier", "a tier", "b tier", "c tier", "d tier", "f tier",
            "tier list", "tierlist",
        }) >= 2
    )


def _looks_like_strong_ranking_text(transcript: str, caption: str) -> bool:
    text = f"{transcript or ''} {caption or ''}"
    return (
        _MAINSTREAM_TO_NICHE_RE.search(text) is not None
        or _WORST_BEST_AXIS_RE.search(text) is not None
        or is_ranked_list_transcript(transcript)
        or _count_contains(text.lower(), _RANKING_SIGNALS) >= 1
        or _looks_like_product_test_context(text)
    )


def _category_signal_subtype(text: str) -> str:
    if _looks_like_product_test_context(text):
        return "ranking"
    if _contains_any(text, _FINANCE_SIGNALS):
        return "finance"
    if _contains_any(text, _SOFTWARE_SIGNALS):
        return "software"
    if _contains_any(text, _GEAR_SIGNALS):
        return "gear"
    if _contains_any(text, _FOOD_SIGNALS):
        return "food"
    if _contains_any(text, _LIFESTYLE_SIGNALS):
        return "lifestyle"
    if _contains_any(text, _GROUPED_SIGNALS):
        return "grouped"
    return "picks"


def _looks_like_place_selection(transcript: str, caption: str, category: str = "", topic: str = "") -> bool:
    combined = f"{transcript or ''} {caption or ''} {category or ''} {topic or ''}".lower()

    if _looks_like_product_test_context(combined):
        return False
    if _count_contains(combined, _SUNSCREEN_PRODUCT_TEST_SIGNALS) >= 2:
        return False
    if _contains_any(combined, _LIFESTYLE_SIGNALS):
        return False

    if is_place_ranking(transcript, caption):
        return True

    location_signal = (
        is_location_list_content(transcript, caption)
        or _count_contains(combined, _PLACE_RANKING_KEYWORDS) >= 2
    )
    mention_count = count_plain_mentions(caption)

    return location_signal and mention_count >= 2


def classify_structured_family(
    transcript: str,
    caption: str,
    category: str = "",
    topic: str = "",
) -> str:
    """
    Infer the public content family from combined text.
    Returns: "places" | "finance" | "software" | "products"
    """
    combined = f"{transcript or ''} {caption or ''} {category or ''} {topic or ''}".lower()

    if _looks_like_place_selection(transcript, caption, category, topic):
        return "places"
    if _contains_any(combined, _FINANCE_SIGNALS):
        return "finance"
    if _contains_any(combined, _SOFTWARE_SIGNALS):
        return "software"
    return "products"


def is_place_ranking(transcript: str, caption: str) -> bool:
    combined = f"{transcript or ''} {caption or ''}".lower()

    if _looks_like_product_test_context(combined):
        return False
    if _count_contains(combined, _SUNSCREEN_PRODUCT_TEST_SIGNALS) >= 2:
        return False
    if _contains_any(combined, _LIFESTYLE_SIGNALS):
        return False

    hits = sum(1 for kw in _PLACE_RANKING_KEYWORDS if kw in combined)
    rank_signal = (
        is_ranked_list_transcript(transcript)
        or _count_contains(combined, _RANKING_SIGNALS) >= 1
        or re.search(r"(?:top|classement|ranking|numéro)\s*\d+", combined) is not None
    )
    return hits >= 2 and rank_signal


def is_location_list_content(transcript: str, caption: str) -> bool:
    combined = f"{transcript or ''} {caption or ''}".lower()

    if _looks_like_product_test_context(combined):
        return False
    if _count_contains(combined, _SUNSCREEN_PRODUCT_TEST_SIGNALS) >= 2:
        return False

    return (
        _contains_any(combined, _LOCATION_WHOLE_WORDS)
        or _matches_any(combined, _LOCATION_PATTERNS, re.MULTILINE)
    )


def count_numbered_caption_items(caption: str) -> int:
    if not caption:
        return 0

    plain = re.findall(r"(?:^|[\n\r]|[.!?]\s)\s*(\d{1,2})[.)]\s+\S", caption, re.MULTILINE)
    if plain:
        return max(int(n) for n in plain)

    inline = re.findall(r"\b(\d{1,2})\.\s+[A-Z\u00C0-\u024F\"']", caption)
    if inline:
        return max(int(n) for n in inline)

    emoji_count = len(re.findall(r"[1-9]️⃣", caption)) + (1 if "🔟" in caption else 0)
    return emoji_count


def count_mention_verdict_items(caption: str) -> int:
    return len(_MENTION_VERDICT_RE.findall(caption or ""))


def count_plain_mentions(caption: str) -> int:
    handles = [h.lower() for h in _PLAIN_MENTION_RE.findall(caption or "")]
    return len(dict.fromkeys(handles))


def is_tools_list_content(transcript: str, caption: str) -> bool:
    combined = f"{transcript or ''} {caption or ''}".lower()

    if is_place_ranking(transcript, caption):
        return True

    if is_location_list_content(transcript, caption) and not _looks_like_strong_ranking_text(transcript, caption):
        return False

    if _count_contains(combined, _TOOL_KEYWORDS) >= 2:
        return True
    if _matches_any(combined, _TOOL_PATTERNS):
        return True
    if count_mention_verdict_items(caption) >= 2 and not _looks_like_strong_ranking_text(transcript, caption):
        return True
    if combined.count(" pour ") >= 4:
        return True

    return False


def is_ranked_list_transcript(transcript: str) -> bool:
    if not transcript:
        return False
    text = transcript.lower()

    return (
        len(_RANKED_TRANSCRIPT_RE.findall(text)) >= 3
        or len(_ORDINAL_TRANSCRIPT_RE.findall(text)) >= 3
        or len(_TIER_TRANSCRIPT_RE.findall(text)) >= 2
        or len(_TESTED_TRANSCRIPT_RE.findall(text)) >= 2
        or len(_FRENCH_TIER_TRANSCRIPT_RE.findall(text)) >= 2
    )


def looks_like_educational_numbered_explainer(transcript: str, caption: str) -> bool:
    text = f"{caption or ''} {transcript or ''}".lower()

    explainer_signals = (
        "things you need to know", "need to know", "rules", "tips", "steps",
        "principles", "mistakes", "lessons", "reasons", "ways",
        "about etfs", "about investing", "beginner", "beginners",
    )

    finance_explainer_signals = (
        "etf", "etfs", "investing", "expense ratio", "dividend yield",
        "holdings", "performance", "s&p 500",
    )

    has_explainer_shape = (
        re.search(r"\bonly\s+\d+\s+things\s+you\s+need\s+to\s+know\b", text)
        or re.search(r"\b\d+\s+things\s+you\s+need\s+to\s+know\b", text)
        or re.search(r"\b\d+\s+(?:tips|rules|steps|mistakes|reasons|ways)\b", text)
    )

    return has_explainer_shape and (
        _contains_any(text, explainer_signals) or _contains_any(text, finance_explainer_signals)
    )


def pre_detect_list_subtype(transcript: str, caption: str) -> str:
    combined = f"{caption or ''} {(transcript or '')[:1200]}".lower()

    if _looks_like_place_selection(transcript, caption):
        return "places"
    if _looks_like_strong_tier_text(transcript, caption):
        return "tier"
    if _looks_like_product_test_context(combined):
        return "ranking"
    if _looks_like_strong_ranking_text(transcript, caption):
        return "ranking"
    if count_mention_verdict_items(caption) >= 2:
        return "verdict"
    if _count_contains(combined, _VERDICT_SIGNALS) >= 2:
        return "verdict"

    subtype = _category_signal_subtype(combined)
    if subtype != "picks":
        return subtype

    if re.search(r"(?:top|classement|ranking|numéro)\s*\d+", combined):
        return "ranking"

    return "picks"


def _non_empty_categories(categories: list[dict]) -> list[dict]:
    out = []
    for cat in categories or []:
        items = [item for item in (cat.get("items") or []) if _safe_text(item.get("name"))]
        if items:
            out.append({**cat, "items": items})
    return out


def _category_labels(categories: list[dict]) -> list[str]:
    return [_norm_label(cat.get("name")) for cat in categories if _safe_text(cat.get("name"))]


def _all_items(categories: list[dict]) -> list[dict]:
    rows = []
    for cat_index, cat in enumerate(categories or []):
        for local_index, item in enumerate(cat.get("items", []) or []):
            if _safe_text(item.get("name")):
                rows.append({
                    "cat_index": cat_index,
                    "local_index": local_index,
                    "cat_label": _norm_label(cat.get("name")),
                    "rank": item.get("rank"),
                    "tier": _safe_text(item.get("tier")).upper() or None,
                    "name": _safe_text(item.get("name")),
                })
    return rows


def _item_count(categories: list[dict]) -> int:
    return len(_all_items(categories))


def _has_numeric_ranks(categories: list[dict]) -> bool:
    rows = _all_items(categories)
    ranked = sum(1 for row in rows if isinstance(row.get("rank"), int) and row["rank"] > 0)
    return bool(rows) and ranked >= max(2, len(rows) // 2)


def _single_global_ranking(categories: list[dict]) -> bool:
    active = _non_empty_categories(categories)
    return len(active) == 1 and _has_numeric_ranks(active)


def _has_tier_items(categories: list[dict]) -> bool:
    for cat in categories or []:
        if _looks_like_tier_label(_safe_text(cat.get("name"))):
            return True
        for item in cat.get("items", []) or []:
            if _safe_text(item.get("tier")).upper() in _TIER_VALUES:
                return True
    return False


def _verdict_label_score(labels: list[str]) -> int:
    score = 0
    strong_terms = (
        "buy the brand", "buy the product", "buy both",
        "worth it", "not worth it", "avoid", "skip",
        "tu achètes la marque", "tu achètes le produit", "tu achètes les deux",
        "à éviter", "vaut le coup",
    )
    for label in labels:
        if any(re.search(p, label) for p in _VERDICT_LABEL_PATTERNS):
            score += 3
        if any(term in label for term in strong_terms):
            score += 2
    return score


def _grouped_label_score(labels: list[str]) -> int:
    grouped_terms = (
        "budget", "premium", "luxury", "affordable",
        "beginner", "advanced", "intermediate",
        "casual", "formal", "workwear", "daily", "occasion", "season",
    )
    return sum(1 for label in labels if any(term in label for term in grouped_terms))


def _ranking_label_score(labels: list[str]) -> int:
    score = 0
    for label in labels:
        if label in _RANKING_LABEL_HINTS or label in _PRODUCT_TEST_CATEGORY_HINTS:
            score += 2
        elif any(hint in label for hint in _RANKING_LABEL_HINTS) or any(hint in label for hint in _PRODUCT_TEST_CATEGORY_HINTS):
            score += 1
    return score


def _global_rank_sequence_info(categories: list[dict]) -> dict:
    ranks = sorted({
        row["rank"] for row in _all_items(categories)
        if isinstance(row.get("rank"), int) and row["rank"] > 0
    })

    total_rows = len(_all_items(categories))
    if len(ranks) < 2:
        return {"has_sequence": False, "coverage_ratio": 0.0}

    expected = list(range(ranks[0], ranks[-1] + 1))
    return {
        "has_sequence": ranks == expected,
        "coverage_ratio": len(ranks) / max(1, total_rows),
    }


def _categories_follow_rank_order(categories: list[dict]) -> bool:
    prev_max = None
    active = _non_empty_categories(categories)

    if len(active) < 2:
        return False

    for cat in active:
        ranks = [
            item.get("rank")
            for item in cat.get("items", []) or []
            if isinstance(item.get("rank"), int) and item.get("rank") > 0
        ]
        if not ranks:
            return False
        if prev_max is not None and min(ranks) <= prev_max:
            return False
        prev_max = max(ranks)

    return True


def _items_have_location_meta(categories: list[dict]) -> bool:
    rows = _all_items(categories)
    if not rows:
        return False
    hits = 0
    for cat in categories or []:
        for item in cat.get("items", []) or []:
            if isinstance(item.get("location_meta"), dict):
                hits += 1
    return hits >= max(2, len(rows) // 2)


def analyze_structure(
    tools_categories: list[dict],
    category: str = "",
    topic: str = "",
    transcript: str = "",
    pre_detected_hint: str = "",
) -> dict:
    active = _non_empty_categories(tools_categories)
    labels = _category_labels(active)
    text_blob = f"{category} {topic} {transcript[:800]} {' '.join(labels)}".lower()
    total_items = _item_count(active)
    cat_count = len(active)
    pre_hint = _norm_label(pre_detected_hint)

    if total_items < 2 or cat_count == 0:
        return {
            "mode": "bookmark",
            "structure_type": "unknown",
            "render_hint": "bookmark",
            "list_subtype": "picks",
            "is_ranked": False,
            "confidence": 0.25,
            "global_ordered": False,
            "group_ordered": False,
            "reason": "Too few named items or no usable categories",
        }

    if pre_hint == "places" or _items_have_location_meta(active):
        has_ranks = _has_numeric_ranks(active)
        return {
            "mode": "structured",
            "structure_type": "places",
            "render_hint": "ranked_list",
            "list_subtype": "places",
            "is_ranked": has_ranks,
            "confidence": 0.95 if _items_have_location_meta(active) else 0.88,
            "global_ordered": has_ranks,
            "group_ordered": has_ranks,
            "reason": "Pre-detected as place ranking or items carry location_meta",
        }

    if _has_tier_items(active):
        return {
            "mode": "structured",
            "structure_type": "tier",
            "render_hint": "tier_board",
            "list_subtype": "tier",
            "is_ranked": False,
            "confidence": 0.97,
            "global_ordered": False,
            "group_ordered": False,
            "reason": "Tier labels or tier values detected",
        }

    rank_text_hits = (
        int(_contains_any(text_blob, _RANKING_SIGNALS))
        + int(is_ranked_list_transcript(transcript))
        + int(_looks_like_product_test_context(text_blob))
        + int(pre_hint == "ranking")
    )
    ranking_label_score = _ranking_label_score(labels)
    rank_info = _global_rank_sequence_info(active)

    if _single_global_ranking(active):
        confidence = min(0.80 + (0.05 * min(rank_text_hits, 3)), 0.95)
        return {
            "mode": "structured",
            "structure_type": "ranking",
            "render_hint": "ranked_list",
            "list_subtype": "ranking",
            "is_ranked": True,
            "confidence": confidence,
            "global_ordered": True,
            "group_ordered": True,
            "reason": "Single-category numeric ordering looks like a global ranking",
        }

    if (
        cat_count >= 2
        and _has_numeric_ranks(active)
        and rank_info["has_sequence"]
        and _categories_follow_rank_order(active)
        and (rank_text_hits >= 1 or ranking_label_score >= 1 or pre_hint == "ranking")
    ):
        confidence = 0.93 if rank_text_hits >= 2 else 0.91 if ranking_label_score >= 2 else 0.88
        return {
            "mode": "structured",
            "structure_type": "ranking",
            "render_hint": "ranked_list",
            "list_subtype": "ranking",
            "is_ranked": True,
            "confidence": confidence,
            "global_ordered": True,
            "group_ordered": True,
            "reason": "Multiple ordered categories form a single ranked progression",
        }

    verdict_score = _verdict_label_score(labels)
    if verdict_score >= 3 and rank_text_hits == 0:
        return {
            "mode": "structured",
            "structure_type": "verdict",
            "render_hint": "grouped_sections",
            "list_subtype": "verdict",
            "is_ranked": False,
            "confidence": 0.94,
            "global_ordered": False,
            "group_ordered": True,
            "reason": "Category labels explicitly match verdict semantics",
        }

    if pre_hint == "verdict" and verdict_score >= 1 and cat_count >= 2 and rank_text_hits == 0:
        return {
            "mode": "structured",
            "structure_type": "verdict",
            "render_hint": "grouped_sections",
            "list_subtype": "verdict",
            "is_ranked": False,
            "confidence": 0.86,
            "global_ordered": False,
            "group_ordered": True,
            "reason": "Verdict hint supported by explicit verdict labels",
        }

    if cat_count >= 2 and total_items >= 3:
        grouped_score = _grouped_label_score(labels)
        subtype = pre_hint if pre_hint in {"software", "finance", "lifestyle", "gear", "food", "places", "tier"} else "grouped"
        if grouped_score == 0 and pre_hint not in {"ranking", "verdict"}:
            subtype = pre_hint or "grouped"

        confidence = 0.78 if grouped_score > 0 else 0.72
        structured = confidence >= 0.75
        return {
            "mode": "structured" if structured else "bookmark",
            "structure_type": "grouped" if structured else "unknown",
            "render_hint": "grouped_sections" if structured else "bookmark",
            "list_subtype": subtype if structured else "picks",
            "is_ranked": False,
            "confidence": confidence,
            "global_ordered": False,
            "group_ordered": _has_numeric_ranks(active),
            "reason": "Multiple meaningful categories without a reliable single ranking progression",
        }

    if pre_hint in {"software", "finance", "lifestyle", "gear", "food", "grouped", "places", "tier"} and total_items >= 2:
        return {
            "mode": "bookmark",
            "structure_type": "unknown",
            "render_hint": "bookmark",
            "list_subtype": pre_hint,
            "is_ranked": False,
            "confidence": 0.60,
            "global_ordered": False,
            "group_ordered": False,
            "reason": "Content looks list-like but structure is not strong enough for special rendering",
        }

    return {
        "mode": "bookmark",
        "structure_type": "unknown",
        "render_hint": "bookmark",
        "list_subtype": "picks",
        "is_ranked": False,
        "confidence": 0.45,
        "global_ordered": False,
        "group_ordered": False,
        "reason": "No reliable structured pattern detected",
    }


def detect_list_subtype(
    tools_categories: list[dict],
    category: str,
    topic: str,
    transcript: str = "",
    is_ranked: bool = False,
    pre_detected_hint: str = "",
) -> str:
    structure = analyze_structure(
        tools_categories=tools_categories,
        category=category,
        topic=topic,
        transcript=transcript,
        pre_detected_hint=pre_detected_hint,
    )
    subtype = structure.get("list_subtype")
    if subtype:
        return subtype

    all_text = f"{category} {topic} {transcript[:400]}".lower()
    for cat in tools_categories or []:
        for item in cat.get("items", []) or []:
            if item.get("url"):
                return "software"
            all_text += f" {item.get('name', '')} {item.get('description', '')}".lower()

    if _looks_like_strong_tier_text(transcript, all_text):
        return "tier"
    if _looks_like_product_test_context(all_text):
        return "ranking"
    if _contains_any(all_text, _RANKING_SIGNALS):
        return "ranking"

    subtype = _category_signal_subtype(all_text)
    if subtype != "picks":
        return subtype

    if is_ranked:
        return "ranking"
    if pre_detected_hint and pre_detected_hint != "picks":
        return pre_detected_hint
    return "picks"