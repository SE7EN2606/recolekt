# fetcher_api/adapters/db.py
import os
import logging
import psycopg2
import psycopg2.extras
from psycopg2.pool import SimpleConnectionPool
from contextlib import contextmanager
import threading
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
# Thread-safe Connection Pool (Greenlet Safe)
# -------------------------------------------------
_pool = None
_pool_lock = threading.Lock()

def init_pool():
    """Initializes the database connection pool."""
    global _pool
    with _pool_lock:
        if _pool is None:
            DATABASE_URL = os.environ.get("DATABASE_URL")
            if not DATABASE_URL:
                raise RuntimeError("DATABASE_URL is not set. Check your environment variables.")
            
            try:
                # SimpleConnectionPool + Lock is universally safe (threads, gevent, gunicorn, etc)
                _pool = SimpleConnectionPool(1, 20, DATABASE_URL, sslmode="require")
                logger.info("📡 PostgreSQL SimpleConnectionPool created (min=1, max=20)")
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
        
    with _pool_lock:
        conn = _pool.getconn()
        
    # ✅ FIX: Ping the database. If Neon closed the connection, reconnect!
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT 1")
    except psycopg2.OperationalError:
        logger.warning("🔌 NeonDB closed idle connection. Reconnecting...")
        # Close the dead connection and manually create a fresh one to inject into the pool
        try:
            conn.close()
        except Exception:
            pass
        conn = psycopg2.connect(os.environ.get("DATABASE_URL"), sslmode="require")
        
    try:
        try:
            conn.rollback()
        except Exception:
            pass
        yield conn
    finally:
        with _pool_lock:
            _pool.putconn(conn)

# Legacy support
def get_conn():
    if _pool is None:
        init_pool()
    with _pool_lock:
        return _pool.getconn()

def release_conn(conn):
    if _pool and conn:
        with _pool_lock:
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
