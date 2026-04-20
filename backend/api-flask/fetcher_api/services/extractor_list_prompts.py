"""
Prompt constants and prompt builders for structured list extraction.

Separated from detection logic so prompt/schema maintenance does not bloat
the heuristic routing module.
"""

from __future__ import annotations

from fetcher_api.services.extractor_list_detection import count_numbered_caption_items


# ---------------------------------------------------------------------------
# Shared prompt constants
# ---------------------------------------------------------------------------

FRAME_LIST_INSTRUCTION = """

IMPORTANT — VIDEO FRAMES INCLUDED:
The frames above are from the video. Read any visible text carefully.
If you can see specific named items on screen (tool names, app names, product names,
step titles, ingredient quantities, scores, labels, etc.), extract them as:

"items": [
  {"name": "Exact Name", "category": "AI / Design / Video / Cooking / etc.", "description": "one line what it does or is"},
  ...
]

Only include items whose names you can actually read in the frames.
Do NOT invent items — if nothing readable is visible, omit "items" entirely.
"""


# ---------------------------------------------------------------------------
# Item schemas per subtype
# ---------------------------------------------------------------------------

_ITEM_SCHEMA_SOFTWARE = """{
  "rank": 1,
  "name": "Tool / App Name",
  "description": "One line: what it does and why it is useful",
  "free": true,
  "url": "domain.com if well-known, otherwise null",
  "source": "transcript",
  "creator_rating": "best"
}"""

_ITEM_SCHEMA_FINANCE = """{
  "rank": 1,
  "name": "Tool / Product / Strategy Name",
  "description": "One line: what it is, what metric matters, or why the creator recommends it",
  "score": "e.g. low fees, 7% yield, 4/5, null if not applicable",
  "source": "transcript",
  "creator_rating": "best | good | bad | null"
}"""

_ITEM_SCHEMA_LIFESTYLE = """{
  "rank": 1,
  "name": "Brand / Product Name",
  "description": "One line: what it is and why the creator recommends it",
  "price_range": "luxury | premium | mid-range | budget | null",
  "source": "transcript",
  "creator_rating": "best"
}"""

_ITEM_SCHEMA_GEAR = """{
  "rank": 1,
  "name": "Brand / Product Name",
  "description": "One line: what it is, key spec, and why the creator picks it",
  "price_range": "luxury | premium | mid-range | budget | null",
  "source": "transcript",
  "creator_rating": "best"
}"""

_ITEM_SCHEMA_FOOD = """{
  "rank": 1,
  "name": "Item / Brand / Venue Name",
  "description": "One line: what it is, taste profile, or why the creator picks it",
  "price_range": "luxury | premium | mid-range | budget | null",
  "source": "transcript",
  "creator_rating": "best"
}"""

_ITEM_SCHEMA_RANKING = """{
  "rank": 1,
  "name": "Product / Brand Name",
  "description": "One line: key result, score, or why it ranked here",
  "score": "e.g. SPF 72, 4.5/5, Grade A — null if not applicable",
  "tier": "S | A | B | C | D | F — null if not a tier list",
  "source": "transcript",
  "creator_rating": "best | good | bad | null"
}"""

_ITEM_SCHEMA_TIER = """{
  "rank": null,
  "name": "Product / Brand Name",
  "description": "One line: key result, score, or why it belongs in this tier",
  "score": "e.g. SPF 72, 4.5/5, Grade A — null if not applicable",
  "tier": "S | A | B | C | D | F",
  "source": "transcript",
  "creator_rating": "best | good | bad | null"
}"""

_ITEM_SCHEMA_PLACES = """{
  "rank": 1,
  "name": "Resort / Place Name",
  "description": "One line: why the creator ranks it here or its key characteristic",
  "location_meta": {
    "type": "Ski Resort | Beach | City | Restaurant | Hotel | null",
    "region": "Region or nearest city",
    "country": "Country name in English"
  },
  "source": "transcript",
  "creator_rating": "best | good | null"
}"""

_ITEM_SCHEMA_GENERIC = """{
  "rank": 1,
  "name": "Item Name",
  "description": "One line: what it is and why it is included",
  "source": "transcript",
  "creator_rating": "best"
}"""


