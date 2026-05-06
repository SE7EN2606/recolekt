"""
Universal Content Extractor, orchestration only.

All heavy logic lives in dedicated mixins:
    extractor_http.py            -> HttpMixin      (_call_ai, retry, model fallback)
    extractor_call1.py           -> Call1Mixin     (Call 1 parsing)
    extractor_call2.py           -> Call2Mixin     (Call 2 summary + Call 3 translation)
    extractor_assembly.py        -> AssemblyMixin  (final output assembly)
    extractor_list_detection.py  -> detection helpers

Public content families:
    "recipe" | "workout" | "location" | "products" | "software" | "finance" | "general"

Internal extraction path:
    Structured products / software / finance content still flows through the
    legacy tools extraction path for now. "tools" is therefore internal-only
    semantics during Phase 1 migration.

Structured subtype values on the legacy tools path:
    "software" | "lifestyle" | "gear" | "food" |
    "ranking" | "picks" | "verdict" | "grouped" | "places"

MODEL CHAIN NOTE:
    extractor_http.py owns the model policy.
    Current default policy is:
      - Call 1 / vision extraction: ['mistral-large-latest', 'mistral-small-latest']
      - Call 2 / Call 3 summary/translation: ['mistral-small-latest']
    Do NOT include 'open-mistral-nemo'. Nemo is weaker and fails tier-list instructions.
"""

from __future__ import annotations

import asyncio
import logging
import re
from typing import Any, Dict, List, Optional

from fetcher_api.adapters.meta_client import meta_client
from fetcher_api.services.category_validator import validate_category
from fetcher_api.services.extractor_assembly import AssemblyMixin
from fetcher_api.services.extractor_call1 import Call1Mixin, _is_ranked_list_transcript
from fetcher_api.services.extractor_call2 import Call2Mixin
from fetcher_api.services.extractor_helpers import (
    clean_title,
    derive_best_title_from_caption,
    is_english,
    safe_list,
    safe_str,
)
from fetcher_api.services.extractor_http import HttpMixin, AIRequestExhaustedError
from fetcher_api.services.extractor_list_detection import (
    analyze_structure,
    classify_structured_family,
    count_mention_verdict_items,
    count_numbered_caption_items,
    count_plain_mentions,
    is_location_list_content,
    is_tools_list_content,
    looks_like_educational_numbered_explainer,
    pre_detect_list_subtype,
)
from fetcher_api.services.extractor_list_prompts import (
    FRAME_LIST_INSTRUCTION,
    build_location_list_instruction,
    build_tools_list_instruction,
)
from fetcher_api.services.extractor_orchestration_helpers import (
    _CHEZ_BRAND_RE,
    _FASHION_PRODUCT_RE,
    _PUBLIC_CONTENT_TYPES,
    _STRUCTURED_PRODUCT_FAMILIES,
    _caption_promised_count,
    _coerce_locations_to_list,
    _count_location_enrichment_changes,
    _dedupe_account_candidates,
    _default_subtype_for_family,
    _iter_account_like_values,
    _looks_like_global_ranking,
    _normalize_requested_public_content_type,
    _resolve_effective_language,
    _route_public_family,
    _strip_garbage_recovery_items,
    _transcript_promised_count,
)
from fetcher_api.services.extractor_prompts import (
    build_bookmark_prompt,
    build_data_extraction_prompt,
)
from fetcher_api.services.location_account_enrichment import (
    enrich_locations_with_accounts,
)
from fetcher_api.services.summary_formatter import format_ai_summary
from fetcher_api.utils.ocr_utils import (
    extract_and_stitch_frames,
    extract_video_frames_base64,
    is_silent_video,
    should_extract_frames,
)

logger = logging.getLogger(__name__)

EXTRACTOR_VERSION = "universal-v24"

