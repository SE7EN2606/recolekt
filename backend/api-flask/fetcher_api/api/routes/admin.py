import os
import sys
import json
import logging
import requests
from datetime import datetime
from flask import Blueprint, jsonify, request, render_template

from fetcher_api.adapters.db import execute, fetch_all, fetch_one
from fetcher_api.api.helpers.auth import get_user_id_from_request

logger = logging.getLogger("admin")

admin_bp = Blueprint("admin", __name__)

ADMIN_KEY = (
    os.getenv("ADMIN_KEY")
    or os.getenv("ADMIN_SECRET")
    or "recolekt-admin-2026"
)


def _check_admin_key():
    key = request.args.get("key") or request.headers.get("X-Admin-Key", "")
    return key == ADMIN_KEY


@admin_bp.route("/admin/page", methods=["GET"])
def admin_page():
    key = request.args.get("key", "")
    if key != ADMIN_KEY:
        return render_template("admin_login.html"), 401
    return render_template("admin.html", admin_key=key)


@admin_bp.route("/admin/dashboard", methods=["GET"])
@admin_bp.route("/admin/api/stats", methods=["GET"])
def admin_stats():
    if not _check_admin_key():
        return jsonify({"error": "Unauthorized"}), 401

    db = _get_db_stats()
    mistral = _get_mistral_usage()
    deepgram = _get_deepgram_usage()
    gcs = _get_gcs_usage()

    return jsonify({
        "db": db,
        "deepgram": deepgram,
        "gcs": gcs,
        "errors": _get_recent_errors(),
        "reels_list": _get_recent_reels(),
        "users_summary": _get_users_summary(),
        "reel_platform_breakdown": _get_reel_platform_breakdown(),
        "reel_type_breakdown": _get_reel_type_breakdown(),
        "generated_at": datetime.utcnow().isoformat(),
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "environment": os.getenv("RAILWAY_ENVIRONMENT", os.getenv("FLASK_ENV", "local")),
        "mistral": mistral,
        "users": {
            "total": db.get("total_users", 0),
            "active_today": db.get("active_today_users", 0),
            "newest": _get_newest_users(),
        },
        "reels": {
            "total": db.get("total_reels", 0),
            "processed_today": sum(d["count"] for d in db.get("daily", [])[:1]),
            "last_processed_at": _get_last_processed_at(),
        },
        "server": {
            "extractor_version": "universal-v17-taxonomy",
            "python_version": _get_python_version(),
        },
    })


@admin_bp.route("/admin/users_summary", methods=["GET"])
def admin_users_summary():
    if not _check_admin_key():
        return jsonify({"error": "Unauthorized"}), 401
    return jsonify({
        "generated_at": datetime.utcnow().isoformat(),
        "users": _get_users_summary(),
    })


