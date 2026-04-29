"""
Saved places endpoints — per-user, stored in NeonDB.

GET    /api/saved-places              → list all saved places for this user
GET    /api/saved-places?video_id=X   → list saved places for one video
POST   /api/saved-places              → save a place
DELETE /api/saved-places              → unsave a place
"""

import os
import logging

import psycopg2
import psycopg2.extras
from flask import Blueprint, request, jsonify

from fetcher_api.api.helpers.auth import get_user_id_from_request

logger = logging.getLogger(__name__)

saved_places_bp = Blueprint("saved_places", __name__)


def get_db():
    url = os.getenv("DATABASE_URL") or os.getenv("NEON_DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL not set")
    conn = psycopg2.connect(
        url,
        sslmode="require",
        cursor_factory=psycopg2.extras.RealDictCursor,
    )
    conn.autocommit = False
    return conn


def ensure_table():
    """Create or migrate saved_places table."""
    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS saved_places (
                    id                     SERIAL PRIMARY KEY,
                    user_id                TEXT        NOT NULL,
                    video_id               TEXT        NOT NULL,
                    place_index            INTEGER     NOT NULL,
                    name                   TEXT        NOT NULL,
                    type                   TEXT,
                    place_type             TEXT,
                    city                   TEXT,
                    region                 TEXT,
                    country                TEXT,
                    address                TEXT,
                    neighborhood           TEXT,
                    postal_code            TEXT,
                    description            TEXT,
                    instagram              TEXT,
                    instagram_username     TEXT,
                    instagram_account_name TEXT,
                    lat                    DOUBLE PRECISION,
                    lng                    DOUBLE PRECISION,
                    rank                   INTEGER,
                    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    UNIQUE (user_id, video_id, place_index)
                );
                """
            )

            cur.execute(
                "ALTER TABLE saved_places ADD COLUMN IF NOT EXISTS place_type TEXT"
            )
            cur.execute(
                "ALTER TABLE saved_places ADD COLUMN IF NOT EXISTS neighborhood TEXT"
            )
            cur.execute(
                "ALTER TABLE saved_places ADD COLUMN IF NOT EXISTS postal_code TEXT"
            )
            cur.execute(
                "ALTER TABLE saved_places ADD COLUMN IF NOT EXISTS instagram_username TEXT"
            )
            cur.execute(
                "ALTER TABLE saved_places ADD COLUMN IF NOT EXISTS instagram_account_name TEXT"
            )

            cur.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_saved_places_user
                ON saved_places(user_id)
                """
            )
            cur.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_saved_places_video
                ON saved_places(user_id, video_id)
                """
            )

        conn.commit()
    finally:
        conn.close()


try:
    ensure_table()
    logger.info("✅ saved_places table ready")
except Exception as e:
    logger.warning("⚠️ saved_places table check failed: %s", e)


def _require_user_id():
    try:
        user_id = get_user_id_from_request()
    except Exception:
        user_id = None

    if not user_id:
        return None, (jsonify({"error": "Unauthorized"}), 401)

    return user_id, None


def _clean_text(value):
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _to_int_or_none(value):
    if value is None or value == "":
        return None
    return int(value)


def _to_float_or_none(value):
    if value is None or value == "":
        return None
    return float(value)


@saved_places_bp.route("/api/saved-places", methods=["GET"])
def list_saved_places():
    user_id, error = _require_user_id()
    if error:
        return error

    video_id = request.args.get("video_id")

    conn = get_db()
    try:
        with conn.cursor() as cur:
            if video_id:
                cur.execute(
                    """
                    SELECT
                        id,
                        video_id,
                        place_index,
                        name,
                        type,
                        place_type,
                        city,
                        region,
                        country,
                        address,
                        neighborhood,
                        postal_code,
                        description,
                        instagram,
                        instagram_username,
                        instagram_account_name,
                        lat,
                        lng,
                        rank,
                        created_at
                    FROM saved_places
                    WHERE user_id = %s AND video_id = %s
                    ORDER BY place_index
                    """,
                    (user_id, video_id),
                )
            else:
                cur.execute(
                    """
                    SELECT
                        id,
                        video_id,
                        place_index,
                        name,
                        type,
                        place_type,
                        city,
                        region,
                        country,
                        address,
                        neighborhood,
                        postal_code,
                        description,
                        instagram,
                        instagram_username,
                        instagram_account_name,
                        lat,
                        lng,
                        rank,
                        created_at
                    FROM saved_places
                    WHERE user_id = %s
                    ORDER BY created_at DESC
                    """,
                    (user_id,),
                )

            rows = cur.fetchall()

        return jsonify([dict(r) for r in rows])

    except Exception as e:
        logger.error("saved_places GET error: %s", e, exc_info=True)
        return jsonify({"error": str(e)}), 500
    finally:
        conn.close()


@saved_places_bp.route("/api/saved-places", methods=["POST"])
def save_place():
    user_id, error = _require_user_id()
    if error:
        return error

    data = request.get_json(silent=True) or {}

    video_id = _clean_text(data.get("video_id"))
    place_index = data.get("place_index")
    name = _clean_text(data.get("name"))

    if not video_id or place_index is None or not name:
        return jsonify({"error": "video_id, place_index, and name are required"}), 400

    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO saved_places (
                    user_id,
                    video_id,
                    place_index,
                    name,
                    type,
                    place_type,
                    city,
                    region,
                    country,
                    address,
                    neighborhood,
                    postal_code,
                    description,
                    instagram,
                    instagram_username,
                    instagram_account_name,
                    lat,
                    lng,
                    rank
                )
                VALUES (
                    %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                    %s, %s, %s, %s, %s, %s, %s, %s, %s
                )
                ON CONFLICT (user_id, video_id, place_index) DO UPDATE SET
                    name                   = EXCLUDED.name,
                    type                   = EXCLUDED.type,
                    place_type             = EXCLUDED.place_type,
                    city                   = EXCLUDED.city,
                    region                 = EXCLUDED.region,
                    country                = EXCLUDED.country,
                    address                = EXCLUDED.address,
                    neighborhood           = EXCLUDED.neighborhood,
                    postal_code            = EXCLUDED.postal_code,
                    description            = EXCLUDED.description,
                    instagram              = EXCLUDED.instagram,
                    instagram_username     = EXCLUDED.instagram_username,
                    instagram_account_name = EXCLUDED.instagram_account_name,
                    lat                    = EXCLUDED.lat,
                    lng                    = EXCLUDED.lng,
                    rank                   = EXCLUDED.rank
                RETURNING
                    id,
                    video_id,
                    place_index,
                    name,
                    type,
                    place_type,
                    city,
                    region,
                    country,
                    address,
                    neighborhood,
                    postal_code,
                    description,
                    instagram,
                    instagram_username,
                    instagram_account_name,
                    lat,
                    lng,
                    rank,
                    created_at
                """,
                (
                    user_id,
                    video_id,
                    int(place_index),
                    name,
                    _clean_text(data.get("type")),
                    _clean_text(data.get("place_type")) or _clean_text(data.get("type")),
                    _clean_text(data.get("city")),
                    _clean_text(data.get("region")),
                    _clean_text(data.get("country")),
                    _clean_text(data.get("address")),
                    _clean_text(data.get("neighborhood")),
                    _clean_text(data.get("postal_code")),
                    _clean_text(data.get("description")),
                    _clean_text(data.get("instagram")) or _clean_text(data.get("instagram_username")),
                    _clean_text(data.get("instagram_username")) or _clean_text(data.get("instagram")),
                    _clean_text(data.get("instagram_account_name")),
                    _to_float_or_none(data.get("lat")),
                    _to_float_or_none(data.get("lng")),
                    _to_int_or_none(data.get("rank")),
                ),
            )
            row = cur.fetchone()

        conn.commit()
        return jsonify(dict(row)), 201

    except Exception as e:
        conn.rollback()
        logger.error("saved_places POST error: %s", e, exc_info=True)
        return jsonify({"error": str(e)}), 500
    finally:
        conn.close()


@saved_places_bp.route("/api/saved-places", methods=["DELETE"])
def unsave_place():
    user_id, error = _require_user_id()
    if error:
        return error

    data = request.get_json(silent=True) or {}

    video_id = _clean_text(data.get("video_id"))
    place_index = data.get("place_index")

    if not video_id or place_index is None:
        return jsonify({"error": "video_id and place_index are required"}), 400

    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                DELETE FROM saved_places
                WHERE user_id = %s AND video_id = %s AND place_index = %s
                """,
                (user_id, video_id, int(place_index)),
            )
            deleted = cur.rowcount

        conn.commit()
        return jsonify({"deleted": True, "count": deleted})

    except Exception as e:
        conn.rollback()
        logger.error("saved_places DELETE error: %s", e, exc_info=True)
        return jsonify({"error": str(e)}), 500
    finally:
        conn.close()