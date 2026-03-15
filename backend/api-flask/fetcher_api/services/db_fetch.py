import logging
from fetcher_api.adapters.db import fetch_all

logger = logging.getLogger("db_fetch")


# -----------------------------------------------------
# FETCH SAVED REELS
# -----------------------------------------------------
def fetch_saved_reels(user_id: str):
    """
    Returns the latest processed + processing reels for a given user.
    Sorted by creation date DESC.
    """
    sql = """
        SELECT *
        FROM reels
        WHERE user_id = %s
        ORDER BY created_at DESC
        LIMIT 500;
    """

    try:
        return fetch_all(sql, (user_id,))
    except Exception as e:
        logger.error(f"Error fetching saved reels: {e}", exc_info=True)
        return []


# -----------------------------------------------------
# FULL-TEXT SEARCH
# -----------------------------------------------------
def search_reels(user_id: str, q: str):
    """
    Full-text search using GIN index and search_vector column.

    Searches in:
      - caption
      - summary title
      - summary topic
      - hashtags
      - transcription
      - author name
    """
    sql = """
        SELECT *
        FROM reels
        WHERE user_id = %s
          AND search_vector @@ plainto_tsquery('simple', %s)
        ORDER BY created_at DESC
        LIMIT 200;
    """

    try:
        return fetch_all(sql, (user_id, q))
    except Exception as e:
        logger.error(f"Error in search: {e}", exc_info=True)
        return []
