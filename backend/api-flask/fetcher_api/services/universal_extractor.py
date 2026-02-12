# fetcher_api/services/universal_extractor.py

"""
Universal Content Extractor - ONE extractor for ALL content types
Makes 1-2 API calls MAX (optimized batch translations)
"""

import os
import json
import re
import logging
from typing import Dict, List, Any

from mistralai import Mistral
from fetcher_api.services.emoji_mapper import infer_ingredient_emoji
from fetcher_api.services.summary_formatter import (
    strip_emoji,
    clean_text,
    format_ai_summary,
)

logger = logging.getLogger(__name__)

EXTRACTOR_VERSION = "universal-v5-title56-noemoji-langfix"

TITLE_MAX_CHARS = 56


def _is_english(lang: str) -> bool:
    return (lang or "").strip().lower() in {"en", "eng", "english"}


def _is_unknown_lang(lang: str) -> bool:
    l = (lang or "").strip().lower()
    return (not l) or l in {"unknown", "und", "none", "n/a", "na"}


def _safe_list(v) -> List:
    return v if isinstance(v, list) else []


def _safe_str(v) -> str:
    return v if isinstance(v, str) else ("" if v is None else str(v))


def _unique_keep_order(items: List[str]) -> List[str]:
    seen = set()
    out = []
    for x in items:
        if x not in seen:
            seen.add(x)
            out.append(x)
    return out


def _truncate_to_max_chars(text: str, max_chars: int) -> str:
    s = (text or "").strip()
    if len(s) <= max_chars:
        return s
    cut = s[:max_chars].rstrip()
    if " " in cut:
        cut = cut.rsplit(" ", 1)[0].rstrip()
    return cut.rstrip(" ,.;:!-–—")


def _clean_title(title: str) -> str:
    title = strip_emoji(title or "")
    title = re.sub(r"\s+", " ", title).strip()
    title = title.strip(" \t\r\n,.;:!-–—")
    title = _truncate_to_max_chars(title, TITLE_MAX_CHARS)
    return title.strip()


def _clean_headline(text: str) -> str:
    text = (text or "").strip()
    text = re.sub(r"^[•·●○◦▪▫-]\s*", "", text)
    text = re.sub(r"\s+", " ", text)
    return strip_emoji(text).strip()


def _extract_caption_url_domain_hint(caption: str) -> str:
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
    hint = _clean_title(hint)
    return hint


def _derive_best_title_from_caption(caption: str) -> str:
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
        t = _clean_title(first)
        if t and len(t) >= 10:
            return t

    hint = _extract_caption_url_domain_hint(caption)
    if hint:
        return hint

    return ""


def _normalize_ingredients(ings: Any) -> List[Dict[str, str]]:
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
            item = strip_emoji(_safe_str(ing.get("item") or ing.get("name") or ""))
            qty = strip_emoji(_safe_str(ing.get("quantity") or ""))
            unit = strip_emoji(_safe_str(ing.get("unit") or ""))

            emoji = infer_ingredient_emoji(item)

            out.append({"item": item, "name": item, "quantity": qty, "unit": unit, "emoji": emoji})

    return out


