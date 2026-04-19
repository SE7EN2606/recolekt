# fetcher_api/services/reel_classifier.py
"""
Lightweight heuristic classifier for Instagram reel content.

Phase 1 public families:
  recipe | workout | software | products | finance | general

Returns a classification dict:
  {
    "label":   "recipe" | "workout" | "software" | "products" | "finance" | "general",
    "score":   float,           # 0.0 – 1.0 confidence
    "reason":  str,             # human-readable explanation
    "signals": dict[str, int],  # keyword hit counts per category
  }

Also exports:
  caption_looks_like_recipe(caption: str) -> bool
  caption_looks_like_tools(caption: str)  -> bool   # compatibility helper
"""

from __future__ import annotations
import re


# ─────────────────────────────────────────────────────────────────────────────
# Keyword dictionaries
# ─────────────────────────────────────────────────────────────────────────────

# ── Recipe signals ────────────────────────────────────────────────────────────
RECIPE_KEYWORDS = [
    # EN
    "recipe", "ingredient", "tablespoon", "teaspoon", "cup of", "oven", "bake", "baking",
    "boil", "simmer", "sauté", "saute", "fry", "marinate", "grill", "roast", "blend",
    "preheat", "dice", "chop", "mince", "whisk", "stir", "fold in", "pour into",
    "cook time", "prep time", "serves", "portions",
    # FR
    "recette", "ingrédient", "cuillère", "cuillere", "four", "cuire", "cuisson",
    "faire revenir", "mélanger", "melanger", "mixer", "préparer", "preparer",
    "portions", "personne", "grammes", "millilitres",
]

RECIPE_UNITS = [
    "g", "kg", "ml", "cl", "l", "oz", "lb", "tbsp", "tsp",
    "cup", "cups", "mins", "min", "h", "°c", "°f",
]

# ── Workout signals ───────────────────────────────────────────────────────────
WORKOUT_KEYWORDS = [
    "workout", "kettlebell", "dumbbell", "barbell", "squat", "pushup", "push-up",
    "pull-up", "deadlift", "reps", "sets", "emom", "amrap", "hiit", "tabata",
    "muscle", "gym", "fitness", "fentes", "glutes", "quads", "hamstrings",
    "entraînement", "entrainement", "musculation", "gainage", "circuit training",
    "cardio", "burpees", "plank", "lunge", "bench press", "overhead press",
    "warm up", "cool down", "personal trainer", "calisthenics",
]

# ── Software / AI / apps signals ─────────────────────────────────────────────
KNOWN_TOOL_NAMES = [
    "chatgpt", "chat gpt", "claude", "mistral", "gemini", "perplexity",
    "copilot", "grok", "llama", "ollama",
    "capcut", "cap cut", "descript", "runway", "heygen", "synthesia",
    "opus clip", "opusclip", "submagic", "sub magic", "veed", "loom",
    "kling", "pika", "sora", "luma", "invideo", "vidiq", "tubebuddy",
    "manychat", "many chat", "later", "buffer", "hootsuite", "metricool",
    "zapier", "make.com", "n8n", "activepieces",
    "elevenlabs", "eleven labs", "murf", "resemble",
    "canva", "figma", "adobe express", "photoshop", "illustrator", "midjourney",
    "stable diffusion", "dall-e", "dalle",
    "notion", "airtable", "coda", "obsidian", "logseq",
    "webflow", "framer", "bubble", "softr", "glide",
    "mailchimp", "brevo", "beehiiv", "convertkit", "kit.com",
    "kajabi", "gumroad", "systeme.io", "teachable", "thinkific",
    "semrush", "ahrefs", "similarweb", "hotjar",
    "viralfinder", "viral finder", "zight", "agen",
    "typeform", "tally", "cal.com", "calendly", "lemlist",
]

TOOL_CATEGORY_KEYWORDS = [
    "outils", "outil", "tools", "tool", "apps", "app",
    "logiciel", "logiciels", "software", "plugin", "extension",
    "platform", "plateforme", "stack", "workflow", "automation",
    "liste d'outils", "tool list", "ai tools", "outils ia",
    "must have", "use this", "try this", "utilise", "utiliser",
    "boost your", "make money", "earn money", "gagner", "créer du contenu",
]

