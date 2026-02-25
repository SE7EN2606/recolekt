# fetcher_api/services/embeddings.py
import os
import logging
from openai import OpenAI

logger = logging.getLogger(__name__)

_client = None

def _get_client():
    global _client
    if _client is None:
        _client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    return _client


def _extract_str(val) -> str:
    if not val:
        return ""
    if isinstance(val, str):
        return val
    if isinstance(val, dict):
        for key in ("en", "english", "fr", "original"):
            v = val.get(key)
            if isinstance(v, str) and v.strip():
                return v
            if isinstance(v, dict):
                for subkey in ("title", "summary", "text"):
                    sv = v.get(subkey)
                    if isinstance(sv, str) and sv.strip():
                        return sv
        for v in val.values():
            if isinstance(v, str) and v.strip():
                return v
    return ""


def build_embed_text(reel: dict) -> str:
    parts = []

    title = _extract_str(reel.get("summary_title"))
    if title:
        parts.append(title)

    topic = _extract_str(reel.get("summary_topic"))
    if topic:
        parts.append(topic)

    text = _extract_str(reel.get("summary_text"))
    if text:
        parts.append(text)

    caption = _extract_str(reel.get("caption"))
    if caption:
        parts.append(caption[:500])

    transcription = reel.get("transcription") or ""
    if isinstance(transcription, dict):
        transcription = transcription.get("transcript") or transcription.get("text") or ""
    if isinstance(transcription, str) and transcription.strip():
        parts.append(transcription[:1000])

    hashtags = reel.get("summary_hashtags") or []
    if isinstance(hashtags, list) and hashtags:
        parts.append(" ".join(str(h) for h in hashtags))

    return " | ".join(p for p in parts if isinstance(p, str) and p.strip())


def embed_text(text: str) -> list | None:
    if not text or not text.strip():
        return None
    try:
        resp = _get_client().embeddings.create(
            model="text-embedding-3-small",
            input=text[:8000],
        )
        return resp.data[0].embedding
    except Exception as e:
        logger.error("Embedding failed: %s", e)
        return None


def embed_reel(reel: dict) -> list | None:
    text = build_embed_text(reel)
    if not text.strip():
        logger.warning("Empty embed text for reel %s", reel.get("id"))
        return None
    logger.info("Embedding reel %s (%d chars)", reel.get("id"), len(text))
    return embed_text(text)

