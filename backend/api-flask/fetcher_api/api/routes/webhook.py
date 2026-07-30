# fetcher_api/api/routes/webhook.py
import os
import re
import json
import logging
import threading
import secrets
from datetime import datetime, timedelta

from flask import Blueprint, request, jsonify
import requests

from fetcher_api.adapters.db import execute, fetch_one, fetch_all
from fetcher_api.api.helpers.auth import get_user_id_from_request
from fetcher_api.api.helpers.webhook_signature import verify_meta_signature

logger = logging.getLogger("webhook")

webhook_bp = Blueprint("webhook", __name__)


def _extract_reel_url(text: str) -> str | None:
    match = re.search(r'(https?://(?:www\.)?instagram\.com/(?:reel|p)/[^\s"\'<>]+)', text or "")
    return match.group(1).strip() if match else None


def _get_user_by_platform_id(platform: str, platform_user_id: str) -> str | None:
    row = fetch_one(
        "SELECT user_id FROM linked_accounts WHERE platform = %s AND platform_user_id = %s",
        (platform, platform_user_id),
    )
    return row["user_id"] if row else None


def _send_instagram_dm(recipient_id: str, text: str):
    token = os.getenv("INSTAGRAM_PAGE_ACCESS_TOKEN", "")
    ig_account_id = os.getenv("INSTAGRAM_BUSINESS_ACCOUNT_ID", "")

    if not token or not ig_account_id:
        logger.warning("⚠️ Missing INSTAGRAM_PAGE_ACCESS_TOKEN or INSTAGRAM_BUSINESS_ACCOUNT_ID")
        return

    try:
        resp = requests.post(
            f"https://graph.instagram.com/v21.0/{ig_account_id}/messages",
            json={
                "recipient": {"id": recipient_id},
                "message": {"text": text},
                "messaging_product": "instagram",
            },
            params={"access_token": token},
            timeout=10,
        )

        if resp.status_code != 200:
            logger.warning(f"⚠️ DM send failed: {resp.text[:300]}")
        else:
            logger.info(f"✅ DM sent to {recipient_id}")

    except Exception as e:
        logger.error(f"❌ DM send error: {e}")


def _find_existing_reel(user_id: str, url: str, shortcode: str | None = None):
    shortcode = (shortcode or "").strip()
    url = (url or "").strip()

    try:
        if shortcode:
            return fetch_one(
                """
                SELECT id, status, gcs_urls, created_at
                FROM reels
                WHERE user_id = %s
                  AND (
                        source_url = %s
                        OR id LIKE %s
                  )
                ORDER BY created_at DESC NULLS LAST
                LIMIT 1
                """,
                (user_id, url, f"{shortcode}--%"),
            )

        return fetch_one(
            """
            SELECT id, status, gcs_urls, created_at
            FROM reels
            WHERE user_id = %s AND source_url = %s
            ORDER BY created_at DESC NULLS LAST
            LIMIT 1
            """,
            (user_id, url),
        )

    except Exception as exc:
        logger.warning("⚠️ Webhook duplicate lookup failed user=%s url=%s shortcode=%s: %s", user_id, url, shortcode, exc)

    return None