# ---------------------------------------------------------------------------
# Subtype prompt config
# Maps subtype -> (intro description, item schema, category examples)
#
# Note: "verdict" intentionally reuses _ITEM_SCHEMA_RANKING because verdicts
# are ranked comparisons without numeric positions. Do not change this.
# ---------------------------------------------------------------------------

_SUBTYPE_PROMPT_CONFIG = {
    "software": (
        "tools, apps, websites, or digital platforms",
        _ITEM_SCHEMA_SOFTWARE,
        '"AI Writing", "Video Editing", "Analytics", "Productivity"',
    ),
    "finance": (
        "finance tools, accounting tools, investment products, or money-related comparisons",
        _ITEM_SCHEMA_FINANCE,
        '"Low-Fee Brokers", "Budgeting Apps", "ETF Picks", "Accounting Tools", "Tax Tools"',
    ),
    "lifestyle": (
        "fashion brands, fragrances, beauty products, skincare, watches, or luxury goods",
        _ITEM_SCHEMA_LIFESTYLE,
        '"Fragrances", "Watches", "Skincare", "Fashion Brands", "Accessories"',
    ),
    "gear": (
        "sports equipment, tech gear, hardware, or physical products",
        _ITEM_SCHEMA_GEAR,
        '"Ski Brands", "Camera Gear", "Headphones", "Running Shoes", "Supplements"',
    ),
    "food": (
        "food, drinks, restaurants, or culinary brands",
        _ITEM_SCHEMA_FOOD,
        '"Wines", "Coffee Brands", "Restaurants", "Whisky", "Street Food"',
    ),
    "tier": (
        "specific named products, brands, or items sorted into tier buckets",
        _ITEM_SCHEMA_TIER,
        '"S Tier", "A Tier", "B Tier", "C Tier", "D Tier", "F Tier"',
    ),
    "ranking": (
        "specific named products, brands, or items ranked or tested with scores or tiers",
        _ITEM_SCHEMA_RANKING,
        '"S Tier", "A Tier", "Tested Above 50", "Failed", "Best Value"',
    ),
    "verdict": (
        "specific named products, brands, or items grouped by the creator's verdict",
        _ITEM_SCHEMA_RANKING,  # intentional — see note above
        '"Buy the Product", "Buy the Brand", "Buy Both", "Worth It", "Avoid"',
    ),
    "grouped": (
        "specific named items, products, or brands grouped into meaningful categories",
        _ITEM_SCHEMA_GENERIC,
        '"Budget", "Premium", "Beginner", "Advanced", "Workwear"',
    ),
    "picks": (
        "specific named items, products, or brands curated by the creator",
        _ITEM_SCHEMA_GENERIC,
        '"Recommendations", "Must-Haves", "Favorites"',
    ),
    "places": (
        "specific named places, resorts, destinations, restaurants, or locations ranked by the creator",
        _ITEM_SCHEMA_PLACES,
        '"Top 10 Ski Resorts", "Best Restaurants", "Must-Visit Destinations"',
    ),
}


# ---------------------------------------------------------------------------
# Location list instruction builder
# ---------------------------------------------------------------------------

