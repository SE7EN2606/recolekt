# fetcher_api/services/ai_service.py
"""
AI Service — Orchestrator using Universal Extractor.
Outputs UI-compatible fields for all content types.

Phase 1 public content families:
  recipe | workout | location | products | software | finance | general

Important:
- "tools" is now considered internal / legacy semantics and is normalized away
  at the API/UI boundary.
- The extractor may still internally use structured-list logic that originated
  from tools handling; AIService maps public labels onto the new families.
"""

from typing import Dict
import logging
import os

from fetcher_api.services.reel_classifier import (
    classify_reel_content,
    caption_looks_like_recipe,
    caption_looks_like_tools,
    KNOWN_TOOL_NAMES,
    TOOL_CATEGORY_KEYWORDS,
    _count_hits,
)
from fetcher_api.services.universal_extractor import UniversalExtractor

logger = logging.getLogger(__name__)

PIPELINE_VERSION = "universal-v1-single-extractor"

_VALID_PUBLIC_CONTENT_TYPES = (
    "recipe",
    "general",
    "workout",
    "location",
    "products",
    "software",
    "finance",
)


class AIService:
    def __init__(self):
        self.extractor = UniversalExtractor()

        api_key = os.getenv("MISTRAL_API_KEY")
        logger.info(
            "🚀 AI SERVICE STARTED — MISTRAL KEY: %s",
            (api_key[:12] + "...") if api_key else "MISSING",
        )
        logger.info("✅ AI Service initialized (%s)", PIPELINE_VERSION)

    def _normalize_ui_output(self, out: Dict) -> Dict:
        """Ensure output has all required fields for UI compatibility."""
        if not isinstance(out, dict):
            return out

        summary_text = out.get("summary_text")
        summary_structured = out.get("summary")

        if not summary_text and isinstance(summary_structured, dict):
            summary_text = summary_structured
            out["summary_text"] = summary_text

        if isinstance(summary_text, dict):
            out["summary"] = summary_text

            eng = summary_text.get("english") if isinstance(summary_text.get("english"), dict) else {}
            orig = summary_text.get("original") if isinstance(summary_text.get("original"), dict) else {}

            eng_title = (eng.get("title") or "").strip()
            orig_title = (orig.get("title") or "").strip()
            chosen_title = eng_title or orig_title

            if chosen_title:
                out.setdefault("summary_title", chosen_title)
                out.setdefault("title", chosen_title)

            out.setdefault("summary_hashtags", eng.get("hashtags") or orig.get("hashtags") or [])
            out.setdefault("summary_emojis", eng.get("emojis") or orig.get("emojis") or [])
            out.setdefault("summary_bullets", eng.get("headlines") or orig.get("headlines") or [])

        ct = (out.get("content_type") or "").strip().lower()

        if ct == "tools":
            classification = out.get("classification") or {}
            label = (classification.get("label") or "").strip().lower()
            if label in {"software", "products", "finance"}:
                out["content_type"] = label
            else:
                out["content_type"] = "products"
        elif ct in ("generic", "summary", ""):
            out["content_type"] = "general"
        elif ct not in _VALID_PUBLIC_CONTENT_TYPES:
            logger.warning(
                "⚠️ _normalize_ui_output: unexpected content_type=%r — coercing to 'general'", ct
            )
            out["content_type"] = "general"

        return out

    def _looks_like_workout(self, transcript: str, caption: str) -> bool:
        text = (transcript + " " + caption).lower()
        workout_keywords = [
            "workout", "kettlebell", "dumbbell", "squat", "pushup", "push-up",
            "deadlift", "reps", "sets", "emom", "amrap", "hiit", "muscle",
            "gym", "fitness", "fentes", "glutes", "quads", "hamstrings",
            "entraînement", "musculation", "gainage", "circuit",
        ]
        return sum(1 for kw in workout_keywords if kw in text) >= 2

    def _looks_like_finance(self, transcript: str, caption: str) -> bool:
        text = (transcript + " " + caption).lower()

        finance_keywords = [
            "finance", "financial", "accounting", "bookkeeping", "bookkeeper",
            "tax", "taxes", "vat", "invoice", "invoices", "profit", "loss",
            "margin", "cash flow", "budgeting", "budget", "investing",
            "investment", "etf", "etfs", "stock", "stocks", "dividend",
            "balance sheet", "income statement", "p&l", "payroll",
            "expense ratio", "capital gains", "portfolio",
        ]
        hits = sum(1 for kw in finance_keywords if kw in text)

        if hits < 3:
            return False

        product_markers = [
            "sunscreen", "spf", "skincare", "perfume", "fragrance", "watch", "watches",
            "jacket", "jackets", "shoes", "sneakers", "bag", "bags",
            "tier list", "consumer test", "independent test", "lab test",
        ]
        product_hits = sum(1 for kw in product_markers if kw in text)
        if product_hits >= 3:
            return False

        return True

    def _looks_like_software(self, transcript: str, caption: str) -> bool:
        text = (transcript + " " + caption).lower()

        tool_name_matches = sum(1 for name in KNOWN_TOOL_NAMES if name in text)
        tool_kw_matches = _count_hits(text, TOOL_CATEGORY_KEYWORDS)

        software_markers = [
            "ai tool", "ai tools", "software", "app", "apps", "website", "websites",
            "saas", "platform", "automation", "workflow", "plugin", "extension",
            "api", "chrome extension", "chatgpt", "claude", "notion", "figma",
            "canva", "zapier", "n8n", "make.com", "framer", "webflow",
        ]
        software_hits = sum(1 for kw in software_markers if kw in text)

        finance_markers = [
            "finance", "financial", "accounting", "bookkeeping", "tax", "vat",
            "invoice", "payroll", "etf", "etfs", "stocks", "dividend",
        ]
        finance_hits = sum(1 for kw in finance_markers if kw in text)

        product_markers = [
            "sunscreen", "spf", "skincare", "perfume", "fragrance", "watch", "watches",
            "jacket", "jackets", "shoes", "sneakers", "bag", "bags",
            "tier list", "consumer test", "independent test", "lab test",
        ]
        product_hits = sum(1 for kw in product_markers if kw in text)

        if finance_hits >= 3 or product_hits >= 4:
            return False

        return (
            tool_name_matches >= 3
            or (tool_name_matches >= 2 and (tool_kw_matches >= 1 or software_hits >= 2))
            or (tool_name_matches >= 1 and tool_kw_matches >= 2 and software_hits >= 1)
            or software_hits >= 4
        )

    def _looks_like_products(self, transcript: str, caption: str) -> bool:
        text = (transcript + " " + caption).lower()

        product_markers = [
            "brand", "brands", "product", "products", "ranking", "tier", "tier list",
            "tested", "review", "reviews", "comparison", "compared", "best", "worst",
            "sunscreen", "spf", "skincare", "perfume", "fragrance", "watch", "watches",
            "jacket", "jackets", "pants", "shoes", "sneakers", "bag", "bags",
            "handbag", "gear", "outdoor", "rain jacket", "baby shoes", "moisturizer",
            "serum", "consumer test", "lab test", "independent test", "worth it",
            "overrated", "underrated",
        ]
        product_hits = sum(1 for kw in product_markers if kw in text)

        software_markers = [
            "app", "apps", "software", "saas", "website", "websites", "automation",
            "plugin", "extension", "api", "chatgpt", "claude", "notion",
            "figma", "zapier", "n8n",
        ]
        software_hits = sum(1 for kw in software_markers if kw in text)

        finance_markers = [
            "finance", "financial", "accounting", "bookkeeping", "tax", "vat",
            "invoice", "payroll", "etf", "etfs", "stocks", "dividend",
        ]
        finance_hits = sum(1 for kw in finance_markers if kw in text)

        return product_hits >= 4 and software_hits < 4 and finance_hits < 3

    def analyze_content(
        self,
        transcript: str,
        caption: str,
        language_code: str = "en",
        video_path: str = None,
        duration_seconds: int = None,
        is_silent: bool = False,
    ) -> Dict:
        transcript = transcript or ""
        caption = caption or ""
        language_code = language_code or "en"

        # Always work on a fresh copy so caller-provided dicts are never mutated.
        classification = dict(classify_reel_content(transcript, caption) or {})

        is_workout = self._looks_like_workout(transcript, caption)
        is_finance = self._looks_like_finance(transcript, caption)
        is_software = self._looks_like_software(transcript, caption)
        is_products = self._looks_like_products(transcript, caption)

        if is_workout:
            classification["label"] = "workout"
            classification["reason"] = (classification.get("reason") or "") + " | forced:workout_keywords"
            classification["score"] = max(float(classification.get("score") or 0), 0.90)

        elif is_finance:
            old_label = classification.get("label")
            classification["label"] = "finance"
            classification["reason"] = (
                (classification.get("reason") or "") +
                f" | forced:finance_heuristic(from={old_label})"
            )
            classification["score"] = max(float(classification.get("score") or 0), 0.84)

        elif is_software:
            old_label = classification.get("label")
            classification["label"] = "software"
            classification["reason"] = (
                (classification.get("reason") or "") +
                f" | forced:software_heuristic(from={old_label})"
            )
            classification["score"] = max(float(classification.get("score") or 0), 0.88)

        elif is_products:
            old_label = classification.get("label")
            classification["label"] = "products"
            classification["reason"] = (
                (classification.get("reason") or "") +
                f" | forced:product_heuristic(from={old_label})"
            )
            classification["score"] = max(float(classification.get("score") or 0), 0.86)

        elif classification.get("label") != "recipe" and caption_looks_like_recipe(caption):
            old_label = classification.get("label")
            classification["label"] = "recipe"
            classification["reason"] = (
                (classification.get("reason") or "") +
                f" | caption_structure_override(from={old_label})"
            )
            classification["score"] = max(float(classification.get("score") or 0), 0.85)

        elif classification.get("label") not in ("recipe", "software", "products", "finance", "workout"):
            if caption_looks_like_tools(caption) and not is_products:
                old_label = classification.get("label")
                classification["label"] = "software"
                classification["reason"] = (
                    (classification.get("reason") or "") +
                    f" | caption_software_override(from={old_label})"
                )
                classification["score"] = max(float(classification.get("score") or 0), 0.80)

        logger.info(
            "🧭 Classification: label=%s score=%s reason=%s signals=%s",
            classification.get("label"),
            classification.get("score"),
            classification.get("reason"),
            classification.get("signals"),
        )

        # ── Extraction ────────────────────────────────────────────────────────
        # The try block wraps ONLY the extractor call. Post-processing runs
        # outside the except so errors there surface immediately rather than
        # silently degrading to fallback.
        try:
            out = self.extractor.extract(
                transcript,
                caption,
                language_code,
                classification,
                video_path=video_path,
                duration_seconds=duration_seconds,
                is_silent=is_silent,
            )
        except Exception as e:
            logger.error(
                "❌ extractor.extract() raised unexpectedly — using fallback. error=%s",
                e,
                exc_info=True,
            )
            out = self.extractor.fallback(caption, classification)

        out["pipeline_version"] = PIPELINE_VERSION
        out["classification"] = classification

        # Preserve detected_language from extractor output when fallback overwrites it.
        # fallback() hardcodes "unknown"; if the extractor ran and returned a real
        # language before crashing, carry it forward.
        if not out.get("detected_language") or out["detected_language"] == "unknown":
            if language_code and language_code != "unknown":
                out["detected_language"] = language_code

        out = self._normalize_ui_output(out)

        # _normalize_ui_output already coerces unknown types to "general".
        # Log a warning if content_type is still somehow invalid after normalization.
        if out.get("content_type") not in _VALID_PUBLIC_CONTENT_TYPES:
            logger.warning(
                "⚠️ content_type=%r still invalid after normalization — forcing 'general'",
                out.get("content_type"),
            )
            out["content_type"] = "general"

        return out


ai_service = AIService()


def analyze_instagram_video(
    transcript: str,
    caption: str,
    language_code: str = "en",
    video_path: str = None,
    duration_seconds: int = None,
    is_silent: bool = False,
) -> Dict:
    return ai_service.analyze_content(
        transcript,
        caption,
        language_code,
        video_path,
        duration_seconds,
        is_silent,
    )