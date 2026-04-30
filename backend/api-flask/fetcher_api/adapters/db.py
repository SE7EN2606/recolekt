import os
import time
import logging
import psycopg2
import psycopg2.extras
from contextlib import contextmanager
from dotenv import load_dotenv
from pathlib import Path

from urllib.parse import urlparse

DATABASE_URL_DEBUG_ONCE = False

logger = logging.getLogger("db")

ROOT_ENV = Path(__file__).resolve().parents[2] / ".env"
if ROOT_ENV.exists():
    load_dotenv(ROOT_ENV, override=True)

LOCAL_ENV = Path(__file__).resolve().parents[2] / ".env.local"
if LOCAL_ENV.exists():
    load_dotenv(LOCAL_ENV, override=True)


def _get_database_url():
    url = os.environ.get("DATABASE_URL", "")
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql://", 1)
    if not url:
        raise RuntimeError("DATABASE_URL is not set.")
    return url


def _log_database_url_once(url: str):
    global DATABASE_URL_DEBUG_ONCE

    if DATABASE_URL_DEBUG_ONCE:
        return

    DATABASE_URL_DEBUG_ONCE = True
    parsed = urlparse(url)
    logger.warning(
        "DATABASE_URL host=%s database=%s user=%s",
        parsed.hostname,
        parsed.path.lstrip("/"),
        parsed.username,
    )


def _connect_with_retry(max_attempts: int = 5):
    """
    Connect to NeonDB with exponential backoff.
    Handles auto-suspend wakeup (cold start can take 2-5s).
    """
    url = _get_database_url()
    _log_database_url_once(url)
    last_err = None

    for attempt in range(max_attempts):
        try:
            conn = psycopg2.connect(url, sslmode="require", connect_timeout=10)
            if attempt > 0:
                logger.info(f"✅ DB connected after {attempt + 1} attempts")
            return conn
        except Exception as e:
            last_err = e
            if attempt < max_attempts - 1:
                wait = 2 ** attempt  # 1s → 2s → 4s → 8s
                logger.warning(
                    f"⚠️ DB connect failed (attempt {attempt + 1}/{max_attempts}), "
                    f"retrying in {wait}s — NeonDB may be waking up: {e}"
                )
                time.sleep(wait)

    logger.error(f"❌ DB connection failed after {max_attempts} attempts: {last_err}")
    raise last_err


@contextmanager
def get_db_connection():
    """Single-use connection manager with retry. Safe for NeonDB serverless."""
    conn = None
    try:
        conn = _connect_with_retry()
        yield conn
    except Exception as e:
        logger.error(f"❌ Database connection error: {e}")
        raise
    finally:
        if conn and not conn.closed:
            conn.close()


def get_conn():
    return _connect_with_retry()


def release_conn(conn):
    if conn and not conn.closed:
        conn.close()


# Legacy alias
get_connection = get_conn


def fetch_one(sql, params=None):
    with get_db_connection() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, params)
            return cur.fetchone()


def fetch_all(sql, params=None):
    with get_db_connection() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, params)
            return cur.fetchall()


def execute(sql, params=None, commit=True):
    with get_db_connection() as conn:
        try:
            with conn.cursor() as cur:
                cur.execute(sql, params)
            if commit:
                conn.commit()
        except Exception as e:
            conn.rollback()
            logger.error("❌ execute failed: %s", e, exc_info=True)
            raise


def get_user_tier(user_id):
    res = fetch_one("SELECT tier FROM users WHERE user_id = %s", (user_id,))
    if res and "tier" in res:
        return res["tier"]
    return "free"


def count_user_reels(user_id):
    res = fetch_one("SELECT COUNT(*) as count FROM reels WHERE user_id = %s", (user_id,))
    return res["count"] if res else 0