def _trigger_processing(user_id: str, url: str, sender_id: str):
    try:
        from fetcher_api.api.helpers.processing import background_process
        from fetcher_api.adapters.meta_client import meta_client
        from fetcher_api.services.storage import generate_gcs_paths
        from fetcher_api.utils.timestamps import get_timestamp, get_unique_id
        import tempfile

        shortcode = (meta_client.extract_shortcode(url) or "unknown").strip()

        existing = _find_existing_reel(user_id, url, shortcode)
        if existing:
            logger.info("📌 Webhook duplicate blocked: user=%s existing=%s url=%s", user_id, existing.get("id"), url)
            _send_instagram_dm(
                sender_id,
                "✅ You already have this reel saved! View it here: https://recolekt.app",
            )
            return

        process_id = f"{shortcode}--{get_timestamp()}--{get_unique_id(url)}"
        temp_dir = tempfile.mkdtemp()
        video_path = os.path.join(temp_dir, f"{process_id}.mp4")

        gcs_paths = generate_gcs_paths(shortcode, "IG", user_id=user_id)

        result = {
            "process_id": process_id,
            "summary": {},
            "caption": "",
            "gcs_paths": gcs_paths,
            "gcs_urls": {
                "preview_thumbnail": None,
                "video": None,
                "result_json": None,
            },
        }

        execute(
            """
            INSERT INTO reels (id, user_id, source_url, status, folder_id, gcs_urls, created_at)
            VALUES (%s, %s, %s, 'processing', 'default', %s, NOW())
            """,
            (process_id, user_id, url, json.dumps(result["gcs_urls"])),
        )

        def process_and_reply():
            background_process(result, video_path, temp_dir, shortcode, "", url, True, "", None, user_id)

            status = fetch_one(
                "SELECT status FROM reels WHERE id = %s AND user_id = %s",
                (process_id, user_id),
            )

            if status and status["status"] == "done":
                _send_instagram_dm(
                    sender_id,
                    "✨ Done! Your reel is saved on Recolekt.\nView it here: https://recolekt.app",
                )
            else:
                _send_instagram_dm(
                    sender_id,
                    "⚠️ Something went wrong processing your reel. Please try again!",
                )

        threading.Thread(target=process_and_reply, daemon=True).start()
        _send_instagram_dm(sender_id, "⏳ Got it! I'm processing your reel now. I'll message you when it's ready.")

    except Exception as e:
        logger.error(f"❌ _trigger_processing error: {e}", exc_info=True)
        _send_instagram_dm(sender_id, "⚠️ Something went wrong. Please try again!")


def _process_message_event(sender_id: str, message: dict):
    """Handle a single message event regardless of which format it came from."""
    text = message.get("text", "")

    if not text:
        for att in message.get("attachments", []):
            payload_url = att.get("payload", {}).get("url", "")
            if payload_url:
                text = payload_url
                break

    logger.info(f"📩 sender={sender_id} text={text[:200] if text else '(empty)'}")

    if not text:
        return

    if "instagram.com/reel" in text or "instagram.com/p/" in text:
        threading.Thread(target=handle_inbound_reel, args=(sender_id, text), daemon=True).start()


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
            (token, "instagram", sender_id, expires_at),
        )

        _send_instagram_dm(
            sender_id,
            f"👋 Hey! To save reels to your Recolekt account, connect here first:\n"
            f"https://recolekt.app/connect?token={token}\n\n"
            f"Once connected, just DM me any Instagram reel and I'll save it for you! ✨",
        )
        return

    _trigger_processing(user_id, url, sender_id)


@webhook_bp.route("/webhook/instagram", methods=["GET", "POST"])
def instagram_webhook():
    if request.method == "GET":
        if request.args.get("hub.verify_token") == os.getenv("WEBHOOK_VERIFY_TOKEN"):
            return request.args.get("hub.challenge"), 200
        return "Forbidden", 403

    raw_body = request.get_data(cache=True)
    signature_valid, signature_reason = verify_meta_signature(request, raw_body)
    if not signature_valid:
        logger.warning("Meta webhook signature rejected: %s", signature_reason)
        return "Forbidden", 403

    data = request.get_json(silent=True) or {}
    logger.info("Meta webhook accepted with %d entr%s", len(data.get("entry", [])), "y" if len(data.get("entry", [])) == 1 else "ies")

    for entry in data.get("entry", []):
        for change in entry.get("changes", []):
            if change.get("field") != "messages":
                continue

            val = change.get("value", {})
            sender_id = val.get("sender", {}).get("id")
            message = val.get("message", {})

            if sender_id and message:
                _process_message_event(sender_id, message)

        for event in entry.get("messaging", []):
            sender_id = event.get("sender", {}).get("id")
            message = event.get("message", {})

            if sender_id and message:
                _process_message_event(sender_id, message)

    return "OK", 200


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
        "SELECT platform, platform_user_id, expires_at FROM linking_tokens WHERE token = %s",
        (token,),
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
        (user_id, row["platform"], row["platform_user_id"]),
    )

    execute("DELETE FROM linking_tokens WHERE token = %s", (token,))

    logger.info(f"✅ Linked {row['platform']} account {row['platform_user_id']} to user {user_id}")
    return jsonify({"success": True, "platform": row["platform"]}), 200


@webhook_bp.route("/connect/status", methods=["GET"])
def connect_status():
    try:
        user_id = get_user_id_from_request()
    except ValueError:
        return jsonify({"error": "Authentication required"}), 401

    rows = fetch_all(
        "SELECT platform, platform_username, linked_at FROM linked_accounts WHERE user_id = %s",
        (user_id,),
    )

    return jsonify({"linked": rows or []}), 200
