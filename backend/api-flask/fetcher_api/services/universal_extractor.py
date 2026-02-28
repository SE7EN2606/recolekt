# fetcher_api/services/universal_extractor.py
"""
Universal Content Extractor - BILINGUAL TWO-CALL approach
Call 1: Extract structured data (title, recipe/guide, hashtags, location, etc.)
Call 2: Generate summary in BOTH English AND original language + translations (no Call 3)
"""

import os
import json
import logging
import requests
import re
from typing import Dict

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
from fetcher_api.services.usage_tracker import record_call

logger = logging.getLogger(__name__)

EXTRACTOR_VERSION = "universal-v15-guides"
MISTRAL_API_URL = "https://api.mistral.ai/v1/chat/completions"


def smart_truncate_summary(text: str, max_chars: int = 600) -> str:
    """Truncate summary intelligently while preserving paragraph formatting."""
    s = strip_emoji(text or "").strip()
    if len(s) <= max_chars:
        return s

    cut = s[:max_chars]
    # Find last space to avoid cutting mid-word
    if " " in cut:
        cut = cut.rsplit(" ", 1)[0].rstrip()
    
    cut = cut.rstrip(" ,.;:!-–—")
    if cut and not cut.endswith((".", "!", "?")):
        cut += "..."

    return cut


