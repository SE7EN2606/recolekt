# fetcher_api/api/routes/admin.py
"""
Admin routes - JSON API for dashboard, cleanup, and maintenance.
Protected by a simple admin key (not JWT — this is for internal use).
"""

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

# ✅ Accept either env var name — never breaks regardless of what Railway has
ADMIN_KEY = (
    os.getenv("ADMIN_KEY")
    or os.getenv("ADMIN_SECRET")
    or "recolekt-admin-2026"
)


def _check_admin_key():
    key = request.args.get("key") or request.headers.get("X-Admin-Key", "")
    return key == ADMIN_KEY


# ══════════════════════════════════════════════════════════════
# ADMIN PAGE (HTML template)
# ══════════════════════════════════════════════════════════════

@admin_bp.route("/admin/page", methods=["GET"])
def admin_page():
    key = request.args.get("key", "")
    if key != ADMIN_KEY:
        return render_template("admin_login.html"), 401
    return render_template("admin.html", admin_key=key)


# ══════════════════════════════════════════════════════════════
# MAIN DASHBOARD ENDPOINT
# blueprint prefix "/api" + "/admin/dashboard" = /api/admin/dashboard ✅
# ══════════════════════════════════════════════════════════════

@admin_bp.route("/admin/dashboard", methods=["GET"])
@admin_bp.route("/admin/api/stats", methods=["GET"])
def admin_stats():
    if not _check_admin_key():
        return jsonify({"error": "Unauthorized"}), 401

    db       = _get_db_stats()
    mistral  = _get_mistral_usage()
    deepgram = _get_deepgram_usage()
    gcs      = _get_gcs_usage()

    return jsonify({
        # ── New structured format ──
        "db":           db,
        "deepgram":     deepgram,
        "gcs":          gcs,
        "errors":       _get_recent_errors(),
        "reels_list":   _get_recent_reels(),
        "generated_at": datetime.utcnow().isoformat(),

        # ── Legacy format (matches HTML dashboard JS) ──
        "timestamp":   datetime.utcnow().isoformat() + "Z",
        "environment": os.getenv("RAILWAY_ENVIRONMENT", os.getenv("FLASK_ENV", "local")),
        "mistral": {
            **mistral,
            "calls_today":            mistral.get("total_requests"),
            "tokens_estimated_today": mistral.get("total_tokens"),
            "errors_today":           1 if mistral.get("error") else 0,
            "estimated_remaining":    None,
            "remaining_tokens_month": None,
            "last_call_at":           None,
        },
        "users": {
            "total":        db.get("total_users", 0),
            "active_today": db.get("done", 0),
            "newest":       _get_newest_users(),
        },
        "reels": {
            "total":             db.get("total_reels", 0),
            "processed_today":   sum(d["count"] for d in db.get("daily", [])[:1]),
            "last_processed_at": _get_last_processed_at(),
        },
        "server": {
            "extractor_version": "universal-v17-taxonomy",
            "python_version":    _get_python_version(),
        },
    })


# ══════════════════════════════════════════════════════════════
# DATA FETCHERS
# ══════════════════════════════════════════════════════════════

def _get_db_stats():
    try:
        total_reels      = fetch_one("SELECT COUNT(*) as count FROM reels")
        total_users      = fetch_one("SELECT COUNT(*) as count FROM users")
        done_reels       = fetch_one("SELECT COUNT(*) as count FROM reels WHERE status = 'done'")
        error_reels      = fetch_one("SELECT COUNT(*) as count FROM reels WHERE status = 'error'")
        processing_reels = fetch_one("SELECT COUNT(*) as count FROM reels WHERE status = 'processing'")
        recipes          = fetch_one("SELECT COUNT(*) as count FROM reels WHERE content_type = 'recipe'")

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
            "total_reels": total_reels["count"]      if total_reels      else 0,
            "total_users": total_users["count"]      if total_users      else 0,
            "done":        done_reels["count"]       if done_reels       else 0,
            "errors":      error_reels["count"]      if error_reels      else 0,
            "processing":  processing_reels["count"] if processing_reels else 0,
            "recipes":     recipes["count"]          if recipes          else 0,
            "daily":      [{"day": str(r["day"]), "count": r["count"]} for r in (daily      or [])],
            "categories": [{"name": r["summary_category"], "count": r["count"]} for r in (categories or [])],
        }
    except Exception as e:
        logger.error(f"DB stats error: {e}")
        return {"error": str(e)}