class UniversalExtractor:
    def __init__(self):
        api_key = os.getenv("MISTRAL_API_KEY")
        if not api_key:
            raise ValueError("MISTRAL_API_KEY not found in environment")
        self.client = Mistral(api_key=api_key)
        self.model = "mistral-large-latest"
        self.api_call_count = 0

    def extract(self, transcript: str, caption: str, lang: str, classification: Dict) -> Dict:
        self.api_call_count = 0

        transcript = transcript or ""
        caption = caption or ""
        lang = (lang or "en").strip() or "en"

        content_type = classification.get("label", "general")

        # CALL 1: Extract EVERYTHING in English
        prompt = self._build_universal_prompt(transcript, caption, lang, content_type)
        result = self._call_ai(prompt)

        category = _safe_str(result.get("category", "General")).strip() or "General"
        topic = _safe_str(result.get("topic", "")).strip()

        # Title (English): strict 56 chars, no emojis.
        title_en = _clean_title(_safe_str(result.get("title", "")))

        # Deterministic fallback for "music_only"/no transcript situations.
        if not title_en or len(title_en) < 8:
            derived = _derive_best_title_from_caption(caption)
            title_en = derived or title_en

        if not title_en:
            title_en = "Saved Content"
        title_en = _clean_title(title_en) or "Saved Content"

        # Raw summary/highlights from model
        summary_en_raw = clean_text(_safe_str(result.get("summary", "")))
        highlights_raw = _safe_list(result.get("highlights", []))

        # STRICT UI ai_summary (applies to all content types, including recipes)
        ai_paragraph_en, ai_bullets = format_ai_summary(
            title_en=title_en,
            summary_en_raw=summary_en_raw,
            highlights_raw=highlights_raw,
        )

        # For legacy schema: headlines_en uses {headline, text}
        headlines_en = [{"headline": b["headline"], "text": b["description"]} for b in ai_bullets]

        # Emojis/hashtags (titles + ai_summary are emoji-free, but you still store emojis separately)
        emojis = _safe_list(result.get("emojis", []))
        emojis = [e.strip() for e in emojis if isinstance(e, str) and e.strip()]
        emojis = _unique_keep_order(emojis)
        if len(emojis) < 4:
            emojis = (emojis + ["✨", "💡", "📌", "✅"])[:4]
        emojis = emojis[:4]

        hashtags = _safe_list(result.get("hashtags", []))
        hashtags = [str(t).lstrip("#").strip() for t in hashtags if str(t).strip()]
        hashtags = _unique_keep_order(hashtags)

        # Recipe data (if recipe)
        recipe_obj = result.get("recipe", {}) if content_type == "recipe" else {}
        ingredients_en = _normalize_ingredients(recipe_obj.get("ingredients", []))
        instructions_en = _safe_list(recipe_obj.get("instructions", []))
        tips_en = _safe_list(recipe_obj.get("tips", []))
        notes_en = _safe_list(recipe_obj.get("notes", []))

        # Original language defaults
        title_og = title_en
        summary_og = ai_paragraph_en  # we store strict paragraph in bilingual summary
        headlines_og = headlines_en
        ingredients_og = ingredients_en
        instructions_og = instructions_en
        tips_og = tips_en
        notes_og = notes_en

        # CALL 2: translate only if language is truly known and non-English.
        if (not _is_english(lang)) and (not _is_unknown_lang(lang)):
            logger.info("Detected non-English content (lang=%s), starting translation...", lang)

            to_translate = {
                "title": title_en,
                "summary": ai_paragraph_en,
                "headlines": [f"{h['headline']}: {h['text']}" for h in headlines_en],
            }
            if ingredients_en:
                to_translate["ingredient_names"] = [ing["item"] for ing in ingredients_en]
            if instructions_en:
                to_translate["instructions"] = instructions_en

            translated = self._translate_mega_batch(to_translate, lang)

            title_translated = _clean_title(translated.get("title", ""))
            summary_translated = clean_text(translated.get("summary", ""))

            if title_translated and title_translated != title_en:
                title_og = title_translated
            else:
                title_og = title_en

            if summary_translated and summary_translated != ai_paragraph_en:
                # Keep strict constraints again (no emoji, one paragraph, etc.)
                # Use formatter with translated headlines as "highlights" input.
                translated_highlights = _safe_list(translated.get("headlines", []))
                summary_og_fmt, bullets_og = format_ai_summary(
                    title_en=title_og,
                    summary_en_raw=summary_translated,
                    highlights_raw=translated_highlights,
                )
                summary_og = summary_og_fmt
                headlines_og = [{"headline": b["headline"], "text": b["description"]} for b in bullets_og]
            else:
                summary_og = ai_paragraph_en
                headlines_og = headlines_en

            # Ingredients/instructions
            ingredient_names_og = _safe_list(translated.get("ingredient_names", []))
            if ingredient_names_og and len(ingredient_names_og) >= len(ingredients_en):
                ingredients_og = []
                for i, ing in enumerate(ingredients_en):
                    name_og = clean_text(_safe_str(ingredient_names_og[i]))
                    ingredients_og.append({
                        "item": name_og,
                        "name": name_og,
                        "quantity": ing["quantity"],
                        "unit": ing["unit"],
                        "emoji": ing["emoji"],
                    })

            instructions_og_raw = _safe_list(translated.get("instructions", []))
            if instructions_og_raw and len(instructions_og_raw) >= len(instructions_en):
                instructions_og = [clean_text(_safe_str(x)) for x in instructions_og_raw]

            logger.info(
                "Translation applied: title='%s', summary=%d chars, headlines=%d",
                title_og[:50],
                len(summary_og),
                len(headlines_og),
            )
        elif (not _is_english(lang)) and _is_unknown_lang(lang):
            logger.info("Language is unknown; skipping translation (lang=%s)", lang)

        # Ensure titles obey rules in final payload
        title_en = _clean_title(title_en) or "Saved Content"
        title_og = _clean_title(title_og) or title_en

        bilingual_summary = {
            "english": {
                "title": title_en,
                "summary": ai_paragraph_en,
                "headlines": headlines_en,
                "hashtags": hashtags,
                "emojis": emojis,
            },
            "original": {
                "title": title_og,
                "summary": summary_og,
                "headlines": headlines_og,
                "hashtags": hashtags,
                "emojis": emojis,
            },
        }

        recipe_data = None
        if content_type == "recipe" and ingredients_en:
            recipe_data = {
                "english": {
                    "title": title_en,
                    "ingredients": ingredients_en,
                    "instructions": instructions_en,
                    "tips": tips_en,
                    "notes": notes_en,
                },
                "original": {
                    "title": title_og,
                    "ingredients": ingredients_og,
                    "instructions": instructions_og,
                    "tips": tips_og,
                    "notes": notes_og,
                },
            }

        headlines_flat = [f"{h['headline']}: {h['text']}" for h in headlines_en]

        logger.info("Content extracted with %d API calls", self.api_call_count)

        return {
            "content_type": content_type,
            "extractor_version": EXTRACTOR_VERSION,
            "category": category,
            "topic": topic,
            "title": title_en,
            "summary_title": title_en,

            # keep existing keys exactly
            "summary_text": bilingual_summary,
            "summary_bullets": json.dumps(headlines_flat, ensure_ascii=False),
            "summary_hashtags": hashtags,
            "summary_emojis": emojis,
            "summary": bilingual_summary,
            "headlines": headlines_en,
            "hashtags": hashtags,
            "emojis": emojis,

            "recipe": json.dumps(recipe_data, ensure_ascii=False) if recipe_data else None,
            "workout": None,
        }

    def _format_highlights(self, highlights_raw: List) -> List[Dict]:
        # Kept for backwards compatibility (no longer used for the strict summary path),
        # but leaving it here avoids breaking any external callers/tests.
        formatted = []
        for h in highlights_raw:
            if isinstance(h, dict):
                headline = _clean_headline(_safe_str(h.get("headline", "")))
                text = strip_emoji(_safe_str(h.get("description") or h.get("text", ""))).strip()
                if headline and text:
                    formatted.append({"headline": headline, "text": text})
            elif isinstance(h, str):
                h_clean = strip_emoji(h)
                if ":" in h_clean:
                    parts = h_clean.split(":", 1)
                    formatted.append({"headline": _clean_headline(parts[0]), "text": strip_emoji(parts[1]).strip()})
                else:
                    formatted.append({"headline": _clean_headline(h_clean), "text": ""})
        return formatted

    def _build_universal_prompt(self, transcript: str, caption: str, lang: str, content_type: str) -> str:
        type_specific = ""

        if content_type == "recipe":
            type_specific = """
9. **recipe** object (ONLY if recipe detected):
   - **ingredients**: array of objects with:
     - "item": ingredient name (NO emojis, clean text)
     - "quantity": numeric amount ONLY (e.g., "100", "1.5", "250", "0.5")
     - "unit": measurement unit REQUIRED (e.g., "g", "kg", "ml", "l", "tbsp", "tsp", "cup", "pinch", "piece")
       → If no unit in source, use "" (empty string)
       → Common units: g, kg, ml, l, tbsp, tsp, cup, pinch, piece
   - **instructions**: 6-12 clear steps in English
   - **tips**: optional array of helpful tips
   - **notes**: optional array of important notes

IMPORTANT: ALWAYS provide "unit" field for ingredients. Never leave it out.
"""

        return f"""Analyze this {content_type} content and extract ALL data in ONE response. Output ONLY valid JSON.

ORIGINAL_LANGUAGE: {lang}

TRANSCRIPT:
{transcript[:3500]}

CAPTION:
{caption[:6000]}

EXTRACTION RULES:

1. **category**: English category (e.g., "Food", "Fitness", "Beauty")

2. **topic**: English topic (e.g., "Pumpkin Bars")

3. **title**: English, extremely precise, <= {TITLE_MAX_CHARS} characters (including spaces), NO emojis, NO quotes
   - Must describe what the post is actually about
   - If this is a recipe/dish, include the key dish name + key differentiator

4. **summary**: ONE FACTUAL DESCRIPTIVE PARAGRAPH (280-420 characters)
   - Focus on what is shown and the method/result
   - NEVER list raw ingredients or quantities
   - NEVER include emojis, hashtags, or promotional text
   - Avoid author voice and CTA phrasing

5. **highlights**: array of EXACTLY 4 objects with:
   - "headline": 3-5 word title (NO emojis, NO special characters, NO bullets)
   - "description": One sentence explaining the point (NO emojis, NO special characters)

6. **hashtags**: 5-10 keywords WITHOUT '#'

7. **emojis**: 4 emojis (separate array)

8. **All text fields MUST be emoji-free and clean**

{type_specific}

Return ALL fields in ONE JSON response.
"""

    def _call_ai(self, prompt: str, max_retries: int = 2) -> Dict:
        for attempt in range(max_retries + 1):
            try:
                logger.info("Calling Mistral API (attempt %d/%d)...", attempt + 1, max_retries + 1)
                self.api_call_count += 1

                response = self.client.chat.complete(
                    model=self.model,
                    messages=[
                        {"role": "system", "content": "You are a content analysis expert. Output only valid JSON."},
                        {"role": "user", "content": prompt},
                    ],
                    response_format={"type": "json_object"},
                    temperature=0.1,
                )
                content = response.choices[0].message.content
                return json.loads(content)
            except Exception as e:
                logger.error("AI call failed (attempt %s): %s", attempt + 1, e)
                if attempt == max_retries:
                    raise
        raise ValueError("AI call failed after retries")

    def _translate_mega_batch(self, data: Dict, target_lang: str) -> Dict:
        fields_to_translate = []
        if "title" in data:
            fields_to_translate.append('"title": "translated title"')
        if "summary" in data:
            fields_to_translate.append('"summary": "translated summary"')
        if "headlines" in data:
            fields_to_translate.append('"headlines": ["translated headline 1", "translated headline 2", ...]')
        if "ingredient_names" in data:
            fields_to_translate.append('"ingredient_names": ["translated ingredient 1", "translated ingredient 2", ...]')
        if "instructions" in data:
            fields_to_translate.append('"instructions": ["translated instruction 1", "translated instruction 2", ...]')

        expected_structure = "{\n  " + ",\n  ".join(fields_to_translate) + "\n}"

        prompt = f"""Translate ALL fields into {target_lang}. Keep exact structure and order. Output ONLY valid JSON.

Return JSON with EXACT structure:
{expected_structure}

DATA TO TRANSLATE:
{json.dumps(data, ensure_ascii=False, indent=2)}

RULES:
- Translate EVERY field accurately
- Keep arrays in same order
- Preserve meaning and context
- Do NOT add emojis
"""

        self.api_call_count += 1
        logger.info("Translating to %s in ONE batch call...", target_lang)

        response = self.client.chat.complete(
            model=self.model,
            messages=[
                {"role": "system", "content": "You output only valid JSON. Translate accurately while preserving structure."},
                {"role": "user", "content": prompt},
            ],
            response_format={"type": "json_object"},
            temperature=0.1,
        )

        result = json.loads(response.choices[0].message.content)

        return {
            "title": _safe_str(result.get("title", "")),
            "summary": _safe_str(result.get("summary", "")),
            "headlines": _safe_list(result.get("headlines", [])),
            "ingredient_names": _safe_list(result.get("ingredient_names", [])),
            "instructions": _safe_list(result.get("instructions", [])),
        }

    def fallback(self, caption: str, classification: Dict) -> Dict:
        title = _derive_best_title_from_caption(caption) or (caption.split("\n")[0] if caption else "Saved Content").strip()
        title = _clean_title(title) or "Saved Content"

        # strict paragraph for fallback too
        fallback_paragraph, fallback_bullets = format_ai_summary(
            title_en=title,
            summary_en_raw=(caption[:500] if caption else ""),
            highlights_raw=[],
        )
        headlines = [{"headline": b["headline"], "text": b["description"]} for b in fallback_bullets]
        headlines_flat = [f"{h['headline']}: {h['text']}" for h in headlines]

        bilingual_summary = {
            "english": {"title": title, "summary": fallback_paragraph, "headlines": headlines, "hashtags": [], "emojis": []},
            "original": {"title": title, "summary": fallback_paragraph, "headlines": headlines, "hashtags": [], "emojis": []},
        }

        return {
            "content_type": "general",
            "extractor_version": EXTRACTOR_VERSION,
            "category": "General",
            "topic": "",
            "title": title,
            "summary_title": title,
            "summary_text": bilingual_summary,
            "summary_bullets": json.dumps(headlines_flat, ensure_ascii=False),
            "summary_hashtags": [],
            "summary_emojis": [],
            "summary": bilingual_summary,
            "headlines": headlines,
            "hashtags": [],
            "emojis": [],
            "recipe": None,
            "workout": None,
        }
