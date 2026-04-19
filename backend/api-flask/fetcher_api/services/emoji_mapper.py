# fetcher_api/services/emoji_mapper.py

import json
import os
import re
import unicodedata
import logging
from typing import Dict

import requests

logger = logging.getLogger(__name__)

BASE_DIR = os.path.dirname(__file__)
CACHE_PATH = os.path.join(BASE_DIR, "emoji_category_cache.json")

MISTRAL_MODEL = "mistral-small-latest"
MISTRAL_API_URL = "https://api.mistral.ai/v1/chat/completions"

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
    "of", "for", "fresh", "ground", "minced", "chopped", "sliced", "crushed",
    "toasted", "roasted", "soaked", "dried", "cooked", "large", "small", "medium",
    "some", "a", "an", "the",
}

_SPELLING_FIXES = {
    "potatoe": "potato",
    "potatos": "potato",
    "gochuchang": "gochujang",
    "mirin ": "mirin",
}

LEGACY_CATEGORY_ALIASES: Dict[str, str] = {
    "OIL_FAT": "FAT_OIL",
    "OLIVE_OIL": "FAT_OIL",
    "OIL": "FAT_OIL",
}

CATEGORY_TO_EMOJI: Dict[str, str] = {
    # Proteins
    "PROTEIN_MEAT": "🥩",
    "PROTEIN_FISH": "🐟",
    "PROTEIN_EGG": "🥚",
    "PROTEIN_DAIRY": "🥛",
    "PROTEIN_SOY": "🫘",
    "PROTEIN_OTHER": "🍳",

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
    "STARCH": "🍞",

    # Nuts / seeds
    "LEGUME": "🫘",
    "NUT_SEED": "🥜",

    # Fats
    "FAT_OIL": "🧈",
    "BUTTER": "🧈",

    # Sweeteners
    "SWEETENER": "🧊",
    "SWEETENER_POWDER": "❄️",
    "SWEETENER_BROWN": "🟤",
    "SWEETENER_LIQUID": "🍯",
    "SWEETENER_CHOCOLATE": "🍫",

    # Flavor builders
    "CONDIMENT": "🥫",
    "SAUCE_PASTE": "🍲",
    "SPICE": "🧂",
    "VANILLA": "🌸",
    "CHILI": "🌶️",
    "FERMENTED": "🥣",

    # Liquids
    "LIQUID": "💧",
    "ALCOHOL": "🍶",

    # Fallback
    "OTHER": "🍽️",
}

ALLOWED_CATEGORIES = set(CATEGORY_TO_EMOJI.keys())

