# fetcher_api/services/summary_extractor.py

import os
import json
import re
import logging
from typing import Dict, List
from mistralai import Mistral

logger = logging.getLogger(__name__)

SUMMARY_EXTRACTOR_VERSION = "summary-v6-bilingual-normalized"


def _is_english(lang: str) -> bool:
    l = (lang or "").strip().lower()
    return l in {"en", "eng", "english"}


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


class SummaryExtractor:
    def __init__(self):
        api_key = os.getenv("MISTRAL_API_KEY")
        if not api_key:
            raise ValueError("MISTRAL_API_KEY not found in environment")
        self.client = Mistral(api_key=api_key)
        self.model = "mistral-large-latest"

    def extract(self, transcript: str, caption: str, lang: str, classification: Dict) -> Dict:
        """
        Behavior:
        - If lang is English → summarize in English only; original == english.
        - If lang is not English → model returns both english + original blocks.
        - Never returns 'Untitled' as a title; falls back to caption first line or 'Saved Video'.
        """
        transcript = transcript or ""
        caption = caption or ""
        lang = lang or "en"

        prompt = self._build_summary_prompt(transcript, caption, lang)
        result = self._call_ai(prompt)

        hashtags = _safe_list(result.get("hashtags", []))
        hashtags = [str(t).lstrip("#").strip() for t in hashtags if str(t).strip()]
        hashtags = _unique_keep_order([h for h in hashtags if h])

        emojis = _safe_list(result.get("emojis", []))
        emojis = [e for e in emojis if isinstance(e, str) and e.strip()]
        emojis = _unique_keep_order(emojis)

        category = _safe_str(result.get("category", "Lifestyle")).strip() or "Lifestyle"
        topic = _safe_str(result.get("topic", "General")).strip() or "General"

        english_block = result.get("english") if isinstance(result.get("english"), dict) else None
        original_block = result.get("original") if isinstance(result.get("original"), dict) else None

        if english_block or original_block:
            eng_title = self._clean_title(_safe_str((english_block or {}).get("title", "")))
            eng_summary = _safe_str((english_block or {}).get("summary", "")).strip()
            eng_headlines = _safe_list((english_block or {}).get("headlines", []))

            orig_title = self._clean_title(_safe_str((original_block or {}).get("title", "")))
            orig_summary = _safe_str((original_block or {}).get("summary", "")).strip()
            orig_headlines = _safe_list((original_block or {}).get("headlines", []))
        else:
            eng_title = self._clean_title(_safe_str(result.get("title", "")))
            eng_summary = _safe_str(result.get("summary", "")).strip()
            eng_headlines = _safe_list(result.get("headlines", []))

            orig_title = eng_title
            orig_summary = eng_summary
            orig_headlines = eng_headlines

        # Title fallback
        caption_first_line = (caption.split("\n")[0] if caption else "").strip()

        if not eng_title:
            eng_title = self._clean_title(caption_first_line) or "Saved Video"
        if not orig_title:
            orig_title = self._clean_title(caption_first_line) or eng_title

        # English post: do not invent a different original
        if _is_english(lang):
            orig_title = eng_title
            orig_summary = eng_summary
            orig_headlines = eng_headlines

        if not isinstance(eng_headlines, list):
            eng_headlines = []
        if not isinstance(orig_headlines, list):
            orig_headlines = []

        # Enforce exactly 4 headlines (best effort, UI expects 4)
        eng_headlines = [h for h in eng_headlines if isinstance(h, str) and h.strip()]
        orig_headlines = [h for h in orig_headlines if isinstance(h, str) and h.strip()]
        while len(eng_headlines) < 4:
            eng_headlines.append("✨ Key takeaway")
        while len(orig_headlines) < 4:
            orig_headlines.append("✨ Point clé")
        eng_headlines = eng_headlines[:4]
        orig_headlines = orig_headlines[:4]

        bilingual_summary = {
            "english": {
                "title": eng_title,
                "summary": eng_summary,
                "headlines": eng_headlines,
                "hashtags": hashtags,
                "emojis": emojis,
            },
            "original": {
                "title": orig_title,
                "summary": orig_summary,
                "headlines": orig_headlines,
                "hashtags": hashtags,
                "emojis": emojis,
            },
        }

        return {
            "content_type": "general",
            "extractor_version": SUMMARY_EXTRACTOR_VERSION,
            "category": category,
            "topic": topic,

            "title": eng_title,

            # UI flattened fields
            "summary_title": eng_title,
            "summary_text": bilingual_summary,
            "summary_bullets": json.dumps(eng_headlines, ensure_ascii=False),
            "summary_hashtags": hashtags,
            "summary_emojis": emojis,

            # Structured payload (alias; must NEVER be a wrapper around summary_text)
            "summary": bilingual_summary,

            # Convenience top-level fields (English)
            "headlines": eng_headlines,
            "hashtags": hashtags,
            "emojis": emojis,

            "recipe": None,
            "workout": None,
        }

    def _build_summary_prompt(self, transcript: str, caption: str, lang: str) -> str:
        if _is_english(lang):
            return f"""Summarize the content in English. Output ONLY valid JSON.

TRANSCRIPT: {transcript[:3500]}
CAPTION: {caption[:2000]}
DETECTED_LANGUAGE: {lang}

Return keys (all in English):
- category: string (e.g., "Food", "Lifestyle", "Fitness")
- topic: string (e.g., "Cooking", "Travel")
- title: string (concise, under 60 chars, MUST NOT be "Untitled")
- summary: string (2-3 sentences)
- headlines: array of exactly 4 strings (short key points; may start with emoji; MUST NOT include bullet chars like "•")
- hashtags: array of 3-10 strings (no # prefix)
- emojis: array of 3-8 emoji characters

Rules:
- If you cannot infer a good title, use the first sentence of the caption (trim to <= 60 chars) instead of "Untitled".
"""
        return f"""The content is in the original language: {lang}. Output ONLY valid JSON.

Your job:
1) Create a summary + 4 highlights in the ORIGINAL language ({lang}).
2) Create an accurate ENGLISH translation of that summary + highlights.

TRANSCRIPT: {transcript[:3500]}
CAPTION: {caption[:2000]}
DETECTED_LANGUAGE: {lang}

Return JSON keys:
- category: string (English category label, e.g., "Food", "Lifestyle", "Fitness")
- topic: string (English topic label, e.g., "Cooking", "Travel")
- english: object with keys:
  - title: string (English, concise, <= 60 chars, MUST NOT be "Untitled")
  - summary: string (English, 2-3 sentences)
  - headlines: array of exactly 4 strings (English; may start with emoji; MUST NOT include bullet chars like "•")
- original: object with keys:
  - title: string (in {lang}, concise, <= 60 chars, MUST NOT be "Untitled")
  - summary: string (in {lang}, 2-3 sentences)
  - headlines: array of exactly 4 strings (in {lang}; may start with emoji; MUST NOT include bullet chars like "•")
- hashtags: array of 3-10 strings (no # prefix; keep them language-appropriate)
- emojis: array of 3-8 emoji characters

Hard rules:
- NEVER output "Untitled" as a title.
- If title is unclear, derive it from the caption’s first sentence (shorten to <= 60 chars).
"""

    def _call_ai(self, prompt: str, max_retries: int = 2) -> Dict:
        for attempt in range(max_retries + 1):
            response = self.client.chat.complete(
                model=self.model,
                messages=[
                    {"role": "system", "content": "You output only valid JSON."},
                    {"role": "user", "content": prompt},
                ],
                response_format={"type": "json_object"},
                temperature=0.1,
            )
            content = response.choices[0].message.content
            try:
                return json.loads(content)
            except Exception as e:
                logger.error("❌ JSON parse failed (attempt %s): %s", attempt + 1, e)
                if attempt == max_retries:
                    raise
        raise ValueError("AI call failed after retries")

    def _clean_title(self, title: str) -> str:
        title = (title or "").strip()
        title = re.sub(r"\s+", " ", title)
        if not title:
            return ""
        if len(title) > 90:
            title = title[:90].rsplit(" ", 1)[0]
        return title

    def fallback(self, caption: str, classification: Dict) -> Dict:
        title = (caption.split("\n")[0] if caption else "Saved Video").strip()
        title = self._clean_title(title) or "Saved Video"

        bilingual_summary = {
            "english": {"title": title, "summary": (caption[:400] if caption else ""), "headlines": [], "hashtags": [], "emojis": []},
            "original": {"title": title, "summary": (caption[:400] if caption else ""), "headlines": [], "hashtags": [], "emojis": []},
        }

        return {
            "content_type": "general",
            "extractor_version": SUMMARY_EXTRACTOR_VERSION,
            "category": "Lifestyle",
            "topic": "General",
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
