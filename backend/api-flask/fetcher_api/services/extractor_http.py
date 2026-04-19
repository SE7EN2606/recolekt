"""
HTTP transport mixin for UniversalExtractor.

Handles all LLM API calls, retry logic, call logging, and provider switching.
Supports Mistral (default) or OpenRouter free-tier models.

Environment variables:
    MISTRAL_API_KEY               — used when USE_OPENROUTER is not set
    MISTRAL_MODEL_EXTRACTION      — primary model for Call 1 (vision + frames).
                                    default: mistral-small-latest
    MISTRAL_MODEL_SUMMARY         — model for Call 2 (text summary).
                                    default: mistral-small-latest
    MISTRAL_MODEL                 — legacy single-model override

    USE_OPENROUTER                — set to "true" to route through OpenRouter
    OPENROUTER_API_KEY            — required when USE_OPENROUTER=true
    OPENROUTER_REFERER            — your app domain

    Optional per-call model overrides (OpenRouter only):
    OPENROUTER_MODEL_EXTRACTION
    OPENROUTER_MODEL_VISION
    OPENROUTER_MODEL_SUMMARY
    OPENROUTER_MODEL_TRANSLATION
"""

from __future__ import annotations

import json
import logging
import os
import re
import time
from typing import Dict, List, Optional

import requests

from fetcher_api.services.extractor_prompts import SYSTEM_MESSAGE
from fetcher_api.services.usage_tracker import record_call

logger = logging.getLogger(__name__)

MISTRAL_API_URL = "https://api.mistral.ai/v1/chat/completions"
OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"

_ROTATE_PAUSE_SECONDS = 3
_EXHAUST_PAUSE_SECONDS = 30
_REQUEST_TIMEOUT_SECONDS = 45
_REQUEST_TIMEOUT_LARGE = 90  # large models need more headroom

# OpenRouter free-tier model routing
_OR_MODELS = {
    "extraction": "nvidia/nemotron-3-super-120b-a12b:free",
    "vision": "google/gemma-4-31b-it:free",
    "summary": "nvidia/nemotron-3-super-120b-a12b:free",
    "translation": "google/gemma-4-31b-it:free",
}