SOFTWARE_KEYWORDS = [
    "software", "app", "apps", "website", "websites", "saas", "platform",
    "automation", "workflow", "plugin", "extension", "api",
    "ai tool", "ai tools", "chrome extension", "browser extension",
]

# ── Product / brand / ranking signals ────────────────────────────────────────
PRODUCT_KEYWORDS = [
    "brand", "brands", "product", "products", "ranking", "ranked",
    "tier", "tier list", "review", "reviews", "comparison", "compared",
    "best", "worst", "tested", "lab test", "independent test", "consumer report",
    "worth it", "not worth it", "overrated", "underrated",
    "sunscreen", "spf", "skincare", "serum", "moisturizer",
    "perfume", "fragrance", "watch", "watches",
    "jacket", "jackets", "pants", "shoes", "sneakers",
    "bag", "bags", "handbag", "gear", "outdoor", "rain jacket",
    "baby shoes", "fashion brand",
]

# ── Finance / accounting signals ─────────────────────────────────────────────
FINANCE_KEYWORDS = [
    "finance", "financial", "accounting", "accountant", "bookkeeping", "bookkeeper",
    "tax", "taxes", "vat", "invoice", "invoices", "profit", "loss",
    "margin", "cash flow", "budget", "budgeting", "payroll",
    "investing", "investment", "etf", "etfs", "stock", "stocks",
    "dividend", "portfolio", "balance sheet", "income statement", "p&l",
    "expense ratio", "capital gains",
]

_FINANCE_STRONG_KEYWORDS = [
    "accounting", "bookkeeping", "bookkeeper", "vat", "invoice", "invoices",
    "balance sheet", "income statement", "p&l", "expense ratio",
    "capital gains", "payroll",
]

_TOOL_FOR_PATTERN = re.compile(
    r"\b\w[\w\s]{1,30}?\s+(pour|to|for|afin de|permettant de)\s+\w",
    re.IGNORECASE,
)


def _count_hits(text: str, keywords: list[str]) -> int:
    return sum(1 for kw in keywords if kw in text)


def _count_tool_names(text: str) -> int:
    return sum(1 for name in KNOWN_TOOL_NAMES if name in text)


def _count_tool_for_patterns(text: str) -> int:
    return len(_TOOL_FOR_PATTERN.findall(text))


