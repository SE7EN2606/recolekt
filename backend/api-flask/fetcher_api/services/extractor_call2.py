"""
Call2Mixin — summary generation and structured-list translation.

Recommended architecture:
  - English content:       Call 1 + Call 2 in English. Call 3 skipped.
  - Non-English content:   Call 1 in original language.
                           Call 2: deterministic EN summary + original-language translation.
                           Call 3: translates structured list if not already done in Call 2.

Current compatibility behavior:
  EN structured lists:        0 LLM calls — deterministic summary only
  EN bookmark/general:        1 LLM call  — English summary + headlines
  non-EN structured lists:    1 LLM call  — deterministic EN summary + original-language translation
  non-EN bookmark/general:    1 LLM call  — original-first bilingual fallback

Key behaviors:
  - Structured list output has no deterministic headlines. Frontend uses summary + tools_list directly.
  - Verdict summaries are bucket-aware. Ranking summaries do not assume "best first".
  - Non-English structured lists: EN summary is deterministic first, then translated via LLM.
  - Translation keeps enum fields (creator_rating, rank, tier, source, free, url) unchanged.
  - Location payload disables structured-list mode so location content is not mis-routed.
"""

from __future__ import annotations

import logging

from fetcher_api.services.extractor_helpers import safe_str, safe_list
from fetcher_api.services.extractor_call1_helpers import parse_tools_categories
from fetcher_api.services.extractor_call2_helpers import (
    build_headlines_json,
    build_tools_json,
    safe_headlines,
    copy_emojis_to_headlines,
    is_english_lang,
    has_location_payload,
    restore_item_enum_fields,
    infer_public_family,
    is_structured_mode,
    get_structure_type,
    build_structured_output,
)

logger = logging.getLogger(__name__)


