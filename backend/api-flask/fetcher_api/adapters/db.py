import os
import time
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


def _get_database_url():
    url = os.environ.get("DATABASE_URL", "")
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql://", 1)
    if not url:
        raise RuntimeError("DATABASE_URL is not set.")
    return url


