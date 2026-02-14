# fetcher_api/services/extractor_helpers.py

"""
Helper functions for universal content extraction
Text processing, language detection, cleaning, normalization
"""

import re
from typing import List, Dict, Any

from fetcher_api.services.emoji_mapper import infer_ingredient_emoji
from fetcher_api.services.summary_formatter import strip_emoji, clean_text


TITLE_MAX_CHARS = 56
SUMMARY_MAX_CHARS = 350


def is_english(lang: str) -> bool:
    return (lang or "").strip().lower() in {"en", "eng", "english"}


def is_unknown_lang(lang: str) -> bool:
    l = (lang or "").strip().lower()
    return (not l) or l in {"unknown", "und", "none", "n/a", "na"}


def detect_caption_language(caption: str) -> str:
    """
    Lightweight heuristic language detection from caption text.
    Returns ISO language code (e.g., "fr", "es", "de") or "unknown".
    """
    text = (caption or "").lower().strip()
    if not text or len(text) < 20:
        return "unknown"

    french_markers = [
        "ingrédients", "recette", "très", "c'est", "pour", "avec", "une", "des",
        "vous", "je", "abonne", "épisode", "étape", "français", "à", "été"
    ]
    french_score = sum(1 for m in french_markers if m in text)
    if french_score >= 3 or any(c in text for c in ["é", "è", "ê", "à", "ç", "œ"]):
        spanish_markers = ["para", "con", "los", "las", "una", "tiene", "más"]
        spanish_score = sum(1 for m in spanish_markers if m in text)
        if spanish_score < french_score:
            return "fr"

    spanish_markers = ["ingredientes", "receta", "para", "con", "los", "las", "muy", "más", "está", "cómo"]
    spanish_score = sum(1 for m in spanish_markers if m in text)
    if spanish_score >= 3 or any(c in text for c in ["ñ", "á", "é", "í", "ó", "ú", "¿", "¡"]):
        return "es"

    german_markers = ["zutaten", "rezept", "mit", "und", "für", "das", "die", "der", "ein", "ist", "sehr"]
    german_score = sum(1 for m in german_markers if m in text)
    if german_score >= 3 or any(c in text for c in ["ü", "ö", "ä", "ß"]):
        return "de"

    italian_markers = ["ingredienti", "ricetta", "con", "per", "una", "più", "molto", "come", "è"]
    italian_score = sum(1 for m in italian_markers if m in text)
    if italian_score >= 3:
        return "it"

    portuguese_markers = ["ingredientes", "receita", "com", "para", "uma", "mais", "muito", "como", "está", "são"]
    portuguese_score = sum(1 for m in portuguese_markers if m in text)
    if portuguese_score >= 3 or any(c in text for c in ["ã", "õ", "ç"]):
        return "pt"

    if any("\u0600" <= c <= "\u06FF" for c in text):
        return "ar"
    if any("\u0400" <= c <= "\u04FF" for c in text):
        return "ru"
    if any("\u3040" <= c <= "\u309F" or "\u30A0" <= c <= "\u30FF" for c in text):
        return "ja"
    if any("\u4E00" <= c <= "\u9FFF" for c in text):
        return "zh"
    if any("\uAC00" <= c <= "\uD7AF" for c in text):
        return "ko"

    return "unknown"


def safe_list(v) -> List:
    return v if isinstance(v, list) else []


def safe_str(v) -> str:
    return v if isinstance(v, str) else ("" if v is None else str(v))


def unique_keep_order(items: List[str]) -> List[str]:
    seen = set()
    out = []
    for x in items:
        if x not in seen:
            seen.add(x)
            out.append(x)
    return out


def truncate_to_max_chars(text: str, max_chars: int) -> str:
    s = (text or "").strip()
    if len(s) <= max_chars:
        return s
    cut = s[:max_chars].rstrip()
    if " " in cut:
        cut = cut.rsplit(" ", 1)[0].rstrip()
    return cut.rstrip(" ,.;:!-–—")


def clean_title(title: str) -> str:
    title = strip_emoji(title or "")
    title = re.sub(r"\s+", " ", title).strip()
    title = title.strip(" \t\r\n,.;:!-–—")
    title = truncate_to_max_chars(title, TITLE_MAX_CHARS)
    return title.strip()


def clean_headline(text: str) -> str:
    text = (text or "").strip()
    text = re.sub(r"^[•·●○◦▪▫-]\s*", "", text)
    text = re.sub(r"\s+", " ", text)
    return strip_emoji(text).strip()


