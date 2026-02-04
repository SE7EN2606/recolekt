# fetcher_api/services/summary_extractor.py

"""
Summary Extractor - OPTIMIZED to make ONLY 1 API call per video
"""

import os
import json
import re
import logging
from typing import Dict, List
from mistralai import Mistral

logger = logging.getLogger(__name__)

SUMMARY_EXTRACTOR_VERSION = "summary-v7-single-call-factual"


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


def _clean_headline(text: str) -> str:
    text = (text or "").strip()
    text = re.sub(r"^[•·●○◦▪▫-]\s*", "", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


class SummaryExtractor:
    def __init__(self):
        api_key = os.getenv("MISTRAL_API_KEY")
        if not api_key:
            raise ValueError("MISTRAL_API_KEY not found in environment")
        self.client = Mistral(api_key=api_key)
        self.model = "mistral-large-latest"

    def extract(self, transcript: str, caption: str, lang: str, classification: Dict) -> Dict:
        transcript = transcript or ""
        caption = caption or ""
        lang = lang or "en"

        # ✅ SINGLE API CALL - Get everything at once
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

        if english_block:
            eng_title = self._clean_title(_safe_str(english_block.get("title", "")))
            eng_summary = _safe_str(english_block.get("summary", "")).strip()
            
            # ✅ Extract highlights properly
            highlights_raw = english_block.get("highlights", [])
            eng_headlines = []
            
            for h in highlights_raw:
                if isinstance(h, dict):
                    headline = _safe_str(h.get("headline", "")).strip()
                    description = _safe_str(h.get("description", "")).strip()
                    if headline and description:
                        eng_headlines.append(f"{headline}: {description}")
                elif isinstance(h, str):
                    eng_headlines.append(_clean_headline(h))
        else:
            eng_title = self._clean_title(_safe_str(result.get("title", "")))
            eng_summary = _safe_str(result.get("summary", "")).strip()
            eng_headlines = _safe_list(result.get("highlights", []))
            eng_headlines = [_clean_headline(h) for h in eng_headlines if isinstance(h, str)]

        if original_block:
            orig_title = self._clean_title(_safe_str(original_block.get("title", "")))
            orig_summary = _safe_str(original_block.get("summary", "")).strip()
            
            highlights_raw = original_block.get("highlights", [])
            orig_headlines = []
            
            for h in highlights_raw:
                if isinstance(h, dict):
                    headline = _safe_str(h.get("headline", "")).strip()
                    description = _safe_str(h.get("description", "")).strip()
                    if headline and description:
                        orig_headlines.append(f"{headline}: {description}")
                elif isinstance(h, str):
                    orig_headlines.append(_clean_headline(h))
        else:
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

        # Enforce exactly 4 headlines
        while len(eng_headlines) < 4:
            eng_headlines.append("Key takeaway")
        while len(orig_headlines) < 4:
            orig_headlines.append("Point clé")
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

        logger.info("✅ Summary extracted with 1 API call")

        return {
            "content_type": "general",
            "extractor_version": SUMMARY_EXTRACTOR_VERSION,
            "category": category,
            "topic": topic,
            "title": eng_title,
            "summary_title": eng_title,
            "summary_text": bilingual_summary,
            "summary_bullets": json.dumps(eng_headlines, ensure_ascii=False),
            "summary_hashtags": hashtags,
            "summary_emojis": emojis,
            "summary": bilingual_summary,
            "headlines": eng_headlines,
            "hashtags": hashtags,
            "emojis": emojis,
            "recipe": None,
            "workout": None,
        }

    def _build_summary_prompt(self, transcript: str, caption: str, lang: str) -> str:
        if _is_english(lang):
            return f"""Summarize this video content. Output ONLY valid JSON with ALL fields in ONE response.

TRANSCRIPT: {transcript[:3500]}
CAPTION: {caption[:2000]}
DETECTED_LANGUAGE: {lang}

EXTRACTION RULES:

1. **category**: English category (e.g., "Fitness", "Lifestyle", "Education")

2. **topic**: English topic (e.g., "Kettlebell Workout", "Morning Routine")

3. **title**: Concise English title (< 60 chars, NEVER "Untitled")

4. **summary**: ONE FACTUAL PARAGRAPH (50-80 words)
   - Describe WHAT HAPPENS in the video
   - NO emojis, NO promotional language, NO author opinions
   - NO phrases like: "This video shows", "Learn how", "Discover", "Watch as"
   - State facts directly
   
   CORRECT EXAMPLES:
   "A quick 10-minute kettlebell workout routine that can be done by anyone, even those with busy schedules. The routine involves three main exercises and a specific rule to keep the kettlebell in hand at all times."
   
   "Morning productivity routine featuring hydration, exercise, and focused work blocks. The system prioritizes high-impact tasks before checking email or social media."
   
   WRONG (DO NOT USE):
   "This video shows you how to do a great kettlebell workout! 💪"
   "Facile, rapide et irrésistible! 🔥"

5. **highlights**: array of EXACTLY 4 objects, each with:
   - "headline": Bold 3-5 word title
   - "description": One sentence explaining the point
   
   Example:
   [
     {{"headline": "Time-Efficient Workout", "description": "You don't need an hour or even thirty minutes. All you need is ten minutes."}},
     {{"headline": "Kettlebell Rules", "description": "Do not let go of the kettlebell for the entire ten minutes."}},
     {{"headline": "Exercise Choices", "description": "Choose from three exercises: around the world, reverse lunges, single side squat into rotational press, or deadlift into high shoulder pull."}},
     {{"headline": "Resting Position", "description": "30 seconds max rest when you are in the resting position."}}
   ]

6. **hashtags**: 5-10 keywords WITHOUT '#'

7. **emojis**: 4 emojis (NO emojis in summary/highlights text)

Return ALL fields in ONE JSON response.
"""
        
        return f"""This content is in {lang}. Create BOTH English and original language versions. Output ONLY valid JSON.

TRANSCRIPT: {transcript[:3500]}
CAPTION: {caption[:2000]}
DETECTED_LANGUAGE: {lang}

EXTRACTION RULES:

1. **category**: English category (e.g., "Fitness", "Lifestyle", "Education")

2. **topic**: English topic

3. **english** object with:
   - **title**: Concise English title (< 60 chars, NEVER "Untitled")
   - **summary**: ONE FACTUAL PARAGRAPH (50-80 words) - NO emojis, NO promotional language, state facts directly
   - **highlights**: array of EXACTLY 4 objects with "headline" and "description"
   
   Example highlights:
   [
     {{"headline": "Main Technique", "description": "Description of primary method or approach."}},
     {{"headline": "Key Benefit", "description": "Main advantage or outcome."}},
     {{"headline": "Important Rule", "description": "Critical guideline to follow."}},
     {{"headline": "Time Requirement", "description": "Duration or time commitment needed."}}
   ]

4. **original** object with same structure as english but in {lang}

5. **hashtags**: 5-10 keywords WITHOUT '#'

6. **emojis**: 4 emojis (NO emojis in summary/highlights text)

Return ALL fields in ONE JSON response.
"""

    def _call_ai(self, prompt: str, max_retries: int = 2) -> Dict:
        for attempt in range(max_retries + 1):
            logger.info("🤖 Calling Mistral API (attempt %d/%d)...", attempt + 1, max_retries + 1)
            response = self.client.chat.complete(
                model=self.model,
                messages=[
                    {"role": "system", "content": "You are a video content analyzer. Output only valid JSON with ALL fields in ONE response. Write factual summaries without emojis, promotional language, or author opinions. Format highlights as headline+description objects."},
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