BOOKMARK_MESSAGES = {
    "en": "Bookmark saved. The creator did not provide a detailed caption or transcript for this video.",
    "fr": "Signet enregistré. Le créateur n'a pas fourni de légende ou de transcription détaillée pour cette vidéo.",
    "es": "Marcador guardado. El creador no proporcionó una leyenda o transcripción detallada para este video.",
    "it": "Segnalibro salvato. Il creatore non ha fornito una didascalia o una trascrizione dettagliata per questo video.",
    "de": "Lesezeichen gespeichert. Der Ersteller hat keine detaillierte Bildunterschrift oder Transkript bereitgestellt.",
}

_CAPTION_MENTION_RE = re.compile(r"(?<![\w.])@([A-Za-z0-9._]{2,})")

_RECIPE_ACTION_RE = re.compile(
    r"\b(?:"
    r"recipe|cook|cooking|bake|baking|oven|air\s*fryer|pan|pot|tray|"
    r"grate|grated|slice|chop|mix|spread|roll|flip|add|season|serve|"
    r"recette|cuire|four|po[eê]le|m[eé]langer|ajouter|"
    r"rezept|ofen|backblech|reiben|gerieben|verteilen|umdrehen|salz|"
    r"ricetta|forno|mescolare|aggiungere"
    r")\b",
    re.IGNORECASE,
)

_RECIPE_INGREDIENT_RE = re.compile(
    r"\b(?:"
    r"potato|carrot|zucchini|courgette|egg|eggs|cheese|cottage\s+cheese|quark|"
    r"lettuce|cucumber|turkey|chicken|beef|salmon|garlic|onion|salt|pepper|"
    r"kartoffel|karotte|zucchini|ei|eier|k[aä]se|frischk[aä]se|kr[aä]uterquark|"
    r"salat|gurke|putenbrust|poulet|ail|oignon|sel|poivre"
    r")\b",
    re.IGNORECASE,
)


def _looks_like_spoken_recipe(transcript: str, caption: str) -> bool:
    text = f"{transcript or ''} {caption or ''}"
    if len(text.strip()) < 120:
        return False

    action_hits = len(_RECIPE_ACTION_RE.findall(text))
    ingredient_hits = len(_RECIPE_INGREDIENT_RE.findall(text))

    return action_hits >= 5 and ingredient_hits >= 4


def _call_classify_structured_family_safe(
    transcript: str,
    caption: str,
    category: str = "",
    topic: str = "",
) -> str:
    try:
        return classify_structured_family(
            transcript=transcript,
            caption=caption,
            category=category,
            topic=topic,
        )
    except TypeError:
        return classify_structured_family(transcript, caption)


