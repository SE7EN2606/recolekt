# fetcher_api/services/digest.py
import os
import logging
import requests
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

RESEND_API_URL = "https://api.resend.com/emails"
DEEPGRAM_USAGE_URL = "https://api.deepgram.com/v1/projects/{project_id}/usage"


def get_deepgram_minutes_today() -> float | None:
    """Fetch today's transcription minutes from Deepgram usage API."""
    api_key = os.getenv("DEEPGRAM_API_KEY")
    project_id = os.getenv("DEEPGRAM_PROJECT_ID")
    if not api_key or not project_id:
        logger.warning("⚠️ DEEPGRAM_API_KEY or DEEPGRAM_PROJECT_ID not set")
        return None

    try:
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        url = DEEPGRAM_USAGE_URL.format(project_id=project_id)
        resp = requests.get(
            url,
            headers={"Authorization": f"Token {api_key}"},
            params={"start": today, "end": today},
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        # Sum hours from all requests and convert to minutes
        hours = sum(r.get("hours", 0) for r in data.get("requests", []))
        minutes = round(hours * 60, 2)
        return minutes
    except Exception as e:
        logger.error("Deepgram usage fetch failed: %s", e)
        return None


def get_daily_stats() -> dict:
    """Gather all daily stats for the digest."""
    from fetcher_api.services.usage_tracker import get_usage
    from fetcher_api.adapters.db import get_db_connection

    usage = get_usage()
    stats = {
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "mistral_calls_today": usage["calls_today"],
        "mistral_tokens_today": usage["tokens_estimated_today"],
        "mistral_errors_today": usage["errors_today"],
        "reels_today": 0,
        "reels_total": 0,
        "new_users_today": 0,
        "active_users_today": 0,
        "total_users": 0,
        "deepgram_minutes_today": get_deepgram_minutes_today(),
        "gcs_total_gb": None,  # placeholder — add GCS billing API later
    }

    try:
        with get_db_connection() as conn:
            cur = conn.cursor()

            cur.execute("SELECT COUNT(*) FROM reels WHERE created_at >= NOW() - INTERVAL '24 hours'")
            stats["reels_today"] = cur.fetchone()[0]

            cur.execute("SELECT COUNT(*) FROM reels")
            stats["reels_total"] = cur.fetchone()[0]

            cur.execute("SELECT COUNT(*) FROM users WHERE created_at >= NOW() - INTERVAL '24 hours'")
            stats["new_users_today"] = cur.fetchone()[0]

            cur.execute("SELECT COUNT(DISTINCT user_id) FROM reels WHERE created_at >= NOW() - INTERVAL '24 hours'")
            stats["active_users_today"] = cur.fetchone()[0]

            cur.execute("SELECT COUNT(*) FROM users")
            stats["total_users"] = cur.fetchone()[0]

            cur.close()
    except Exception as e:
        logger.error("Digest DB query failed: %s", e)

    return stats


def _fmt(val, suffix="", fallback="—"):
    if val is None:
        return fallback
    return f"{val}{suffix}"


def build_digest_html(stats: dict) -> str:
    """Build a clean HTML email body from stats dict."""
    ts = stats.get("timestamp", "")[:10]
    return f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background:#f9f9f9; padding:32px; color:#111; }}
    .card {{ background:white; border-radius:12px; padding:24px 28px; margin-bottom:16px; border:1px solid #eee; }}
    h1 {{ font-size:20px; font-weight:700; margin:0 0 4px; }}
    .sub {{ font-size:13px; color:#888; margin-bottom:28px; }}
    h3 {{ font-size:11px; text-transform:uppercase; letter-spacing:0.1em; color:#999; margin:0 0 12px; }}
    .row {{ display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid #f0f0f0; font-size:14px; }}
    .row:last-child {{ border-bottom:none; }}
    .label {{ color:#555; }}
    .value {{ font-weight:700; color:#111; }}
    .ok {{ color:#16a34a; }}
    .warn {{ color:#d97706; }}
  </style>
</head>
<body>
  <h1>⚡ Recolekt Daily Digest</h1>
  <div class="sub">{ts} · Auto-generated summary</div>

  <div class="card">
    <h3>👥 Users</h3>
    <div class="row"><span class="label">Total users</span><span class="value">{_fmt(stats.get('total_users'))}</span></div>
    <div class="row"><span class="label">Active today</span><span class="value">{_fmt(stats.get('active_users_today'))}</span></div>
    <div class="row"><span class="label">New today</span><span class="value">{_fmt(stats.get('new_users_today'))}</span></div>
  </div>

  <div class="card">
    <h3>🎬 Reels</h3>
    <div class="row"><span class="label">Processed today</span><span class="value">{_fmt(stats.get('reels_today'))}</span></div>
    <div class="row"><span class="label">Total reels</span><span class="value">{_fmt(stats.get('reels_total'))}</span></div>
  </div>

  <div class="card">
    <h3>🤖 Mistral AI</h3>
    <div class="row"><span class="label">Calls today</span><span class="value">{_fmt(stats.get('mistral_calls_today'))}</span></div>
    <div class="row"><span class="label">Tokens estimated</span><span class="value">{_fmt(stats.get('mistral_tokens_today'))}</span></div>
    <div class="row"><span class="label">Errors today</span><span class="value {'warn' if (stats.get('mistral_errors_today') or 0) > 0 else 'ok'}">{_fmt(stats.get('mistral_errors_today'), fallback='0')}</span></div>
  </div>

  <div class="card">
    <h3>🎙️ Deepgram</h3>
    <div class="row"><span class="label">Minutes transcribed today</span><span class="value">{_fmt(stats.get('deepgram_minutes_today'), suffix=' min')}</span></div>
  </div>

  <div class="card">
    <h3>☁️ Storage (GCS)</h3>
    <div class="row"><span class="label">Bucket size</span><span class="value">{_fmt(stats.get('gcs_total_gb'), suffix=' GB')}</span></div>
  </div>

  <div style="font-size:11px;color:#bbb;text-align:center;margin-top:32px;">
    Recolekt Admin · api.recolekt.app
  </div>
</body>
</html>
"""


def send_admin_digest_email(stats: dict) -> bool:
    """Send digest email via Resend API."""
    api_key = os.getenv("RESEND_API_KEY")
    to_email = os.getenv("ADMIN_DIGEST_TO")

    if not api_key:
        logger.error("❌ RESEND_API_KEY not set")
        return False
    if not to_email:
        logger.error("❌ ADMIN_DIGEST_TO not set")
        return False

    date_str = datetime.utcnow().strftime("%b %d, %Y")
    html = build_digest_html(stats)

    payload = {
        "from": os.getenv("RESEND_FROM_EMAIL", "admin@recolekt.app"),
        "to": [to_email],
        "subject": f"⚡ Recolekt Daily Digest — {date_str}",
        "html": html,
    }

    try:
        resp = requests.post(
            RESEND_API_URL,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=15,
        )
        resp.raise_for_status()
        logger.info("✅ Digest email sent to %s", to_email)
        return True
    except Exception as e:
        logger.error("❌ Failed to send digest email: %s", e)
        return False
