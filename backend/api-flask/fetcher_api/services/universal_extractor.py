# fetcher_api/services/universal_extractor.py

"""
Universal Content Extractor - ONE extractor for ALL content types
Makes 1-2 API calls MAX (optimized batch translations)
"""

import os
import json
import re
import logging
from typing import Dict, List, Any, Optional

from mistralai import Mistral
from fetcher_api.services.emoji_mapper import infer_ingredient_emoji

logger = logging.getLogger(__name__)

EXTRACTOR_VERSION = "universal-v4-fixed-all-bugs"


def _is_english(lang: str) -> bool:
    return (lang or "").strip().lower() in {"en", "eng", "english"}


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


def _clean_title(title: str) -> str:
    title = (title or "").strip()
    title = re.sub(r"\s+", " ", title)
    if len(title) > 90:
        title = title[:90].rsplit(" ", 1)[0]
    return title.strip()


def _strip_emoji_from_text(text: str) -> str:
    """Remove all emoji characters and special symbols from text"""
    # More comprehensive emoji pattern
    emoji_pattern = re.compile(
        "["
        "\U0001F1E0-\U0001F1FF"  # flags (iOS)
        "\U0001F300-\U0001F5FF"  # symbols & pictographs
        "\U0001F600-\U0001F64F"  # emoticons
        "\U0001F680-\U0001F6FF"  # transport & map symbols
        "\U0001F700-\U0001F77F"  # alchemical symbols
        "\U0001F780-\U0001F7FF"  # Geometric Shapes Extended
        "\U0001F800-\U0001F8FF"  # Supplemental Arrows-C
        "\U0001F900-\U0001F9FF"  # Supplemental Symbols and Pictographs
        "\U0001FA00-\U0001FA6F"  # Chess Symbols
        "\U0001FA70-\U0001FAFF"  # Symbols and Pictographs Extended-A
        "\U00002702-\U000027B0"  # Dingbats
        "\U000024C2-\U0001F251"
        "\U0001F004"              # Mahjong
        "\U0001F0CF"              # Playing card
        "\U0001F18E"
        "\U00003030"
        "\U00002B50"              # Star
        "\U00002705"              # Check mark
        "\U0000203C"
        "\U00002049"
        "\U000025AA-\U000025AB"
        "\U000025B6"
        "\U000025C0"
        "\U000025FB-\U000025FE"
        "\U00002600-\U00002604"
        "\U0000260E"
        "\U00002611"
        "\U00002614-\U00002615"
        "\U0000261D"
        "\U0000263A"
        "\U00002648-\U00002653"
        "\U00002660-\U00002668"
        "\U0000267B"
        "\U0000267F"
        "\U00002692-\U00002697"
        "\U00002699"
        "\U000026A1"
        "\U000026AA-\U000026AB"
        "\U000026B0-\U000026B1"
        "\U000026BD-\U000026BE"
        "\U000026C4-\U000026C5"
        "\U000026CE"
        "\U000026D4"
        "\U000026EA"
        "\U000026F2-\U000026F3"
        "\U000026F5"
        "\U000026FA"
        "\U000026FD"
        "\U00002934-\U00002935"
        "\U00002B05-\U00002B07"
        "\U00002B1B-\U00002B1C"
        "\U00002B50"
        "\U00002B55"
        "\U00003297"
        "\U00003299"
        "]+",
        flags=re.UNICODE
    )
    text = emoji_pattern.sub('', text)
    
    # Also remove common emoji-like characters
    text = re.sub(r'[—–•·●○◦▪▫►▻◄◅△▲▴▵▿▾▼▽]', '', text)
    
    return text.strip()


def _clean_headline(text: str) -> str:
    text = (text or "").strip()
    text = re.sub(r"^[•·●○◦▪▫-]\s*", "", text)
    text = re.sub(r"\s+", " ", text)
    return _strip_emoji_from_text(text)


