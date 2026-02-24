# fetcher_api/services/ai_service.py
"""
AI Service - Orchestrator using Universal Extractor
Outputs UI-compatible fields for all content types
"""

from typing import Dict
import logging
import os  # 🔑 needed for MISTRAL_API_KEY logging

from fetcher_api.services.reel_classifier import classify_reel_content, caption_looks_like_recipe
from fetcher_api.services.universal_extractor import UniversalExtractor

logger = logging.getLogger(__name__)

PIPELINE_VERSION = "universal-v1-single-extractor"


class AIService:
    def __init__(self):
        self.extractor = UniversalExtractor()

        # 🔑 Log the Mistral key presence + prefix at startup
        api_key = os.getenv("MISTRAL_API_KEY")
        logger.info(
            "🚀 AI SERVICE STARTED - MISTRAL KEY: %s",
            (api_key[:12] + "...") if api_key else "MISSING",
        )

        logger.info("✅ AI Service initialized (%s)", PIPELINE_VERSION)

    def _normalize_ui_output(self, out: Dict) -> Dict:
        """Ensure output has all required fields for UI compatibility"""
        if not isinstance(out, dict):
            return out

        summary_text = out.get("summary_text")
        summary_structured = out.get("summary")

        # Ensure summary_text exists
        if not summary_text and isinstance(summary_structured, dict):
            summary_text = summary_structured
            out["summary_text"] = summary_text

        # Ensure summary exists
        if isinstance(summary_text, dict):
            out["summary"] = summary_text

            # Extract title from english block
            eng = summary_text.get("english") if isinstance(summary_text.get("english"), dict) else {}
            eng_title = (eng.get("title") or "").strip()
            if eng_title:
                out.setdefault("summary_title", eng_title)
                out.setdefault("title", eng_title)

        # Normalize content_type
        ct = out.get("content_type")
        if ct not in ("recipe", "general", "workout"):
            if ct in ("generic", "summary"):
                out["content_type"] = "general"

        return out

    def analyze_content(self, transcript: str, caption: str, language_code: str = "en") -> Dict:
        transcript = transcript or ""
        caption = caption or ""

        # Classify content type
        classification = classify_reel_content(transcript, caption)

        # Guardrail: if caption structure looks like recipe, force recipe routing
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
            # Use universal extractor for ALL content types
            out = self.extractor.extract(transcript, caption, language_code, classification)

            out["pipeline_version"] = PIPELINE_VERSION
            out["classification"] = classification

            # Validate content_type
            if out.get("content_type") not in ("recipe", "general", "workout"):
                raise ValueError(f"Invalid content_type from extractor: {out.get('content_type')}")

            out = self._normalize_ui_output(out)
            return out

        except Exception as e:
            logger.error("❌ analyze_content failed: %s", e, exc_info=True)
            
            # Fallback
            fallback = self.extractor.fallback(caption, classification)
            fallback["pipeline_version"] = PIPELINE_VERSION
            fallback["classification"] = classification
            fallback = self._normalize_ui_output(fallback)
            return fallback


ai_service = AIService()


def analyze_instagram_video(transcript: str, caption: str, language_code: str = "en") -> Dict:
    return ai_service.analyze_content(transcript, caption, language_code)
