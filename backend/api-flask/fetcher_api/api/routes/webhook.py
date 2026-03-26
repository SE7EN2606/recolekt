# fetcher_api/api/routes/webhook.py
import os
import re
import logging
import threading
import secrets
from datetime import datetime, timedelta
from flask import Blueprint, request, jsonify
import requests

from fetcher_api.adapters.db import execute, fetch_one, fetch_all
from fetcher_api.api.helpers.auth import get_user_id_from_request

logger = logging.getLogger("webhook")

webhook_bp = Blueprint("webhook", __name__)


# ----------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------

def _extract_reel_url(text: str) -> str | None:
    match = re.search(r'(https?://(?:www\.)?instagram\.com/(?:reel|p)/[^\s"\'<>]+)', text)
    return match.group(1).strip() if match else None


def _get_user_by_platform_id(platform: str, platform_user_id: str) -> str | None:
    row = fetch_one(
        "SELECT user_id FROM linked_accounts WHERE platform = %s AND platform_user_id = %s",
        (platform, platform_user_id)
    )
    return row["user_id"] if row else None


def _send_instagram_dm(recipient_id: str, text: str):
    token = os.getenv("INSTAGRAM_PAGE_ACCESS_TOKEN", "")
    ig_account_id = os.getenv("INSTAGRAM_BUSINESS_ACCOUNT_ID", "")
    if not token or not ig_account_id:
        logger.warning("⚠️ Missing INSTAGRAM_PAGE_ACCESS_TOKEN or INSTAGRAM_ACCOUNT_ID")
        return
    try:
        resp = requests.post(
            f"https://graph.facebook.com/v21.0/{ig_account_id}/messages",
            json={
                "recipient": {"id": recipient_id},
                "message": {"text": text}
            },
            params={"access_token": token},
            timeout=10,
        )
        if resp.status_code != 200:
            logger.warning(f"⚠️ DM send failed: {resp.text[:200]}")
        else:
            logger.info(f"✅ DM sent to {recipient_id}")
    except Exception as e:
        logger.error(f"❌ DM send error: {e}")


def _trigger_processing(user_id: str, url: str, sender_id: str):
    """Calls /summarize internally and replies via DM."""
    try:
        from fetcher_api.api.helpers.processing import background_process
        from fetcher_api.adapters.meta_client import meta_client
        from fetcher_api.services.storage import generate_gcs_paths
        from fetcher_api.adapters.db import execute, fetch_one
        from fetcher_api.utils.timestamps import get_timestamp, get_unique_id
        import tempfile, os, json

        existing = fetch_one(
            "SELECT id FROM reels WHERE user_id = %s AND source_url = %s",
            (user_id, url)
        )
        if existing:
            _send_instagram_dm(
                sender_id,
                "✅ You already have this reel saved! View it here: https://recolekt.app"
            )
            return

        shortcode = meta_client.extract_shortcode(url) or "unknown"
        process_id = f"{shortcode}--{get_timestamp()}--{get_unique_id(url)}"
        video_path = os.path.join(tempfile.mkdtemp(), f"{process_id}.mp4")
        temp_dir = os.path.dirname(video_path)

        gcs_paths = generate_gcs_paths(shortcode, "IG")
        result = {
            "process_id": process_id,
            "summary": {},
            "caption": "",
            "gcs_paths": gcs_paths,
            "gcs_urls": {"preview_thumbnail": None, "video": None},
        }

        execute(
            """
            INSERT INTO reels (id, user_id, source_url, status, folder_id, gcs_urls, created_at)
            VALUES (%s, %s, %s, 'processing', 'default', %s, NOW())
            """,
            (process_id, user_id, url, json.dumps(result["gcs_urls"])),
        )

        def process_and_reply():
            from fetcher_api.api.helpers.processing import background_process
            background_process(result, video_path, temp_dir, shortcode, "", url, True, "", None, user_id)
            status = fetch_one("SELECT status FROM reels WHERE id = %s", (process_id,))
            if status and status["status"] == "done":
                _send_instagram_dm(
                    sender_id,
                    "✨ Done! Your reel is saved on Recolekt.\nView it here: https://recolekt.app"
                )
            else:
                _send_instagram_dm(
                    sender_id,
                    "⚠️ Something went wrong processing your reel. Please try again!"
                )

        threading.Thread(target=process_and_reply, daemon=True).start()
        _send_instagram_dm(
            sender_id,
            "⏳ Got it! I'm processing your reel now. I'll message you when it's ready."
        )

    except Exception as e:
        logger.error(f"❌ _trigger_processing error: {e}", exc_info=True)
        _send_instagram_dm(sender_id, "⚠️ Something went wrong. Please try again!")


