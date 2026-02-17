# fetcher_api/services/universal_extractor.py
"""
Universal Content Extractor - BILINGUAL TWO-CALL approach
Call 1: Extract structured data (title, recipe, hashtags, etc.)
Call 2: Generate summary in BOTH English AND original language
"""

import os
import json
import logging
from typing import Dict

from mistralai import Mistral
from fetcher_api.services.extractor_helpers import (
    is_english,
    is_unknown_lang,
    detect_caption_language,
    safe_list,
    safe_str,
    unique_keep_order,
    clean_title,
    derive_best_title_from_caption,
    normalize_ingredients,
    is_caption_copy,
    TITLE_MAX_CHARS,
    SUMMARY_MAX_CHARS,
)
from fetcher_api.services.summary_formatter import (
    clean_text,
    strip_emoji,
    format_ai_summary,
)

logger = logging.getLogger(__name__)

# bumped because we now support ingredients_groups + time/servings meta
EXTRACTOR_VERSION = "universal-v14-groups-time"


def smart_truncate_summary(text: str, max_chars: int = SUMMARY_MAX_CHARS) -> str:
    """
    Truncate summary intelligently at sentence boundaries.
    Never cut mid-word.
    """
    s = strip_emoji(text or "").strip()
    if len(s) <= max_chars:
        return s

    cut = s[:max_chars]
    last_period = max(cut.rfind("."), cut.rfind("!"), cut.rfind("?"))

    if last_period > max_chars * 0.7:
        return s[:last_period + 1].strip()

    if " " in cut:
        cut = cut.rsplit(" ", 1)[0].rstrip()

    cut = cut.rstrip(" ,.;:!-–—")

    if cut and not cut.endswith((".", "!", "?")):
        cut += "."

    return cut


