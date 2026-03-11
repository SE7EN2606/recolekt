# fetcher_api/services/universal_extractor.py
"""
Universal Content Extractor - BILINGUAL TWO-CALL approach
Call 1: Extract structured data (title, recipe/guide, hashtags, location, etc.)
Call 2: Generate summary in BOTH English AND original language + translations
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
)
from fetcher_api.services.summary_formatter import (
    clean_text,
    strip_emoji,
    format_ai_summary,
)
from fetcher_api.services.category_validator import validate_category  # validate_category(ai_category, content_type)
from fetcher_api.services.extractor_prompts import (
    SYSTEM_MESSAGE,
    SUMMARY_HARD_MAX,
    build_bookmark_prompt,
    build_data_extraction_prompt,
    build_summary_prompt_english,
    build_summary_prompt_bilingual,
)
from fetcher_api.services.usage_tracker import record_call

logger = logging.getLogger(__name__)

EXTRACTOR_VERSION = "universal-v17-taxonomy"
MISTRAL_API_URL = "https://api.mistral.ai/v1/chat/completions"

# Hardcoded bookmark messages for empty reels
BOOKMARK_MESSAGES = {
    "en": "Bookmark saved. The creator did not provide a detailed caption or transcript for this video.",
    "fr": "Signet enregistré. Le créateur n'a pas fourni de légende ou de transcription détaillée pour cette vidéo.",
    "es": "Marcador guardado. El creador no proporcionó una leyenda o transcripción detallada para este video.",
    "it": "Segnalibro salvato. Il creatore non ha fornito una didascalia o una trascrizione dettagliata per questo video.",
    "de": "Lesezeichen gespeichert. Der Ersteller hat keine detaillierte Bildunterschrift oder ein Transkript bereitgestellt."
}


def smart_truncate_summary(text: str, max_chars: int = SUMMARY_HARD_MAX) -> str:
    """Truncate summary intelligently at sentence boundary."""
    s = strip_emoji(text or "").strip()
    if len(s) <= max_chars:
        return s

    cut = s[:max_chars]
    last_period = max(cut.rfind('. '), cut.rfind('! '), cut.rfind('? '))
    if cut.endswith('.') or cut.endswith('!') or cut.endswith('?'):
        last_period = max(last_period, len(cut) - 1)

    if last_period > max_chars * 0.6:
        return s[:last_period + 1].strip()

    if " " in cut:
        cut = cut.rsplit(" ", 1)[0].rstrip()
    cut = cut.rstrip(" ,.;:!-–—")
    if cut and not cut.endswith((".", "!", "?")):
        cut += "."
    return cut


def _normalize_servings(servings_raw: str) -> str:
    """Convert servings to a sensible portion number."""
    s = (servings_raw or "").strip().lower()
    if not s:
        return "1"

    yield_units = ["ml", "cl", "l", "g", "kg", "oz", "lb", "cups", "cup"]
    for unit in yield_units:
        if unit in s:
            logger.info(f"📏 Servings '{servings_raw}' looks like total yield → defaulting to 1")
            return "1"

    m = re.search(r"(\d+)", s)
    if m:
        num = int(m.group(1))
        if num > 20:
            logger.info(f"📏 Servings '{servings_raw}' = {num} too high → defaulting to 1")
            return "1"
        return str(num)

    return "1"


class UniversalExtractor:
    def __init__(self):
        api_key = os.getenv("MISTRAL_API_KEY")
        if not api_key:
            raise ValueError("MISTRAL_API_KEY not found in environment")

        logger.info("🔑 Mistral HTTP ready: %s...", api_key[:12])
        self.api_key = api_key
        self.model = "mistral-small-latest"
        self.api_call_count = 0

    # ══════════════════════════════════════════════════════════════
    # MAIN EXTRACT
    # ══════════════════════════════════════════════════════════════

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
            detected = detect_caption_language(caption)
            if detected != "unknown":
                effective_lang = detected
                logger.info("🔍 Detected caption language: %s", effective_lang)

        is_english_content = is_english(effective_lang) or is_unknown_lang(effective_lang)

        # ── LOW CONTEXT → BOOKMARK MODE ──
        transcript_len = len(transcript.strip())
        caption_len = len(caption.strip())
        if (transcript_len + caption_len) < 80 and caption_len < 40:
            return self._bookmark_mode(caption, effective_lang)

        # ── CALL 1: Structured data extraction ──
        logger.info("📞 CALL 1: Extracting structured data...")
        result_data = self._call_ai(
            build_data_extraction_prompt(transcript, caption, effective_lang, content_type)
        )

        # Parse Call 1 results
        parsed = self._parse_call1(result_data, caption, content_type)

        # ── CALL 2: Summary + translations ──
        if is_english_content:
            summary_result = self._call2_english(parsed, caption)
        else:
            summary_result = self._call2_bilingual(parsed, caption, effective_lang, result_data)

        # ── Assemble final output ──
        return self._assemble_output(
            parsed, summary_result, content_type, effective_lang, is_english_content
        )

    # ══════════════════════════════════════════════════════════════
    # CALL 1 PARSING
    # ══════════════════════════════════════════════════════════════

    def _parse_call1(self, result_data: Dict, caption: str, content_type: str) -> Dict:
        """Parse and validate Call 1 AI response into a clean dict."""
        # Category with taxonomy validation
        category = validate_category(
            safe_str(result_data.get("category", "")),
            content_type,
        )
        topic = safe_str(result_data.get("topic", "")).strip()

        # Title
        title_en = clean_title(safe_str(result_data.get("title", "")))
        if not title_en or len(title_en) < 8:
            derived = derive_best_title_from_caption(caption)
            title_en = derived or title_en
        if not title_en:
            title_en = "Saved Content"
        title_en = clean_title(title_en) or "Saved Content"

        brief_description = safe_str(result_data.get("brief_description", ""))
        highlights_raw = safe_list(result_data.get("highlights", []))
        location_obj = result_data.get("location", None)

        # Recipe fields
        recipe_obj = result_data.get("recipe") or {}
        ingredients_en = normalize_ingredients(recipe_obj.get("ingredients", []))
        instructions_en = safe_list(recipe_obj.get("instructions", []))
        tips_en = safe_list(recipe_obj.get("tips", []))
        notes_en = safe_list(recipe_obj.get("notes", []))

        servings_raw = safe_str(recipe_obj.get("servings", "")).strip() or safe_str(recipe_obj.get("yield", "")).strip()
        servings = _normalize_servings(servings_raw)

        prep_time = safe_str(recipe_obj.get("prep_time", "")).strip()
        cook_time = safe_str(recipe_obj.get("cook_time", "")).strip()
        total_time = safe_str(recipe_obj.get("total_time", "")).strip()

        # Hashtags
        hashtags_raw = safe_list(result_data.get("hashtags", []))
        hashtags_clean = [str(t).lstrip("#").strip() for t in hashtags_raw if str(t).strip()]
        caption_tags = set(re.findall(r"#(\w+)", caption.lower()))
        filtered_tags = []
        for t in hashtags_clean:
            t_lower = t.lower()
            if t_lower not in caption_tags and t_lower not in [f.lower() for f in filtered_tags]:
                filtered_tags.append(t)
        hashtags = filtered_tags[:5]

        # Emojis
        emojis = safe_list(result_data.get("emojis", []))
        emojis = [e.strip() for e in emojis if isinstance(e, str) and e.strip()]
        emojis = unique_keep_order(emojis)
        if len(emojis) < 4:
            emojis = (emojis + ["✨", "💡", "📌", "✅"])[:4]
        emojis = emojis[:4]

        return {
            "category": category,
            "topic": topic,
            "title_en": title_en,
            "brief_description": brief_description,
            "highlights_raw": highlights_raw,
            "location": location_obj,
            "ingredients_en": ingredients_en,
            "instructions_en": instructions_en,
            "tips_en": tips_en,
            "notes_en": notes_en,
            "servings": servings,
            "prep_time": prep_time,
            "cook_time": cook_time,
            "total_time": total_time,
            "hashtags": hashtags,
            "emojis": emojis,
        }

    # ══════════════════════════════════════════════════════════════
    # CALL 2 VARIANTS
    # ══════════════════════════════════════════════════════════════

    def _call2_english(self, parsed: Dict, caption: str) -> Dict:
        """Call 2 for English-only content."""
        logger.info("📞 CALL 2: Generating English summary...")
        result = self._call_ai(
            build_summary_prompt_english(
                parsed["title_en"], parsed["brief_description"], "english"
            )
        )

        summary_en_raw = safe_str(result.get("summary", ""))
        if is_caption_copy(summary_en_raw, caption):
            logger.error("🚨 AI COPIED CAPTION! Using fallback.")
            summary_en_raw = self._fallback_summary(parsed["title_en"], "general")

        summary_en = smart_truncate_summary(summary_en_raw)

        return {
            "summary_en": summary_en,
            "summary_og": summary_en,
            "title_og": parsed["title_en"],
            "ingredients_og": parsed["ingredients_en"],
            "instructions_og": parsed["instructions_en"],
            "tips_og": parsed["tips_en"],
            "notes_og": parsed["notes_en"],
            "translated_headlines": None,
        }

    def _call2_bilingual(self, parsed: Dict, caption: str, lang: str, result_data: Dict) -> Dict:
        """Call 2 for non-English content (summary + translations)."""
        logger.info("📞 CALL 2: Bilingual summary + translations (EN + %s)...", lang)

        result = self._call_ai(
            build_summary_prompt_bilingual(
                parsed["title_en"], parsed["brief_description"], "bilingual", lang,
                highlights=parsed["highlights_raw"],
                ingredients=parsed["ingredients_en"] or None,
                instructions=parsed["instructions_en"] or None,
                tips=parsed["tips_en"] or None,
                notes=parsed["notes_en"] or None,
            )
        )

        summary_en_raw = safe_str(result.get("summary_en", ""))
        summary_og_raw = safe_str(result.get("summary_original", ""))
        title_og = clean_title(safe_str(result.get("title_original", ""))) or parsed["title_en"]

        if is_caption_copy(summary_en_raw, caption):
            logger.error("🚨 AI COPIED CAPTION in EN! Using fallback.")
            summary_en_raw = self._fallback_summary(parsed["title_en"], "general")
        if is_caption_copy(summary_og_raw, caption):
            logger.error("🚨 AI COPIED CAPTION in original! Using fallback.")
            summary_og_raw = summary_en_raw

        summary_en = smart_truncate_summary(summary_en_raw)
        summary_og = smart_truncate_summary(summary_og_raw)

        # Translate recipe fields
        ingredients_og, instructions_og, tips_og, notes_og = self._translate_recipe_fields(
            result, parsed
        )

        return {
            "summary_en": summary_en,
            "summary_og": summary_og,
            "title_og": title_og,
            "ingredients_og": ingredients_og,
            "instructions_og": instructions_og,
            "tips_og": tips_og,
            "notes_og": notes_og,
            "translated_headlines": safe_list(result.get("headlines", [])),
        }

    def _translate_recipe_fields(self, translated: Dict, parsed: Dict) -> tuple:
        """Extract translated recipe fields from Call 2 response."""
        ingredients_en = parsed["ingredients_en"]
        ingredients_og = ingredients_en
        instructions_og = parsed["instructions_en"]
        tips_og = parsed["tips_en"]
        notes_og = parsed["notes_en"]

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

                ingredients_og.append({
                    "item": name_og,
                    "name": name_og,
                    "quantity": ing["quantity"],
                    "unit": unit_og,
                    "emoji": ing["emoji"],
                })

        instructions_og_raw = safe_list(translated.get("instructions", []))
        if instructions_og_raw and len(instructions_og_raw) >= len(parsed["instructions_en"]):
            instructions_og = [clean_text(safe_str(x)) for x in instructions_og_raw]

        tips_og_raw = safe_list(translated.get("tips", []))
        if tips_og_raw and len(tips_og_raw) >= len(parsed["tips_en"]):
            tips_og = [clean_text(safe_str(x)) for x in tips_og_raw]

        notes_og_raw = safe_list(translated.get("notes", []))
        if notes_og_raw and len(notes_og_raw) >= len(parsed["notes_en"]):
            notes_og = [clean_text(safe_str(x)) for x in notes_og_raw]

        return ingredients_og, instructions_og, tips_og, notes_og

    # ══════════════════════════════════════════════════════════════
    # ASSEMBLY
    # ══════════════════════════════════════════════════════════════

    def _assemble_output(
        self, parsed: Dict, summary_result: Dict,
        content_type: str, effective_lang: str, is_english_content: bool
    ) -> Dict:
        """Assemble the final output dict from parsed Call 1 + Call 2 results."""

        title_en = parsed["title_en"]
        title_og = summary_result["title_og"]
        summary_en = summary_result["summary_en"]
        summary_og = summary_result["summary_og"]

        # ── Build headlines ──
        _, ai_bullets_en = format_ai_summary(
            title_en=title_en,
            summary_en_raw=summary_en,
            highlights_raw=parsed["highlights_raw"],
            content_type=content_type,
        )
        headlines_en = [
            {"headline": b["headline"], "text": b["description"], "emoji": b.get("emoji", "")}
            for b in ai_bullets_en
        ]

        headlines_og = headlines_en
        if not is_english_content and summary_result.get("translated_headlines"):
            _, bullets_og = format_ai_summary(
                title_en=title_og,
                summary_en_raw=summary_og,
                highlights_raw=summary_result["translated_headlines"],
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

        # ── Bilingual summary object ──
        bilingual_summary = {
            "english": {
                "title": title_en,
                "summary": summary_en,
                "headlines": headlines_en,
                "hashtags": parsed["hashtags"],
                "emojis": parsed["emojis"],
            },
            "original": {
                "title": title_og,
                "summary": summary_og if not is_english_content else summary_en,
                "headlines": headlines_og,
                "hashtags": parsed["hashtags"],
                "emojis": parsed["emojis"],
            },
        }

        # ── Recipe object ──
        recipe_data = None
        if parsed["ingredients_en"] or parsed["instructions_en"]:
            recipe_data = {
                "english": {
                    "title": title_en,
                    "servings": parsed["servings"] or "1",
                    "prep_time": parsed["prep_time"] or None,
                    "cook_time": parsed["cook_time"] or None,
                    "total_time": parsed["total_time"] or None,
                    "ingredients": parsed["ingredients_en"],
                    "instructions": parsed["instructions_en"],
                    "tips": parsed["tips_en"],
                    "notes": parsed["notes_en"],
                },
                "original": {
                    "title": title_og,
                    "servings": parsed["servings"] or "1",
                    "prep_time": parsed["prep_time"] or None,
                    "cook_time": parsed["cook_time"] or None,
                    "total_time": parsed["total_time"] or None,
                    "ingredients": summary_result["ingredients_og"],
                    "instructions": summary_result["instructions_og"],
                    "tips": summary_result["tips_og"],
                    "notes": summary_result["notes_og"],
                },
            }

        return {
            "content_type": content_type,
            "extractor_version": EXTRACTOR_VERSION,
            "category": parsed["category"],
            "topic": parsed["topic"],
            "title": title_en,
            "summary": bilingual_summary,
            "hashtags": parsed["hashtags"],
            "emojis": parsed["emojis"],
            "recipe": json.dumps(recipe_data, ensure_ascii=False) if recipe_data else None,
            "location": parsed["location"],
            "workout": None,
            "detected_language": effective_lang,
        }

    # ══════════════════════════════════════════════════════════════
    # BOOKMARK MODE
    # ══════════════════════════════════════════════════════════════

    def _bookmark_mode(self, caption: str, effective_lang: str) -> Dict:
        """Handle low-context reels with minimal AI call."""
        logger.info("⚠️ Bookmark mode activated.")
        result_data = self._call_ai(build_bookmark_prompt(caption, effective_lang))

        category = validate_category(
            safe_str(result_data.get("category", "")), "general",
        )
        topic = safe_str(result_data.get("topic", "")).strip()
        title_en = clean_title(safe_str(result_data.get("title", "Saved Reel")))

        hashtags_raw = safe_list(result_data.get("hashtags", []))
        hashtags = [str(t).lstrip("#").strip() for t in hashtags_raw if str(t).strip()][:5]

        emojis = safe_list(result_data.get("emojis", []))
        emojis = [e.strip() for e in emojis if isinstance(e, str) and e.strip()][:4]

        summary_en = BOOKMARK_MESSAGES["en"]
        summary_og = BOOKMARK_MESSAGES.get(effective_lang[:2].lower(), BOOKMARK_MESSAGES["en"])

        bilingual_summary = {
            "english": {
                "title": title_en, "summary": summary_en,
                "headlines": [], "hashtags": hashtags, "emojis": emojis,
            },
            "original": {
                "title": title_en, "summary": summary_og,
                "headlines": [], "hashtags": hashtags, "emojis": emojis,
            },
        }

        return {
            "content_type": "general",
            "extractor_version": EXTRACTOR_VERSION + "-bookmark",
            "category": category,
            "topic": topic,
            "title": title_en,
            "summary": bilingual_summary,
            "hashtags": hashtags,
            "emojis": emojis,
            "recipe": None,
            "location": None,
            "workout": None,
            "detected_language": effective_lang,
        }

    # ══════════════════════════════════════════════════════════════
    # AI CALL + HELPERS
    # ══════════════════════════════════════════════════════════════

    def _call_ai(self, prompt: str, max_retries: int = 2) -> Dict:
        """Pure HTTP call to Mistral API."""
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": SYSTEM_MESSAGE},
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

                record_call(prompt_len=len(prompt), response_len=len(raw))
                return content

            except Exception as e:
                logger.error("❌ HTTP Mistral failed (attempt %d): %s", attempt + 1, e)
                record_call(prompt_len=len(prompt), response_len=0, error=True)
                if attempt == max_retries:
                    raise

        raise ValueError("Mistral HTTP call failed after retries")

    @staticmethod
    def _fallback_summary(title: str, content_type: str) -> str:
        """Generate a safe fallback summary when AI output is rejected."""
        return (
            f"{title} is a practical {content_type} guide that provides "
            "clear steps and requirements for an easy-to-follow result.\n\n"
            "Suitable for various skill levels and highly recommended."
        )

    def fallback(self, caption: str, classification: Dict) -> Dict:
        """Full fallback when AI extraction fails entirely."""
        title = derive_best_title_from_caption(caption) or (
            caption.split("\n")[0] if caption else "Saved Content"
        ).strip()
        title = clean_title(title) or "Saved Content"

        content_type = classification.get("label", "general")
        category = validate_category("", content_type)

        fallback_paragraph, fallback_bullets = format_ai_summary(
            title_en=title,
            summary_en_raw=(caption[:500] if caption else ""),
            highlights_raw=[],
            content_type=content_type,
        )
        headlines = [
            {"headline": b["headline"], "text": b["description"], "emoji": ""}
            for b in fallback_bullets
        ]

        bilingual_summary = {
            "english": {
                "title": title, "summary": fallback_paragraph,
                "headlines": headlines, "hashtags": [], "emojis": [],
            },
            "original": {
                "title": title, "summary": fallback_paragraph,
                "headlines": headlines, "hashtags": [], "emojis": [],
            },
        }

        return {
            "content_type": content_type,
            "extractor_version": EXTRACTOR_VERSION,
            "category": category,
            "topic": "",
            "title": title,
            "summary": bilingual_summary,
            "hashtags": [],
            "emojis": [],
            "recipe": None,
            "workout": None,
            "detected_language": "unknown",
        }