def _get_mistral_usage():
    api_key = os.getenv("MISTRAL_API_KEY", "")
    if not api_key:
        return {"error": "MISTRAL_API_KEY not set", "total_requests": 0, "total_tokens": 0}
    try:
        headers = {"Authorization": f"Bearer {api_key}"}
        now = datetime.utcnow()

        # ✅ Correct Mistral billing endpoint
        resp = requests.get(
            "https://api.mistral.ai/v1/billing/workspace/credits",
            headers=headers, timeout=10,
        )

        if resp.status_code == 200:
            data = resp.json()
            return {
                "total_tokens":       0,
                "total_requests":     0,
                "estimated_cost_usd": 0,
                "period":             now.strftime("%B %Y"),
                "model":              "mistral-small-latest",
                "credits":            data,
            }
        else:
            return {
                "error":          f"HTTP {resp.status_code}",
                "note":           "Check console.mistral.ai for usage stats",
                "api_key_prefix": api_key[:12] + "...",
                "total_requests": 0,
                "total_tokens":   0,
            }
    except Exception as e:
        logger.error(f"Mistral usage error: {e}")
        return {"error": str(e), "total_requests": 0, "total_tokens": 0}


def _get_deepgram_usage():
    api_key = os.getenv("DEEPGRAM_API_KEY", "")
    if not api_key:
        return {"error": "DEEPGRAM_API_KEY not set"}

    headers = {"Authorization": f"Token {api_key}"}

    # ── Step 1: Get project ID ──────────────────────────────────────────────
    try:
        projects_resp = requests.get(
            "https://api.deepgram.com/v1/projects", headers=headers, timeout=10
        )
        if projects_resp.status_code != 200:
            return {"error": f"Projects API: HTTP {projects_resp.status_code}"}

        projects = projects_resp.json().get("projects", [])
        if not projects:
            return {"error": "No Deepgram projects found"}

        project_id   = projects[0].get("project_id")
        project_name = projects[0].get("name", "Unknown")

    except Exception as e:
        logger.error(f"Deepgram projects error: {e}")
        return {"error": str(e)}

    result = {
        "project_name": project_name,
        "project_id":   project_id,
        "period":       datetime.utcnow().strftime("%B %Y"),
        "balance":      None,
        "usage_this_month": None,
        "scope_errors": [],  # surfaced in dashboard so you know exactly what's missing
    }

    # ── Step 2: Balance ─────────────────────────────────────────────────────
    try:
        br = requests.get(
            f"https://api.deepgram.com/v1/projects/{project_id}/balances",
            headers=headers, timeout=10,
        )
        if br.status_code == 200:
            bd = br.json().get("balances", [])
            if bd:
                result["balance"] = {
                    "amount": bd[0].get("amount"),
                    "units":  bd[0].get("units", "usd"),
                }
        elif br.status_code == 403:
            msg = "billing:read scope missing — regenerate API key in Deepgram console"
            result["scope_errors"].append(msg)
            logger.debug(f"Deepgram balances: {msg}")  # downgraded from WARNING
        else:
            logger.debug(f"Deepgram balances: HTTP {br.status_code} — {br.text[:200]}")
    except Exception as e:
        logger.debug(f"Deepgram balances exception: {e}")

    # ── Step 3: Usage ───────────────────────────────────────────────────────
    try:
        now   = datetime.utcnow()
        start = now.replace(day=1).strftime("%Y-%m-%d")
        end   = now.strftime("%Y-%m-%d")

        ur = requests.get(
            f"https://api.deepgram.com/v1/projects/{project_id}/usage"
            f"?start={start}&end={end}",
            headers=headers, timeout=10,
        )
        if ur.status_code == 200:
            total_hours = total_requests = 0
            for r in ur.json().get("results", []):
                total_hours    += r.get("hours",    0)
                total_requests += r.get("requests", 0)
            result["usage_this_month"] = {
                "total_hours":    round(total_hours, 4),
                "total_minutes":  round(total_hours * 60, 2),
                "total_requests": total_requests,
            }
        elif ur.status_code == 403:
            msg = "usage:read scope missing — regenerate API key in Deepgram console"
            result["scope_errors"].append(msg)
            logger.debug(f"Deepgram usage: {msg}")  # downgraded from WARNING
        else:
            logger.debug(f"Deepgram usage: HTTP {ur.status_code} — {ur.text[:200]}")
    except Exception as e:
        logger.debug(f"Deepgram usage exception: {e}")

    return result