def _normalize_ingredients(ings: Any) -> List[Dict[str, str]]:
    """Normalize ingredients and add emojis"""
    if not isinstance(ings, list):
        return []

    out: List[Dict[str, str]] = []
    for ing in ings:
        if isinstance(ing, str):
            body = _strip_emoji_from_text(ing)
            emoji = infer_ingredient_emoji(body)
            out.append({
                "item": body,
                "name": body,
                "quantity": "",
                "unit": "",
                "emoji": emoji,
            })
            continue

        if isinstance(ing, dict):
            item = _strip_emoji_from_text(_safe_str(ing.get("item") or ing.get("name") or ""))
            qty = _strip_emoji_from_text(_safe_str(ing.get("quantity") or ""))
            unit = _strip_emoji_from_text(_safe_str(ing.get("unit") or ""))
            
            emoji = infer_ingredient_emoji(item)
            
            out.append({
                "item": item,
                "name": item,
                "quantity": qty,
                "unit": unit,
                "emoji": emoji,
            })

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
        lang = lang or "en"
        
        content_type = classification.get("label", "general")

        # CALL 1: Extract EVERYTHING in English
        prompt = self._build_universal_prompt(transcript, caption, lang, content_type)
        result = self._call_ai(prompt)

        # Extract common fields
        category = _safe_str(result.get("category", "General")).strip() or "General"
        topic = _safe_str(result.get("topic", "")).strip()
        
        title_en = _clean_title(_safe_str(result.get("title", "")))
        if not title_en:
            caption_first_line = (caption.split("\n")[0] if caption else "").strip()
            title_en = _clean_title(caption_first_line) or "Saved Content"

        summary_en = _safe_str(result.get("summary", "")).strip()
        if len(summary_en) < 50:
            summary_en = f"{title_en} with detailed step-by-step guidance."

        # Extract highlights
        highlights_raw = _safe_list(result.get("highlights", []))
        headlines_en = self._format_highlights(highlights_raw)
        while len(headlines_en) < 4:
            headlines_en.append({"headline": "Key Point", "text": "Additional insight"})
        headlines_en = headlines_en[:4]

        # Extract emojis and hashtags
        emojis = _safe_list(result.get("emojis", []))
        emojis = [e.strip() for e in emojis if isinstance(e, str) and e.strip()]
        emojis = _unique_keep_order(emojis)
        if len(emojis) < 4:
            emojis = (emojis + ["✨", "🔥", "💫", "🎯"])[:4]
        emojis = emojis[:4]

        hashtags = _safe_list(result.get("hashtags", []))
        hashtags = [str(t).lstrip("#").strip() for t in hashtags if str(t).strip()]
        hashtags = _unique_keep_order(hashtags)

        # Extract recipe data (if recipe)
        recipe_obj = result.get("recipe", {}) if content_type == "recipe" else {}
        ingredients_en = _normalize_ingredients(recipe_obj.get("ingredients", []))
        instructions_en = _safe_list(recipe_obj.get("instructions", []))
        tips_en = _safe_list(recipe_obj.get("tips", []))
        notes_en = _safe_list(recipe_obj.get("notes", []))

        # INITIALIZE original language variables (default to English)
        title_og = title_en
        summary_og = summary_en
        headlines_og = headlines_en
        ingredients_og = ingredients_en
        instructions_og = instructions_en
        tips_og = tips_en
        notes_og = notes_en

        # CALL 2 (only if NOT English): Translate EVERYTHING
        if not _is_english(lang):
            logger.info("🌐 Detected non-English content (lang=%s), starting translation...", lang)
            
            # Build translation batch
            to_translate = {
                "title": title_en,
                "summary": summary_en,
                "headlines": [f"{h['headline']}: {h['text']}" for h in headlines_en]
            }
            
            # Add recipe data if exists
            if ingredients_en:
                to_translate["ingredient_names"] = [ing["item"] for ing in ingredients_en]
            if instructions_en:
                to_translate["instructions"] = instructions_en
            
            # Translate everything in ONE call
            translated = self._translate_mega_batch(to_translate, lang)
            
            # APPLY TRANSLATIONS (override original variables)
            title_translated = _clean_title(translated.get("title", ""))
            summary_translated = translated.get("summary", "").strip()

            # Validate: Only use translation if it's actually different from English
            title_og = title_translated if title_translated and title_translated != title_en else title_en
            summary_og = summary_translated if summary_translated and summary_translated != summary_en else summary_en

            # If translation failed, log warning
            if title_og == title_en or summary_og == summary_en:
                logger.warning("⚠️ Translation incomplete: title_match=%s, summary_match=%s", 
                              title_og == title_en, summary_og == summary_en)

            
            # Parse translated headlines
            headlines_og_raw = _safe_list(translated.get("headlines", []))
            if headlines_og_raw:
                headlines_og = []
                for h in headlines_og_raw:
                    if isinstance(h, str) and ":" in h:
                        parts = h.split(":", 1)
                        headlines_og.append({
                            "headline": _clean_headline(parts[0]),
                            "text": _strip_emoji_from_text(parts[1]).strip()
                        })
                    else:
                        headlines_og.append({"headline": _clean_headline(str(h)), "text": ""})
                
                # Ensure 4 headlines
                while len(headlines_og) < 4:
                    headlines_og.append({"headline": "Point Clé", "text": "Information supplémentaire"})
                headlines_og = headlines_og[:4]
            
            # Apply translated ingredient names
            ingredient_names_og = _safe_list(translated.get("ingredient_names", []))
            if ingredient_names_og and len(ingredient_names_og) >= len(ingredients_en):
                ingredients_og = []
                for i, ing in enumerate(ingredients_en):
                    ingredients_og.append({
                        "item": ingredient_names_og[i],
                        "name": ingredient_names_og[i],
                        "quantity": ing["quantity"],
                        "unit": ing["unit"],
                        "emoji": ing["emoji"],
                    })
            
            # Apply translated instructions
            instructions_og_raw = _safe_list(translated.get("instructions", []))
            if instructions_og_raw and len(instructions_og_raw) >= len(instructions_en):
                instructions_og = instructions_og_raw
            
            logger.info("✅ Translation applied: title='%s', summary=%d chars, headlines=%d", 
                       title_og[:50], len(summary_og), len(headlines_og))

        # Build bilingual summary
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
                "summary": summary_og,
                "headlines": headlines_og,
                "hashtags": hashtags,
                "emojis": emojis,
            },
        }

        # Build recipe data (if recipe)
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

        # Flatten headlines for summary_bullets
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
            "recipe": json.dumps(recipe_data, ensure_ascii=False) if recipe_data else None,
            "workout": None,
        }

    def _format_highlights(self, highlights_raw: List) -> List[Dict]:
        """Convert highlights to {headline, text} format - EXTRA emoji stripping"""
        formatted = []
        
        for h in highlights_raw:
            if isinstance(h, dict):
                headline = _clean_headline(_safe_str(h.get("headline", "")))
                text = _strip_emoji_from_text(_safe_str(h.get("description") or h.get("text", ""))).strip()
                
                # EXTRA VALIDATION: Strip any remaining emojis
                headline = _strip_emoji_from_text(headline)
                text = _strip_emoji_from_text(text)
                
                if headline and text:
                    formatted.append({"headline": headline, "text": text})
            elif isinstance(h, str):
                h = _strip_emoji_from_text(h)  # Clean the raw string first
                if ":" in h:
                    parts = h.split(":", 1)
                    formatted.append({
                        "headline": _clean_headline(parts[0]),
                        "text": _strip_emoji_from_text(parts[1]).strip()
                    })
                else:
                    formatted.append({
                        "headline": _clean_headline(h),
                        "text": ""
                    })
        
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