STATIC_CATEGORY_OVERRIDES: Dict[str, str] = {
    # Dairy
    "yogurt": "PROTEIN_DAIRY",
    "yaourt": "PROTEIN_DAIRY",
    "yaourt nature": "PROTEIN_DAIRY",
    "milk": "PROTEIN_DAIRY",
    "lait": "PROTEIN_DAIRY",
    "cream": "PROTEIN_DAIRY",
    "creme": "PROTEIN_DAIRY",
    "cheese": "PROTEIN_DAIRY",
    "fromage": "PROTEIN_DAIRY",
    # Eggs
    "egg": "PROTEIN_EGG",
    "eggs": "PROTEIN_EGG",
    "oeuf": "PROTEIN_EGG",
    "oeufs": "PROTEIN_EGG",
    # Fats
    "butter": "BUTTER",
    "beurre": "BUTTER",
    "oil": "FAT_OIL",
    "huile": "FAT_OIL",
    "sesame oil": "FAT_OIL",
    "olive oil": "FAT_OIL",
    "vegetable oil": "FAT_OIL",
    "canola oil": "FAT_OIL",
    "corn oil": "FAT_OIL",
    "sunflower oil": "FAT_OIL",
    "perilla oil": "FAT_OIL",
    # Grains
    "flour": "GRAIN",
    "farine": "GRAIN",
    "rice": "RICE",
    "pasta": "GRAIN",
    "noodle": "STARCH",
    "glass noodle": "STARCH",
    # Sugars
    "sugar": "SWEETENER",
    "sucre": "SWEETENER",
    "granulated sugar": "SWEETENER",
    "sucre en poudre": "SWEETENER",
    "powdered sugar": "SWEETENER_POWDER",
    "sucre glace": "SWEETENER_POWDER",
    "brown sugar": "SWEETENER_BROWN",
    "cassonade": "SWEETENER_BROWN",
    "honey": "SWEETENER_LIQUID",
    "miel": "SWEETENER_LIQUID",
    "maple syrup": "SWEETENER_LIQUID",
    "corn syrup": "SWEETENER_LIQUID",
    # Chocolate
    "chocolate chip": "SWEETENER_CHOCOLATE",
    "chocolate chips": "SWEETENER_CHOCOLATE",
    "pepites de chocolat": "SWEETENER_CHOCOLATE",
    "cocoa": "SWEETENER_CHOCOLATE",
    "cacao": "SWEETENER_CHOCOLATE",
    "chocolate": "SWEETENER_CHOCOLATE",
    "chocolat": "SWEETENER_CHOCOLATE",
    "dark chocolate": "SWEETENER_CHOCOLATE",
    "chocolat noir": "SWEETENER_CHOCOLATE",
    "milk chocolate": "SWEETENER_CHOCOLATE",
    "chocolat au lait": "SWEETENER_CHOCOLATE",
    # Vanilla
    "vanilla": "VANILLA",
    "vanille": "VANILLA",
    "vanilla extract": "VANILLA",
    "extrait de vanille": "VANILLA",
    "vanilla liquid": "VANILLA",
    "vanilla pod": "VANILLA",
    "gousse de vanille": "VANILLA",
    # Baking
    "baking powder": "SPICE",
    "levure chimique": "SPICE",
    "baking soda": "SPICE",
    "bicarbonate": "SPICE",
    "bicarbonate de soude": "SPICE",
    "yeast": "FERMENTED",
    "levure": "FERMENTED",
    # Spices
    "salt": "SPICE",
    "sel": "SPICE",
    "pepper": "SPICE",
    "poivre": "SPICE",
    "cinnamon": "SPICE",
    "cannelle": "SPICE",
    "cumin": "SPICE",
    "turmeric": "SPICE",
    # Fruits
    "apple": "FRUIT",
    "pomme": "FRUIT",
    "pear": "FRUIT",
    "poire": "FRUIT",
    "pears in syrup": "FRUIT",
    "poires au sirop": "FRUIT",
    # Nuts
    "walnut": "NUT_SEED",
    "walnuts": "NUT_SEED",
    "noix": "NUT_SEED",
    "almond": "NUT_SEED",
    "amande": "NUT_SEED",
    # Sauces
    "soy sauce": "CONDIMENT",
    "oyster sauce": "CONDIMENT",
    "tonkatsu sauce": "CONDIMENT",
    "ketchup": "CONDIMENT",
    "mayonnaise": "CONDIMENT",
    "mustard": "CONDIMENT",
    "vinegar": "CONDIMENT",
    # Fermented
    "kimchi": "FERMENTED",
    "gochujang": "CHILI",
    "sriracha": "CHILI",
    # Alcohol
    "mirin": "ALCOHOL",
    "sweet cooking wine": "ALCOHOL",
    "wine": "ALCOHOL",
    "vin": "ALCOHOL",
    # Starches
    "potato starch": "STARCH",
    "starch": "STARCH",
    # Potato
    "potatoe": "POTATO",
    "potato": "POTATO",
}


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

    if sanitized != raw:
        _write_json(CACHE_PATH, sanitized)

    return sanitized


def _save_cache(cache: Dict[str, str]) -> None:
    cleaned: Dict[str, str] = {}
    for k, v in (cache or {}).items():
        ck = _canonical_key(k)
        cv = _normalize_category(v)
        if ck and cv in ALLOWED_CATEGORIES:
            cleaned[ck] = cv
    _write_json(CACHE_PATH, cleaned)


def _write_json(path: str, data: Dict[str, str]) -> None:
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)