def handle_inbound_reel(sender_id: str, text: str):
    url = _extract_reel_url(text)
    if not url:
        return

    user_id = _get_user_by_platform_id("instagram", sender_id)

    if not user_id:
        token = secrets.token_urlsafe(24)
        expires_at = datetime.utcnow() + timedelta(hours=24)
        execute(
            """
            INSERT INTO linking_tokens (token, platform, platform_user_id, expires_at)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (token) DO NOTHING
            """,
            (token, "instagram", sender_id, expires_at)
        )
        _send_instagram_dm(
            sender_id,
            f"👋 Hey! To save reels to your Recolekt account, connect here first:\n"
            f"https://recolekt.app/connect?token={token}\n\n"
            f"Once connected, just DM me any Instagram reel and I'll save it for you! ✨"
        )
        return

    _trigger_processing(user_id, url, sender_id)


# ----------------------------------------------------------------
# Webhook — Instagram DM
# ----------------------------------------------------------------

@webhook_bp.route("/webhook/instagram", methods=["GET", "POST"])
def instagram_webhook():
    if request.method == "GET":
        if request.args.get("hub.verify_token") == os.getenv("WEBHOOK_VERIFY_TOKEN"):
            return request.args.get("hub.challenge"), 200
        return "Forbidden", 403

    data = request.get_json(silent=True) or {}
    logger.info(f"📨 Webhook received: {str(data)[:300]}")

    for entry in data.get("entry", []):
        for event in entry.get("messaging", []):
            sender_id = event.get("sender", {}).get("id")
            text = event.get("message", {}).get("text", "")
            if not sender_id or not text:
                continue
            if "instagram.com/reel" in text or "instagram.com/p/" in text:
                threading.Thread(
                    target=handle_inbound_reel,
                    args=(sender_id, text),
                    daemon=True
                ).start()

    return "OK", 200


# ----------------------------------------------------------------
# Account linking — called from frontend /connect page
# ----------------------------------------------------------------

@webhook_bp.route("/connect/instagram", methods=["POST"])
def connect_instagram():
    try:
        user_id = get_user_id_from_request()
    except ValueError:
        return jsonify({"error": "Authentication required"}), 401

    token = (request.get_json() or {}).get("token")
    if not token:
        return jsonify({"error": "Token required"}), 400

    row = fetch_one(
        """
        SELECT platform, platform_user_id, expires_at
        FROM linking_tokens
        WHERE token = %s
        """,
        (token,)
    )

    if not row:
        return jsonify({"error": "Invalid or expired token"}), 404

    if datetime.utcnow() > row["expires_at"]:
        return jsonify({"error": "Token expired — please DM @recolekt again"}), 410

    execute(
        """
        INSERT INTO linked_accounts (user_id, platform, platform_user_id)
        VALUES (%s, %s, %s)
        ON CONFLICT (platform, platform_user_id) DO UPDATE SET user_id = EXCLUDED.user_id
        """,
        (user_id, row["platform"], row["platform_user_id"])
    )

    execute("DELETE FROM linking_tokens WHERE token = %s", (token,))

    logger.info(f"✅ Linked {row['platform']} account {row['platform_user_id']} to user {user_id}")
    return jsonify({"success": True, "platform": row["platform"]}), 200


# ----------------------------------------------------------------
# Check link status (for frontend /connect page polling)
# ----------------------------------------------------------------

@webhook_bp.route("/connect/status", methods=["GET"])
def connect_status():
    try:
        user_id = get_user_id_from_request()
    except ValueError:
        return jsonify({"error": "Authentication required"}), 401

    rows = fetch_all(
        "SELECT platform, platform_username, linked_at FROM linked_accounts WHERE user_id = %s",
        (user_id,)
    )
    return jsonify({"linked": rows or []}), 200
