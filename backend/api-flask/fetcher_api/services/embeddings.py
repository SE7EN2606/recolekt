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


def build_embed_text(reel: dict) -> str:
    """Combine richest text fields into one string for embedding."""
    parts = []

    title = reel.get("summary_title") or ""
    if isinstance(title, dict):
        title = title.get("en") or title.get("fr") or next(iter(title.values()), "")
    if title:
        parts.append(title)

    topic = reel.get("summary_topic") or ""
    if topic:
        parts.append(topic)

    text = reel.get("summary_text") or ""
    if isinstance(text, dict):
        text = text.get("en") or text.get("fr") or next(iter(text.values()), "")
    if text:
        parts.append(text)

    caption = reel.get("caption") or ""
    if caption:
        parts.append(caption[:500])

    transcription = reel.get("transcription") or ""
    if isinstance(transcription, dict):
        transcription = transcription.get("text") or transcription.get("transcript") or ""
    if isinstance(transcription, str) and transcription:
        parts.append(transcription[:1000])

    hashtags = reel.get("summary_hashtags") or []
    if isinstance(hashtags, list) and hashtags:
        parts.append(" ".join(hashtags))

    return " | ".join(filter(None, parts))


def embed_text(text: str) -> list | None:
    """Call OpenAI text-embedding-3-small and return vector."""
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
    """Build embed text from reel dict and return vector."""
    text = build_embed_text(reel)
    if not text.strip():
        logger.warning("⚠️ Empty embed text for reel %s", reel.get("id"))
        return None
    logger.info("🧠 Embedding reel %s (%d chars)", reel.get("id"), len(text))
    return embed_text(text)
