# fetcher_api/services/usage_tracker.py
"""
Persistent API usage tracker - stores Mistral call counts in NeonDB.
Survives server restarts. Falls back to in-memory if DB unavailable.
"""
import logging
from datetime import date, datetime
from typing import Dict

logger = logging.getLogger(__name__)

# ── in-memory fallback ──
_fallback = {
    "calls_today": 0,
    "calls_total": 0,
    "tokens_estimated_today": 0,
    "errors_today": 0,
    "last_call_at": None,
    "last_reset_date": str(date.today()),
}


def _get_db():
    try:
        from fetcher_api.adapters.db import get_db_connection
        return get_db_connection
    except Exception:
        return None


def record_call(prompt_len: int = 0, response_len: int = 0, error: bool = False):
    """Record one Mistral API call into DB (with in-memory fallback)."""
    tokens = (prompt_len + response_len) // 4
    now = datetime.utcnow().isoformat() + "Z"

    get_db_connection = _get_db()
    if not get_db_connection:
        _record_fallback(tokens, error, now)
        return

    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("""
                INSERT INTO api_usage (date, calls_count, tokens_estimated, errors_count, updated_at)
                VALUES (CURRENT_DATE, 1, %s, %s, NOW())
                ON CONFLICT (date) DO UPDATE SET
                    calls_count      = api_usage.calls_count + 1,
                    tokens_estimated = api_usage.tokens_estimated + EXCLUDED.tokens_estimated,
                    errors_count     = api_usage.errors_count + EXCLUDED.errors_count,
                    updated_at       = NOW()
            """, (tokens, 1 if error else 0))
            conn.commit()
            cur.close()
    except Exception as e:
        logger.warning("DB usage record failed, using fallback: %s", e)
        _record_fallback(tokens, error, now)


def get_usage() -> Dict:
    """Get today's usage stats from DB (with in-memory fallback)."""
    get_db_connection = _get_db()
    if not get_db_connection:
        return dict(_fallback)

    try:
        with get_db_connection() as conn:
            cur = conn.cursor()

            # Today
            cur.execute("""
                SELECT calls_count, tokens_estimated, errors_count, updated_at
                FROM api_usage WHERE date = CURRENT_DATE
            """)
            row = cur.fetchone()

            # All time total
            cur.execute("SELECT COALESCE(SUM(calls_count), 0) FROM api_usage")
            total = cur.fetchone()[0]

            cur.close()

        if row:
            return {
                "calls_today": row[0],
                "calls_total": int(total),
                "tokens_estimated_today": row[1],
                "errors_today": row[2],
                "last_call_at": row[3].isoformat() + "Z" if row[3] else None,
            }
        else:
            return {
                "calls_today": 0,
                "calls_total": int(total),
                "tokens_estimated_today": 0,
                "errors_today": 0,
                "last_call_at": None,
            }

    except Exception as e:
        logger.warning("DB usage fetch failed, using fallback: %s", e)
        return dict(_fallback)


def _record_fallback(tokens: int, error: bool, now: str):
    today = str(date.today())
    if _fallback["last_reset_date"] != today:
        _fallback["calls_today"] = 0
        _fallback["tokens_estimated_today"] = 0
        _fallback["errors_today"] = 0
        _fallback["last_reset_date"] = today
    _fallback["calls_today"] += 1
    _fallback["calls_total"] += 1
    _fallback["tokens_estimated_today"] += tokens
    _fallback["last_call_at"] = now
    if error:
        _fallback["errors_today"] += 1