class UniversalExtractor(HttpMixin, Call1Mixin, Call2Mixin, AssemblyMixin):
    EXTRACTOR_VERSION = EXTRACTOR_VERSION

    def _extract_caption_mentions(self, caption: str) -> List[str]:
        if not caption:
            return []

        seen = set()
        mentions: List[str] = []

        for match in _CAPTION_MENTION_RE.findall(caption):
            username = (match or "").strip().lower()
            if not username or username in seen:
                continue
            seen.add(username)
            mentions.append(username)

        return mentions

    def _collect_candidate_accounts(
        self,
        classification: Dict[str, Any],
        result_data: Dict[str, Any],
        parsed: Dict[str, Any],
        caption: str = "",
    ) -> List[Dict[str, Any]]:
        raw_candidates: List[Any] = []

        for container in (classification, result_data, parsed):
            raw_candidates.extend(_iter_account_like_values(container))

        raw_candidates.extend(self._extract_caption_mentions(caption))
        candidates = _dedupe_account_candidates(raw_candidates)

        if candidates:
            logger.info(
                "📎 Found %d candidate account/profile objects for location enrichment",
                len(candidates),
            )

        return candidates

    def _maybe_enrich_locations_from_accounts(
        self,
        parsed: Dict[str, Any],
        result_data: Dict[str, Any],
        classification: Dict[str, Any],
        caption: str = "",
    ) -> None:
        location_payload = parsed.get("location")
        if not location_payload:
            return

        candidate_accounts = self._collect_candidate_accounts(
            classification=classification,
            result_data=result_data,
            parsed=parsed,
            caption=caption,
        )
        if not candidate_accounts:
            return

        locations_before, was_single = _coerce_locations_to_list(location_payload)
        if not locations_before:
            return

        try:
            loop = asyncio.new_event_loop()
            try:
                asyncio.set_event_loop(loop)
                locations_after = loop.run_until_complete(
                    enrich_locations_with_accounts(
                        locations=locations_before,
                        mentioned_accounts=candidate_accounts,
                        fetch_account=meta_client.get_instagram_profile,
                    )
                )
            finally:
                asyncio.set_event_loop(None)
                loop.close()
        except Exception as exc:
            logger.warning("📍 Location account enrichment failed (non-fatal): %s", exc)
            return

        changed_count = _count_location_enrichment_changes(locations_before, locations_after)
        if changed_count:
            logger.info("📍 Enriched %d location entries from account/profile metadata", changed_count)

        parsed["location"] = locations_after[0] if was_single and locations_after else locations_after

    def _extract_frame_images(
        self,
        transcript: str,
        caption: str,
        extraction_content_type: str,
        video_path: Optional[str],
        duration_seconds: Optional[int],
        silent: bool,
        is_tools: bool,
        is_location_list: bool,
        promised_count: int,
    ) -> List[str]:
        if not video_path:
            logger.warning("⚠️ video_path is None, frames cannot be extracted")
            return []

        has_good_transcript = len(transcript.strip()) > 200

        if is_location_list:
            frame_images = extract_and_stitch_frames(
                video_path,
                duration_seconds=duration_seconds,
                n_raw_frames=12,
                n_composites=4,
                is_silent=silent,
                start_offset_seconds=0.0,
            )
            logger.info(
                "📍 Location list, %d composite frames (12 raw stitched 3-per-composite, from 0s)",
                len(frame_images),
            )
            return frame_images

        if is_tools and not has_good_transcript:
            if silent and promised_count >= 3:
                n_raw = min(promised_count * 3, 24)
                n_comp = min(promised_count, 8)
                frame_images = extract_and_stitch_frames(
                    video_path,
                    duration_seconds=duration_seconds,
                    n_raw_frames=n_raw,
                    n_composites=n_comp,
                    is_silent=True,
                    start_offset_seconds=0.0,
                )
                logger.info(
                    "🎵 Silent list, %d composite frames (%d raw, promised=%d items)",
                    len(frame_images),
                    n_raw,
                    promised_count,
                )
                return frame_images

            frame_images = extract_video_frames_base64(
                video_path,
                duration_seconds=duration_seconds,
                max_frames=4,
                is_silent=silent,
            )
            if frame_images:
                logger.info("🎞️ %d frames (structured list, short transcript)", len(frame_images))
            return frame_images

        if should_extract_frames(
            transcript,
            caption,
            extraction_content_type,
            transcription_status="music_only" if silent else "",
        ):
            frame_images = extract_video_frames_base64(
                video_path,
                duration_seconds=duration_seconds,
                max_frames=3,
                is_silent=silent,
            )
            if frame_images:
                logger.info("🎞️ %d frames (heuristic)", len(frame_images))
            return frame_images

        return []

    def extract(
        self,
        transcript: str,
        caption: str,
        lang: str,
        classification: Dict,
        video_path: str = None,
        duration_seconds: int = None,
        is_silent: bool = False,
    ) -> Dict:
        logger.info("🔍 UniversalExtractor.extract() called!")
        self.api_call_count = 0
        self._call_log = []

        transcript = transcript or ""
        caption = caption or ""
        lang = (lang or "unknown").strip() or "unknown"
        classification = classification or {}

        requested_public_content_type = _normalize_requested_public_content_type(classification)
        signals = classification.get("signals", {}) or {}

        effective_lang = _resolve_effective_language(lang, caption, transcript)
        is_english_content = is_english(effective_lang)

        logger.info(
            "🌍 Language resolution: upstream=%s effective=%s english_path=%s",
            lang,
            effective_lang,
            is_english_content,
        )

        if (len(transcript.strip()) + len(caption.strip())) < 80 and len(caption.strip()) < 40:
            return self._bookmark_mode(caption, effective_lang)

        promised_count = _caption_promised_count(caption)
        if not promised_count:
            promised_count = _transcript_promised_count(transcript)
            if promised_count:
                logger.info("🔢 Promised count from transcript opener: %d", promised_count)

        combined_text = f"{transcript} {caption}"

        mention_verdicts = count_mention_verdict_items(caption)
        mention_items = count_plain_mentions(caption)

        looks_ranked = _looks_like_global_ranking(transcript, caption)
        looks_educational_explainer = looks_like_educational_numbered_explainer(
            transcript,
            caption,
        )

        is_location_list = is_location_list_content(transcript, caption)
        looks_spoken_recipe = _looks_like_spoken_recipe(transcript, caption)

        if looks_spoken_recipe and requested_public_content_type not in {"workout", "location"}:
            requested_public_content_type = "recipe"
            is_location_list = False
            logger.info("🍳 Spoken recipe guard: routing content as recipe")

        if requested_public_content_type in {"recipe", "workout"} and is_location_list:
            is_location_list = False
            logger.info(
                "📍 Location-list detection suppressed because requested family is %s",
                requested_public_content_type,
            )

        if is_location_list:
            if mention_verdicts >= 3:
                is_location_list = False
                logger.info(
                    "📍 Location false-positive suppressed, %d @mention verdict entries detected",
                    mention_verdicts,
                )
            elif (
                len(_CHEZ_BRAND_RE.findall(combined_text)) >= 3
                and bool(_FASHION_PRODUCT_RE.search(combined_text))
            ):
                is_location_list = False
                logger.info(
                    "📍 Location false-positive suppressed, repeated 'chez [Brand]' + fashion/product nouns"
                )
            elif looks_ranked and (
                signals.get("tool_kw", 0) >= 1 or promised_count >= 3
            ):
                is_location_list = False
                logger.info(
                    "📍 Location false-positive suppressed, strong ranking signals with tool/product context"
                )

        requested_structured_product_family = (
            requested_public_content_type in _STRUCTURED_PRODUCT_FAMILIES
            or requested_public_content_type == "tools"
        )

        is_tools = (
            not is_location_list
            and not looks_educational_explainer
            and requested_public_content_type != "recipe"
            and (
                is_tools_list_content(transcript, caption)
                or signals.get("tool_kw", 0) >= 2
                or requested_structured_product_family
                or _is_ranked_list_transcript(transcript)
                or looks_ranked
                or mention_verdicts >= 3
            )
        )

        if looks_spoken_recipe and is_tools:
            is_tools = False
            logger.info("🍳 Spoken recipe guard: suppressing tools/list extraction")

        silent = is_silent or is_silent_video("", transcript)

        if (
            not is_tools
            and not is_location_list
            and requested_public_content_type != "recipe"
            and promised_count >= 3
            and not looks_educational_explainer
        ):
            is_tools = True
            logger.info(
                "📋 List promoted to structured extraction (%d items promised, silent=%s)",
                promised_count,
                silent,
            )

        public_content_type = _route_public_family(
            requested_public_content_type,
            transcript,
            caption,
            is_location_list,
            is_tools,
        )

        if requested_public_content_type in {"recipe", "workout"}:
            extraction_content_type = requested_public_content_type
        elif requested_public_content_type == "location" or is_location_list:
            extraction_content_type = "location"
        elif is_tools:
            extraction_content_type = "tools"
        else:
            extraction_content_type = "general"

        logger.info(
            "🏷️ Family routing: requested=%s public=%s internal=%s",
            requested_public_content_type,
            public_content_type,
            extraction_content_type,
        )

        subtype_hint = _default_subtype_for_family(public_content_type)
        pre_subtype = pre_detect_list_subtype(transcript, caption)

        if is_tools:
            if looks_ranked:
                subtype_hint = "places" if pre_subtype == "places" else "ranking"
                logger.info("🔧 Structured-list, subtype forced to %r", subtype_hint)
            elif mention_verdicts >= 3:
                subtype_hint = "verdict"
                logger.info(
                    "🔧 Structured-list, subtype forced to 'verdict' (%d @mention entries)",
                    mention_verdicts,
                )
            elif mention_items >= 3:
                subtype_hint = pre_subtype or "picks"
                logger.info(
                    "🔧 Structured-list, subtype from plain mentions: %s (%d mentions)",
                    subtype_hint,
                    mention_items,
                )
            else:
                if public_content_type == "software" and pre_subtype in {"picks", "grouped", "software"}:
                    subtype_hint = "software"
                elif public_content_type == "products" and pre_subtype in {"picks", "grouped", "lifestyle", "gear", "food"}:
                    subtype_hint = pre_subtype if pre_subtype in {"lifestyle", "gear", "food"} else "grouped"
                elif public_content_type == "finance" and pre_subtype in {"picks", "grouped", "software"}:
                    subtype_hint = "grouped"
                elif public_content_type == "location" and pre_subtype == "places":
                    subtype_hint = "places"
                else:
                    subtype_hint = pre_subtype or _default_subtype_for_family(public_content_type)

                logger.info("🔧 Structured-list, subtype: %s", subtype_hint)

        elif is_location_list:
            n = count_numbered_caption_items(caption)
            logger.info("📍 Location-list, %d numbered items in caption", n)
        elif looks_educational_explainer:
            logger.info(
                "🧠 Numbered explainer detected, keeping out of structured-list mode despite promised count=%d",
                promised_count,
            )

        logger.info("🏷️ extraction_content_type resolved to: %r", extraction_content_type)

        frame_images = self._extract_frame_images(
            transcript=transcript,
            caption=caption,
            extraction_content_type=extraction_content_type,
            video_path=video_path,
            duration_seconds=duration_seconds,
            silent=silent,
            is_tools=is_tools,
            is_location_list=is_location_list,
            promised_count=promised_count,
        )

        call1_prompt = build_data_extraction_prompt(
            transcript=transcript,
            caption=caption,
            lang=effective_lang,
            content_type=extraction_content_type,
            caption_promised_count=promised_count,
        )

        if frame_images:
            call1_prompt += FRAME_LIST_INSTRUCTION
        if is_location_list:
            call1_prompt += build_location_list_instruction(caption)
            logger.info("📍 Location list instruction injected")
        elif is_tools:
            call1_prompt += build_tools_list_instruction(subtype_hint)

        prompt_trace = {
            "extractor_version": EXTRACTOR_VERSION,
            "requested_public_content_type": requested_public_content_type,
            "public_content_type": public_content_type,
            "content_type": extraction_content_type,
            "language": effective_lang,
            "is_silent": silent,
            "is_tools_content": is_tools,
            "is_location_list": is_location_list,
            "pre_detected_subtype": subtype_hint if is_tools else None,
            "caption_promised_count": promised_count,
            "mention_verdicts": mention_verdicts,
            "mention_items": mention_items,
            "looks_ranked": looks_ranked,
            "looks_educational_explainer": looks_educational_explainer,
            "looks_spoken_recipe": looks_spoken_recipe,
            "frames_sent": len(frame_images),
            "video_path_provided": bool(video_path),
            "transcript_chars": len(transcript),
            "caption_chars": len(caption),
            "call1_prompt_chars": len(call1_prompt),
            "transcript_preview": transcript[:300] if transcript else "",
            "caption_preview": caption[:300] if caption else "",
            "caption": caption,
        }

        logger.info("📞 CALL 1: Extracting structured data...")
        try:
            result_data = self._call_ai(
                call1_prompt,
                images=frame_images,
                call_type="extraction",
                subtype_hint=subtype_hint if is_tools else "",
            )
        except AIRequestExhaustedError as exc:
            logger.error("❌ CALL 1 exhausted retries, using fallback extractor: %s", exc, exc_info=True)
            return self.fallback(caption, classification)

        prompt_trace["call1_response_keys"] = (
            list(result_data.keys()) if isinstance(result_data, dict) else []
        )

        call1_raw_tools: List[dict] = []

        if extraction_content_type != "location" and isinstance(result_data, dict):
            raw_tools_block = result_data.get("tools") or {}
            if isinstance(raw_tools_block, dict):
                call1_raw_tools = raw_tools_block.get("categories", []) or []

        if call1_raw_tools:
            logger.info("🔧 Captured %d raw Call 1 tool categories", len(call1_raw_tools))

        parsed = self._parse_call1(result_data, caption, extraction_content_type, transcript=transcript)

        if is_tools and parsed.get("tools_categories"):
            before = sum(len(c.get("items", [])) for c in parsed["tools_categories"])
            parsed["tools_categories"] = _strip_garbage_recovery_items(
                parsed["tools_categories"]
            )
            after = sum(len(c.get("items", [])) for c in parsed["tools_categories"])
            if before != after:
                logger.info(
                    "🗑️ Stripped %d garbage transcript_recovery items (%d -> %d)",
                    before - after,
                    before,
                    after,
                )

        if parsed.get("location"):
            self._maybe_enrich_locations_from_accounts(
                parsed=parsed,
                result_data=result_data if isinstance(result_data, dict) else {},
                classification=classification,
                caption=caption,
            )

        final_content_type = public_content_type

        if parsed.get("location"):
            final_content_type = "location"
            logger.info("📍 public content_type confirmed -> 'location' (location populated)")
        elif parsed.get("tools_categories") and extraction_content_type != "recipe" and public_content_type != "recipe":
            inferred_family = _call_classify_structured_family_safe(
                transcript=transcript,
                caption=caption,
                category=parsed.get("category", ""),
                topic=parsed.get("topic", ""),
            )
            if inferred_family == "places":
                final_content_type = "location"
            elif inferred_family in _STRUCTURED_PRODUCT_FAMILIES:
                final_content_type = inferred_family
            elif public_content_type not in _STRUCTURED_PRODUCT_FAMILIES:
                final_content_type = "products"

            logger.info(
                "🧩 public content_type confirmed from structured list -> %r",
                final_content_type,
            )
        elif parsed.get("tools_categories"):
            logger.info("🧩 Ignoring structured-list promotion because content is recipe")

        if parsed.get("tools_categories") and final_content_type != "recipe":
            structure_analysis = analyze_structure(
                tools_categories=parsed.get("tools_categories") or [],
                category=parsed.get("category", ""),
                topic=parsed.get("topic", ""),
                transcript=transcript,
                pre_detected_hint=subtype_hint if is_tools else "",
            )
            parsed["structure_analysis"] = structure_analysis
            parsed["list_subtype"] = structure_analysis.get("list_subtype")
            parsed["is_ranked"] = bool(structure_analysis.get("is_ranked"))

            if subtype_hint == "places" and parsed["list_subtype"] in ("ranking", None):
                parsed["list_subtype"] = "places"
                logger.info("🗺️ list_subtype preserved as 'places' after structure analysis")

            logger.info(
                "🧠 Parsed structure mode=%s type=%s subtype=%s is_ranked=%s conf=%.2f",
                structure_analysis.get("mode"),
                structure_analysis.get("structure_type"),
                structure_analysis.get("list_subtype"),
                structure_analysis.get("is_ranked"),
                structure_analysis.get("confidence", 0.0),
            )
        else:
            parsed["structure_analysis"] = None
            parsed["list_subtype"] = None
            parsed["is_ranked"] = False

        if is_english_content:
            logger.info("📞 CALL 2: English summary...")
            summary_result = self._call2_english(parsed, caption)
        else:
            if parsed.get("tools_categories") and final_content_type != "recipe":
                logger.info(
                    "📞 CALL 2: Non-English structured tools path -> %s...",
                    effective_lang.upper(),
                )
                summary_result = self._call2_bilingual_structured(parsed, caption, effective_lang)
            else:
                logger.info(
                    "📞 CALL 2: Non-English summary path -> %s...",
                    effective_lang.upper(),
                )
                summary_result = self._call2_bilingual(parsed, caption, effective_lang, result_data)

        if (
            not is_english_content
            and parsed.get("tools_categories")
            and "tools_og" not in summary_result
        ):
            logger.info("📞 CALL 3: Translating tools -> %s...", effective_lang.upper())
            translated_cats = self._call3_translate_structured(
                categories=parsed["tools_categories"],
                lang=effective_lang,
            )
            if translated_cats:
                summary_result["tools_og"] = {"categories": translated_cats}
                logger.info("✅ Call 3: %d categories translated", len(translated_cats))

        prompt_trace["total_api_calls"] = self.api_call_count

        result = self._assemble_output(
            parsed,
            summary_result,
            final_content_type,
            effective_lang,
            is_english_content,
            prompt_trace=prompt_trace,
            call1_raw_tools=call1_raw_tools,
        )
        result["_content_payload"] = self._call_log
        return result

    def _bookmark_mode(self, caption: str, effective_lang: str) -> Dict:
        logger.info("⚠️ Bookmark mode activated.")
        try:
            result_data = self._call_ai(
                build_bookmark_prompt(caption, effective_lang),
                call_type="extraction",
            )
        except AIRequestExhaustedError as exc:
            logger.error("❌ Bookmark mode exhausted retries, using fallback: %s", exc, exc_info=True)
            result_data = {}

        category = validate_category(safe_str(result_data.get("category", "")), "general")
        topic = safe_str(result_data.get("topic", "")).strip()
        title_en = clean_title(safe_str(result_data.get("title", "Saved Reel")))

        hashtags = [
            str(tag).lstrip("#").strip()
            for tag in safe_list(result_data.get("hashtags", []))
            if str(tag).strip()
        ][:5]

        emojis = [
            emoji.strip()
            for emoji in safe_list(result_data.get("emojis", []))
            if isinstance(emoji, str) and emoji.strip()
        ][:4]

        summary_en = BOOKMARK_MESSAGES["en"]
        summary_og = BOOKMARK_MESSAGES.get(
            effective_lang[:2].lower(),
            BOOKMARK_MESSAGES["en"],
        )

        return {
            "content_type": "general",
            "extractor_version": EXTRACTOR_VERSION + "-bookmark",
            "category": category,
            "topic": topic,
            "title": title_en,
            "summary": {
                "english": {
                    "title": title_en,
                    "summary": summary_en,
                    "headlines": [],
                    "hashtags": hashtags,
                    "emojis": emojis,
                },
                "original": {
                    "title": title_en,
                    "summary": summary_og,
                    "headlines": [],
                    "hashtags": hashtags,
                    "emojis": emojis,
                },
            },
            "hashtags": hashtags,
            "emojis": emojis,
            "prompt": None,
            "debug": {"mode": "bookmark", "caption_chars": len(caption)},
            "items": None,
            "tools_list": None,
            "recipe": None,
            "location": None,
            "workout": None,
            "detected_language": effective_lang,
            "_content_payload": self._call_log,
        }

    def fallback(self, caption: str, classification: Dict) -> Dict:
        classification = classification or {}

        title = (
            derive_best_title_from_caption(caption)
            or (caption.split()[0] if caption else "Saved Content")
        )
        title = clean_title(title) or "Saved Content"

        content_type = (classification.get("label") or "general").strip().lower()
        if content_type not in _PUBLIC_CONTENT_TYPES:
            content_type = "general"

        category = validate_category("", content_type)

        fallback_paragraph, fallback_bullets = format_ai_summary(
            title_en=title,
            summary_en_raw=caption[:500] if caption else "",
            highlights_raw=[],
            content_type=content_type,
        )

        headlines = [
            {"headline": b["headline"], "text": b["description"], "emoji": ""}
            for b in fallback_bullets
        ]

        bilingual = {
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
            "content_type": content_type,
            "extractor_version": EXTRACTOR_VERSION,
            "category": category,
            "topic": "",
            "title": title,
            "summary": bilingual,
            "hashtags": [],
            "emojis": [],
            "prompt": None,
            "debug": {"mode": "fallback"},
            "items": None,
            "tools_list": None,
            "recipe": None,
            "location": None,
            "workout": None,
            "detected_language": "unknown",
            "_content_payload": [],
        }