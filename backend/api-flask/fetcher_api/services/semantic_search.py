# fetcher_api/services/semantic_search.py
import logging
from fetcher_api.services.embeddings import embed_text
from fetcher_api.adapters.db import fetch_all, execute

logger = logging.getLogger(__name__)


def save_embedding(reel_id: str, vector: list):
    """Store embedding vector in DB."""
    execute(
        "UPDATE reels SET embedding = %s::vector WHERE id = %s",
        (vector, reel_id),
        commit=True,
    )


def semantic_search(user_id: str, query: str, limit: int = 20) -> list:
    """Find reels semantically similar to query."""
    vector = embed_text(query)
    if vector is None:
        return []

    sql = """
        SELECT
            id, source_url, folder_id, is_favorite, status,
            summary_category, summary_title, summary_topic, summary_text,
            summary_bullets, summary_hashtags, summary_emojis,
            content_type, recipe, workout, created_at,
            caption, author_name, is_long_video, duration, transcription,
            gcs_urls::jsonb AS gcs_urls,
            1 - (embedding <=> %s::vector) AS similarity
        FROM reels
        WHERE user_id = %s
          AND embedding IS NOT NULL
        ORDER BY embedding <=> %s::vector
        LIMIT %s;
    """

    try:
        results = fetch_all(sql, (vector, user_id, vector, limit))
        logger.info("🔍 Semantic search '%s' → %d results", query, len(results))
        return results
    except Exception as e:
        logger.error("Semantic search failed: %s", e)
        return []


def hybrid_search(user_id: str, query: str, limit: int = 20) -> list:
    """Semantic first, then keyword, deduplicated."""
    from fetcher_api.services.db_fetch import search_reels

    semantic = semantic_search(user_id, query, limit=limit)
    keyword = search_reels(user_id, query)

    seen = set()
    combined = []

    for row in semantic:
        rid = dict(row).get("id") if hasattr(row, "keys") else row[0]
        if rid not in seen:
            seen.add(rid)
            combined.append(row)

    for row in keyword:
        rid = dict(row).get("id") if hasattr(row, "keys") else row[0]
        if rid not in seen:
            seen.add(rid)
            combined.append(row)

    return combined[:limit]