def _normalize_category(cat: str) -> str:
    cat = (cat or "").strip()
    cat = LEGACY_CATEGORY_ALIASES.get(cat, cat)
    return cat


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
- Granulated/white sugar → SWEETENER
- Powdered sugar → SWEETENER_POWDER
- Brown sugar → SWEETENER_BROWN
- Honey/syrup → SWEETENER_LIQUID
- Chocolate/cocoa → SWEETENER_CHOCOLATE
- Vanilla → VANILLA
- Water / neutral liquids → LIQUID
- Do NOT invent categories

Allowed categories:
{", ".join(sorted(ALLOWED_CATEGORIES))}

Return JSON:
{{ "category": "ONE_CATEGORY" }}

INGREDIENT:
{ingredient}
""".strip()


def _looks_too_noisy_for_ai(key: str) -> bool:
    if not key:
        return True
    if len(key) < 3:
        return True
    if len(key.split()) > 6:
        return True
    if re.search(r"[0-9]{3,}", key):
        return True
    return False


def _classify_with_ai(ingredient_key: str) -> str | None:
    """
    Best-effort HTTP call.
    Returns a valid category or None.
    Never raises to callers.
    """
    api_key = os.getenv("MISTRAL_API_KEY")
    if not api_key:
        logger.debug("emoji_mapper: MISTRAL_API_KEY missing, skipping AI classify")
        return None

    if _looks_too_noisy_for_ai(ingredient_key):
        return None

    prompt = _build_category_prompt(ingredient_key)

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": MISTRAL_MODEL,
        "messages": [
            {"role": "system", "content": "You output only valid JSON."},
            {"role": "user", "content": prompt},
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.0,
    }

    try:
        resp = requests.post(MISTRAL_API_URL, headers=headers, json=payload, timeout=15)
        resp.raise_for_status()

        raw = resp.json()["choices"][0]["message"]["content"]
        if isinstance(raw, str) and raw.startswith("```"):
            raw = re.sub(r"^```(?:json)?\s*\n?", "", raw)
            raw = re.sub(r"\n?```\s*$", "", raw)

        data = json.loads(raw)
        cat = _normalize_category(data.get("category", ""))

        if cat not in ALLOWED_CATEGORIES:
            logger.warning("emoji_mapper: invalid category from AI for %r: %r", ingredient_key, cat)
            return None

        return cat

    except Exception as exc:
        logger.warning("emoji_mapper: AI classify failed for %r (%s)", ingredient_key, exc)
        return None


def infer_ingredient_emoji(ingredient_english: str) -> str:
    """
    Deterministic-first emoji inference:
    Canonicalize → hard guards → static overrides → cache → best-effort AI → fallback
    """
    key = _canonical_key(ingredient_english)
    if not key:
        return CATEGORY_TO_EMOJI["OTHER"]

    toks = set(key.split())

    # Hard guards
    if "butter" in toks or "beurre" in toks:
        return CATEGORY_TO_EMOJI["BUTTER"]
    if "oil" in toks or "huile" in toks:
        return CATEGORY_TO_EMOJI["FAT_OIL"]
    if "salt" in toks or "sel" in toks:
        return CATEGORY_TO_EMOJI["SPICE"]
    if "pepper" in toks or "poivre" in toks:
        return CATEGORY_TO_EMOJI["SPICE"]

    # Exact static overrides
    if key in STATIC_CATEGORY_OVERRIDES:
        return CATEGORY_TO_EMOJI[STATIC_CATEGORY_OVERRIDES[key]]

    # Cache
    if key in _CATEGORY_CACHE:
        cat = _normalize_category(_CATEGORY_CACHE[key])
        if cat in ALLOWED_CATEGORIES:
            return CATEGORY_TO_EMOJI[cat]

    # Best-effort AI
    cat = _classify_with_ai(key)
    if cat and cat in ALLOWED_CATEGORIES:
        _CATEGORY_CACHE[key] = cat
        _save_cache(_CATEGORY_CACHE)
        return CATEGORY_TO_EMOJI[cat]

    # Safe fallback
    return CATEGORY_TO_EMOJI["OTHER"]


# --- Init ---
_CATEGORY_CACHE: Dict[str, str] = _load_cache()