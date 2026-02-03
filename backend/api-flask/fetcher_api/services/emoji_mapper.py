# fetcher_api/services/emoji_mapper.py

import json
import os
import re
import unicodedata
from typing import Dict, Optional

from mistralai import Mistral

BASE_DIR = os.path.dirname(__file__)
CACHE_PATH = os.path.join(BASE_DIR, "emoji_category_cache.json")

MISTRAL_MODEL = "mistral-large-latest"

_UNITS = {
    "g", "kg", "mg", "ml", "l", "cl",
    "tsp", "tbsp", "teaspoon", "teaspoons", "tablespoon", "tablespoons",
    "cup", "cups",
    "bowl", "bowls",
    "pinch", "pinches",
    "piece", "pieces", "pc", "pcs",
    "clove", "cloves",
    "stalk", "stalks",
}

_STOP_PHRASES = [
    "to taste",
    "for garnish",
    "for serving",
    "to serve",
    "as needed",
    "optional",
]

_STOP_WORDS = {
    "of",
    "for",  # helps canonicalize "oil for frying" -> "oil frying" -> guarded by "oil"
    "fresh", "ground", "minced", "chopped", "sliced", "crushed",
    "toasted", "roasted", "soaked", "dried",
    "cooked",  # helps canonicalize "cooked rice" -> "rice"
    "large", "small", "medium",
    "some", "a", "an", "the",
}

_SPELLING_FIXES = {
    "potatoe": "potato",
    "potatos": "potato",
}

LEGACY_CATEGORY_ALIASES: Dict[str, str] = {
    # Old cache values you showed
    "OIL_FAT": "FAT_OIL",
    # If you ever had these variants
    "OLIVE_OIL": "FAT_OIL",
    "OIL": "FAT_OIL",
}

CATEGORY_TO_EMOJI: Dict[str, str] = {
    # Proteins
    "PROTEIN_MEAT": "🍖",
    "PROTEIN_FISH": "🐟",
    "PROTEIN_EGG": "🥚",
    "PROTEIN_DAIRY": "🧀",
    "PROTEIN_SOY": "🫘",
    "PROTEIN_OTHER": "🍽️",

    # Plants
    "VEGETABLE": "🥬",
    "VEGETABLE_ROOT": "🥕",
    "POTATO": "🥔",
    "ALLIUM": "🧅",
    "ALLIUM_GARLIC": "🧄",
    "HERB": "🌿",
    "FRUIT": "🍎",
    "MUSHROOM": "🍄",

    # Carbs
    "RICE": "🍚",
    "GRAIN": "🌾",
    "STARCH": "🌾",

    # Nuts / seeds
    "LEGUME": "🫘",
    "NUT_SEED": "🥜",

    # Fats (your requirement)
    "FAT_OIL": "⚱️",
    "BUTTER": "🧈",

    # Sweeteners
    "SWEETENER": "🍯",

    # Flavor builders
    "CONDIMENT": "🥫",
    "SAUCE_PASTE": "🥫",
    "SPICE": "🧂",
    "CHILI": "🌶️",
    "FERMENTED": "🥣",

    # Liquids
    "LIQUID": "💧",
    "ALCOHOL": "🍷",

    # Fallback
    "OTHER": "🍽️",
}

ALLOWED_CATEGORIES = set(CATEGORY_TO_EMOJI.keys())


def _norm(s: str) -> str:
    s = (s or "").strip().lower()
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r"[^\w\s/.-]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def _canonical_key(s: str) -> str:
    s = _norm(s)
    if not s:
        return ""

    s = re.sub(r"\([^)]*\)", " ", s)

    for ph in _STOP_PHRASES:
        s = re.sub(rf"\b{re.escape(ph)}\b", " ", s)

    s = re.sub(r"\b\d+(?:[./]\d+)?\b", " ", s)

    tokens = [t for t in s.split() if t]
    kept = []
    for t in tokens:
        t2 = t.strip(" .-")
        if not t2:
            continue

        t2 = _SPELLING_FIXES.get(t2, t2)

        if t2 in _UNITS:
            continue
        if t2 in _STOP_WORDS:
            continue
        if re.match(r"^\d+(?:[./]\d+)?(ml|l|cl|g|kg|mg|tsp|tbsp)$", t2):
            continue

        kept.append(t2)

    s = " ".join(kept).strip()

    if s.endswith("ies") and len(s) > 4:
        s = s[:-3] + "y"
    elif s.endswith("s") and len(s) > 3 and not s.endswith("ss"):
        s = s[:-1]

    return s.strip()


def _normalize_category(cat: str) -> str:
    cat = (cat or "").strip()
    cat = LEGACY_CATEGORY_ALIASES.get(cat, cat)
    return cat


def _write_json(path: str, data: Dict[str, str]) -> None:
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)


def _load_cache() -> Dict[str, str]:
    if not os.path.exists(CACHE_PATH):
        return {}

    try:
        with open(CACHE_PATH, "r", encoding="utf-8") as f:
            raw = json.load(f)
        if not isinstance(raw, dict):
            return {}
    except Exception:
        return {}

    sanitized: Dict[str, str] = {}
    for k, v in raw.items():
        if not isinstance(k, str) or not isinstance(v, str):
            continue
        ck = _canonical_key(k)
        cv = _normalize_category(v)
        if not ck:
            continue
        if cv not in ALLOWED_CATEGORIES:
            continue
        sanitized[ck] = cv

    # Auto-migrate file on disk if it changed (fixes your current situation)
    try:
        if sanitized != raw:
            _write_json(CACHE_PATH, sanitized)
    except Exception:
        pass

    return sanitized