@admin_bp.route("/admin/users/<user_id>", methods=["DELETE"])
def admin_delete_user(user_id):
    if not _check_admin_key():
        return jsonify({"error": "Unauthorized"}), 401
    try:
        user = fetch_one("SELECT user_id, email FROM users WHERE user_id = %s", (user_id,))
        if not user:
            return jsonify({"error": "User not found"}), 404
        reels_result = fetch_one("SELECT COUNT(*) as count FROM reels WHERE user_id = %s", (user_id,))
        reels_count = reels_result["count"] if reels_result else 0
        execute("DELETE FROM reels WHERE user_id = %s", (user_id,), commit=True)
        execute("DELETE FROM users WHERE user_id = %s", (user_id,), commit=True)
        logger.info(f"Admin deleted user {user_id} ({user.get('email')}) and {reels_count} reels")
        return jsonify({"success": True, "deleted_user": user_id, "deleted_reels": reels_count})
    except Exception as e:
        logger.error(f"Delete user error: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@admin_bp.route("/admin/users/<user_id>/tier", methods=["PATCH"])
def admin_update_tier(user_id):
    if not _check_admin_key():
        return jsonify({"error": "Unauthorized"}), 401
    try:
        data = request.get_json(silent=True) or {}
        new_tier = (data.get("tier") or "").strip().lower()
        if new_tier not in ("free", "pro"):
            return jsonify({"error": "tier must be 'free' or 'pro'"}), 400
        user = fetch_one("SELECT user_id, email FROM users WHERE user_id = %s", (user_id,))
        if not user:
            return jsonify({"error": "User not found"}), 404
        execute(
            "UPDATE users SET tier = %s, updated_at = NOW() WHERE user_id = %s",
            (new_tier, user_id),
            commit=True,
        )
        logger.info(f"Admin set tier={new_tier} for user {user_id} ({user.get('email')})")
        return jsonify({"success": True, "user_id": user_id, "tier": new_tier})
    except Exception as e:
        logger.error(f"Update tier error: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@admin_bp.route("/admin/cleanup_duplicates", methods=["POST"])
def cleanup_duplicates():
    if not _check_admin_key():
        return jsonify({"error": "Unauthorized"}), 401
    try:
        deleted = fetch_all("""
            DELETE FROM reels
            WHERE id IN (
                SELECT id FROM (
                    SELECT id, ROW_NUMBER() OVER (
                        PARTITION BY user_id, source_url ORDER BY created_at DESC
                    ) as rn FROM reels
                ) t WHERE rn > 1
            ) RETURNING id
        """)
        ids = [row["id"] for row in (deleted or [])]
        logger.info(f"Cleaned {len(ids)} duplicate entries")
        return jsonify({"cleaned": len(ids), "ids": ids})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@admin_bp.route("/admin/cleanup_errors", methods=["POST"])
def cleanup_errors():
    if not _check_admin_key():
        return jsonify({"error": "Unauthorized"}), 401
    try:
        result = fetch_one("SELECT COUNT(*) as count FROM reels WHERE status = 'error'")
        count = result["count"] if result else 0
        execute("DELETE FROM reels WHERE status = 'error'", commit=True)
        logger.info(f"Cleaned {count} error reels")
        return jsonify({"cleaned": count})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@admin_bp.route("/user/preferences", methods=["PATCH"])
def update_user_preferences():
    try:
        user_id = get_user_id_from_request()
        data = request.get_json(silent=True) or {}
        if "language" in data:
            execute("UPDATE users SET language = %s WHERE user_id = %s", (data["language"], user_id))
        if "darkMode" in data:
            execute("UPDATE users SET dark_mode = %s WHERE user_id = %s", (data["darkMode"], user_id))
        return jsonify({"success": True})
    except ValueError:
        return jsonify({"error": "Authentication required"}), 401
    except Exception as e:
        logger.error(f"Error saving prefs: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


def _get_db_stats():
    try:
        total_reels = fetch_one("SELECT COUNT(*) as count FROM reels")
        total_users = fetch_one("SELECT COUNT(*) as count FROM users")
        done_reels = fetch_one("SELECT COUNT(*) as count FROM reels WHERE status = 'done'")
        error_reels = fetch_one("SELECT COUNT(*) as count FROM reels WHERE status = 'error'")
        processing_reels = fetch_one("SELECT COUNT(*) as count FROM reels WHERE status = 'processing'")
        recipes = fetch_one("SELECT COUNT(*) as count FROM reels WHERE content_type = 'recipe'")
        active_today_users = fetch_one("""
            SELECT COUNT(DISTINCT user_id) as count
            FROM reels
            WHERE created_at > NOW() - INTERVAL '1 day'
              AND user_id IS NOT NULL
        """)

        daily = fetch_all("""
            SELECT DATE(created_at) as day, COUNT(*) as count
            FROM reels
            WHERE created_at > NOW() - INTERVAL '7 days'
            GROUP BY DATE(created_at)
            ORDER BY day DESC
        """)

        categories = fetch_all("""
            SELECT summary_category, COUNT(*) as count
            FROM reels
            WHERE summary_category IS NOT NULL AND summary_category != ''
            GROUP BY summary_category
            ORDER BY count DESC
            LIMIT 10
        """)

        return {
            "total_reels": total_reels["count"] if total_reels else 0,
            "total_users": total_users["count"] if total_users else 0,
            "done": done_reels["count"] if done_reels else 0,
            "errors": error_reels["count"] if error_reels else 0,
            "processing": processing_reels["count"] if processing_reels else 0,
            "recipes": recipes["count"] if recipes else 0,
            "active_today_users": active_today_users["count"] if active_today_users else 0,
            "daily": [{"day": str(r["day"]), "count": r["count"]} for r in (daily or [])],
            "categories": [{"name": r["summary_category"], "count": r["count"]} for r in (categories or [])],
        }
    except Exception as e:
        logger.error(f"DB stats error: {e}")
        return {"error": str(e)}


def _get_mistral_usage():
    api_key = os.getenv("MISTRAL_API_KEY", "")
    if not api_key:
        return {
            "configured": False,
            "status": "missing_key",
            "label": "Missing key",
            "calls_today": 0,
            "tokens_estimated_today": 0,
            "total_tokens": 0,
            "errors_today": 1,
            "last_call_at": None,
            "note": "MISTRAL_API_KEY not set",
            "api_key_prefix": None,
            "error": "MISTRAL_API_KEY not set",
        }

    api_key_prefix = api_key[:12] + "..."

    try:
        headers = {"Authorization": f"Bearer {api_key}"}
        health = requests.get("https://api.mistral.ai/v1/models", headers=headers, timeout=10)
        if health.status_code == 200:
            return {
                "configured": True,
                "status": "connected",
                "label": "Connected",
                "calls_today": 0,
                "tokens_estimated_today": 0,
                "total_tokens": 0,
                "errors_today": 0,
                "last_call_at": None,
                "note": "Model API reachable. Billing stats endpoint is not being used here.",
                "api_key_prefix": api_key_prefix,
                "error": None,
            }
        return {
            "configured": True,
            "status": "api_error",
            "label": f"HTTP {health.status_code}",
            "calls_today": 0,
            "tokens_estimated_today": 0,
            "total_tokens": 0,
            "errors_today": 1,
            "last_call_at": None,
            "note": "API key exists, but test request to Mistral models endpoint failed.",
            "api_key_prefix": api_key_prefix,
            "error": f"HTTP {health.status_code}",
        }
    except Exception as e:
        logger.error(f"Mistral usage error: {e}")
        return {
            "configured": True,
            "status": "exception",
            "label": "Request failed",
            "calls_today": 0,
            "tokens_estimated_today": 0,
            "total_tokens": 0,
            "errors_today": 1,
            "last_call_at": None,
            "note": str(e),
            "api_key_prefix": api_key_prefix,
            "error": str(e),
        }


def _get_deepgram_usage():
    api_key = os.getenv("DEEPGRAM_API_KEY", "")
    if not api_key:
        return {"error": "DEEPGRAM_API_KEY not set"}

    headers = {"Authorization": f"Token {api_key}"}

    try:
        projects_resp = requests.get(
            "https://api.deepgram.com/v1/projects", headers=headers, timeout=10
        )
        if projects_resp.status_code != 200:
            return {"error": f"Projects API: HTTP {projects_resp.status_code}"}

        projects = projects_resp.json().get("projects", [])
        if not projects:
            return {"error": "No Deepgram projects found"}

        project_id = projects[0].get("project_id")
        project_name = projects[0].get("name", "Unknown")
    except Exception as e:
        logger.error(f"Deepgram projects error: {e}")
        return {"error": str(e)}

    result = {
        "project_name": project_name,
        "project_id": project_id,
        "period": datetime.utcnow().strftime("%B %Y"),
        "balance": None,
        "usage_this_month": None,
        "scope_errors": [],
    }

    try:
        br = requests.get(
            f"https://api.deepgram.com/v1/projects/{project_id}/balances",
            headers=headers,
            timeout=10,
        )
        if br.status_code == 200:
            bd = br.json().get("balances", [])
            if bd:
                result["balance"] = {
                    "amount": bd[0].get("amount"),
                    "units": bd[0].get("units", "usd"),
                }
        elif br.status_code == 403:
            result["scope_errors"].append("billing:read scope missing, regenerate API key in Deepgram console")
    except Exception as e:
        logger.debug(f"Deepgram balances exception: {e}")

    try:
        now = datetime.utcnow()
        start = now.replace(day=1).strftime("%Y-%m-%d")
        end = now.strftime("%Y-%m-%d")

        ur = requests.get(
            f"https://api.deepgram.com/v1/projects/{project_id}/usage?start={start}&end={end}",
            headers=headers,
            timeout=10,
        )
        if ur.status_code == 200:
            total_hours = 0
            total_requests = 0
            for r in ur.json().get("results", []):
                total_hours += r.get("hours", 0)
                total_requests += r.get("requests", 0)
            result["usage_this_month"] = {
                "total_hours": round(total_hours, 4),
                "total_minutes": round(total_hours * 60, 2),
                "total_requests": total_requests,
            }
        elif ur.status_code == 403:
            result["scope_errors"].append("usage:read scope missing, regenerate API key in Deepgram console")
    except Exception as e:
        logger.debug(f"Deepgram usage exception: {e}")

    return result


def _get_gcs_usage():
    bucket_name = os.getenv("GCS_BUCKET_NAME", "recolekt-storage")
    try:
        from google.cloud import storage as gcs_storage
        from google.oauth2 import service_account

        creds_json = os.getenv("GCS_CREDENTIALS_JSON")
        if creds_json:
            creds_info = json.loads(creds_json)
            credentials = service_account.Credentials.from_service_account_info(creds_info)
            client = gcs_storage.Client(credentials=credentials, project=creds_info.get("project_id"))
        else:
            client = gcs_storage.Client()

        bucket = client.bucket(bucket_name)

        total_size = 0
        total_count = 0
        video_count = 0
        json_count = 0
        thumb_count = 0
        for blob in bucket.list_blobs(prefix="media/", max_results=2000):
            total_count += 1
            total_size += blob.size or 0
            name = blob.name.lower()
            if name.endswith(".mp4"):
                video_count += 1
            elif name.endswith(".json"):
                json_count += 1
            elif name.endswith((".jpg", ".jpeg", ".webp", ".png")):
                thumb_count += 1

        return {
            "bucket_name": bucket_name,
            "total_files": total_count,
            "total_size_mb": round(total_size / (1024 * 1024), 2),
            "total_size_gb": round(total_size / (1024 * 1024 * 1024), 3),
            "videos": video_count,
            "json_files": json_count,
            "thumbnails": thumb_count,
            "sampled": total_count >= 2000,
        }
    except Exception as e:
        logger.error(f"GCS usage error: {e}")
        return {"error": str(e)}


def _get_recent_errors():
    try:
        rows = fetch_all("""
            SELECT id, source_url, created_at, author_name
            FROM reels
            WHERE status = 'error'
            ORDER BY created_at DESC
            LIMIT 10
        """)
        return [
            {
                "id": r["id"],
                "url": r.get("source_url", ""),
                "created": r["created_at"].isoformat() if r.get("created_at") else "",
                "author": r.get("author_name", ""),
            }
            for r in (rows or [])
        ]
    except Exception as e:
        return [{"error": str(e)}]


def _get_recent_reels():
    try:
        rows = fetch_all("""
            SELECT id, summary_title, summary_category, content_type, status, created_at, author_name
            FROM reels
            WHERE status = 'done'
            ORDER BY created_at DESC
            LIMIT 10
        """)
        return [
            {
                "id": r["id"],
                "title": r.get("summary_title", "Untitled"),
                "category": r.get("summary_category", ""),
                "type": r.get("content_type", ""),
                "author": r.get("author_name", ""),
                "created": r["created_at"].isoformat() if r.get("created_at") else "",
            }
            for r in (rows or [])
        ]
    except Exception as e:
        return [{"error": str(e)}]


def _get_newest_users():
    try:
        rows = fetch_all("""
            SELECT email, created_at
            FROM users
            ORDER BY created_at DESC
            LIMIT 5
        """)
        return [
            {
                "email": r.get("email", ""),
                "joined": r["created_at"].isoformat() if r.get("created_at") else "",
            }
            for r in (rows or [])
        ]
    except Exception:
        return []


def _get_users_summary():
    try:
        rows = fetch_all("""
            SELECT
                u.user_id,
                u.email,
                u.name,
                COALESCE(u.tier, 'free') AS tier,
                u.created_at,
                u.last_active,
                COALESCE(COUNT(r.id), 0) AS saved_count,
                COALESCE(COUNT(r.id) FILTER (WHERE r.status = 'done'), 0) AS done_count,
                MAX(r.created_at) AS last_saved_at
            FROM users u
            LEFT JOIN reels r ON r.user_id = u.user_id
            GROUP BY u.user_id, u.email, u.name, u.tier, u.created_at, u.last_active
            ORDER BY u.created_at DESC
        """)
        return [
            {
                "user_id": r.get("user_id"),
                "email": r.get("email", ""),
                "name": r.get("name", ""),
                "tier": r.get("tier", "free"),
                "saved_count": int(r.get("saved_count") or 0),
                "done_count": int(r.get("done_count") or 0),
                "last_active": r["last_active"].isoformat() if r.get("last_active") else None,
                "created_at": r["created_at"].isoformat() if r.get("created_at") else None,
                "last_saved_at": r["last_saved_at"].isoformat() if r.get("last_saved_at") else None,
            }
            for r in (rows or [])
        ]
    except Exception as e:
        logger.error(f"Users summary error: {e}")
        return [{"error": str(e)}]


def _get_reel_platform_breakdown():
    try:
        rows = fetch_all("""
            SELECT
                CASE
                    WHEN source_url ILIKE '%youtube.com%' OR source_url ILIKE '%youtu.be%' THEN 'YouTube'
                    WHEN source_url ILIKE '%tiktok.com%' THEN 'TikTok'
                    WHEN source_url ILIKE '%instagram.com%' THEN 'Instagram'
                    WHEN source_url ILIKE '%facebook.com%' OR source_url ILIKE '%fb.watch%' THEN 'Facebook'
                    ELSE 'Other'
                END AS platform,
                COUNT(*) AS count
            FROM reels
            WHERE status = 'done'
            GROUP BY platform
            ORDER BY count DESC
        """)
        return [{"platform": r["platform"], "count": int(r["count"])} for r in (rows or [])]
    except Exception as e:
        logger.error(f"Platform breakdown error: {e}")
        return []


def _get_reel_type_breakdown():
    try:
        rows = fetch_all("""
            SELECT
                CASE
                    WHEN content_type = 'recipe' THEN 'Recipe'
                    WHEN content_type = 'workout' THEN 'Workout'
                    WHEN content_type = 'location' THEN 'Places'
                    WHEN content_type IN ('finance', 'financial') THEN 'Finance'
                    WHEN content_type = 'products' THEN 'Products'
                    WHEN is_list = true OR content_type = 'list' THEN 'List / Ranking'
                    WHEN content_type = 'software' THEN 'Software / Tools'
                    ELSE 'General'
                END AS type_label,
                COUNT(*) AS count
            FROM reels
            WHERE status = 'done'
            GROUP BY type_label
            ORDER BY count DESC
        """)
        return [{"type": r["type_label"], "count": int(r["count"])} for r in (rows or [])]
    except Exception as e:
        logger.error(f"Type breakdown error: {e}")
        return []


def _get_last_processed_at():
    try:
        row = fetch_one("SELECT created_at FROM reels WHERE status = 'done' ORDER BY created_at DESC LIMIT 1")
        return row["created_at"].isoformat() if row and row.get("created_at") else None
    except Exception:
        return None


def _get_python_version():
    return f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}"