class Call2Mixin:
    """Generates summaries and optional structured-list translation. Optimised for minimal API calls."""

    def _call2_english(self, parsed: dict, caption: str) -> dict:
        highlights = parsed.get("highlights", [])
        tools_categories = parsed.get("tools_categories") or []
        has_location = has_location_payload(parsed)

        if tools_categories and is_structured_mode(parsed) and not has_location:
            structure_type = get_structure_type(parsed)
            result = build_structured_output(parsed, tools_categories)
            logger.info(
                "📞 Call 2 (EN structured): deterministic type=%s — 0 API calls",
                structure_type,
            )
            return result

        prompt = (
            f"Write a summary for this content.\n\n"
            f"TITLE: {parsed['title']}\n"
            f"BRIEF: {parsed.get('brief_description', '')}\n"
            f"CATEGORY: {parsed.get('category', 'general')}\n\n"
            f"REQUIREMENTS FOR SUMMARY:\n"
            f"- Length: STRICTLY 200-400 characters.\n"
            f"- Format: EXACTLY 2 short paragraphs.\n"
            f"- Style: Simple, factual, informative.\n\n"
            f"ABSOLUTE RULES FOR THE OPENING:\n"
            f"- NEVER start with 'This content', 'This video', 'This recipe', 'Here is', "
            f"or any 'This/That + noun' pattern.\n"
            f"- Start DIRECTLY with the subject.\n\n"
            f"Output ONLY valid JSON:\n"
            f'{{ "summary_en": "para1\\n\\npara2" }}'
        )

        result_data = self._call_ai(prompt)
        summary_en = safe_str(result_data.get("summary_en", "")).strip()

        return {
            "summary_en": summary_en,
            "summary_original": summary_en,
            "title_original": parsed["title"],
            "headlines_en": list(highlights),
            "headlines_og": list(highlights),
        }

    def _call2_bilingual(
        self,
        parsed: dict,
        caption: str,
        lang: str,
        call1_response: dict | None = None,
    ) -> dict:
        highlights = parsed.get("highlights", [])
        headline_json = build_headlines_json(highlights)

        prompt = (
            f"The ORIGINAL language of this content is {lang}.\n"
            f"Write the ORIGINAL-language version first, then an English version.\n\n"
            f"TITLE (current working title in English): {parsed['title']}\n"
            f"BRIEF DESCRIPTION: {parsed.get('brief_description', '')}\n"
            f"CATEGORY: {parsed.get('category', 'general')}\n\n"
            f"CONTENT TO TRANSLATE / REWRITE:\n\n"
            f'"headlines_en": {headline_json}\n\n'
            f"Return translated original-language headlines in this exact JSON shape:\n"
            f'  "headlines": [{{"headline": "translated headline", "description": "translated description"}}]\n\n'
            f"REQUIREMENTS:\n"
            f"- summary_original must be natural {lang}\n"
            f"- summary_en must be natural English\n"
            f"- Length: STRICTLY 200-400 characters EACH\n"
            f"- Format: EXACTLY 2 short paragraphs EACH\n"
            f"- Style: Simple, factual, informative\n\n"
            f"ABSOLUTE RULES FOR THE OPENING:\n"
            f"- Start DIRECTLY with the subject\n"
            f"- NEVER start with 'This content', 'This video', 'Cette vidéo', 'Ce contenu', "
            f"or any similar pattern\n\n"
            f"TRANSLATION QUALITY RULES:\n"
            f"- title_original must sound natural in {lang}\n"
            f"- Keep quantities, units, prices, and proper nouns unchanged where appropriate\n\n"
            f"Output ONLY valid JSON:\n"
            f"{{\n"
            f'  "summary_original": "{lang} para1\\n\\n{lang} para2",\n'
            f'  "summary_en": "English para1\\n\\nEnglish para2",\n'
            f'  "title_original": "{lang} title here",\n'
            f'  "headlines": [{{"headline": "translated", "description": "translated"}}]\n'
            f"}}"
        )

        result_data = self._call_ai(prompt)

        summary_og = safe_str(result_data.get("summary_original", "")).strip()
        summary_en = safe_str(result_data.get("summary_en", "")).strip()
        title_og = safe_str(result_data.get("title_original", "")).strip() or parsed["title"]

        raw_headlines = safe_list(result_data.get("headlines", []))
        headlines_og = safe_headlines(raw_headlines)

        if not headlines_og:
            logger.warning(
                "⚠️ Call 2 bilingual returned no translated headlines for lang=%s", lang
            )
        else:
            headlines_og = copy_emojis_to_headlines(highlights, headlines_og)

        return {
            "summary_en": summary_en or summary_og,
            "summary_original": summary_og or summary_en,
            "title_original": title_og,
            "headlines_en": highlights,
            "headlines_og": headlines_og,
        }

    def _call2_bilingual_structured(
        self,
        parsed: dict,
        caption: str,
        lang: str,
    ) -> dict:
        """
        Non-English structured list path.

        - English summary is deterministic (no LLM).
        - LLM translates that summary + the structured list into the original language.
        - Enum fields (creator_rating, rank, tier, source, free, url) are restored after translation.
        - Falls back to generic bilingual summary if location payload is present.
        """
        if has_location_payload(parsed):
            logger.info(
                "📍 Call 2 bilingual structured bypassed — location payload present, falling back to generic bilingual"
            )
            return self._call2_bilingual(parsed, caption, lang)

        if is_english_lang(lang):
            logger.warning(
                "⚠️ _call2_bilingual_structured called with lang=%s — redirecting to deterministic EN path",
                lang,
            )
            tools_categories = parsed.get("tools_categories") or []
            return build_structured_output(parsed, tools_categories)

        tools_categories = parsed.get("tools_categories") or []
        structured_out = build_structured_output(parsed, tools_categories)
        summary_en_deterministic = structured_out["summary_en"]
        tools_json = build_tools_json(tools_categories)
        structure_type = get_structure_type(parsed)
        public_family = infer_public_family(parsed, tools_categories)

        prompt = (
            f"The ORIGINAL language of this content is {lang}.\n"
            f"Translate the deterministic structured summary below into natural {lang}.\n\n"
            f"TASK 1 — Summary + title translation:\n"
            f"  - summary_original in {lang}\n"
            f"  - title_original in {lang}\n"
            f"  - Keep the meaning and structure faithful to the English summary\n"
            f"  - Do NOT drop any category or bucket that appears in the summary\n"
            f"  - STRUCTURE TYPE: {structure_type}\n"
            f"  - PUBLIC FAMILY: {public_family}\n"
            f"  - For verdict summaries, preserve coverage of all verdict buckets mentioned\n"
            f"  - Start DIRECTLY with the subject\n"
            f"  - NEVER start with 'This content', 'This video', 'Cette vidéo', 'Ce contenu'\n\n"
            f"ENGLISH SUMMARY TO TRANSLATE:\n"
            f"{summary_en_deterministic}\n\n"
            f"ENGLISH TITLE TO TRANSLATE:\n"
            f"{parsed.get('title', '')}\n\n"
            f"TASK 2 — Translate the structured list into {lang}:\n"
            f"  - Keep all item names unchanged\n"
            f"  - Keep url/free/rank/source/tier/creator_rating unchanged\n"
            f"  - creator_rating is an internal enum: allowed values are best/good/bad/null — do NOT translate\n"
            f"  - Translate ONLY category names, description, why_it_matters\n\n"
            f"STRUCTURED LIST:\n{tools_json}\n\n"
            f"Output ONLY valid JSON:\n"
            f"{{\n"
            f'  "summary_original": "{lang} para1\\n\\n{lang} para2",\n'
            f'  "title_original": "{lang} title here",\n'
            f'  "translated_categories": [{{"name": "Category", "emoji": "🔧", "items": []}}]\n'
            f"}}"
        )

        try:
            result_data = self._call_ai(prompt)
        except Exception as e:
            logger.warning(
                "⚠️ Call 2 bilingual structured failed: %s — using deterministic fallback", e
            )
            result_data = {}

        summary_og = safe_str(result_data.get("summary_original", "")).strip()
        title_og = safe_str(result_data.get("title_original", "")).strip() or parsed.get("title", "")

        if not summary_og:
            logger.info(
                "📞 Call 2 bilingual structured: missing original summary — mirroring deterministic EN"
            )
            summary_og = summary_en_deterministic

        tools_og = None
        raw_translated_cats = result_data.get("translated_categories")
        if isinstance(raw_translated_cats, list) and raw_translated_cats:
            parsed_tools_og = parse_tools_categories({"categories": raw_translated_cats})
            tools_og = restore_item_enum_fields(parsed_tools_og, tools_categories)

        out = {
            "summary_en": summary_en_deterministic,
            "summary_original": summary_og,
            "title_original": title_og,
            "headlines_en": [],
            "headlines_og": [],
        }

        if tools_og:
            out["tools_og"] = {"categories": tools_og}
            logger.info("✅ Merged call: translated %d structured categories", len(tools_og))

        return out

    def _call3_translate_structured(
        self,
        categories: list[dict],
        lang: str,
    ) -> list[dict] | None:
        """
        Standalone structured-list translation for the Call 3 path.
        """
        if not categories:
            return None

        prompt = (
            f'Translate the following structured list into language code "{lang}".\n\n'
            f"Rules:\n"
            f'- Keep all item "name" values unchanged\n'
            f'- Keep all "url" values unchanged\n'
            f'- Keep all "free" boolean values unchanged\n'
            f'- Keep all "rank" values unchanged\n'
            f'- Keep all "source" values unchanged\n'
            f'- Keep all "tier" values unchanged\n'
            f'- Keep all "creator_rating" values unchanged\n'
            f"- creator_rating is an internal enum and must remain one of: best, good, bad, null\n"
            f'- Translate "description", "why_it_matters", and category "name" values only\n'
            f"- Keep the exact same JSON structure\n"
            f'- Return valid JSON with the key "categories"\n\n'
            f"Input:\n{build_tools_json(categories)}"
        )

        try:
            result_data = self._call_ai(prompt)
            raw_cats = result_data.get("categories", [])
            if isinstance(raw_cats, list) and raw_cats:
                translated = parse_tools_categories({"categories": raw_cats})
                translated = restore_item_enum_fields(translated, categories)
                return translated
        except Exception as e:
            logger.warning("⚠️ Call 3 structured translation failed: %s", e)

        return None