def _get_gcs_usage():
    # ✅ Explicitly pass credentials from env — same as storage.py does
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
            client = gcs_storage.Client()  # local ADC fallback

        bucket = client.bucket(bucket_name)

        total_size = total_count = video_count = json_count = thumb_count = 0
        for blob in bucket.list_blobs(prefix="media/", max_results=2000):
            total_count += 1
            total_size  += blob.size or 0
            name = blob.name.lower()
            if name.endswith(".mp4"):
                video_count += 1
            elif name.endswith(".json"):
                json_count += 1
            elif name.endswith((".jpg", ".jpeg", ".webp", ".png")):
                thumb_count += 1

        return {
            "bucket_name":    bucket_name,
            "total_files":    total_count,
            "total_size_mb":  round(total_size / (1024 * 1024),        2),
            "total_size_gb":  round(total_size / (1024 * 1024 * 1024), 3),
            "videos":         video_count,
            "json_files":     json_count,
            "thumbnails":     thumb_count,
            "sampled":        total_count >= 2000,
        }
    except Exception as e:
        logger.error(f"GCS usage error: {e}")
        return {"error": str(e)}


def _get_recent_errors():
    try:
        rows = fetch_all("""
            SELECT id, source_url, created_at, author_name
            FROM reels WHERE status = 'error'
            ORDER BY created_at DESC LIMIT 10
        """)
        return [
            {
                "id":      r["id"],
                "url":     r.get("source_url", ""),
                "created": r["created_at"].isoformat() if r.get("created_at") else "",
                "author":  r.get("author_name", ""),
            }
            for r in (rows or [])
        ]
    except Exception as e:
        return [{"error": str(e)}]


def _get_recent_reels():
    try:
        rows = fetch_all("""
            SELECT id, summary_title, summary_category, content_type, status, created_at, author_name
            FROM reels WHERE status = 'done'
            ORDER BY created_at DESC LIMIT 10
        """)
        return [
            {
                "id":       r["id"],
                "title":    r.get("summary_title",    "Untitled"),
                "category": r.get("summary_category", ""),
                "type":     r.get("content_type",     ""),
                "author":   r.get("author_name",      ""),
                "created":  r["created_at"].isoformat() if r.get("created_at") else "",
            }
            for r in (rows or [])
        ]
    except Exception as e:
        return [{"error": str(e)}]


def _get_newest_users():
    try:
        rows = fetch_all("""
            SELECT email, created_at FROM users
            ORDER BY created_at DESC LIMIT 5
        """)
        return [
            {
                "email":  r.get("email", ""),
                "joined": r["created_at"].isoformat() if r.get("created_at") else "",
            }
            for r in (rows or [])
        ]
    except Exception:
        return []


def _get_last_processed_at():
    try:
        row = fetch_one(
            "SELECT created_at FROM reels WHERE status = 'done' ORDER BY created_at DESC LIMIT 1"
        )
        return row["created_at"].isoformat() if row and row.get("created_at") else None
    except Exception:
        return None


def _get_python_version():
    return f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}"


# ══════════════════════════════════════════════════════════════
# CLEANUP ROUTES
# ══════════════════════════════════════════════════════════════

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
        logger.info(f"🧹 Cleaned {len(ids)} duplicate entries")
        return jsonify({"cleaned": len(ids), "ids": ids})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@admin_bp.route("/admin/cleanup_errors", methods=["POST"])
def cleanup_errors():
    if not _check_admin_key():
        return jsonify({"error": "Unauthorized"}), 401
    try:
        result = fetch_one("SELECT COUNT(*) as count FROM reels WHERE status = 'error'")
        count  = result["count"] if result else 0
        execute("DELETE FROM reels WHERE status = 'error'", commit=True)
        logger.info(f"🧹 Cleaned {count} error reels")
        return jsonify({"cleaned": count})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@admin_bp.route("/user/preferences", methods=["PATCH"])
def update_user_preferences():
    try:
        user_id = get_user_id_from_request()
        data = request.get_json()
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
