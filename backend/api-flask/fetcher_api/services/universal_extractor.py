"""
Universal Content Extractor — orchestration only.

All heavy logic lives in dedicated mixins:
    extractor_http.py            → HttpMixin      (_call_ai, retry, model fallback)
    extractor_call1.py           → Call1Mixin     (Call 1 parsing)
    extractor_call2.py           → Call2Mixin     (Call 2 summary + Call 3 translation)
    extractor_assembly.py        → AssemblyMixin  (final output assembly)
    extractor_tools_detection.py → detection helpers

Public content families:
    "recipe" | "workout" | "location" | "products" | "software" | "finance" | "general"

Internal extraction path:
    Structured products / software / finance content still flows through the
    legacy tools extraction path for now. "tools" is therefore internal-only
    semantics during Phase 2 migration.

Structured subtype values on the legacy tools path:
    "software" | "lifestyle" | "gear" | "food" |
    "ranking" | "picks" | "verdict" | "grouped" | "places"

⚠️ MODEL CHAIN NOTE:
    extractor_http.py contains the model fallback chain.
    It MUST be set to ['mistral-small-latest'] only — do NOT include
    'open-mistral-nemo'. Nemo is weaker and fails tier-list instructions.
"""

import logging
import re
from typing import Dict, List

from fetcher_api.services.category_validator import validate_category
from fetcher_api.services.extractor_assembly import AssemblyMixin
from fetcher_api.services.extractor_call1 import Call1Mixin, _is_ranked_list_transcript
from fetcher_api.services.extractor_call2 import Call2Mixin
from fetcher_api.services.extractor_helpers import (
    clean_title,
    derive_best_title_from_caption,
    detect_caption_language,
    is_english,
    safe_list,
    safe_str,
)
from fetcher_api.services.extractor_http import HttpMixin
from fetcher_api.services.extractor_prompts import (
    build_bookmark_prompt,
    build_data_extraction_prompt,
)
from fetcher_api.services.extractor_tools_detection import (
    analyze_structure,
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
from fetcher_api.services.summary_formatter import format_ai_summary
from fetcher_api.utils.ocr_utils import (
    extract_and_stitch_frames,
    extract_video_frames_base64,
    is_silent_video,
    should_extract_frames,
)

logger = logging.getLogger(__name__)

EXTRACTOR_VERSION = "universal-v22"

BOOKMARK_MESSAGES = {
    "en": "Bookmark saved. The creator did not provide a detailed caption or transcript for this video.",
    "fr": "Signet enregistré. Le créateur n'a pas fourni de légende ou de transcription détaillée pour cette vidéo.",
    "es": "Marcador guardado. El creador no proporcionó una leyenda o transcripción detallada para este video.",
    "it": "Segnalibro salvato. Il creatore non ha fornito una didascalia o una trascrizione dettagliata per questo video.",
    "de": "Lesezeichen gespeichert. Der Ersteller hat keine detaillierte Bildunterschrift oder Transkript bereitgestellt.",
}

_STRUCTURED_PRODUCT_FAMILIES = {"products", "software", "finance"}
_PUBLIC_CONTENT_TYPES = {
    "recipe",
    "workout",
    "location",
    "products",
    "software",
    "finance",
    "general",
}

_LIST_NOUNS = (
    r"alternatives?|bags?|sacs?|handbags?|purses?|looks?|outfits?|styles?|"
    r"jackets?|coats?|shirts?|vestes?|manteaux?|serviettes?|towels?|"
    r"brands?|marques?|labels?|companies|"
    r"albums?|songs?|tracks?|records?|playlists?|"
    r"picks?|places?|spots?|destinations?|resorts?|h[oô]tels?|hotels?|"
    r"addresses?|adresses?|"
    r"tools?|apps?|products?|items?|things?|choses?|"
    r"tips?|conseils?|ideas?|id[ée]es?|ways?|fa[çc]ons?|reasons?|steps?|"
    r"movies?|films?|shows?|books?|livres?|recipes?|recettes?|"
    r"wines?|vins?|perfumes?|parfums?|fragrances?|sunscreens?|"
    r"restaurants?|dishes?|plats?|exercises?|workouts?|"
    r"options?|choices?|s[ée]lections?|recommendations?|favorites?|favoris?|favourites?|"
    r"gear|pieces?|essentials?|must.haves?"
)

_CAPTION_LIST_NOUN_RE = re.compile(
    r"\b(\d+)\s+(?:\w+\s+)?(?:" + _LIST_NOUNS + r")\b",
    re.IGNORECASE,
)

_TRANSCRIPT_LIST_OPENER_RE = re.compile(
    r"(?:here'?s?|top|best|ranked?|my)\s+(\d+)\s+(?:\w+\s+)?(?:" + _LIST_NOUNS + r")\b",
    re.IGNORECASE,
)

_SEQUENTIAL_RANK_RE = re.compile(
    r"number\s+(?:one|two|three|1|2|3).{0,400}?number\s+(?:two|three|four|2|3|4)"
    r"|(?:first|second|third).{0,400}?(?:second|third|fourth)",
    re.IGNORECASE | re.DOTALL,
)

_SPOKEN_ORDINAL_RE = re.compile(
    r"\b(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\b",
    re.IGNORECASE,
)

_NUMBERED_RANK_RE = re.compile(
    r"\bnumber\s+(?:one|two|three|four|five|six|seven|eight|nine|ten|1|2|3|4|5|6|7|8|9|10)\b",
    re.IGNORECASE,
)

_GARBAGE_NAME_START_RE = re.compile(
    r"^(?:is|are|was|were|the|a|an)\s"
    r"|^most\s"
    r"|^(?:number\s+\w+\s+)?(?:and\s+)?(?:the\s+)?most\s",
    re.IGNORECASE,
)

_CHEZ_BRAND_RE = re.compile(r"\bchez\s+[A-ZÉÈÀÂÎÔÙÛÄËÏ]", re.UNICODE)
_FASHION_PRODUCT_RE = re.compile(
    r"\b(sac|bag|bags|alternative|handbag|purse|pochette|tote|"
    r"v[êe]tement|robe|chaussure|parfum|cr[èe]me|montre|bijou|collier)\b",
    re.IGNORECASE,
)

_ENGLISH_PROSE_MARKERS = (
    " the ",
    " and ",
    " for ",
    " with ",
    " save ",
    " follow ",
    " our ",
    " road trip ",
    " best time to visit ",
    " must-see ",
    " hike ",
    " views ",
    " less than ",
    " through ",
    " without ",
    " one of the most ",
    " known as ",
    " arrive early ",
    " rent a rowboat ",
    " parking ",
    " take the cable car ",
    " short hike ",
    " worth it ",
    " hidden gem ",
)


def _looks_clearly_english(text: str) -> bool:
    t = f" {safe_str(text).lower()} "
    if len(t.strip()) < 120:
        return False

    hits = sum(1 for marker in _ENGLISH_PROSE_MARKERS if marker in t)
    ascii_ratio = sum(1 for ch in t if ord(ch) < 128) / max(1, len(t))

    return hits >= 4 and ascii_ratio >= 0.97


def _resolve_effective_language(
    upstream_lang: str,
    caption: str,
    transcript: str = "",
) -> str:
    """
    Conservative language resolution.

    Priority:
      1. If the caption/transcript is clearly English prose, force 'en'.
      2. Otherwise trust upstream when present.
      3. Otherwise fall back to caption detection.
      4. Otherwise return unknown.
    """
    upstream = (upstream_lang or "").strip().lower()
    caption = caption or ""
    transcript = transcript or ""

    combined = f"{caption[:2500]} {transcript[:1200]}".strip()

    if _looks_clearly_english(combined):
        if upstream not in ("", "unknown", "en"):
            logger.info(
                "🌍 Language override: %s -> en (clear English prose detected)",
                upstream,
            )
        return "en"

    if upstream and upstream != "unknown":
        return upstream

    text = caption.strip()
    if len(text) < 40:
        return "unknown"

    try:
        detected = (detect_caption_language(text) or "").strip().lower()
    except Exception:
        logger.warning("⚠️ detect_caption_language() failed", exc_info=True)
        return "unknown"

    return detected if detected and detected != "unknown" else "unknown"


def _caption_promised_count(caption: str) -> int:
    """
    Extract promised item count from caption with minimal deterministic logic.
    """
    text = caption or ""

    match = _CAPTION_LIST_NOUN_RE.search(text)
    if match:
        return int(match.group(1))

    mention_count = count_mention_verdict_items(text)
    if mention_count >= 3:
        return mention_count

    plain_mentions = count_plain_mentions(text)
    if plain_mentions >= 3:
        return plain_mentions

    return 0


def _transcript_promised_count(transcript: str) -> int:
    """
    Extract promised item count from transcript opener with minimal deterministic logic.
    """
    if not transcript:
        return 0

    head = transcript[:600]

    match = _TRANSCRIPT_LIST_OPENER_RE.search(head)
    if match:
        return int(match.group(1))

    match = _CAPTION_LIST_NOUN_RE.search(head)
    if match:
        return int(match.group(1))

    return 0


def _looks_like_global_ranking(transcript: str, caption: str) -> bool:
    """
    Minimal strong-signal ranking detector.

    Guards against false positives from:
    - Lists of @mention picks that repeat the same emoji
    - Captions where items are ordered by listing, not by true ranking
    """
    text = f"{transcript or ''} {caption or ''}"

    if _SEQUENTIAL_RANK_RE.search(text):
        return True

    ordinal_hits = len(_SPOKEN_ORDINAL_RE.findall(text))
    numbered_hits = len(_NUMBERED_RANK_RE.findall(text))

    if not transcript.strip() and count_plain_mentions(caption) >= 3:
        return False

    return ordinal_hits >= 3 or numbered_hits >= 3


def _strip_garbage_recovery_items(categories: list) -> list:
    """
    Remove transcript_recovery items whose names are clearly raw transcript
    fragments rather than clean names.
    """
    for cat in categories or []:
        items = cat.get("items") or []
        cleaned = []

        for item in items:
            if item.get("source") != "transcript_recovery":
                cleaned.append(item)
                continue

            name = (item.get("name") or "").strip()
            if not name or len(name) > 50 or _GARBAGE_NAME_START_RE.search(name):
                logger.debug("🗑️ Dropping garbage recovery item: %r", name)
                continue

            cleaned.append(item)

        cat["items"] = cleaned

    return categories


def _default_subtype_for_family(public_content_type: str) -> str:
    """
    Return the sensible default subtype hint for a given public family,
    before pre_detect_list_subtype() has a chance to override.
    """
    if public_content_type == "software":
        return "software"
    if public_content_type == "finance":
        return "grouped"
    if public_content_type == "products":
        return "picks"
    return "software"


class UniversalExtractor(HttpMixin, Call1Mixin, Call2Mixin, AssemblyMixin):
    EXTRACTOR_VERSION = EXTRACTOR_VERSION

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

        public_content_type = (classification.get("label") or "general").strip().lower()
        if public_content_type not in _PUBLIC_CONTENT_TYPES and public_content_type != "tools":
            public_content_type = "general"

        extraction_content_type = (
            "tools"
            if public_content_type in _STRUCTURED_PRODUCT_FAMILIES or public_content_type == "tools"
            else public_content_type
        )

        signals = classification.get("signals", {}) or {}

        effective_lang = _resolve_effective_language(lang, caption, transcript)
        is_english_content = is_english(effective_lang)

        logger.info(
            "🌍 Language resolution: upstream=%s effective=%s english_path=%s",
            lang,
            effective_lang,
            is_english_content,
        )
        logger.info(
            "🏷️ Family routing: public=%s internal=%s",
            public_content_type,
            extraction_content_type,
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

        if is_location_list:
            if mention_verdicts >= 3:
                is_location_list = False
                logger.info(
                    "📍 Location false-positive suppressed — %d @mention verdict entries detected",
                    mention_verdicts,
                )
            elif (
                len(_CHEZ_BRAND_RE.findall(combined_text)) >= 3
                and bool(_FASHION_PRODUCT_RE.search(combined_text))
            ):
                is_location_list = False
                logger.info(
                    "📍 Location false-positive suppressed — repeated 'chez [Brand]' + fashion/product nouns"
                )
            elif looks_ranked and (
                signals.get("tool_kw", 0) >= 1 or promised_count >= 3
            ):
                is_location_list = False
                logger.info(
                    "📍 Location false-positive suppressed — strong ranking signals with tool/product context"
                )

        is_structured_product_family = (
            public_content_type in _STRUCTURED_PRODUCT_FAMILIES
            or public_content_type == "tools"
        )

        is_tools = (
            not is_location_list
            and not looks_educational_explainer
            and (
                is_tools_list_content(transcript, caption)
                or signals.get("tool_kw", 0) >= 2
                or is_structured_product_family
                or _is_ranked_list_transcript(transcript)
                or looks_ranked
                or mention_verdicts >= 3
            )
        )

        subtype_hint = _default_subtype_for_family(public_content_type)
        pre_subtype = pre_detect_list_subtype(transcript, caption)

        if is_tools:
            if looks_ranked:
                subtype_hint = "places" if pre_subtype == "places" else "ranking"
                logger.info("🔧 Structured-list — subtype forced to %r", subtype_hint)
            elif mention_verdicts >= 3:
                subtype_hint = "verdict"
                logger.info(
                    "🔧 Structured-list — subtype forced to 'verdict' (%d @mention entries)",
                    mention_verdicts,
                )
            elif mention_items >= 3:
                subtype_hint = pre_subtype or "picks"
                logger.info(
                    "🔧 Structured-list — subtype from plain mentions: %s (%d mentions)",
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
                else:
                    subtype_hint = pre_subtype or _default_subtype_for_family(public_content_type)

                logger.info("🔧 Structured-list — subtype: %s", subtype_hint)

        elif is_location_list:
            n = count_numbered_caption_items(caption)
            logger.info("📍 Location-list — %d numbered items in caption", n)
        elif looks_educational_explainer:
            logger.info(
                "🧠 Numbered explainer detected — keeping out of structured-list mode despite promised count=%d",
                promised_count,
            )

        silent = is_silent or is_silent_video("", transcript)

        if (
            not is_tools
            and not is_location_list
            and promised_count >= 3
            and not looks_educational_explainer
        ):
            is_tools = True

            if looks_ranked:
                subtype_hint = "places" if pre_subtype == "places" else "ranking"
            elif mention_verdicts >= 3:
                subtype_hint = "verdict"
            elif mention_items >= 3:
                subtype_hint = pre_subtype or "picks"
            else:
                if public_content_type == "software":
                    subtype_hint = "software"
                elif public_content_type == "finance":
                    subtype_hint = "grouped"
                else:
                    subtype_hint = pre_subtype or _default_subtype_for_family(public_content_type)

            logger.info(
                "📋 List promoted to structured extraction (%d items promised, subtype=%s, silent=%s)",
                promised_count,
                subtype_hint,
                silent,
            )

        if is_location_list:
            extraction_content_type = "location"
        elif is_tools:
            extraction_content_type = "tools"

        logger.info("🏷️ extraction_content_type resolved to: %r", extraction_content_type)

        frame_images = []

        if video_path:
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
                    "📍 Location list — %d composite frames (12 raw stitched 3-per-composite, from 0s)",
                    len(frame_images),
                )

            elif is_tools and not has_good_transcript:
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
                        "🎵 Silent list — %d composite frames (%d raw, promised=%d items)",
                        len(frame_images),
                        n_raw,
                        promised_count,
                    )
                else:
                    frame_images = extract_video_frames_base64(
                        video_path,
                        duration_seconds=duration_seconds,
                        max_frames=4,
                        is_silent=silent,
                    )
                    if frame_images:
                        logger.info("🎞️ %d frames (structured list, short transcript)", len(frame_images))

            else:
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
        else:
            logger.warning("⚠️ video_path is None — frames cannot be extracted")

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
        result_data = self._call_ai(call1_prompt, images=frame_images, call_type="extraction")
        prompt_trace["call1_response_keys"] = (
            list(result_data.keys()) if isinstance(result_data, dict) else []
        )

        call1_raw_tools: List[dict] = []
        if isinstance(result_data, dict):
            raw_tools_block = result_data.get("tools") or {}
            if isinstance(raw_tools_block, dict):
                call1_raw_tools = raw_tools_block.get("categories", [])
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
                    "🗑️ Stripped %d garbage transcript_recovery items (%d → %d)",
                    before - after,
                    before,
                    after,
                )

        final_content_type = public_content_type

        if parsed.get("location"):
            final_content_type = "location"
            logger.info("📍 public content_type confirmed → 'location' (location populated)")
        elif parsed.get("tools_categories"):
            if public_content_type not in _STRUCTURED_PRODUCT_FAMILIES:
                final_content_type = "products"
            logger.info(
                "🧩 public content_type confirmed from structured list → %r",
                final_content_type,
            )

        if parsed.get("tools_categories"):
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
            if parsed.get("tools_categories"):
                logger.info(
                    "📞 CALL 2: Non-English structured tools path → %s...",
                    effective_lang.upper(),
                )
                summary_result = self._call2_bilingual_structured(parsed, caption, effective_lang)
            else:
                logger.info(
                    "📞 CALL 2: Non-English summary path → %s...",
                    effective_lang.upper(),
                )
                summary_result = self._call2_bilingual(parsed, caption, effective_lang, result_data)

        if (
            not is_english_content
            and parsed.get("tools_categories")
            and "tools_og" not in summary_result
        ):
            logger.info("📞 CALL 3: Translating tools → %s...", effective_lang.upper())
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
        result_data = self._call_ai(
            build_bookmark_prompt(caption, effective_lang),
            call_type="extraction",
        )

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
            "workout": None,
            "detected_language": "unknown",
            "_content_payload": [],
        }