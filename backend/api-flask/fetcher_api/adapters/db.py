# fetcher_api/adapters/db.py
import os
import psycopg2
import psycopg2.extras
import logging
from dotenv import load_dotenv
from pathlib import Path

logger = logging.getLogger("db")

# -------------------------------------------------
# 🔒 Load environment variables (but don't fail at import)
# -------------------------------------------------
ROOT_ENV = Path(__file__).resolve().parents[2] / ".env"
if ROOT_ENV.exists():
    load_dotenv(ROOT_ENV, override=True)

LOCAL_ENV = Path(__file__).resolve().parents[2] / ".env.local"
if LOCAL_ENV.exists():
    load_dotenv(LOCAL_ENV, override=True)

# -------------------------------------------------
# Lazy connection holder
# -------------------------------------------------
_conn = None


def _new_conn():
    DATABASE_URL = os.environ.get("DATABASE_URL")
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL is not set. Check your .env.local file.")
    conn = psycopg2.connect(DATABASE_URL, sslmode="require")
    return conn


def get_conn():
    """
    Returns a valid PostgreSQL connection.
    Reconnects automatically if Neon closes idle sessions.
    Also clears aborted transactions by rolling back if needed.
    """
    global _conn

    if _conn is None:
        logger.info("📡 Creating initial PostgreSQL connection...")
        _conn = _new_conn()
        return _conn

    # First: try to clear any aborted transaction state
    try:
        _conn.rollback()
    except Exception:
        pass

    # Then: test the connection
    try:
        with _conn.cursor() as cur:
            cur.execute("SELECT 1;")
        return _conn
    except Exception:
        logger.warning("🔌 PostgreSQL connection dropped or invalid. Reconnecting...")
        try:
            _conn.close()
        except Exception:
            pass
        _conn = _new_conn()
        return _conn


def get_connection():
    """Alias for get_conn() - used for explicit transaction management."""
    return get_conn()


# -------------------------------------------------
# Query helpers
# -------------------------------------------------
def fetch_one(sql, params=None):
    conn = get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, params)
            row = cur.fetchone()
        conn.commit()
        return row
    except Exception as e:
        try:
            conn.rollback()
        except Exception:
            pass
        logger.error("❌ fetch_one failed: %s", e, exc_info=True)
        raise


def fetch_all(sql, params=None):
    conn = get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, params)
            rows = cur.fetchall()
        conn.commit()
        return rows
    except Exception as e:
        try:
            conn.rollback()
        except Exception:
            pass
        logger.error("❌ fetch_all failed: %s", e, exc_info=True)
        raise


def execute(sql, params=None, commit=False):
    """
    Executes SQL (INSERT/UPDATE/DELETE).

    Args:
        sql: SQL query string
        params: Query parameters
        commit: If True, commits immediately. If False, caller must commit manually.
    """
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(sql, params)
        if commit:
            conn.commit()
            logger.debug("✅ Transaction auto-committed")
    except Exception as e:
        try:
            conn.rollback()
        except Exception:
            pass
        logger.error("❌ execute failed: %s", e, exc_info=True)
        raise
