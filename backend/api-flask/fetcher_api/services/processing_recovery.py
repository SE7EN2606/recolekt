import logging
import os
from typing import Any, Optional

from fetcher_api.adapters.db import execute, fetch_all


logger = logging.getLogger("processing_recovery")

PROCESSING_WORKER_KILLED_ERROR = "processing_worker_killed_or_timeout"
DEFAULT_PROCESSING_TIMEOUT_SECONDS = 180


def _coerce_timeout_seconds(timeout_seconds: Optional[int]) -> int:
    try:
        value = int(timeout_seconds or DEFAULT_PROCESSING_TIMEOUT_SECONDS)
    except Exception:
        value = DEFAULT_PROCESSING_TIMEOUT_SECONDS
    return max(60, value)


def recover_stale_processing_reels(
    user_id: Optional[str] = None,
    timeout_seconds: Optional[int] = None,
) -> dict[str, Any]:
    """Mark processing reels as error when no worker has completed within the timeout."""
    timeout = _coerce_timeout_seconds(timeout_seconds)
    params: list[Any] = []
    user_clause = ""
    if user_id:
        user_clause = "AND user_id = %s"
        params.append(user_id)
    params.append(timeout)

    stale_rows = fetch_all(
        f"""
        SELECT id
        FROM reels
        WHERE status = 'processing'
          {user_clause}
          AND COALESCE(updated_at, created_at) < NOW() - (%s * INTERVAL '1 second')
        """,
        tuple(params),
    )

    stale_ids = [row["id"] for row in stale_rows or [] if row.get("id")]
    if not stale_ids:
        return {
            "cleaned": 0,
            "reel_ids": [],
            "timeout_seconds": timeout,
            "error_message": PROCESSING_WORKER_KILLED_ERROR,
        }

    execute(
        """
        UPDATE reels
        SET status = 'error',
            error_message = %s,
            updated_at = NOW()
        WHERE status = 'processing'
          AND id = ANY(%s)
        """,
        (PROCESSING_WORKER_KILLED_ERROR, stale_ids),
        commit=True,
    )

    logger.warning(
        "Recovered %d stale processing reel(s) as error timeout_seconds=%s ids=%s",
        len(stale_ids),
        timeout,
        stale_ids,
    )
    return {
        "cleaned": len(stale_ids),
        "reel_ids": stale_ids,
        "timeout_seconds": timeout,
        "error_message": PROCESSING_WORKER_KILLED_ERROR,
    }
