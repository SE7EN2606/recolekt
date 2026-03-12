import os
import logging
import psycopg2
import psycopg2.extras
from contextlib import contextmanager
from dotenv import load_dotenv
from pathlib import Path

logger = logging.getLogger("db")

ROOT_ENV = Path(__file__).resolve().parents[2] / ".env"
if ROOT_ENV.exists():
    load_dotenv(ROOT_ENV, override=True)

LOCAL_ENV = Path(__file__).resolve().parents[2] / ".env.local"
if LOCAL_ENV.exists():
    load_dotenv(LOCAL_ENV, override=True)

@contextmanager
def get_db_connection():
    """Simple, single-use connection manager. Safe for NeonDB serverless."""
    DATABASE_URL = os.environ.get("DATABASE_URL")
    if DATABASE_URL and DATABASE_URL.startswith("postgres://"):
        DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)
        
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL is not set.")

    conn = None
    try:
        # ✅ Direct connection with a strict 10-second timeout
        conn = psycopg2.connect(DATABASE_URL, sslmode="require", connect_timeout=10)
        yield conn
    except Exception as e:
        logger.error(f"❌ Database connection error: {e}")
        raise
    finally:
        if conn and not conn.closed:
            conn.close()

def get_conn():
    DATABASE_URL = os.environ.get("DATABASE_URL")
    if DATABASE_URL and DATABASE_URL.startswith("postgres://"):
        DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)
    return psycopg2.connect(DATABASE_URL, sslmode="require", connect_timeout=10)

def release_conn(conn):
    if conn and not conn.closed:
        conn.close()

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
    if res and 'tier' in res:
        return res['tier']
    return 'free'

def count_user_reels(user_id):
    res = fetch_one("SELECT COUNT(*) as count FROM reels WHERE user_id = %s", (user_id,))
    return res['count'] if res else 0