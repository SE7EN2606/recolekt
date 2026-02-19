# fetcher_api/adapters/db.py
import os
import logging
import psycopg2
import psycopg2.extras
from psycopg2.pool import ThreadedConnectionPool
from contextlib import contextmanager
from dotenv import load_dotenv
from pathlib import Path

logger = logging.getLogger("db")

# -------------------------------------------------
# 🔒 Load environment variables
# -------------------------------------------------
ROOT_ENV = Path(__file__).resolve().parents[2] / ".env"
if ROOT_ENV.exists():
    load_dotenv(ROOT_ENV, override=True)

LOCAL_ENV = Path(__file__).resolve().parents[2] / ".env.local"
if LOCAL_ENV.exists():
    load_dotenv(LOCAL_ENV, override=True)

# -------------------------------------------------
# Thread-safe Connection Pool
# -------------------------------------------------
_pool = None

def init_pool():
    """Initializes the database connection pool."""
    global _pool
    if _pool is None:
        DATABASE_URL = os.environ.get("DATABASE_URL")
        if not DATABASE_URL:
            raise RuntimeError("DATABASE_URL is not set. Check your environment variables.")
        
        try:
            # Min 1 connection, Max 10 concurrent connections
            _pool = ThreadedConnectionPool(1, 10, DATABASE_URL, sslmode="require")
            logger.info("📡 PostgreSQL Threaded Connection Pool created (min=1, max=10)")
        except Exception as e:
            logger.error(f"❌ Failed to initialize database pool: {e}")
            raise

@contextmanager
def get_db_connection():
    """
    Context manager that safely checks out a connection from the pool,
    yields it for use, and guarantees it is put back when done.
    """
    if _pool is None:
        init_pool()
        
    conn = _pool.getconn()
    try:
        # Clear any aborted transaction states just in case
        try:
            conn.rollback()
        except Exception:
            pass
        yield conn
    finally:
        # ALWAYS give the connection back to the pool
        _pool.putconn(conn)

# Legacy support for explicit transaction management, but use with caution!
def get_conn():
    if _pool is None:
        init_pool()
    return _pool.getconn()

def release_conn(conn):
    if _pool and conn:
        _pool.putconn(conn)

get_connection = get_conn

# -------------------------------------------------
# Query helpers
# -------------------------------------------------
def fetch_one(sql, params=None):
    with get_db_connection() as conn:
        try:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(sql, params)
                row = cur.fetchone()
            conn.commit()
            return row
        except Exception as e:
            conn.rollback()
            logger.error("❌ fetch_one failed: %s", e, exc_info=True)
            raise

def fetch_all(sql, params=None):
    with get_db_connection() as conn:
        try:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(sql, params)
                rows = cur.fetchall()
            conn.commit()
            return rows
        except Exception as e:
            conn.rollback()
            logger.error("❌ fetch_all failed: %s", e, exc_info=True)
            raise

def execute(sql, params=None, commit=True):
    """
    Executes SQL (INSERT/UPDATE/DELETE).
    Defaults to commit=True to prevent pooled connections from locking the database.
    """
    with get_db_connection() as conn:
        try:
            with conn.cursor() as cur:
                cur.execute(sql, params)
            if commit:
                conn.commit()
                logger.debug("✅ Transaction committed")
            else:
                # If explicit commit=False is used, warn the developer
                logger.warning("⚠️ execute called with commit=False in a pooled environment. State may persist.")
        except Exception as e:
            conn.rollback()
            logger.error("❌ execute failed: %s", e, exc_info=True)
            raise
        
