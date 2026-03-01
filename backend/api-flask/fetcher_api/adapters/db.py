import os
import logging
import threading
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
_pool_lock = threading.Lock() # ✅ Prevents multiple pool creation

def init_pool():
    """Initializes the database connection pool in a thread-safe manner."""
    global _pool
    with _pool_lock:
        if _pool is None:
            DATABASE_URL = os.environ.get("DATABASE_URL")
            if not DATABASE_URL:
                raise RuntimeError("DATABASE_URL is not set. Check your environment variables.")
            
            try:
                # ✅ ThreadedConnectionPool is natively safe for Flask's multi-threading
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
        
    # ✅ Ping the database. If Neon closed the connection, gracefully throw it away!
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT 1")
    except (psycopg2.OperationalError, psycopg2.InterfaceError):
        logger.warning("🔌 NeonDB closed idle connection. Replacing gracefully...")
        try:
            _pool.putconn(conn, close=True)
        except:
            pass
        conn = _pool.getconn()
        
    try:
        # Try to rollback any stuck transactions from a previous checkout
        try:
            conn.rollback()
        except:
            pass
        yield conn
    finally:
        # ✅ FIX: Safely return the valid connection to the pool
        # Check closed status to prevent "trying to put unkeyed connection"
        if conn and not conn.closed:
            try:
                _pool.putconn(conn)
            except Exception as e:
                # Silently catch the "unkeyed" error to prevent API request crash
                if "unkeyed" not in str(e):
                    logger.error(f"❌ Pool return error: {e}")

# Legacy support
def get_conn():
    if _pool is None:
        init_pool()
    return _pool.getconn()

def release_conn(conn):
    if _pool and conn:
        try:
            _pool.putconn(conn)
        except Exception:
            pass

get_connection = get_conn

# -------------------------------------------------
# Query helpers
# -------------------------------------------------
def fetch_one(sql, params=None):
    with get_db_connection() as conn:
        try:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(sql, params)
                return cur.fetchone()
        except Exception as e:
            logger.error("❌ fetch_one failed: %s", e, exc_info=True)
            raise

def fetch_all(sql, params=None):
    with get_db_connection() as conn:
        try:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(sql, params)
                return cur.fetchall()
        except Exception as e:
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

def get_user_tier(user_id):
    """Fetches tier for the duration gatekeeper using the correct user_id column."""
    # Note: We use user_id because that is the column name shown in your psql output
    res = fetch_one("SELECT tier FROM users WHERE user_id = %s", (user_id,))
    if res and 'tier' in res:
        return res['tier']
    return 'free'

def count_user_reels(user_id):
    """Counts how many reels a user has already saved."""
    res = fetch_one("SELECT COUNT(*) as count FROM reels WHERE user_id = %s", (user_id,))
    return res['count'] if res else 0
