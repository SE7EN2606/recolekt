from __future__ import annotations

import json
import logging
import os
from typing import Any, Dict, List

import requests

from fetcher_api.services.usage_tracker import record_call

logger = logging.getLogger(__name__)

MISTRAL_API_URL = "https://api.mistral.ai/v1/chat/completions"
REQUEST_TIMEOUT_SECONDS = 45


def _stringify_json(value: Any, max_chars: int = 16000) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        text = value
        try:
            parsed = json.loads(value)
            text = json.dumps(parsed, ensure_ascii=False, indent=2)
        except Exception:
            pass
    else:
        text = json.dumps(value, ensure_ascii=False, indent=2)

    if len(text) > max_chars:
        return text[:max_chars] + "\n...[truncated]"
    return text


def _extract_transcript(transcription: Any) -> str:
    if not transcription:
        return ""
    if isinstance(transcription, dict):
        return transcription.get("transcript") or ""
    if isinstance(transcription, str):
        try:
            parsed = json.loads(transcription)
            if isinstance(parsed, dict):
                return parsed.get("transcript") or transcription
        except Exception:
            return transcription
    return str(transcription)


def _extract_missing_info(recipe: Any) -> List[str]:
    missing: List[str] = []

    def walk(obj: Any):
        if isinstance(obj, dict):
            if isinstance(obj.get("missingInfo"), list):
                for item in obj["missingInfo"]:
                    if isinstance(item, dict):
                        msg = item.get("message") or item.get("field") or ""
                        if msg:
                            missing.append(str(msg))
                    elif item:
                        missing.append(str(item))

            for value in obj.values():
                walk(value)

        elif isinstance(obj, list):
            for value in obj:
                walk(value)

    walk(recipe)

    # Deduplicate while preserving order.
    seen = set()
    out = []
    for item in missing:
        key = item.strip().lower()
        if key and key not in seen:
            seen.add(key)
            out.append(item.strip())

    return out[:8]


def answer_recipe_question(
    *,
    question: str,
    recipe: Any,
    caption: str = "",
    transcription: Any = None,
    language: str = "en",
) -> Dict[str, Any]:
    api_key = os.getenv("MISTRAL_API_KEY")
    if not api_key:
        raise RuntimeError("MISTRAL_API_KEY is not set")

    question = (question or "").strip()
    if not question:
        raise ValueError("Question is required")

    transcript = _extract_transcript(transcription)
    missing_info = _extract_missing_info(recipe)

    recipe_text = _stringify_json(recipe, max_chars=18000)
    caption_text = (caption or "")[:8000]
    transcript_text = (transcript or "")[:8000]

    system = (
        "You are Recolekt's Recipe Assistant.\n"
        "Answer practical cooking questions using ONLY the provided recipe, caption, and transcript.\n"
        "Be useful, direct, and honest.\n"
        "Do not introduce ingredients, dishes, techniques, or assumptions that are not present in the provided context.\n"
        "If exact information is missing, say it is missing and give a safe practical suggestion.\n"
        "Do not invent exact quantities, nutrition facts, cooking times, or storage rules that are not supported.\n"
        "For substitutions or healthier versions, explain what changes and what tradeoff it creates.\n"
        "Important nutrition logic: do not claim clarified butter is lower-fat than duck fat. Clarified butter is still mostly fat.\n"
        "If the user asks how to make this recipe lighter, prioritize options actually supported by the context: stop at the healthy/protein version mentioned in the transcript, reduce or skip added duck fat, rely on the reduced gelatin-rich cooking liquid for texture, remove chicken skin, and chill well.\n"
        "For this recipe context, do not mention cream, Parmesan, beef broth, pasta, cheese, or unrelated ingredients unless they appear in the supplied context.\n"
        "Use the user's language when obvious. Otherwise answer in concise English.\n"
        "Return plain text only. No JSON. No markdown table."
    )

    user = f"""USER QUESTION:
{question}

RECIPE JSON:
{recipe_text}

CAPTION:
{caption_text}

TRANSCRIPT:
{transcript_text}

KNOWN MISSING / NEEDS REVIEW:
{json.dumps(missing_info, ensure_ascii=False, indent=2)}

Answer now. Be grounded in the provided source data."""

    model = os.getenv("MISTRAL_MODEL_ASSISTANT", "mistral-small-latest").strip() or "mistral-small-latest"

    payload = {
        "model": model,
        "temperature": 0.25,
        "max_tokens": 700,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    }

    started = None
    try:
        # usage_tracker.record_call has changed signatures across this codebase.
        # Keep assistant generation independent from analytics failures.
        try:
            record_call("recipe_assistant")
        except TypeError:
            try:
                record_call()
            except TypeError:
                pass
    except Exception:
        logger.warning("recipe_assistant: usage_tracker record_call failed", exc_info=True)

    res = requests.post(
        MISTRAL_API_URL,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        json=payload,
        timeout=REQUEST_TIMEOUT_SECONDS,
    )

    if not res.ok:
        logger.error("recipe_assistant Mistral error %s: %s", res.status_code, res.text[:500])
        res.raise_for_status()

    data = res.json()
    choices = data.get("choices") or []
    answer = ""
    if choices and isinstance(choices[0], dict):
        answer = ((choices[0].get("message") or {}).get("content") or "").strip()

    if not answer:
        answer = "I could not generate an answer from the available recipe context."

    return {
        "answer": answer,
        "sourcesUsed": ["recipe", "caption", "transcription"],
        "missingInfo": missing_info,
        "model": model,
    }