def build_location_list_instruction(caption: str = "") -> str:
    """
    Build the location extraction instruction block.

    Automatically counts numbered items in the caption via
    count_numbered_caption_items() so callers do not need to pass n separately.
    """
    n = count_numbered_caption_items(caption) if caption else 0

    if n > 0:
        count_line = (
            f"\nCRITICAL: The caption contains exactly {n} numbered places "
            f"(1. through {n}.). You MUST extract all {n} of them — do NOT stop early. "
            "Count every numbered item in the caption before writing your JSON.\n"
        )
        numbered_rule = (
            f'3. NEVER STOP EARLY — if the caption lists {n} places, '
            f'return exactly {n} entries. Missing even one is an extraction error.\n'
            f'   EXTRACT ALL NUMBERED ITEMS — find every item marked "1.", "2.", '
            f'... "{n}." in the caption.'
        )
    else:
        count_line = ""
        numbered_rule = (
            "3. NEVER STOP EARLY — extract every place the creator mentions. "
            "Missing even one is an extraction error."
        )

    return f"""

IMPORTANT — THIS IS A TRAVEL / LOCATION ITINERARY:
The creator is sharing a list of places, stops, or destinations to visit.
{count_line}
STRICT EXTRACTION RULES:
1. READ THE CAPTION FIRST — the caption is the authoritative source for place names.
   Video frames may show only 2–3 locations but the caption lists ALL of them.
2. REAL NAMES ONLY — use the exact place name from the caption (do not paraphrase).
{numbered_rule}
4. FIELDS per location entry:
   - "name": exact place name
   - "type": e.g. "Lake", "Hiking Trail", "Scenic Viewpoint", "Mountain", "Village"
   - "city": nearest city or region (e.g. "Dolomites", "Venice", "Cortina")
   - "country": country name in English
   - "description": one sentence from the caption describing this place
   - "lat": null
   - "lng": null

Return the array under the key:

"location": [
  {{
    "name": "Exact Place Name",
    "type": "Lake | Hiking Trail | Scenic Viewpoint | ...",
    "city": "Region or nearest city",
    "country": "Italy",
    "description": "One sentence from the caption.",
    "lat": null,
    "lng": null
  }},
  ...
]
"""


# ---------------------------------------------------------------------------
# Structured list instruction builder
# ---------------------------------------------------------------------------

def build_tools_list_instruction(subtype_hint: str = "software") -> str:
    intro, schema, cat_examples = _SUBTYPE_PROMPT_CONFIG.get(
        subtype_hint,
        _SUBTYPE_PROMPT_CONFIG["picks"],
    )

    if subtype_hint == "places":
        places_note = """
PLACE RANKING RULES:
- Each item MUST include a "location_meta" object with "type", "region", and "country".
- Use the transcript's spoken descriptions to fill "type" and "region".
- "country" should be derived from context (e.g. "Italy" for Italian ski resorts).
- The creator's spoken rank (first, second, #1, etc.) is the canonical rank — do NOT reorder.
- ASR may garble place names: cross-reference caption hashtags and known geography to correct spelling.
  Examples: "Curmajur" → "Courmayeur", "Cervino" → "Cervinia", "La Twill" → "La Thuile",
            "Paila" → "Pila", "Plan de Coronne" → "Plan de Corones".
"""
    else:
        places_note = """
NON-PLACE RULE:
- This is NOT a travel/location prompt.
- Do NOT populate a location array.
- Do NOT reinterpret brands, products, retailers, or companies as towns, beaches, countries, or destinations.
"""

    return f"""

IMPORTANT — THIS IS A LIST / RANKING VIDEO:
The creator is sharing a curated list of {intro}
grouped by use-case (or ranked within a category).

LIST TYPE HINT: "{subtype_hint}" — use this to guide your extraction.
{places_note}
STRICT EXTRACTION RULES:
1. DEDUPLICATE — each item appears in ONE category only.
2. REAL NAMES ONLY — extract only actual product, brand, or item names.
   - NEVER extract single letters, pronouns, articles, or generic words.
3. RANK — add a "rank" field ONLY when the creator gives explicit numeric ordering in speech, caption, or on-screen text.
   - If there is no explicit ranking signal, set "rank": null.
   - On-screen numbers visible in frames are the CANONICAL source for rank.
   - For true tier lists, the category tier is primary and item rank may be null.
4. SOURCE — "transcript" | "caption" | "frames"
5. NO INVENTION — only list items the creator explicitly names.
6. CATEGORIES — reflect the creator's groupings (e.g. {cat_examples}).
   For tier lists use the tier letters as category names (S Tier, A Tier, etc.).
   NEVER merge adjacent tiers into one category like "S & A Tier" or "C & D Tier".
7. CREATOR RATING — only when EXPLICIT and CLEAR:
   "best" → #1, best, top pick, favourite, S-tier
   "good" → recommended, praised, A/B-tier
   "bad"  → criticised, avoid, D/F-tier
   Omit the field entirely when uncertain.
8. SCORES — if the content includes numeric scores, SPF values, ratings, or grades,
   extract them into the "score" field.

Return this key in your JSON:

"tools": {{
  "categories": [
    {{
      "name": "Category name in English",
      "emoji": "single relevant emoji",
      "items": [
        {schema}
      ]
    }}
  ]
}}
"""