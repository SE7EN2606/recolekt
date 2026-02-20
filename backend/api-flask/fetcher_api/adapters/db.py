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
            # ✅ FIX: ThreadedConnectionPool is natively safe for Flask's multi-threading
            _pool = ThreadedConnectionPool(1, 20, DATABASE_URL, sslmode="require")
            logger.info("📡 PostgreSQL ThreadedConnectionPool created (min=1, max=20)")
        except Exception as e:
            logger.error(f"❌ Failed to initialize database pool: {e}")
            raise

@contextmanager
def get_db_connection():
    """
    Safely checks out a connection, PINGS it to ensure NeonDB hasn't 
    closed it, yields it, and returns it to the pool.
    """
    if _pool is None:
        init_pool()
        
    conn = _pool.getconn()
        
    # ✅ FIX: Ping the database. If Neon closed the connection, gracefully throw it away!
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT 1")
    except (psycopg2.OperationalError, psycopg2.InterfaceError):
        logger.warning("🔌 NeonDB closed idle connection. Replacing gracefully...")
        # Tell the pool to close and discard this specific dead connection
        _pool.putconn(conn, close=True)
        # Grab a fresh one
        conn = _pool.getconn()
        
    try:
        # Try to rollback any stuck transactions from a previous checkout
        try:
            conn.rollback()
        except Exception:
            pass
        yield conn
    finally:
        # Safely return the valid connection to the pool
        _pool.putconn(conn)

# Legacy support
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
    """Executes SQL (INSERT/UPDATE/DELETE)."""
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