def classify_reel_content(transcript: str, caption: str) -> dict:
    text = ((transcript or "") + " " + (caption or "")).lower()

    recipe_hits = _count_hits(text, RECIPE_KEYWORDS)
    workout_hits = _count_hits(text, WORKOUT_KEYWORDS)

    tool_names = _count_tool_names(text)
    tool_kw_hits = _count_hits(text, TOOL_CATEGORY_KEYWORDS)
    tool_patterns = _count_tool_for_patterns(text)
    software_hits = _count_hits(text, SOFTWARE_KEYWORDS)

    product_hits = _count_hits(text, PRODUCT_KEYWORDS)
    finance_hits = _count_hits(text, FINANCE_KEYWORDS)
    finance_strong_hits = _count_hits(text, _FINANCE_STRONG_KEYWORDS)

    unit_hits = _count_hits(text, RECIPE_UNITS)

    signals = {
        "recipe_keywords": recipe_hits,
        "recipe_units": unit_hits,
        "workout_keywords": workout_hits,
        "tool_names_found": tool_names,
        "tool_kw": tool_kw_hits,
        "tool_for_patterns": tool_patterns,
        "software_keywords": software_hits,
        "product_keywords": product_hits,
        "finance_keywords": finance_hits,
        "finance_strong_keywords": finance_strong_hits,
    }

    # Workout first: avoid fitness content being pulled into list/software buckets.
    if workout_hits >= 2:
        score = min(0.55 + workout_hits * 0.06, 0.94)
        return {
            "label": "workout",
            "score": round(score, 2),
            "reason": f"workout: {workout_hits} fitness keywords",
            "signals": signals,
        }

    # Recipe next: avoid cooking posts being pulled into generic product/software buckets.
    if recipe_hits >= 3 or (recipe_hits >= 2 and unit_hits >= 1):
        score = min(0.50 + recipe_hits * 0.07, 0.93)
        return {
            "label": "recipe",
            "score": round(score, 2),
            "reason": f"recipe: {recipe_hits} cooking keywords, {unit_hits} unit matches",
            "signals": signals,
        }

    # Finance should beat software when the subject is clearly finance/accounting/investing.
    if finance_hits >= 3 or (finance_hits >= 2 and finance_strong_hits >= 1):
        score = min(0.56 + finance_hits * 0.06, 0.92)
        return {
            "label": "finance",
            "score": round(score, 2),
            "reason": f"finance: {finance_hits} finance/accounting keywords",
            "signals": signals,
        }

    # Product-ranking / brand-comparison should beat software when product signals dominate.
    if product_hits >= 4 and product_hits >= software_hits + tool_names:
        score = min(0.56 + product_hits * 0.05, 0.93)
        return {
            "label": "products",
            "score": round(score, 2),
            "reason": f"products: dominant product/ranking signals ({product_hits})",
            "signals": signals,
        }

    # Software when actual tool naming + software context is strong.
    if tool_names >= 3:
        score = min(0.60 + (tool_names - 3) * 0.08, 0.97)
        return {
            "label": "software",
            "score": round(score, 2),
            "reason": f"software: {tool_names} known tool names detected",
            "signals": signals,
        }

    if tool_names >= 2 and (tool_kw_hits >= 1 or software_hits >= 2):
        return {
            "label": "software",
            "score": 0.72,
            "reason": f"software: {tool_names} tool names + software/category keywords",
            "signals": signals,
        }

    if tool_names >= 1 and tool_kw_hits >= 2 and tool_patterns >= 2:
        return {
            "label": "software",
            "score": 0.62,
            "reason": f"software: mixed signals — name={tool_names} kw={tool_kw_hits} patterns={tool_patterns}",
            "signals": signals,
        }

    # Product fallback after software when software is not clearly dominant.
    if product_hits >= 3:
        score = min(0.56 + product_hits * 0.05, 0.93)
        return {
            "label": "products",
            "score": round(score, 2),
            "reason": f"products: {product_hits} product/ranking keywords",
            "signals": signals,
        }

    return {
        "label": "general",
        "score": 0.40,
        "reason": "no strong category signals",
        "signals": signals,
    }


def caption_looks_like_recipe(caption: str) -> bool:
    if not caption:
        return False
    text = caption.lower()

    action_verbs = [
        "mix", "stir", "bake", "cook", "fry", "boil", "blend",
        "mélanger", "cuire", "faire revenir", "mixer",
    ]
    has_action = any(v in text for v in action_verbs)

    unit_pattern = re.search(
        r"\b\d+\s*(g|kg|ml|cl|l|oz|lb|tbsp|tsp|cup|°c|°f|min|h)\b",
        text,
        re.IGNORECASE,
    )

    structured_lines = sum(
        1 for line in caption.split("\n")
        if re.match(r"^\s*[-•*]\s*.+", line.strip())
    )

    return has_action and (unit_pattern is not None or structured_lines >= 3)


def caption_looks_like_tools(caption: str) -> bool:
    """
    Compatibility helper retained for older callers.

    Semantically this now means:
      caption looks like software/app/tool content
    """
    if not caption:
        return False
    text = caption.lower()

    tool_names_found = _count_tool_names(text)
    kw_hits = _count_hits(text, TOOL_CATEGORY_KEYWORDS)
    software_hits = _count_hits(text, SOFTWARE_KEYWORDS)

    return (
        tool_names_found >= 2
        or (tool_names_found >= 1 and kw_hits >= 2)
        or (tool_names_found >= 1 and software_hits >= 1)
        or software_hits >= 2
    )