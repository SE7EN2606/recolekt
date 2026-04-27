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

_ROTATE_PAUSE_SECONDS = 3
_EXHAUST_PAUSE_SECONDS = 30
_REQUEST_TIMEOUT_SECONDS = 45
_REQUEST_TIMEOUT_LARGE = 90


class AIRequestExhaustedError(RuntimeError):
    pass


class HttpMixin:
    def __init__(self):
        api_key = os.getenv("MISTRAL_API_KEY")
        if not api_key:
            raise ValueError("MISTRAL_API_KEY not found in environment")

        self._api_url = MISTRAL_API_URL
        self._api_key = api_key

        legacy = os.getenv("MISTRAL_MODEL", "").strip()
        primary_extraction = legacy or os.getenv("MISTRAL_MODEL_EXTRACTION", "mistral-large-latest").strip()
        primary_summary = legacy or os.getenv("MISTRAL_MODEL_SUMMARY", "mistral-small-latest").strip()

        self._chain_extraction: List[str] = _build_chain(
            primary_extraction,
            ["mistral-small-latest"],
        )
        self._chain_summary: List[str] = _build_chain(
            primary_summary,
            ["mistral-small-latest"],
        )

        logger.info(
            "🔑 Mistral HTTP ready (%s...) — extraction chain=%s summary chain=%s",
            api_key[:12],
            self._chain_extraction,
            self._chain_summary,
        )

        self.api_call_count = 0
        self._call_log: List[Dict] = []

    def _get_chain(self, call_type: str, has_images: bool = False) -> List[str]:
        if call_type in ("extraction", "vision") or has_images:
            return self._chain_extraction
        return self._chain_summary

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

    @staticmethod
    def _normalize_places_response(content: Dict) -> Dict:
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
                    "type": meta.get("type") or "",
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
            logger.info("📍 _normalize_places_response: promoted %d places into location[]", len(promoted))

        return content

    def _call_ai(
        self,
        prompt: str,
        max_retries: int = 4,
        images: Optional[List[str]] = None,
        call_type: str = "extraction",
        subtype_hint: str = "",
    ) -> Dict:
        chain = self._get_chain(call_type, has_images=bool(images))

        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }

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
        last_error = None
        last_raw = None

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

                _timeout = _REQUEST_TIMEOUT_LARGE if "large" in model.lower() else _REQUEST_TIMEOUT_SECONDS

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
                        last_error = f"retryable_status_{resp.status_code}"
                        record_call(prompt_len=len(prompt), response_len=0, error=True)
                        time.sleep(_ROTATE_PAUSE_SECONDS)
                        continue

                    resp.raise_for_status()

                    raw = resp.json()["choices"]["message"]["content"]
                    last_raw = raw
                    raw = self._strip_code_fences(raw)

                    try:
                        content = json.loads(raw)
                    except json.JSONDecodeError as exc:
                        last_error = f"json_decode_error:{exc}"
                        logger.error(
                            "❌ [%s] %s returned invalid JSON on attempt %d: %s | raw=%r",
                            call_type, model, total_attempts, exc, raw[:300],
                        )
                        record_call(prompt_len=len(prompt), response_len=0, error=True)
                        time.sleep(_ROTATE_PAUSE_SECONDS)
                        continue

                    if subtype_hint == "places":
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

                except requests.Timeout as e:
                    last_error = f"timeout:{e}"
                    logger.error(
                        "❌ [%s] %s timeout on attempt %d",
                        call_type, model, total_attempts,
                    )
                    record_call(prompt_len=len(prompt), response_len=0, error=True)
                    time.sleep(_ROTATE_PAUSE_SECONDS)
                    continue

                except requests.HTTPError as e:
                    status = getattr(e.response, "status_code", None)
                    last_error = f"http_error:{status}"
                    logger.error(
                        "❌ [%s] %s HTTP error on attempt %d: %s (status=%s)",
                        call_type, model, total_attempts, e, status,
                    )
                    record_call(prompt_len=len(prompt), response_len=0, error=True)

                    if status is not None and self._is_retryable_status(status):
                        time.sleep(_ROTATE_PAUSE_SECONDS)
                        continue

                    raise

                except requests.RequestException as e:
                    last_error = f"request_exception:{e}"
                    logger.error(
                        "❌ [%s] %s request error on attempt %d: %s",
                        call_type, model, total_attempts, e,
                    )
                    record_call(prompt_len=len(prompt), response_len=0, error=True)
                    time.sleep(_ROTATE_PAUSE_SECONDS)
                    continue

                except Exception as e:
                    last_error = f"unexpected:{e}"
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

        logger.error(
            "🔥 _call_ai [%s] exhausted all %d attempts across models=%s, last_error=%s, last_raw=%r",
            call_type,
            total_attempts,
            chain,
            last_error,
            (last_raw[:300] if isinstance(last_raw, str) else last_raw),
        )
        raise AIRequestExhaustedError(
            f"_call_ai exhausted retries for call_type={call_type}, last_error={last_error}"
        )

    @staticmethod
    def fallback_summary(title: str, content_type: str) -> str:
        base = (title or "Saved content").strip()

        if content_type == "recipe":
            return f"{base} works as a recipe reference, preserving the core ingredients, prep flow, and cooking intent for revisiting later."
        if content_type == "workout":
            return f"{base} works as a workout reference, preserving the main exercises, training focus, and session structure for reuse later."
        if content_type == "location":
            return f"{base} works as a location reference, keeping the main place ideas or route details easy to revisit later."
        if content_type in ("products", "software", "finance", "tools"):
            return f"{base} works as a comparison reference, keeping the main options, trade-offs, or item groupings easy to revisit later."

        return f"{base} works as a saved reference, keeping the main practical ideas and useful details easy to revisit later."


def _build_chain(primary: str, defaults: List[str]) -> List[str]:
    primary = (primary or "").strip()
    chain = [primary] if primary else []
    for m in defaults:
        m = (m or "").strip()
        if m and m not in chain:
            chain.append(m)
    return chain