class HttpMixin:
    """
    LLM HTTP transport layer.

    Mistral path:
      - default model is mistral-small-latest
      - fallback chain intentionally remains single-model unless explicitly overridden
      - open-mistral-nemo is intentionally excluded

    OpenRouter path:
      - uses per-call model routing with optional env overrides

    _call_ai contract:
      - ALWAYS returns a dict (never raises, never returns None).
      - On total exhaustion it returns {} and logs an error.
      - Callers (_parse_call1 etc.) handle {} gracefully via .get() guards.
      - The only exception to the no-raise rule is a non-retryable HTTPError
        (e.g. 401 Unauthorized), which should surface immediately.
    """

    def __init__(self):
        use_openrouter = os.getenv("USE_OPENROUTER", "").lower() in ("true", "1", "yes")

        if use_openrouter:
            api_key = os.getenv("OPENROUTER_API_KEY")
            if not api_key:
                raise ValueError("OPENROUTER_API_KEY not found in environment")

            self._api_url = OPENROUTER_API_URL
            self._api_key = api_key
            self._use_openrouter = True
            logger.info("🔑 OpenRouter ready (%s...)", api_key[:12])

        else:
            api_key = os.getenv("MISTRAL_API_KEY")
            if not api_key:
                raise ValueError("MISTRAL_API_KEY not found in environment")

            self._api_url = MISTRAL_API_URL
            self._api_key = api_key
            self._use_openrouter = False

            # Legacy single-model override takes priority if set
            legacy = os.getenv("MISTRAL_MODEL", "").strip()

            primary_extraction = legacy or os.getenv(
                "MISTRAL_MODEL_EXTRACTION", "mistral-small-latest"
            ).strip()
            primary_summary = legacy or os.getenv(
                "MISTRAL_MODEL_SUMMARY", "mistral-small-latest"
            ).strip()

            # Intentionally single-model by default. Do not include open-mistral-nemo.
            self._chain_extraction: List[str] = _build_chain(
                primary_extraction,
                ["mistral-small-latest"],
            )
            self._chain_summary: List[str] = _build_chain(
                primary_summary,
                ["mistral-small-latest"],
            )

            logger.info(
                "🔑 Mistral HTTP ready (%s...) — extraction chain=%s  summary chain=%s",
                api_key[:12],
                self._chain_extraction,
                self._chain_summary,
            )

        self.api_call_count = 0
        self._call_log: List[Dict] = []

    # ── Model selection ────────────────────────────────────────────────────

    def _get_chain(self, call_type: str, has_images: bool = False) -> List[str]:
        """Return the ordered model fallback chain for this call type."""
        if self._use_openrouter:
            if has_images:
                return [os.getenv("OPENROUTER_MODEL_VISION", _OR_MODELS["vision"])]
            return [os.getenv(
                f"OPENROUTER_MODEL_{call_type.upper()}",
                _OR_MODELS.get(call_type, _OR_MODELS["extraction"]),
            )]

        if call_type in ("extraction", "vision") or has_images:
            return self._chain_extraction
        return self._chain_summary

    # ── Raw content helpers ───────────────────────────────────────────────

    @staticmethod
    def _strip_code_fences(raw: str) -> str:
        s = (raw or "").strip()
        if s.startswith("```"):
            s = re.sub(r"^```(?:json|JSON)?\s*\n?", "", s)
            s = re.sub(r"\n?```\s*$", "", s)
        return s.strip()

    @staticmethod
    def _is_retryable_status(status_code: int) -> bool:
        return status_code in (408, 409, 425, 429, 500, 502, 503, 504)

    # ── Places normalizer ─────────────────────────────────────────────────

    @staticmethod
    def _normalize_places_response(content: Dict) -> Dict:
        """
        When the extraction is a place-ranking, the model correctly fills
        tools.categories[].items[].location_meta but leaves location=null
        because the prompt hardcodes that rule.

        This normalizer promotes location_meta data into the top-level
        `location` array so the frontend can render it properly.

        It also cleans up camelCase bleed in `category` and `topic`.
        """
        for field in ("category", "topic"):
            val = content.get(field, "")
            if val and val == val.replace(" ", "") and not val.isupper():
                fixed = re.sub(r"(?<=[a-z])(?=[A-Z])", " ", val)
                content[field] = fixed

        if content.get("location"):
            return content

        tools = content.get("tools") or {}
        categories = tools.get("categories") or []

        promoted = []
        for cat in categories:
            for item in cat.get("items") or []:
                name = (item.get("name") or "").strip()
                if not name:
                    continue

                meta = item.get("location_meta") or {}
                if not meta and not item.get("rank"):
                    continue

                promoted.append({
                    "name": name,
                    "rank": item.get("rank"),
                    "type": meta.get("type") or "Town",
                    "region": meta.get("region") or "",
                    "country": meta.get("country") or "",
                    "description": item.get("description") or "",
                    "creator_rating": item.get("creator_rating"),
                    "lat": None,
                    "lng": None,
                })

        if promoted:
            promoted.sort(key=lambda x: (x.get("rank") is None, x.get("rank") or 999))
            content["location"] = promoted
            logger.info(
                "📍 _normalize_places_response: promoted %d places into location[]",
                len(promoted),
            )

        return content

    # ── Core HTTP call with retry / rotation ──────────────────────────────

    def _call_ai(
        self,
        prompt: str,
        max_retries: int = 4,
        images: Optional[List[str]] = None,
        call_type: str = "extraction",
        subtype_hint: str = "",
    ) -> Dict:
        """
        Call the LLM API with retry logic.

        Always returns a dict. Never raises. On total exhaustion, logs an error
        and returns {} so callers can degrade gracefully without crashing.

        The sole exception: non-retryable HTTP errors (e.g. 401 Unauthorized)
        are re-raised immediately because retrying them is pointless and they
        indicate a configuration problem that needs surfacing.
        """
        chain = self._get_chain(call_type, has_images=bool(images))

        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }
        if self._use_openrouter:
            headers["HTTP-Referer"] = os.getenv("OPENROUTER_REFERER", "https://rekolekt.app")
            headers["X-Title"] = "Rekolekt"

        if images:
            content_parts = [
                {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{img}"}}
                for img in images
            ]
            content_parts.append({"type": "text", "text": prompt})
            user_message = {"role": "user", "content": content_parts}
            logger.info("🖼️ %d frames attached", len(images))
        else:
            user_message = {"role": "user", "content": prompt}

        total_attempts = 0
        max_attempts = max(1, max_retries + 1)

        while total_attempts < max_attempts:
            for model in chain:
                if total_attempts >= max_attempts:
                    break

                total_attempts += 1

                payload = {
                    "model": model,
                    "messages": [
                        {"role": "system", "content": SYSTEM_MESSAGE},
                        user_message,
                    ],
                    "response_format": {"type": "json_object"},
                    "temperature": 0.1,
                }

                _timeout = (
                    _REQUEST_TIMEOUT_LARGE
                    if "large" in model.lower()
                    else _REQUEST_TIMEOUT_SECONDS
                )

                try:
                    logger.info(
                        "🤖 [%s] %s (attempt %d/%d, timeout=%ds)...",
                        call_type, model, total_attempts, max_attempts, _timeout,
                    )
                    self.api_call_count += 1

                    resp = requests.post(
                        self._api_url,
                        headers=headers,
                        json=payload,
                        timeout=_timeout,
                    )

                    if self._is_retryable_status(resp.status_code):
                        logger.warning(
                            "⚠️ [%s] %s returned %s — retrying/rotating",
                            call_type, model, resp.status_code,
                        )
                        record_call(prompt_len=len(prompt), response_len=0, error=True)
                        time.sleep(_ROTATE_PAUSE_SECONDS)
                        continue

                    # Non-retryable HTTP errors (401, 403, 404 etc.) — surface immediately.
                    resp.raise_for_status()

                    raw = resp.json()["choices"][0]["message"]["content"]
                    raw = self._strip_code_fences(raw)

                    try:
                        content = json.loads(raw)
                    except json.JSONDecodeError as exc:
                        logger.error(
                            "❌ [%s] %s returned invalid JSON on attempt %d: %s | raw=%r",
                            call_type, model, total_attempts, exc, raw[:300],
                        )
                        record_call(prompt_len=len(prompt), response_len=0, error=True)
                        time.sleep(_ROTATE_PAUSE_SECONDS)
                        continue

                    if subtype_hint == "places" or call_type == "extraction":
                        content = self._normalize_places_response(content)

                    self._call_log.append({
                        "call_number": self.api_call_count,
                        "model": model,
                        "call_type": call_type,
                        "images_count": len(images) if images else 0,
                        "system_prompt": SYSTEM_MESSAGE,
                        "prompt": prompt,
                        "response": content,
                    })
                    record_call(prompt_len=len(prompt), response_len=len(raw))
                    logger.info("✅ [%s] success via %s", call_type, model)
                    return content

                except requests.Timeout:
                    logger.error(
                        "❌ [%s] %s timeout on attempt %d",
                        call_type, model, total_attempts,
                    )
                    record_call(prompt_len=len(prompt), response_len=0, error=True)
                    time.sleep(_ROTATE_PAUSE_SECONDS)
                    continue

                except requests.HTTPError as e:
                    status = getattr(e.response, "status_code", None)
                    logger.error(
                        "❌ [%s] %s HTTP error on attempt %d: %s (status=%s)",
                        call_type, model, total_attempts, e, status,
                    )
                    record_call(prompt_len=len(prompt), response_len=0, error=True)

                    if status is not None and self._is_retryable_status(status):
                        time.sleep(_ROTATE_PAUSE_SECONDS)
                        continue

                    # Non-retryable (401, 403, etc.) — re-raise so the caller
                    # knows this is a configuration error, not a transient one.
                    raise

                except requests.RequestException as e:
                    logger.error(
                        "❌ [%s] %s request error on attempt %d: %s",
                        call_type, model, total_attempts, e,
                    )
                    record_call(prompt_len=len(prompt), response_len=0, error=True)
                    time.sleep(_ROTATE_PAUSE_SECONDS)
                    continue

                except Exception as e:
                    # Unexpected errors (e.g. KeyError in response parsing).
                    # Log with full traceback but continue the retry loop
                    # rather than re-raising — the next model attempt may succeed.
                    logger.error(
                        "❌ [%s] %s unexpected error on attempt %d: %s",
                        call_type, model, total_attempts, e,
                        exc_info=True,
                    )
                    record_call(prompt_len=len(prompt), response_len=0, error=True)
                    time.sleep(_ROTATE_PAUSE_SECONDS)
                    continue

            if total_attempts < max_attempts:
                logger.warning(
                    "⚠️ All models in chain failed for now. Sleeping %ds before final retries...",
                    _EXHAUST_PAUSE_SECONDS,
                )
                time.sleep(_EXHAUST_PAUSE_SECONDS)

        # All attempts exhausted. Return empty dict so extract() degrades gracefully
        # instead of crashing into the analyze_content fallback path.
        logger.error(
            "🔥 _call_ai [%s] exhausted all %d attempts across models: %s — returning {}",
            call_type,
            total_attempts,
            chain,
        )
        return {}

    # ── Fallback summary (used when AI call fails entirely) ───────────────

    @staticmethod
    def fallback_summary(title: str, content_type: str) -> str:
        base = (title or "Saved content").strip()

        if content_type == "recipe":
            return (
                f"{base} works as a recipe reference, preserving the core ingredients, "
                f"prep flow, and cooking intent for revisiting later."
            )
        if content_type == "workout":
            return (
                f"{base} works as a workout reference, preserving the main exercises, "
                f"training focus, and session structure for reuse later."
            )
        if content_type == "location":
            return (
                f"{base} works as a location reference, keeping the main place ideas "
                f"or route details easy to revisit later."
            )
        if content_type in ("products", "software", "finance", "tools"):
            return (
                f"{base} works as a comparison reference, keeping the main options, "
                f"trade-offs, or item groupings easy to revisit later."
            )

        return (
            f"{base} works as a saved reference, keeping the main practical ideas "
            f"and useful details easy to revisit later."
        )


# ── Helpers ─────────────────────────────────────────────────────────────────


def _build_chain(primary: str, defaults: List[str]) -> List[str]:
    """
    Build a deduplicated model chain starting with `primary`,
    followed by any `defaults` not already in the chain.
    """
    primary = (primary or "").strip()
    chain = [primary] if primary else []
    for m in defaults:
        m = (m or "").strip()
        if m and m not in chain:
            chain.append(m)
    return chain