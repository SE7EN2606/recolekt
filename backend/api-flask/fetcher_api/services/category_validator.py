# fetcher_api/services/category_validator.py
"""
Category validation — lightweight guardrails.

We let the AI generate categories freely but reject garbage outputs.
No hardcoded taxonomy — the AI handles all languages and niches.
"""

import re
import logging

logger = logging.getLogger(__name__)

# Words that are too vague to be useful as a category
BANNED_WORDS = {
    "general", "other", "misc", "miscellaneous", "various", "content",
    "video", "reel", "post", "clip", "media", "entertainment",
    "tips", "advice", "tutorial", "how-to", "howto", "guide",
    "n/a", "na", "none", "unknown", "divers", "autre", "otros",
    "vario", "altro", "sonstiges", "allgemein",
}

# Patterns that indicate the AI gave a garbage category
BANNED_PATTERNS = [
    r"^food\s*[&+]\s*drink",       # "Food & Drink" → too broad
    r"^health\s*[&+]\s*wellness",   # "Health & Wellness" → too broad
    r"^life\s*style$",              # "Lifestyle" → too vague
    r"^home\s*[&+]\s*living",       # "Home & Living" → too broad
    r"^beauty\s*[&+]\s*fashion",    # "Beauty & Fashion" → pick one
]
BANNED_RE = re.compile("|".join(BANNED_PATTERNS), re.IGNORECASE)


def validate_category(ai_category: str, content_type: str) -> str:
    """
    Validate the AI-generated category. If it's garbage, derive a 
    sensible fallback from the content_type classification.
    
    Returns the category string (never empty, never banned).
    """
    cat = (ai_category or "").strip()

    # Remove any emojis or special chars
    cat = re.sub(r"[^\w\s\-/']", "", cat).strip()

    # Check if it's banned
    if _is_banned(cat):
        logger.info(f"📂 Category '{ai_category}' is banned, using content_type fallback")
        return _fallback_from_content_type(content_type)

    # Check minimum quality: at least 3 chars, not just a number
    if len(cat) < 3 or cat.isdigit():
        logger.info(f"📂 Category '{ai_category}' too short/invalid, using fallback")
        return _fallback_from_content_type(content_type)

    return cat


def _is_banned(cat: str) -> bool:
    """Check if category matches any banned word or pattern."""
    if not cat:
        return True

    cat_lower = cat.lower().strip()

    # Exact match against banned words
    if cat_lower in BANNED_WORDS:
        return True

    # Check each word — reject if ALL words are banned
    words = cat_lower.split()
    if words and all(w in BANNED_WORDS for w in words):
        return True

    # Pattern match
    if BANNED_RE.search(cat_lower):
        return True

    return False


def _fallback_from_content_type(content_type: str) -> str:
    """
    Minimal fallback: use the classifier label as a starting point.
    Only used when AI returns garbage — which should be rare with good prompts.
    """
    fallbacks = {
        "recipe": "Cooking",
        "workout": "Fitness",
    }
    return fallbacks.get(content_type, "Saved Content")