class UniversalExtractor:
    def __init__(self):
        api_key = os.getenv("MISTRAL_API_KEY")
        if not api_key:
            raise ValueError("MISTRAL_API_KEY not found in environment")

        logger.info("🔑 Mistral HTTP ready: %s...", api_key[:12])

        self.api_key = api_key
        self.model = "mistral-small-latest"
        self.api_call_count = 0

    def extract(
        self, transcript: str, caption: str, lang: str, classification: Dict
    ) -> Dict:

        logger.info("🔍 UniversalExtractor.extract() called!")
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

        is_english_content = is_english(effective_lang) or is_unknown_lang(effective_lang)

        # ── CALL 1: Extract structured data ──
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

        brief_description = safe_str(result_data.get("brief_description", ""))

        highlights_raw = safe_list(result_data.get("highlights", []))
        
        # ---------- Extract Location (NEW) ----------
        location_obj = result_data.get("location", None)

        # ---------- Extract guide/recipe fields from Call 1 ----------
        recipe_obj = result_data.get("recipe", {})

        ingredients_en = normalize_ingredients(recipe_obj.get("ingredients", []))
        instructions_en = safe_list(recipe_obj.get("instructions", []))
        tips_en = safe_list(recipe_obj.get("tips", []))
        notes_en = safe_list(recipe_obj.get("notes", []))

        servings = safe_str(recipe_obj.get("servings", "")).strip() or safe_str(recipe_obj.get("yield", "")).strip()
        prep_time = safe_str(recipe_obj.get("prep_time", "")).strip()
        cook_time = safe_str(recipe_obj.get("cook_time", "")).strip()
        total_time = safe_str(recipe_obj.get("total_time", "")).strip()

        # ── CALL 2: Generate summary (+ translations if non-English) ──
        if is_english_content:
            logger.info("📞 CALL 2: Generating English summary...")
            prompt_summary = self._build_summary_prompt_english(
                title_en, brief_description, content_type
            )
            result_summary = self._call_ai(prompt_summary)

            summary_en_raw = safe_str(result_summary.get("summary", ""))

            if is_caption_copy(summary_en_raw, caption):
                logger.error("🚨 AI COPIED CAPTION! Using fallback summary.")
                summary_en_raw = (
                    f"{title_en} is a practical {content_type} guide that provides "
                    "clear steps and requirements for an easy-to-follow result.\n\n"
                    "Suitable for various skill levels and highly recommended."
                )

            summary_en = smart_truncate_summary(summary_en_raw)
            summary_og = summary_en
            title_og = title_en

            ingredients_og = ingredients_en
            instructions_og = instructions_en
            tips_og = tips_en
            notes_og = notes_en

        else:
            logger.info(
                "📞 CALL 2: Generating BILINGUAL summary + translations (English + %s)...",
                effective_lang,
            )
            prompt_summary = self._build_summary_prompt_bilingual(
                title_en, brief_description, content_type, effective_lang,
                highlights=highlights_raw,
                ingredients=ingredients_en if ingredients_en else None,
                instructions=instructions_en if instructions_en else None,
                tips=tips_en if tips_en else None,
                notes=notes_en if notes_en else None,
            )
            result_summary = self._call_ai(prompt_summary)

            summary_en_raw = safe_str(result_summary.get("summary_en", ""))
            summary_og_raw = safe_str(result_summary.get("summary_original", ""))
            title_og_raw = clean_title(safe_str(result_summary.get("title_original", "")))

            if is_caption_copy(summary_en_raw, caption):
                logger.error("🚨 AI COPIED CAPTION in English! Using fallback.")
                summary_en_raw = (
                    f"{title_en} is a practical {content_type} guide that provides "
                    "clear steps and requirements for an easy-to-follow result.\n\n"
                    "Suitable for various skill levels and highly recommended."
                )

            if is_caption_copy(summary_og_raw, caption):
                logger.error("🚨 AI COPIED CAPTION in original language! Using fallback.")
                summary_og_raw = summary_en_raw

            summary_en = smart_truncate_summary(summary_en_raw)
            summary_og = smart_truncate_summary(summary_og_raw)
            title_og = title_og_raw or title_en

            translated = result_summary

            ingredient_names_og = safe_list(translated.get("ingredient_names", []))
            ingredient_units_og = safe_list(translated.get("ingredient_units", []))

            ingredients_og = ingredients_en
            instructions_og = instructions_en
            tips_og = tips_en
            notes_og = notes_en

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

                    ingredients_og.append({
                        "item": name_og,
                        "name": name_og,
                        "quantity": ing["quantity"],
                        "unit": unit_og,
                        "emoji": ing["emoji"],
                    })

            instructions_og_raw = safe_list(translated.get("instructions", []))
            if instructions_og_raw and len(instructions_og_raw) >= len(instructions_en):
                instructions_og = [clean_text(safe_str(x)) for x in instructions_og_raw]

            tips_og_raw = safe_list(translated.get("tips", []))
            if tips_og_raw and len(tips_og_raw) >= len(tips_en):
                tips_og = [clean_text(safe_str(x)) for x in tips_og_raw]

            notes_og_raw = safe_list(translated.get("notes", []))
            if notes_og_raw and len(notes_og_raw) >= len(notes_en):
                notes_og = [clean_text(safe_str(x)) for x in notes_og_raw]

        # ---------- Build English headlines ----------
        _, ai_bullets_en = format_ai_summary(
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

        # ---------- Translate headlines ----------
        headlines_og = headlines_en
        if not is_english_content:
            translated_headlines = safe_list(result_summary.get("headlines", []))
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
                        "emoji": headlines_en[i].get("emoji", "") if i < len(headlines_en) else "",
                    }
                    for i, b in enumerate(bullets_og)
                ]

        # 🔥 FIX: GUARDRAIL POUR LES HASHTAGS ET DÉDUPLICATION
        hashtags_raw = safe_list(result_data.get("hashtags", []))
        hashtags_clean = [str(t).lstrip("#").strip() for t in hashtags_raw if str(t).strip()]
        
        # Extraction des hashtags existants dans la légende
        caption_lower = caption.lower()
        caption_tags = set(re.findall(r"#(\w+)", caption_lower))
        
        filtered_tags = []
        for t in hashtags_clean:
            t_lower = t.lower()
            if t_lower not in caption_tags and t_lower not in [f.lower() for f in filtered_tags]:
                filtered_tags.append(t)
        
        # On limite strictement à 5 hashtags
        hashtags = filtered_tags[:5]

        # ---------- Emojis ----------
        emojis = safe_list(result_data.get("emojis", []))
        emojis = [e.strip() for e in emojis if isinstance(e, str) and e.strip()]
        emojis = unique_keep_order(emojis)
        if len(emojis) < 4:
            emojis = (emojis + ["✨", "💡", "📌", "✅"])[:4]
        emojis = emojis[:4]

        bilingual_summary = {
            "english": {
                "title": title_en,
                "summary": summary_en, 
                "headlines": headlines_en,
                "hashtags": hashtags,
                "emojis": emojis,
            },
            "original": {
                "title": title_og,
                "summary": summary_og if not is_english_content else summary_en, 
                "headlines": headlines_og,
                "hashtags": hashtags,
                "emojis": emojis,
            },
        }

        recipe_data = None
        if ingredients_en or instructions_en:
            recipe_data = {
                "english": {
                    "title": title_en,
                    "servings": servings or None,
                    "prep_time": prep_time or None,
                    "cook_time": cook_time or None,
                    "total_time": total_time or None,
                    "ingredients": ingredients_en,
                    "instructions": instructions_en,
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
                    "instructions": instructions_og,
                    "tips": tips_og,
                    "notes": notes_og,
                },
            }

        return {
            "content_type": content_type,
            "extractor_version": EXTRACTOR_VERSION,
            "category": category,
            "topic": topic,
            "title": title_en,
            "summary": bilingual_summary,
            "hashtags": hashtags,
            "emojis": emojis,
            "recipe": json.dumps(recipe_data, ensure_ascii=False) if recipe_data else None,
            "location": location_obj,  # ✅ ADDED FOR THE FUTURE MAP FEATURE
            "workout": None,
            "detected_language": effective_lang,
        }

    def _build_data_extraction_prompt(
        self, transcript: str, caption: str, lang: str, content_type: str
    ) -> str:
        
        type_specific = f"""
7. **recipe** object: ONLY CREATE THIS OBJECT IF the content is an ACTUAL RECIPE TUTORIAL teaching how to make a dish at home. 
   🚨 DO NOT create a recipe if the video is just a restaurant review, a food tasting, or visiting a shop.
   If it IS a valid home recipe, include:
   - **servings**: Yield
   - **prep_time**: Setup time
   - **cook_time**: Active time
   - **total_time**: Total duration
   - **ingredients**: ARRAY OF OBJECTS. Each must have: "item", "quantity", "unit", "emoji". Never return strings.
   - **instructions**: Detailed, actionable steps (minimum 6).
   - **tips**: Extract specific chef secrets or nuances.
   - **notes**: Important context.

8. **location** object: ONLY CREATE THIS OBJECT IF the video is about visiting a specific restaurant, shop, hotel, city, or physical place.
   - **name**: Name of the place (e.g. "L'Antico Vinaio")
   - **city**: City or region mentioned (e.g. "Paris")
   - **type**: Type of place (e.g. "Sandwich Shop", "Restaurant", "Hotel")
"""

        return f"""Extract structured data from this {content_type} content. Output ONLY valid JSON.
        
        CRITICAL: Identify the specific unique value of the content. Avoid generic descriptions.
        If it's a cooking technique, explain the technique in the highlights.

        LANGUAGE: {lang}

        TRANSCRIPT:
        {transcript[:3500]}

        CAPTION:
        {caption[:6000]}

        EXTRACT:

        1. **category**: Generate a highly specific, smart 1-2 word category perfectly tailored to the content. DO NOT USE "&" or "and". NEVER output "Food & Drink". Examples: "Gourmet Cooking", "Baking", "Skincare", "Woodworking", "Fitness", "Nutrition", "Travel".

        2. **topic**: 2-3 word English topic (e.g., "Pumpkin Bars", "HIIT Workout", "Stain Removal")

        3. **title**: Precise English title, <= {TITLE_MAX_CHARS} chars, NO emojis

        4. **brief_description**: ONE sentence (max 80 chars) describing what this is

        5. **highlights**: array of EXACTLY 4 objects:
           - "emoji": ONE relevant emoji
           - "headline": 3-5 word title (NO emojis in text)
           - "description": One sentence (NO emojis in text). Capture SPECIFIC details, not generic fluff.

        6. **hashtags**: Generate up to 5 highly relevant keywords WITHOUT '#'. 🚨 DO NOT repeat any hashtags that are already used in the CAPTION.

        7. **emojis**: array of 4 relevant emojis for this content type.

        {type_specific}

        Return JSON with these fields only. Do NOT include summary field.
        """

    def _build_summary_prompt_english(
        self, title: str, brief_desc: str, content_type: str
    ) -> str:
        return f"""Write a factual summary paragraph for this content.

TITLE: {title}
BRIEF DESCRIPTION: {brief_desc}

REQUIREMENTS:
- Length: EXACTLY 250 to 450 characters.
- Format: Write EXACTLY 2 paragraphs. Use a newline (\\n\\n) to separate them.
- Style: Simple, factual, informative (like Wikipedia intro)
- NO FLUFF: NEVER use phrases like "This video is about", "This content provides", "Here is a guide", or "In this clip". Start directly with the core subject. Dive straight to the point.
- Write about: WHAT the content teaches/shows, WHO it's useful for, and PRACTICAL benefits.
- NO emojis, NO marketing language, NO flowery adjectives
- Do NOT write out the step-by-step instructions (keep it high level)
- Write in your own words - do NOT copy phrases from the input

Output ONLY valid JSON with one field:
{{"summary": "your summary text here"}}
"""

    def _build_summary_prompt_bilingual(
        self,
        title: str,
        brief_desc: str,
        content_type: str,
        original_lang: str,
        highlights: list = None,
        ingredients: list = None,
        instructions: list = None,
        tips: list = None,
        notes: list = None,
    ) -> str:
        lang_name_map = {
            "fr": "French", "es": "Spanish", "de": "German", "it": "Italian",
            "pt": "Portuguese", "ar": "Arabic", "ru": "Russian", "ja": "Japanese",
            "zh": "Chinese", "ko": "Korean",
        }
        lang_name = lang_name_map.get(original_lang, original_lang.upper())

        # ── Build optional translation block ──
        translation_input = ""
        translation_output_fields = []

        if highlights:
            # We only need to translate the text content, strip emojis to save tokens
            hl_text = [{"headline": h.get("headline", ""), "description": h.get("description", "")} for h in highlights]
            translation_input += f'\n"headlines_en": {json.dumps(hl_text, ensure_ascii=False)}'
            translation_output_fields.append('"headlines": [{"headline": "translated headline", "description": "translated description"}]')

        if ingredients:
            names = [i["item"] for i in ingredients]
            units = [i["unit"] for i in ingredients]
            translation_input += f'\n"ingredient_names_en": {json.dumps(names, ensure_ascii=False)}'
            translation_input += f'\n"ingredient_units_en": {json.dumps(units, ensure_ascii=False)}'
            translation_output_fields.append('"ingredient_names": ["translated name 1", ...]')
            translation_output_fields.append('"ingredient_units": ["translated unit 1", ...]')

        if instructions:
            translation_input += f'\n"instructions_en": {json.dumps(instructions, ensure_ascii=False)}'
            translation_output_fields.append('"instructions": ["translated step 1", ...]')

        if tips:
            translation_input += f'\n"tips_en": {json.dumps(tips, ensure_ascii=False)}'
            translation_output_fields.append('"tips": ["translated tip 1", ...]')

        if notes:
            translation_input += f'\n"notes_en": {json.dumps(notes, ensure_ascii=False)}'
            translation_output_fields.append('"notes": ["translated note 1", ...]')

        has_translation = bool(translation_input)

        translation_section = ""
        if has_translation:
            extra_fields = ",\n  ".join(translation_output_fields)
            translation_section = f"""
CONTENT TO TRANSLATE TO {lang_name.upper()}:
{translation_input}

Also include these translated fields in your JSON output exactly matching the structure of the input arrays:
  {extra_fields}
"""

        extra_json_fields = ""
        if has_translation:
            extra_json_fields = ",\n  " + ",\n  ".join(translation_output_fields)

        return f"""Write TWO summary paragraphs for this content: one in English, one in {lang_name}.

TITLE (English): {title}
BRIEF DESCRIPTION: {brief_desc}
{translation_section}
REQUIREMENTS:
- Summary length: EXACTLY 250 to 450 characters EACH.
- Format: Write EXACTLY 2 paragraphs per language. Use a newline (\\n\\n) to separate them.
- Style: Simple, factual, informative (like Wikipedia intro)
- NO FLUFF: NEVER use phrases like "This video is about", "This content provides", "Here is a guide", or "In this clip". Start directly with the core subject. Dive straight to the point.
- Write about: WHAT the content teaches/shows, WHO it's useful for, and PRACTICAL benefits.
- NO emojis, NO marketing language, NO flowery adjectives
- Write ORIGINAL text in both languages - do NOT copy from input
- Translate the title to {lang_name} as well
- For translations: preserve meaning accurately, keep metric units (g, kg, ml, etc.) unchanged

Output ONLY valid JSON:
{{
  "summary_en": "English summary here\\n\\nSecond paragraph here",
  "summary_original": "{lang_name} summary here\\n\\nSecond paragraph here",
  "title_original": "{lang_name} title here"{extra_json_fields}
}}
"""

    def _call_ai(self, prompt: str, max_retries: int = 2) -> Dict:
        """✅ Pure HTTP call - no Mistral SDK dependency."""
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": self.model,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "You are a content analysis expert. Generate ORIGINAL text. "
                        "NEVER copy from input. Output only valid JSON."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            "response_format": {"type": "json_object"},
            "temperature": 0.1,
        }

        for attempt in range(max_retries + 1):
            try:
                logger.info("🤖 Calling Mistral HTTP (attempt %d/%d)...", attempt + 1, max_retries + 1)
                self.api_call_count += 1

                resp = requests.post(MISTRAL_API_URL, headers=headers, json=payload, timeout=30)
                resp.raise_for_status()

                raw = resp.json()["choices"][0]["message"]["content"]
                content = json.loads(raw)

                # Track successful call
                record_call(prompt_len=len(prompt), response_len=len(raw))

                return content

            except Exception as e:
                logger.error("❌ HTTP Mistral failed (attempt %d): %s", attempt + 1, e)

                # Track failed call
                record_call(prompt_len=len(prompt), response_len=0, error=True)

                if attempt == max_retries:
                    raise

        raise ValueError("Mistral HTTP call failed after retries")

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
            "summary": bilingual_summary,
            "hashtags": [],
            "emojis": [],
            "recipe": None,
            "workout": None,
            "detected_language": "unknown",
        }