def extract_caption_url_domain_hint(caption: str) -> str:
    cap = caption or ""
    m = re.search(r"https?://[^\s]+", cap)
    if not m:
        return ""
    url = m.group(0).strip()
    slug = url.split("?")[0].rstrip("/").split("/")[-1]
    if not slug or len(slug) < 4:
        return ""
    slug = re.sub(r"[-_]+", " ", slug)
    slug = re.sub(r"\.(html|php|aspx)$", "", slug, flags=re.IGNORECASE).strip()
    words = [w for w in slug.split() if w and w.lower() not in {"www", "com", "https", "http"}]
    if not words:
        return ""
    hint = " ".join(words[:6]).title().strip()
    hint = re.sub(r"\s+", " ", hint).strip()
    hint = clean_title(hint)
    return hint


def derive_best_title_from_caption(caption: str) -> str:
    caption = caption or ""
    lines = [ln.strip() for ln in caption.split("\n") if ln.strip()]
    first = lines[0] if lines else ""
    first_low = first.lower()

    cta_starts = (
        "comment", "dm", "follow", "subscribe", "tap", "click", "link", "save",
        "share", "use code", "use my code", "order", "shop", "get the", "i'll send",
        "ill send", "send you"
    )
    if first and any(first_low.startswith(x) for x in cta_starts):
        first = ""

    if first:
        t = clean_title(first)
        if t and len(t) >= 10:
            return t

    hint = extract_caption_url_domain_hint(caption)
    if hint:
        return hint

    return ""


def normalize_ingredients(ings: Any) -> List[Dict[str, str]]:
    if not isinstance(ings, list):
        return []

    out: List[Dict[str, str]] = []
    for ing in ings:
        if isinstance(ing, str):
            body = strip_emoji(ing)
            emoji = infer_ingredient_emoji(body)
            out.append({"item": body, "name": body, "quantity": "", "unit": "", "emoji": emoji})
            continue

        if isinstance(ing, dict):
            item = strip_emoji(safe_str(ing.get("item") or ing.get("name") or ""))
            qty = strip_emoji(safe_str(ing.get("quantity") or ""))
            unit = strip_emoji(safe_str(ing.get("unit") or ""))

            emoji = infer_ingredient_emoji(item)

            out.append({"item": item, "name": item, "quantity": qty, "unit": unit, "emoji": emoji})

    return out


def normalize_text_for_comparison(text: str) -> str:
    """Normalize text for similarity checking (remove emojis, lowercase, strip whitespace)"""
    s = strip_emoji(text or "").lower()
    s = re.sub(r"\s+", " ", s)
    s = re.sub(r"[^\w\s]", "", s)
    return s.strip()


def is_caption_copy(summary: str, caption: str) -> bool:
    """
    Detect if summary is just copying the caption.
    Returns True if >60% of summary words appear in caption in same order.
    """
    if not summary or not caption:
        return False
    
    summary_clean = normalize_text_for_comparison(summary)
    caption_clean = normalize_text_for_comparison(caption)
    
    if summary_clean in caption_clean:
        return True
    
    summary_words = summary_clean.split()
    caption_words = caption_clean.split()
    
    if len(summary_words) < 10:
        return False
    
    matches = 0
    for word in summary_words:
        if word in caption_words and len(word) > 3:
            matches += 1
    
    overlap = matches / len(summary_words) if summary_words else 0
    
    return overlap > 0.6


def smart_truncate_summary(text: str, max_chars: int = SUMMARY_MAX_CHARS) -> str:
    """
    Truncate summary intelligently - don't cut mid-sentence.
    If last sentence is incomplete, remove it entirely.
    """
    s = (text or "").strip()
    if len(s) <= max_chars:
        return s
    
    # Try to find last complete sentence within limit
    cut = s[:max_chars]
    
    # Find last sentence-ending punctuation
    last_period = max(cut.rfind('.'), cut.rfind('!'), cut.rfind('?'))
    
    if last_period > max_chars * 0.7:  # If we found a sentence end in last 30% of allowed length
        return s[:last_period + 1].strip()
    
    # Otherwise, cut at word boundary
    if " " in cut:
        cut = cut.rsplit(" ", 1)[0].rstrip()
    
    cut = cut.rstrip(" ,.;:!-–—")
    
    # Add period if missing
    if cut and not cut.endswith((".", "!", "?")):
        cut += "."
    
    return cut
