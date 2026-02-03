# fetcher_api/adapters/db.py

import os
import psycopg2
import psycopg2.extras
import logging
from dotenv import load_dotenv
from pathlib import Path

logger = logging.getLogger("db")

# -------------------------------------------------
# 🔒 Force-load root .env (always overrides system env)
# -------------------------------------------------
ROOT_ENV = Path(__file__).resolve().parents[2] / ".env"
load_dotenv(ROOT_ENV, override=True)

DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL is missing after loading .env")

# -------------------------------------------------
# Lazy connection holder
# -------------------------------------------------
_conn = None


def get_conn():
    """
    Returns a valid PostgreSQL connection.
    Reconnects automatically if Neon closes idle sessions.
    """
    global _conn

    if _conn is None:
        logger.info("📡 Creating initial PostgreSQL connection...")
        _conn = psycopg2.connect(DATABASE_URL, sslmode="require")
        # ✅ REMOVED autocommit - we want manual transaction control
        return _conn

    try:
        # Test connection
        with _conn.cursor() as cur:
            cur.execute("SELECT 1;")
        return _conn

    except Exception:
        logger.warning("🔌 PostgreSQL connection dropped. Reconnecting...")
        _conn = psycopg2.connect(DATABASE_URL, sslmode="require")
        return _conn


def get_connection():
    """
    Alias for get_conn() - used for explicit transaction management.
    """
    return get_conn()


# -------------------------------------------------
# Query helpers
# -------------------------------------------------
def fetch_one(sql, params=None):
    conn = get_conn()
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(sql, params)
        # Auto-commit for SELECT queries
        conn.commit()
        return cur.fetchone()


def fetch_all(sql, params=None):
    conn = get_conn()
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(sql, params)
        # Auto-commit for SELECT queries
        conn.commit()
        return cur.fetchall()


def execute(sql, params=None, commit=False):
    """
    Executes SQL (INSERT/UPDATE/DELETE).
    
    Args:
        sql: SQL query string
        params: Query parameters
        commit: If True, commits immediately. If False, caller must commit manually.
    """
    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute(sql, params)
        if commit:
            conn.commit()
            logger.debug("✅ Transaction auto-committed")