class UniversalExtractor:
    def __init__(self):
        api_key = os.getenv("MISTRAL_API_KEY")
        if not api_key:
            raise ValueError("MISTRAL_API_KEY not found in environment")
        self.client = Mistral(api_key=api_key)
        self.model = "mistral-large-latest"
        self.api_call_count = 0

    def extract(
        self, transcript: str, caption: str, lang: str, classification: Dict
    ) -> Dict:
        self.api_call_count = 0

        transcript = transcript or ""
        caption = caption or ""
        lang = (lang or "en").strip() or "en"

        content_type = classification.get("label", "general")

        effective_lang = lang
        if is_unknown_lang(lang) and caption:
            detected_caption_lang = detect_caption_language(caption)
            if detected_caption_lang != "unknown":
                effective_lang = detected_caption_lang
                logger.info(
                    "🔍 Transcript language unknown; detected caption language: %s",
                    effective_lang,
                )

        is_english_content = is_english(effective_lang) or is_unknown_lang(
            effective_lang
        )

        # CALL 1: Extract structured data (NO summary yet)
        logger.info("📞 CALL 1: Extracting structured data...")
        prompt_data = self._build_data_extraction_prompt(
            transcript, caption, effective_lang, content_type
        )
        result_data = self._call_ai(prompt_data)

        category = safe_str(result_data.get("category", "General")).strip() or "General"
        topic = safe_str(result_data.get("topic", "")).strip()

        title_en = clean_title(safe_str(result_data.get("title", "")))

        if not title_en or len(title_en) < 8:
            derived = derive_best_title_from_caption(caption)
            title_en = derived or title_en

        if not title_en:
            title_en = "Saved Content"
        title_en = clean_title(title_en) or "Saved Content"

        # Brief description for summary call
        brief_description = safe_str(result_data.get("brief_description", ""))

        # CALL 2: Generate summary (bilingual if needed)
        if is_english_content:
            logger.info("📞 CALL 2: Generating English summary...")
            prompt_summary = self._build_summary_prompt_english(
                title_en, brief_description, content_type
            )
            result_summary = self._call_ai(prompt_summary)

            summary_en_raw = clean_text(safe_str(result_summary.get("summary", "")))

            if is_caption_copy(summary_en_raw, caption):
                logger.error("🚨 AI COPIED CAPTION! Using fallback summary.")
                summary_en_raw = (
                    f"{title_en} is a {content_type} that combines simple "
                    "ingredients and straightforward techniques for a practical, "
                    "home-friendly result. Suitable for various skill levels and occasions."
                )

            summary_en = smart_truncate_summary(summary_en_raw)
            summary_og = summary_en
            title_og = title_en
        else:
            logger.info(
                "📞 CALL 2: Generating BILINGUAL summary (English + %s)...",
                effective_lang,
            )
            prompt_summary = self._build_summary_prompt_bilingual(
                title_en, brief_description, content_type, effective_lang
            )
            result_summary = self._call_ai(prompt_summary)

            summary_en_raw = clean_text(
                safe_str(result_summary.get("summary_en", ""))
            )
            summary_og_raw = clean_text(
                safe_str(result_summary.get("summary_original", ""))
            )
            title_og_raw = clean_title(
                safe_str(result_summary.get("title_original", ""))
            )

            if is_caption_copy(summary_en_raw, caption):
                logger.error("🚨 AI COPIED CAPTION in English! Using fallback.")
                summary_en_raw = (
                    f"{title_en} is a {content_type} that combines simple "
                    "ingredients and straightforward techniques for a practical, "
                    "home-friendly result."
                )

            if is_caption_copy(summary_og_raw, caption):
                logger.error(
                    "🚨 AI COPIED CAPTION in original language! Using fallback."
                )
                summary_og_raw = summary_en_raw

            summary_en = smart_truncate_summary(summary_en_raw)
            summary_og = smart_truncate_summary(summary_og_raw)
            title_og = title_og_raw or title_en

        highlights_raw = safe_list(result_data.get("highlights", []))

        ai_paragraph_en, ai_bullets_en = format_ai_summary(
            title_en=title_en,
            summary_en_raw=summary_en,
            highlights_raw=highlights_raw,
            content_type=content_type,
        )

        headlines_en = [
            {
                "headline": b["headline"],
                "text": b["description"],
                "emoji": b.get("emoji", ""),
            }
            for b in ai_bullets_en
        ]

        hashtags = safe_list(result_data.get("hashtags", []))
        hashtags = [str(t).lstrip("#").strip() for t in hashtags if str(t).strip()]
        hashtags = unique_keep_order(hashtags)

        emojis = safe_list(result_data.get("emojis", []))
        emojis = [e.strip() for e in emojis if isinstance(e, str) and e.strip()]
        emojis = unique_keep_order(emojis)
        if len(emojis) < 4:
            emojis = (emojis + ["✨", "💡", "📌", "✅"])[:4]
        emojis = emojis[:4]

        # ---------- Recipe extraction (with time, servings, and OPTIONAL groups) ----------
        recipe_obj = result_data.get("recipe", {}) if content_type == "recipe" else {}

        ingredients_en = normalize_ingredients(recipe_obj.get("ingredients", []))
        instructions_en = safe_list(recipe_obj.get("instructions", []))
        tips_en = safe_list(recipe_obj.get("tips", []))
        notes_en = safe_list(recipe_obj.get("notes", []))

        # NEW: optional ingredients_groups from AI when multiple variants exist
        ingredients_groups = safe_list(recipe_obj.get("ingredients_groups", []))

        # Meta fields
        servings = safe_str(recipe_obj.get("servings", "")).strip()
        if not servings:
            servings = safe_str(recipe_obj.get("yield", "")).strip()

        prep_time = safe_str(recipe_obj.get("prep_time", "")).strip()
        cook_time = safe_str(recipe_obj.get("cook_time", "")).strip()
        total_time = safe_str(recipe_obj.get("total_time", "")).strip()

        # ⚠️ CRITICAL FIX: If content_type is "recipe" but AI didn't extract ingredients,
        # we must still provide a recipe object (even if minimal) to keep the contract consistent.
        if content_type == "recipe" and not ingredients_en:
            logger.error(
                "🚨 RECIPE EXTRACTION FAILED: content_type='recipe' but no ingredients extracted. "
                "Falling back to empty recipe structure. Title: %s",
                title_en
            )
            # Provide minimal structure so UI doesn't see recipe=null
            ingredients_en = []
            instructions_en = instructions_en or []

        # Original-language recipe translation if needed
        ingredients_og = ingredients_en
        instructions_og = instructions_en
        tips_og = tips_en
        notes_og = notes_en
        headlines_og = headlines_en

        if not is_english_content and (ingredients_en or instructions_en):
            logger.info("🌐 Translating recipe to %s...", effective_lang)

            to_translate = {}
            if ingredients_en:
                to_translate["ingredient_names"] = [
                    ing["item"] for ing in ingredients_en
                ]
                to_translate["ingredient_units"] = [
                    ing["unit"] for ing in ingredients_en
                ]
            if instructions_en:
                to_translate["instructions"] = instructions_en
            if tips_en:
                to_translate["tips"] = tips_en
            if notes_en:
                to_translate["notes"] = notes_en
            if headlines_en:
                to_translate["headlines"] = [
                    f"{h['headline']}: {h['text']}" for h in headlines_en
                ]

            translated = self._translate_mega_batch(to_translate, effective_lang)

            ingredient_names_og = safe_list(translated.get("ingredient_names", []))
            ingredient_units_og = safe_list(translated.get("ingredient_units", []))

            if ingredient_names_og and len(ingredient_names_og) >= len(ingredients_en):
                ingredients_og = []
                metric_units = ["g", "kg", "mg", "ml", "cl", "l", "oz", "lb", "lbs"]

                for i, ing in enumerate(ingredients_en):
                    name_og = clean_text(safe_str(ingredient_names_og[i]))
                    unit_en = ing["unit"].lower().strip()

                    if unit_en in metric_units:
                        unit_og = ing["unit"]
                    elif i < len(ingredient_units_og):
                        unit_og = clean_text(safe_str(ingredient_units_og[i]))
                    else:
                        unit_og = ing["unit"]

                    ingredients_og.append(
                        {
                            "item": name_og,
                            "name": name_og,
                            "quantity": ing["quantity"],
                            "unit": unit_og,
                            "emoji": ing["emoji"],
                        }
                    )

            instructions_og_raw = safe_list(translated.get("instructions", []))
            if instructions_og_raw and len(instructions_og_raw) >= len(instructions_en):
                instructions_og = [
                    clean_text(safe_str(x)) for x in instructions_og_raw
                ]

            tips_og_raw = safe_list(translated.get("tips", []))
            if tips_og_raw and len(tips_og_raw) >= len(tips_en):
                tips_og = [clean_text(safe_str(x)) for x in tips_og_raw]

            notes_og_raw = safe_list(translated.get("notes", []))
            if notes_og_raw and len(notes_og_raw) >= len(notes_en):
                notes_og = [clean_text(safe_str(x)) for x in notes_og_raw]

            translated_headlines = safe_list(translated.get("headlines", []))
            if translated_headlines:
                _, bullets_og = format_ai_summary(
                    title_en=title_og,
                    summary_en_raw=summary_og,
                    highlights_raw=translated_headlines,
                    content_type=content_type,
                )
                headlines_og = [
                    {
                        "headline": b["headline"],
                        "text": b["description"],
                        "emoji": headlines_en[i].get("emoji", "")
                        if i < len(headlines_en)
                        else "",
                    }
                    for i, b in enumerate(bullets_og)
                ]

            logger.info("✅ Translation complete for recipe/headlines")

        # ---------- Final bilingual data objects ----------
        bilingual_summary = {
            "english": {
                "title": title_en,
                "summary": ai_paragraph_en,
                "headlines": headlines_en,
                "hashtags": hashtags,
                "emojis": [],
            },
            "original": {
                "title": title_og,
                "summary": summary_og if not is_english_content else ai_paragraph_en,
                "headlines": headlines_og,
                "hashtags": hashtags,
                "emojis": [],
            },
        }

        recipe_data = None
        # ✅ FIXED: Always create recipe_data when content_type is "recipe",
        # even if ingredients are missing (prevents recipe=null inconsistency)
        if content_type == "recipe":
            recipe_data = {
                "english": {
                    "title": title_en,
                    "servings": servings or None,
                    "prep_time": prep_time or None,
                    "cook_time": cook_time or None,
                    "total_time": total_time or None,
                    "ingredients": ingredients_en,  # may be empty, but structure exists
                    "ingredients_groups": ingredients_groups or None,
                    "instructions": instructions_en,  # may be empty
                    "tips": tips_en,
                    "notes": notes_en,
                },
                "original": {
                    "title": title_og,
                    "servings": servings or None,
                    "prep_time": prep_time or None,
                    "cook_time": cook_time or None,
                    "total_time": total_time or None,
                    "ingredients": ingredients_og,
                    # We keep group titles/items as‑is; they usually come from caption in original language.
                    "ingredients_groups": ingredients_groups or None,
                    "instructions": instructions_og,
                    "tips": tips_og,
                    "notes": notes_og,
                },
            }

        headlines_flat = [f"{h['headline']}: {h['text']}" for h in headlines_en]

        logger.info("✅ Content extracted with %d API calls", self.api_call_count)

        return {
            "content_type": content_type,
            "extractor_version": EXTRACTOR_VERSION,
            "category": category,
            "topic": topic,
            "title": title_en,
            "summary_title": title_en,
            "summary_text": bilingual_summary,
            "summary_bullets": json.dumps(headlines_flat, ensure_ascii=False),
            "summary_hashtags": hashtags,
            "summary_emojis": emojis,
            "summary": bilingual_summary,
            "headlines": headlines_en,
            "hashtags": hashtags,
            "emojis": emojis,
            "recipe": json.dumps(recipe_data, ensure_ascii=False)
            if recipe_data
            else None,
            "workout": None,
        }

    def _build_data_extraction_prompt(
        self, transcript: str, caption: str, lang: str, content_type: str
    ) -> str:
        """CALL 1: Extract structured data only (no summary)"""
        type_specific = ""

        if content_type == "recipe":
            # NOTE: ingredients_groups is key for cases like two plaque sizes in one caption.
            type_specific = f"""
7. **recipe** object:
   - **servings**: number of people or portions (infer from caption or typical yield if not explicit, e.g. 8–12 for a large cake)
   - **prep_time**: human-readable estimate like "25 min" or "15 min" for all preparation and mixing, even if not explicitly given
   - **cook_time**: human-readable estimate like "45 min" or "2h", based on baking / cooking / resting in heat
   - **total_time**: optional human-readable total including prep + cook + resting (e.g. "1h 10min")
   - **ingredients**: array with item, quantity, unit, emoji (required fields). Use the DEFAULT / FIRST variant if there are several sizes.
   - **ingredients_groups** (optional but IMPORTANT when caption lists several sizes / variants):
       * If the caption gives ingredient lists for different pan sizes (e.g. "Pour une plaque 25 x 30 cm :" and "Pour une plaque 30 x 40 cm :"), create one entry per variant:
         - "title": section header text EXACTLY as in the caption (any language)
         - "items": full ingredient array for that variant (item, quantity, unit, emoji)
       * Quantities must match that variant (e.g. for "55 g + 40 g de sucre", use the TOTAL like "95 g sugar").
       * If there is only one variant, you may omit ingredients_groups.
   - **instructions**: 6-12 clear steps
   - **tips**: optional helpful tips
   - **notes**: optional important notes

If the caption/transcript does not clearly specify times or servings, use your best expert estimate based on similar recipes. Always fill **servings**, **prep_time** and **cook_time** with realistic values.
"""

        return f"""Extract structured data from this {content_type} content. Output ONLY valid JSON.

LANGUAGE: {lang}

TRANSCRIPT:
{transcript[:3500]}

CAPTION:
{caption[:6000]}

EXTRACT:

1. **category**: English category (e.g., "Food", "Fitness", "Beauty")

2. **topic**: English topic (e.g., "Pumpkin Bars", "HIIT Workout")

3. **title**: Precise English title, <= {TITLE_MAX_CHARS} chars, NO emojis

4. **brief_description**: ONE sentence (max 80 chars) describing what this is
   Example: "A hybrid dessert combining cookie and chocolate fondant"

5. **highlights**: array of EXACTLY 4 objects with these fields:
   - "emoji": ONE relevant emoji (required)
   - "headline": 3-5 word title (NO emojis in text)
   - "description": One sentence (NO emojis in text)

6. **hashtags**: 5-10 keywords WITHOUT '#'

7. **emojis**: 4 relevant emojis

{type_specific}

Return JSON with these fields only. Do NOT include summary field.
"""

    def _build_summary_prompt_english(
        self, title: str, brief_desc: str, content_type: str
    ) -> str:
        """CALL 2: Generate English-only summary"""

        if content_type == "recipe":
            guidelines = """
Write about:
- WHAT the dish is (not HOW to make it)
- Who it's for (families, chocolate lovers, etc.)
- Key characteristics (one-pot, quick, no-bake, etc.)
- What makes it special or different

DO NOT write about:
- Textures (chewy, crisp, gooey, molten, etc.)
- Cooking methods or steps
- Ingredient quantities
"""
        else:
            guidelines = """
Write about:
- WHAT the content teaches or shows
- Who it's useful for
- Practical benefits or applications
- When/why someone would use this
"""

        return f"""Write a factual summary paragraph for this {content_type}.

TITLE: {title}

BRIEF DESCRIPTION: {brief_desc}

REQUIREMENTS:
- Length: 250-{SUMMARY_MAX_CHARS} characters (2-3 complete sentences)
- Style: Simple, factual, informative (like Wikipedia intro)
- NO emojis, NO marketing language, NO flowery adjectives
- NO texture descriptions (chewy, crisp, gooey, velvety, etc.)
- Write in your own words - do NOT copy phrases from the input

{guidelines}

GOOD EXAMPLE:
"A one-pot chicken stew with leeks, potatoes, peas, and curry. The dish is naturally creamy from the potatoes, family-friendly, and requires minimal cleanup while delivering tender chicken and mild vegetable flavors that appeal to both adults and children."

Output ONLY valid JSON with one field:
{{"summary": "your summary text here"}}
"""

    def _build_summary_prompt_bilingual(
        self, title: str, brief_desc: str, content_type: str, original_lang: str
    ) -> str:
        """CALL 2: Generate bilingual summary (English + original language)"""

        lang_name_map = {
            "fr": "French",
            "es": "Spanish",
            "de": "German",
            "it": "Italian",
            "pt": "Portuguese",
            "ar": "Arabic",
            "ru": "Russian",
            "ja": "Japanese",
            "zh": "Chinese",
            "ko": "Korean",
        }
        lang_name = lang_name_map.get(original_lang, original_lang.upper())

        if content_type == "recipe":
            guidelines = """
Write about:
- WHAT the dish is (not HOW to make it)
- Who it's for (families, chocolate lovers, etc.)
- Key characteristics (one-pot, quick, no-bake, etc.)
- What makes it special or different

DO NOT write about:
- Textures (chewy, crisp, gooey, molten, etc.)
- Cooking methods or steps
- Ingredient quantities
"""
        else:
            guidelines = """
Write about:
- WHAT the content teaches or shows
- Who it's useful for
- Practical benefits or applications
- When/why someone would use this
"""

        return f"""Write TWO summary paragraphs for this {content_type}: one in English, one in {lang_name}.

TITLE (English): {title}

BRIEF DESCRIPTION: {brief_desc}

REQUIREMENTS:
- Length: 250-{SUMMARY_MAX_CHARS} characters EACH (2-3 complete sentences)
- Style: Simple, factual, informative (like Wikipedia intro)
- NO emojis, NO marketing language, NO flowery adjectives
- NO texture descriptions (chewy, crisp, gooey, velvety, etc.)
- Write ORIGINAL text in both languages - do NOT copy from input
- Translate the title to {lang_name} as well

{guidelines}

GOOD EXAMPLE (English):
"A one-pot chicken stew with leeks, potatoes, peas, and curry. The dish is naturally creamy from the potatoes, family-friendly, and requires minimal cleanup while delivering tender chicken and mild vegetable flavors that appeal to both adults and children."

Output ONLY valid JSON with three fields:
{{
  "summary_en": "English summary here (250-{SUMMARY_MAX_CHARS} chars)",
  "summary_original": "{lang_name} summary here (250-{SUMMARY_MAX_CHARS} chars)",
  "title_original": "{lang_name} title here (<= {TITLE_MAX_CHARS} chars)"
}}
"""

    def _call_ai(self, prompt: str, max_retries: int = 2) -> Dict:
        for attempt in range(max_retries + 1):
            try:
                logger.info(
                    "🤖 Calling Mistral API (attempt %d/%d)...",
                    attempt + 1,
                    max_retries + 1,
                )
                self.api_call_count += 1

                response = self.client.chat.complete(
                    model=self.model,
                    messages=[
                        {
                            "role": "system",
                            "content": (
                                "You are a content analysis expert. Generate ORIGINAL text. "
                                "NEVER copy from input. Output only valid JSON."
                            ),
                        },
                        {"role": "user", "content": prompt},
                    ],
                    response_format={"type": "json_object"},
                    temperature=0.1,
                )
                content = response.choices[0].message.content
                return json.loads(content)
            except Exception as e:
                logger.error(
                    "❌ AI call failed (attempt %s): %s", attempt + 1, e
                )
                if attempt == max_retries:
                    raise
        raise ValueError("AI call failed after retries")

    def _translate_mega_batch(self, data: Dict, target_lang: str) -> Dict:
        fields_to_translate = []
        if "ingredient_names" in data:
            fields_to_translate.append(
                '"ingredient_names": ["translated ingredient 1", "translated ingredient 2", ...]'
            )
        if "ingredient_units" in data:
            fields_to_translate.append(
                '"ingredient_units": ["translated unit 1", "translated unit 2", ...]'
            )
        if "instructions" in data:
            fields_to_translate.append(
                '"instructions": ["translated instruction 1", "translated instruction 2", ...]'
            )
        if "tips" in data:
            fields_to_translate.append(
                '"tips": ["translated tip 1", "translated tip 2", ...]'
            )
        if "notes" in data:
            fields_to_translate.append(
                '"notes": ["translated note 1", "translated note 2", ...]'
            )
        if "headlines" in data:
            fields_to_translate.append(
                '"headlines": ["translated headline 1", "translated headline 2", ...]'
            )

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
- For units: keep metric symbols (g, ml, kg) unchanged, translate word units (leaf → feuille, pinch → pincée)
- Do NOT add emojis
"""

        self.api_call_count += 1
        logger.info("🌐 Translating to %s in ONE batch call...", target_lang)

        response = self.client.chat.complete(
            model=self.model,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You output only valid JSON. Translate accurately while "
                        "preserving structure. Keep metric units (g, ml, kg) unchanged."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            response_format={"type": "json_object"},
            temperature=0.1,
        )

        result = json.loads(response.choices[0].message.content)

        return {
            "ingredient_names": safe_list(result.get("ingredient_names", [])),
            "ingredient_units": safe_list(
                result.get("ingredient_units", [])
            ),
            "instructions": safe_list(result.get("instructions", [])),
            "tips": safe_list(result.get("tips", [])),
            "notes": safe_list(result.get("notes", [])),
            "headlines": safe_list(result.get("headlines", [])),
        }

    def fallback(self, caption: str, classification: Dict) -> Dict:
        title = derive_best_title_from_caption(caption) or (
            caption.split("\n")[0] if caption else "Saved Content"
        ).strip()
        title = clean_title(title) or "Saved Content"

        fallback_paragraph, fallback_bullets = format_ai_summary(
            title_en=title,
            summary_en_raw=(caption[:500] if caption else ""),
            highlights_raw=[],
            content_type="general",
        )
        headlines = [
            {
                "headline": b["headline"],
                "text": b["description"],
                "emoji": "",
            }
            for b in fallback_bullets
        ]
        headlines_flat = [f"{h['headline']}: {h['text']}" for h in headlines]

        bilingual_summary = {
            "english": {
                "title": title,
                "summary": fallback_paragraph,
                "headlines": headlines,
                "hashtags": [],
                "emojis": [],
            },
            "original": {
                "title": title,
                "summary": fallback_paragraph,
                "headlines": headlines,
                "hashtags": [],
                "emojis": [],
            },
        }

        return {
            "content_type": "general",
            "extractor_version": EXTRACTOR_VERSION,
            "category": "General",
            "topic": "",
            "title": title,
            "summary_title": title,
            "summary_text": bilingual_summary,
            "summary_bullets": json.dumps(
                headlines_flat, ensure_ascii=False
            ),
            "summary_hashtags": [],
            "summary_emojis": [],
            "summary": bilingual_summary,
            "headlines": headlines,
            "hashtags": [],
            "emojis": [],
            "recipe": None,
            "workout": None,
        }
