# fetcher_api/services/ai_service.py

"""
AI Service - Orchestrator (Split Modules) + UI-Compatible Output

Outputs BOTH:
- structured objects (recipe/summary)
- flattened fields your UI already reads:
  summary_title, summary_text, summary_bullets, summary_hashtags, summary_emojis
"""

from typing import Dict
import logging

from fetcher_api.services.reel_classifier import classify_reel_content, caption_looks_like_recipe
from fetcher_api.services.recipe_extractor import RecipeExtractor
from fetcher_api.services.summary_extractor import SummaryExtractor

logger = logging.getLogger(__name__)

PIPELINE_VERSION = "split-v10-ui-normalized-language-agnostic-routing-ko-fallback-regexfix"


class AIService:
    def __init__(self):
        self.recipe_extractor = RecipeExtractor()
        self.summary_extractor = SummaryExtractor()
        logger.info("✅ AI Service initialized (%s)", PIPELINE_VERSION)

    def _normalize_ui_output(self, out: Dict) -> Dict:
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
            eng_title = (eng.get("title") or "").strip()
            if eng_title:
                out.setdefault("summary_title", eng_title)
                out.setdefault("title", eng_title)

        ct = out.get("content_type")
        if ct not in ("recipe", "general"):
            if ct in ("generic", "summary"):
                out["content_type"] = "general"

        return out

    def analyze_content(self, transcript: str, caption: str, language_code: str = "en") -> Dict:
        transcript = transcript or ""
        caption = caption or ""

        classification = classify_reel_content(transcript, caption)

        # Guardrail: if caption structure looks like recipe, force recipe routing.
        if classification.get("label") != "recipe" and caption_looks_like_recipe(caption):
            old_label = classification.get("label")
            classification = dict(classification) if isinstance(classification, dict) else {}
            classification["label"] = "recipe"
            classification["reason"] = (classification.get("reason") or "") + f" | caption_structure_override(from={old_label})"
            classification.setdefault("score", 0.85)

        logger.info(
            "🧭 Classification: label=%s score=%s reason=%s signals=%s",
            classification.get("label"),
            classification.get("score"),
            classification.get("reason"),
            classification.get("signals"),
        )

        try:
            if classification.get("label") == "recipe":
                out = self.recipe_extractor.extract(transcript, caption, language_code, classification)
            else:
                out = self.summary_extractor.extract(transcript, caption, language_code, classification)

            out["pipeline_version"] = PIPELINE_VERSION
            out["classification"] = classification

            if out.get("content_type") not in ("recipe", "general"):
                raise ValueError(f"Invalid content_type from extractor: {out.get('content_type')}")

            out = self._normalize_ui_output(out)
            return out

        except Exception as e:
            logger.error("❌ analyze_content failed: %s", e, exc_info=True)
            fallback = self.summary_extractor.fallback(caption, classification)
            fallback["pipeline_version"] = PIPELINE_VERSION
            fallback["classification"] = classification
            fallback = self._normalize_ui_output(fallback)
            return fallback


ai_service = AIService()


def analyze_instagram_video(transcript: str, caption: str, language_code: str = "en") -> Dict:
    return ai_service.analyze_content(transcript, caption, language_code)
