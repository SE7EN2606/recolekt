# fetcher_api/services/summary_formatter.py

"""
Summary formatting + guardrails (UI contract):

- Paragraph: 250–400 characters max (single factual paragraph).
- Bullets: exactly 4 items, each has a short headline + one-sentence description.
- No emojis anywhere in paragraph/headlines/descriptions.
- No marketing fluff / author comments / CTA phrasing.
- Focus on WHAT the video is about (not a recipe, not ingredient lists, not step dumps).

This module is deterministic and should be used as a post-processor so we don't
trust model formatting to be perfect.
"""

import re
from typing import Any, Dict, List, Tuple


def strip_emoji(text: str) -> str:
    emoji_pattern = re.compile(
        "["
        "\U0001F1E0-\U0001F1FF"
        "\U0001F300-\U0001F5FF"
        "\U0001F600-\U0001F64F"
        "\U0001F680-\U0001F6FF"
        "\U0001F700-\U0001F77F"
        "\U0001F780-\U0001F7FF"
        "\U0001F800-\U0001F8FF"
        "\U0001F900-\U0001F9FF"
        "\U0001FA00-\U0001FA6F"
        "\U0001FA70-\U0001FAFF"
        "\U00002702-\U000027B0"
        "\U000024C2-\U0001F251"
        "\U0001F004"
        "\U0001F0CF"
        "\U0001F18E"
        "\u3030"
        "\u2B50"
        "\u2705"
        "\u203C"
        "\u2049"
        "]+",
        flags=re.UNICODE,
    )
    s = emoji_pattern.sub("", text or "")
    s = re.sub(r"[—–•·●○◦▪▫►▻◄◅△▲▴▵▿▾▼▽]", "", s)
    return s.strip()


def clean_text(text: str) -> str:
    s = strip_emoji(text or "")
    s = re.sub(r"\s+", " ", s).strip()
    return s


def _looks_like_recipe_dump(s: str) -> bool:
    """
    Heuristic: if paragraph looks like ingredients/instructions list, we treat it as invalid for ai_summary.
    We do NOT attempt to rewrite facts; we just avoid obviously bad content.
    """
    t = (s or "").lower()
    if not t:
        return True

    # Strong recipe markers + list patterns
    markers = [
        "ingrédient", "ingredients", "ingredient", "g", "kg", "ml", "l ", "tbsp", "tsp",
        "cuillère", "c. à", "c a", "gram", "grams", "oven", "preheat", "bake", "minutes",
        "recette", "recipe", "instructions", "étape", "step", "1.", "2.", "3."
    ]
    hits = sum(1 for m in markers if m in t)
    if hits >= 4:
        return True

    # Too many quantity-like tokens suggests ingredient list
    qty_tokens = len(re.findall(r"(\b\d+([.,]\d+)?\b|\b\d+/\d+\b)", t))
    if qty_tokens >= 6:
        return True

    return False


def clamp_paragraph_chars(text: str, min_chars: int = 250, max_chars: int = 400) -> str:
    """
    Trim to <= max_chars at a word boundary. If too short, keep as-is (don't hallucinate).
    Always return a single paragraph, emoji-free.
    """
    s = clean_text(text)
    if not s:
        return ""

    if len(s) > max_chars:
        cut = s[:max_chars].rstrip()
        if " " in cut:
            cut = cut.rsplit(" ", 1)[0].rstrip()
        cut = cut.rstrip(" ,.;:!-–—")
        if cut and not cut.endswith((".", "!", "?")):
            cut += "."
        s = cut

    # If it's obviously a recipe dump, reject (caller should fallback)
    if _looks_like_recipe_dump(s):
        return ""

    return s


def clean_headline(text: str) -> str:
    s = clean_text(text)
    s = re.sub(r"^[\-\*\u2022]\s*", "", s).strip()
    # Remove trailing punctuation spam
    s = s.strip(" \t\r\n,.;:!-–—")
    return s


def _ensure_one_sentence(desc: str) -> str:
    s = clean_text(desc).strip(" \t\r\n")
    if not s:
        return ""
    # Prefer one sentence; if multiple, keep first clause until sentence end-ish.
    if len(re.findall(r"[.!?]", s)) >= 2:
        parts = re.split(r"(?<=[.!?])\s+", s)
        s = parts[0].strip()
    s = s.rstrip(" ,;:")
    if s and not s.endswith((".", "!", "?")):
        s += "."
    return s


def normalize_bullets(highlights: Any) -> List[Dict[str, str]]:
    """
    Accept model output formats and return exactly 4 bullets:
    [{"headline": "...", "description": "..."}, ...]
    """
    bullets: List[Dict[str, str]] = []

    if isinstance(highlights, list):
        for h in highlights:
            headline = ""
            desc = ""

            if isinstance(h, dict):
                headline = clean_headline(str(h.get("headline") or h.get("title") or ""))
                desc = str(h.get("description") or h.get("text") or "")
            elif isinstance(h, str):
                s = clean_text(h)
                if ":" in s:
                    a, b = s.split(":", 1)
                    headline, desc = clean_headline(a), b.strip()
                elif "—" in s:
                    a, b = s.split("—", 1)
                    headline, desc = clean_headline(a), b.strip()
                elif "-" in s:
                    a, b = s.split("-", 1)
                    headline, desc = clean_headline(a), b.strip()
                else:
                    headline, desc = clean_headline(s), ""
            else:
                continue

            desc = _ensure_one_sentence(desc)

            if headline and desc:
                bullets.append({"headline": headline, "description": desc})

    # Fill to exactly 4
    while len(bullets) < 4:
        bullets.append({"headline": "Key detail", "description": "A concrete detail shown in the clip."})

    bullets = bullets[:4]

    # Final cleanup
    for b in bullets:
        b["headline"] = clean_headline(b.get("headline", "")) or "Key detail"
        b["description"] = _ensure_one_sentence(b.get("description", "")) or "A concrete detail shown in the clip."

    return bullets


def format_ai_summary(
    title_en: str,
    summary_en_raw: str,
    highlights_raw: Any,
) -> Tuple[str, List[Dict[str, str]]]:
    """
    Produce (paragraph, bullets) in the strict UI contract.

    If summary can't be made valid (recipe dump / too short / empty), fall back to a conservative paragraph
    derived from the title (no hallucinated details).
    """
    paragraph = clamp_paragraph_chars(summary_en_raw, 250, 400)
    bullets = normalize_bullets(highlights_raw)

    if not paragraph:
        # Conservative fallback: factual but minimal; no invented claims.
        base = clean_text(title_en).strip(" \t\r\n,.;:!-–—")
        if not base:
            base = "Saved content"
        paragraph = clamp_paragraph_chars(
            f"{base}. The clip presents key details and visuals around this topic in a short, factual format.",
            250,
            400,
        )
        if not paragraph:
            paragraph = f"{base}."

    return paragraph, bullets