def _save_cache(cache: Dict[str, str]) -> None:
    # Always write canonical keys + normalized categories
    cleaned: Dict[str, str] = {}
    for k, v in (cache or {}).items():
        ck = _canonical_key(k)
        cv = _normalize_category(v)
        if ck and cv in ALLOWED_CATEGORIES:
            cleaned[ck] = cv
    _write_json(CACHE_PATH, cleaned)


_CATEGORY_CACHE: Dict[str, str] = _load_cache()


# Static overrides always win
STATIC_CATEGORY_OVERRIDES: Dict[str, str] = {
    # Fats: your rule
    "butter": "BUTTER",
    "oil": "FAT_OIL",
    "sesame oil": "FAT_OIL",
    "olive oil": "FAT_OIL",
    "vegetable oil": "FAT_OIL",
    "canola oil": "FAT_OIL",
    "corn oil": "FAT_OIL",
    "sunflower oil": "FAT_OIL",
    "perilla oil": "FAT_OIL",

    # Rice / starches
    "rice": "RICE",
    "potato starch": "STARCH",
    "glass noodle": "STARCH",
    "noodle": "STARCH",
    "starch": "STARCH",

    # Kimchi + gochujang (from earlier requirements)
    "kimchi": "VEGETABLE",
    "gochujang": "CHILI",

    # Common items
    "salt": "SPICE",
    "pepper": "SPICE",
    "soy sauce": "CONDIMENT",
    "oyster sauce": "CONDIMENT",
    "tonkatsu sauce": "CONDIMENT",
    "mirin": "ALCOHOL",
    "sweet cooking wine": "ALCOHOL",

    # Fix misspelling seen in your cache
    "potatoe": "POTATO",
    "potato": "POTATO",
}


def _build_category_prompt(ingredient: str) -> str:
    return f"""
You are a food classification engine.

Classify the ingredient below into EXACTLY ONE category.

Rules:
- Output ONLY valid JSON
- Ignore quantity, brand names, preparation words
- Oils/fats (except butter) → FAT_OIL
- Butter → BUTTER
- Salt/pepper/seasoning powders → SPICE
- Sauces/pastes → CONDIMENT or SAUCE_PASTE
- Sugars/syrups/honey → SWEETENER
- Water / neutral liquids → LIQUID
- Do NOT invent categories

Allowed categories:
{", ".join(sorted(ALLOWED_CATEGORIES))}

Return JSON:
{{ "category": "ONE_CATEGORY" }}

INGREDIENT:
{ingredient}
""".strip()


_client: Optional[Mistral] = None


def _get_client() -> Mistral:
    global _client
    if _client is None:
        api_key = os.getenv("MISTRAL_API_KEY")
        if not api_key:
            raise RuntimeError("MISTRAL_API_KEY not set")
        _client = Mistral(api_key=api_key)
    return _client


def _classify_with_ai(ingredient_key: str) -> str:
    client = _get_client()
    prompt = _build_category_prompt(ingredient_key)

    resp = client.chat.complete(
        model=MISTRAL_MODEL,
        messages=[
            {"role": "system", "content": "You output only valid JSON."},
            {"role": "user", "content": prompt},
        ],
        response_format={"type": "json_object"},
        temperature=0.0,
    )

    data = json.loads(resp.choices[0].message.content)
    cat = _normalize_category(data.get("category"))

    if cat not in ALLOWED_CATEGORIES:
        raise ValueError(f"Invalid category from AI: {cat}")

    return cat


def infer_ingredient_emoji(ingredient_english: str) -> str:
    """
    Deterministic emoji inference:
    Canonicalize → HARD GUARDS → STATIC → CACHE → AI → CACHE WRITE
    """
    key = _canonical_key(ingredient_english)
    if not key:
        return CATEGORY_TO_EMOJI["OTHER"]

    toks = set(key.split())

    # Hard guards (these must beat a bad cache forever)
    if "butter" in toks:
        return CATEGORY_TO_EMOJI["BUTTER"]
    if "oil" in toks:
        return CATEGORY_TO_EMOJI["FAT_OIL"]
    if "salt" in toks:
        return CATEGORY_TO_EMOJI["SPICE"]
    if "pepper" in toks:
        return CATEGORY_TO_EMOJI["SPICE"]

    if key in STATIC_CATEGORY_OVERRIDES:
        return CATEGORY_TO_EMOJI[STATIC_CATEGORY_OVERRIDES[key]]

    if key in _CATEGORY_CACHE:
        cat = _normalize_category(_CATEGORY_CACHE[key])
        if cat in ALLOWED_CATEGORIES:
            return CATEGORY_TO_EMOJI[cat]

    cat = _classify_with_ai(key)
    _CATEGORY_CACHE[key] = cat
    _save_cache(_CATEGORY_CACHE)
    return CATEGORY_TO_EMOJI[cat]
