"""
fetcher_api/api/saved_places.py
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

logger = logging.getLogger(__name__)

saved_places_bp = Blueprint("saved_places", __name__)

# ─── DB connection ─────────────────────────────────────────────────────────────

def get_db():
    url = os.getenv("DATABASE_URL") or os.getenv("NEON_DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL not set")
    conn = psycopg2.connect(url, sslmode="require", cursor_factory=psycopg2.extras.RealDictCursor)
    conn.autocommit = False
    return conn


def ensure_table():
    """Create saved_places table if it doesn't exist yet."""
    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS saved_places (
                    id          SERIAL PRIMARY KEY,
                    user_id     TEXT        NOT NULL,
                    video_id    TEXT        NOT NULL,
                    place_index INTEGER     NOT NULL,
                    name        TEXT        NOT NULL,
                    type        TEXT,
                    city        TEXT,
                    region      TEXT,
                    country     TEXT,
                    lat         DOUBLE PRECISION,
                    lng         DOUBLE PRECISION,
                    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    UNIQUE (user_id, video_id, place_index)
                );
                CREATE INDEX IF NOT EXISTS idx_saved_places_user
                    ON saved_places(user_id);
            """)
        conn.commit()
    finally:
        conn.close()


# Run once at import time
try:
    ensure_table()
    logger.info("✅ saved_places table ready")
except Exception as e:
    logger.warning(f"⚠️  saved_places table check failed: {e}")


# ─── Auth helper ───────────────────────────────────────────────────────────────

def get_user_id() -> str | None:
    """
    Extract user_id from either:
      - Authorization: Bearer <jwt>   (preferred)
      - Flask session                 (fallback)
    Returns None if unauthenticated.
    """
    # Try JWT Bearer first
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        token = auth.split(" ", 1)[1]
        try:
            import jwt as pyjwt
            secret = os.getenv("SECRET_KEY", "")
            payload = pyjwt.decode(token, secret, algorithms=["HS256"])
            return str(payload.get("sub") or payload.get("user_id") or payload.get("id"))
        except Exception:
            pass

    # Fallback: Flask session
    try:
        from flask import session
        uid = session.get("user_id") or session.get("user", {}).get("id")
        if uid:
            return str(uid)
    except Exception:
        pass

    return None


# ─── Routes ────────────────────────────────────────────────────────────────────

@saved_places_bp.route("/api/saved-places", methods=["GET"])
def list_saved_places():
    user_id = get_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    video_id = request.args.get("video_id")

    conn = get_db()
    try:
        with conn.cursor() as cur:
            if video_id:
                cur.execute(
                    """
                    SELECT id, video_id, place_index, name, type,
                           city, region, country, lat, lng
                    FROM   saved_places
                    WHERE  user_id = %s AND video_id = %s
                    ORDER  BY place_index
                    """,
                    (user_id, video_id),
                )
            else:
                cur.execute(
                    """
                    SELECT id, video_id, place_index, name, type,
                           city, region, country, lat, lng
                    FROM   saved_places
                    WHERE  user_id = %s
                    ORDER  BY created_at DESC
                    """,
                    (user_id,),
                )
            rows = cur.fetchall()
        return jsonify([dict(r) for r in rows])
    except Exception as e:
        logger.error(f"saved_places GET error: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        conn.close()


@saved_places_bp.route("/api/saved-places", methods=["POST"])
def save_place():
    user_id = get_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    data = request.get_json(force=True) or {}
    video_id    = data.get("video_id")
    place_index = data.get("place_index")
    name        = data.get("name")

    if not video_id or place_index is None or not name:
        return jsonify({"error": "video_id, place_index, and name are required"}), 400

    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO saved_places
                    (user_id, video_id, place_index, name, type, city, region, country, lat, lng)
                VALUES
                    (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (user_id, video_id, place_index) DO UPDATE
                    SET name    = EXCLUDED.name,
                        type    = EXCLUDED.type,
                        city    = EXCLUDED.city,
                        region  = EXCLUDED.region,
                        country = EXCLUDED.country,
                        lat     = EXCLUDED.lat,
                        lng     = EXCLUDED.lng
                RETURNING id
                """,
                (
                    user_id,
                    video_id,
                    int(place_index),
                    name,
                    data.get("type"),
                    data.get("city"),
                    data.get("region"),
                    data.get("country"),
                    data.get("lat"),
                    data.get("lng"),
                ),
            )
            row = cur.fetchone()
        conn.commit()
        return jsonify({"id": row["id"], "saved": True}), 201
    except Exception as e:
        conn.rollback()
        logger.error(f"saved_places POST error: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        conn.close()


@saved_places_bp.route("/api/saved-places", methods=["DELETE"])
def unsave_place():
    user_id = get_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    data = request.get_json(force=True) or {}
    video_id    = data.get("video_id")
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
        conn.commit()
        return jsonify({"deleted": True})
    except Exception as e:
        conn.rollback()
        logger.error(f"saved_places DELETE error: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        conn.close()