2. **topic**: English topic (e.g., "Korean Egg Kimbap")

3. **title**: English, descriptive, <= 90 characters

4. **summary**: ONE FACTUAL DESCRIPTIVE PARAGRAPH (280-420 characters)
   - DESCRIBE the final dish/result (e.g., "This yogurt cake features...")
   - NEVER copy the caption word-for-word
   - NEVER list raw ingredients or quantities
   - NEVER include emojis, hashtags, or promotional text
   - Focus on: what is created, cooking method, flavor profile, texture, serving suggestions
   - Write like a food encyclopedia entry
   - Example: "This seasonal cake combines tender apples with crunchy walnuts in a light yogurt-based batter, creating a moist texture with balanced sweetness."

5. **highlights**: array of EXACTLY 4 objects with:
   - "headline": Bold 3-5 word title (NO emojis, NO special characters, NO bullets)
   - "description": One sentence explaining the point (NO emojis, NO special characters)
   - Example: {{"headline": "Simple Measuring Technique", "description": "The recipe uses the yogurt container as a standard measure for all ingredients."}}

6. **hashtags**: 5-10 keywords WITHOUT '#'

7. **emojis**: 4 emojis (separate array)

8. **All text fields MUST be emoji-free and clean**

{type_specific}

Return ALL fields in ONE JSON response.
"""

    def _call_ai(self, prompt: str, max_retries: int = 2) -> Dict:
        for attempt in range(max_retries + 1):
            try:
                logger.info("🤖 Calling Mistral API (attempt %d/%d)...", attempt + 1, max_retries + 1)
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
                logger.error("❌ AI call failed (attempt %s): %s", attempt + 1, e)
                if attempt == max_retries:
                    raise
        raise ValueError("AI call failed after retries")

    def _translate_mega_batch(self, data: Dict, target_lang: str) -> Dict:
        """Translate EVERYTHING in ONE API call"""
        
        # Build prompt with dynamic fields
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
"""

        self.api_call_count += 1
        logger.info("🌐 Translating to %s in ONE batch call...", target_lang)
        
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
        
        # Log what we got back
        logger.info("✅ Translation received: title=%s..., summary=%d chars, headlines=%d", 
                   result.get("title", "")[:30], len(result.get("summary", "")), len(result.get("headlines", [])))
        
        return {
            "title": _safe_str(result.get("title", "")),
            "summary": _safe_str(result.get("summary", "")),
            "headlines": _safe_list(result.get("headlines", [])),
            "ingredient_names": _safe_list(result.get("ingredient_names", [])),
            "instructions": _safe_list(result.get("instructions", []))
        }

    def fallback(self, caption: str, classification: Dict) -> Dict:
        """Fallback when extraction fails"""
        title = (caption.split("\n")[0] if caption else "Saved Content").strip()
        title = _clean_title(title) or "Saved Content"

        bilingual_summary = {
            "english": {
                "title": title,
                "summary": (caption[:400] if caption else ""),
                "headlines": [],
                "hashtags": [],
                "emojis": []
            },
            "original": {
                "title": title,
                "summary": (caption[:400] if caption else ""),
                "headlines": [],
                "hashtags": [],
                "emojis": []
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
            "summary_bullets": "[]",
            "summary_hashtags": [],
            "summary_emojis": [],
            "summary": bilingual_summary,
            "headlines": [],
            "hashtags": [],
            "emojis": [],
            "recipe": None,
            "workout": None,
        }
