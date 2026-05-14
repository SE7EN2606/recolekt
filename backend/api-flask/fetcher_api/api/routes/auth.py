import os
import logging
import jwt
import requests
import random
import resend
import urllib.parse
import time
import threading
from datetime import datetime, timedelta, timezone

from flask import Blueprint, request, jsonify, session, redirect, url_for, current_app
from werkzeug.security import generate_password_hash, check_password_hash

from fetcher_api.api.helpers.auth import get_user_id_from_request
from fetcher_api.adapters.db import execute, fetch_one, fetch_all
from fetcher_api.utils.timestamps import get_unique_id
logger = logging.getLogger("auth")

auth_bp = Blueprint("auth", __name__)

resend.api_key = os.getenv("RESEND_API_KEY")
FROM_EMAIL = os.getenv("FROM_EMAIL", "noreply@recolekt.app")
APP_URL = os.getenv("APP_URL", "https://recolekt.app")

# 🔥 MEMORY CACHE to prevent duplicate webhook processing
PROCESSED_WEBHOOKS = {}

def get_signing_key():
    return os.getenv("SECRET_KEY", "recolekt-titanium-secret-2026")


def create_jwt_token(user_id: str, email: str) -> str:
    payload = {
        "user_id": user_id,
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
        "iat": datetime.now(timezone.utc),
    }
    token = jwt.encode(payload, get_signing_key(), algorithm="HS256")
    return token if isinstance(token, str) else token.decode('utf-8')


def _get_frontend_base() -> str:
    env_url = os.getenv("FRONTEND_BASE_URL", "").strip().rstrip("/")
    if env_url:
        return env_url
    host = request.host
    scheme = request.scheme
    return f"{scheme}://{host}"


# ─────────────────────────────────────────────
# EMAIL TEMPLATES
# ─────────────────────────────────────────────

def _base_html(lang: str, body_content: str) -> str:
    unsubscribe_label = "Se désabonner" if lang == "fr" else "Unsubscribe"
    help_label = "Aide" if lang == "fr" else "Help"
    return f"""<!DOCTYPE html>
<html lang="{lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light">
</head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f9fafb;padding:40px 20px;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:#0B0F19;padding:28px 40px;">
            <p style="margin:0;color:#ffffff;font-size:22px;font-weight:900;letter-spacing:-0.5px;">recolekt</p>
          </td>
        </tr>
        {body_content}
        <tr>
          <td style="padding:24px 40px;border-top:1px solid #f3f4f6;">
            <p style="margin:0;color:#9ca3af;font-size:12px;">
              © 2026 Recolekt ·
              <a href="{APP_URL}/help" style="color:#7c3aed;text-decoration:none;">{help_label}</a> ·
              <a href="mailto:unsubscribe@recolekt.app" style="color:#9ca3af;text-decoration:none;">{unsubscribe_label}</a>
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""


def _email_verification_html(code: str, lang: str = "en") -> tuple[str, str, str]:
    if lang == "fr":
        subject = "Vérifiez votre compte Recolekt"
        title = "Bienvenue sur Recolekt !"
        subtitle = "Votre code de vérification :"
        note1 = "Valide pendant 10 minutes."
        note2 = "Si vous n'avez pas créé de compte, ignorez cet e-mail."
        text = f"Bienvenue sur Recolekt !\n\nVotre code : {code}\n\n© 2026 Recolekt"
    else:
        subject = "Verify your Recolekt account"
        title = "Welcome to Recolekt!"
        subtitle = "Your email verification code:"
        note1 = "Valid for 10 minutes."
        note2 = "If you didn't create an account, you can safely ignore this email."
        text = f"Welcome to Recolekt!\n\nYour code: {code}\n\n© 2026 Recolekt"

    body = f"""
        <tr><td style="padding:40px;">
          <h1 style="margin:0 0 8px;font-size:24px;font-weight:900;color:#0B0F19;">{title}</h1>
          <p style="margin:0 0 32px;color:#6b7280;font-size:15px;">{subtitle}</p>
          <div style="background:#f3f0ff;border-radius:12px;padding:24px;text-align:center;margin-bottom:32px;">
            <p style="margin:0;font-size:48px;font-weight:900;letter-spacing:12px;color:#7c3aed;font-family:monospace;">{code}</p>
          </div>
          <p style="margin:0;color:#9ca3af;font-size:13px;">{note1}<br>{note2}</p>
        </td></tr>"""

    return subject, _base_html(lang, body), text


def _email_reset_html(code: str, lang: str = "en") -> tuple[str, str, str]:
    if lang == "fr":
        subject = "Réinitialiser votre mot de passe"
        title = "Réinitialisation"
        subtitle = "Votre code à 6 chiffres :"
        text = f"Réinitialisation Recolekt\n\nVotre code : {code}"
    else:
        subject = "Reset your Recolekt password"
        title = "Password reset"
        subtitle = "Your 6-digit reset code:"
        text = f"Recolekt password reset\n\nYour code: {code}"

    body = f"""
        <tr><td style="padding:40px;">
          <h1 style="margin:0 0 8px;font-size:24px;font-weight:900;color:#0B0F19;">{title}</h1>
          <p style="margin:0 0 32px;color:#6b7280;font-size:15px;">{subtitle}</p>
          <div style="background:#fff0f3;border-radius:12px;padding:24px;text-align:center;margin-bottom:32px;">
            <p style="margin:0;font-size:48px;font-weight:900;letter-spacing:12px;color:#f43f5e;font-family:monospace;">{code}</p>
          </div>
        </td></tr>"""

    return subject, _base_html(lang, body), text


def send_email(to: str, subject: str, html: str, text: str = "") -> bool:
    if not resend.api_key:
        logger.warning("⚠️ RESEND_API_KEY not set")
        return False
    try:
        resend.Emails.send({
            "from": f"Recolekt <{FROM_EMAIL}>",
            "to": to,
            "subject": subject,
            "html": html,
            "text": text
        })
        return True
    except Exception as e:
        logger.error("❌ Resend failed: %s", e)
        return False


# ─────────────────────────────────────────────
# INSTAGRAM HELPERS
# ─────────────────────────────────────────────

def _send_ig_reply(recipient_id: str, text: str) -> bool:
    ig_token = os.getenv("INSTAGRAM_PAGE_ACCESS_TOKEN")
    ig_id = os.getenv("INSTAGRAM_BUSINESS_ACCOUNT_ID", "34572224849088745")

    if not ig_token:
        logger.warning("⚠️ INSTAGRAM_PAGE_ACCESS_TOKEN not set — cannot send reply")
        return False

    try:
        resp = requests.post(
            f"https://graph.facebook.com/v25.0/852014951320759/messages",
            json={
                "recipient": {"id": recipient_id},
                "message": {"text": text}
            },
            params={"access_token": ig_token}
        )
        result = resp.json()
        if "error" in result:
            logger.error(f"❌ IG reply failed: {result['error']}")
            return False
        logger.info(f"📤 IG reply sent to {recipient_id}")
        return True
    except Exception as e:
        logger.error(f"❌ _send_ig_reply crash: {e}")
        return False


# ─────────────────────────────────────────────
# INSTAGRAM WEBHOOK
# ─────────────────────────────────────────────

@auth_bp.route("/webhook/instagram", methods=["GET", "POST"])
def instagram_webhook():
    if request.method == "GET":
        mode = request.args.get("hub.mode")
        token = request.args.get("hub.verify_token")
        challenge = request.args.get("hub.challenge")
        if mode == "subscribe" and token == os.getenv("WEBHOOK_VERIFY_TOKEN", "recolekt-titanium-secret-2026"):
            return challenge, 200
        return "Forbidden", 403

    if request.method == "POST":
        data = request.get_json(silent=True) or {}
        logger.info(f"📩 Webhook received: {data}")

        try:
            for entry in data.get("entry", []):

                # ── Instagram Business API: entry.changes[] ──
                for change in entry.get("changes", []):
                    if change.get("field") != "messages":
                        continue
                    value = change.get("value", {})
                    sender_id = value.get("sender", {}).get("id")
                    message = value.get("message", {})
                    text = (message.get("text") or "").strip()

                    if not sender_id:
                        continue

                    _handle_incoming_message(sender_id, text, message)

                # ── Messenger API fallback: entry.messaging[] ──
                for messaging in entry.get("messaging", []):
                    sender_id = messaging.get("sender", {}).get("id")
                    message = messaging.get("message", {})
                    text = (message.get("text") or "").strip()

                    if not sender_id:
                        continue

                    _handle_incoming_message(sender_id, text, message)

        except Exception as e:
            logger.error(f"❌ Webhook processing error: {e}", exc_info=True)

        return "EVENT_RECEIVED", 200


def _handle_incoming_message(sender_id: str, text: str, message: dict):
    # 🔥 1. Deduplication Guard: Stop Meta from processing the exact same message twice
    mid = message.get("mid")
    dedupe_key = mid if mid else f"{sender_id}:{text}"
    now = time.time()
    
    # Cleanup memory dict of messages older than 5 mins
    expired = [k for k, v in PROCESSED_WEBHOOKS.items() if now - v > 300]
    for k in expired:
        del PROCESSED_WEBHOOKS[k]
        
    if dedupe_key in PROCESSED_WEBHOOKS:
        return # We already processed this exact message
    PROCESSED_WEBHOOKS[dedupe_key] = now

    # 🔥 2. Echo Guard: Ignore bot's own sent messages flag
    if message.get("is_echo") in [True, "true"]:
        return
        
    # 🔥 3. Identity Guard: Absolutely NEVER reply to our own Bot Account IDs (Fixes the infinite loop)
    bot_ids = [
        str(os.getenv("INSTAGRAM_BUSINESS_ACCOUNT_ID", "34572224849088745")), 
        str(os.getenv("INSTAGRAM_PAGE_ID", "852014951320759")),
        "852014951320759",
        "17841477914830252",
        "34572224849088745"
    ]
    if str(sender_id) in bot_ids:
        return

    # 🔥 4. Actionable Content Guard: Ignore empty messages (like reactions)
    if not text and not message.get("attachments"):
        return

    logger.info(f"📨 Processing Message from {sender_id}: '{text}'")

# ── CASE 1: 6-digit PIN → link account ──
    if text.isdigit() and len(text) == 6:
        pin_row = fetch_one(
            "SELECT user_id FROM link_pins WHERE pin = %s AND expires_at > NOW()",
            (text,)
        )
        if pin_row:
            linked_user_id = pin_row["user_id"] if isinstance(pin_row, dict) else pin_row[0]
            
            # 🔥 THE PERMANENT FIX: Unlink this IG account from any previous Recolekt users first
            execute(
                "UPDATE users SET instagram_sender_id = NULL WHERE instagram_sender_id = %s",
                (sender_id,),
                commit=True
            )
            
            # Now link it safely to the new user
            execute(
                "UPDATE users SET instagram_sender_id = %s WHERE user_id = %s",
                (sender_id, linked_user_id),
                commit=True
            )
            execute("DELETE FROM link_pins WHERE pin = %s", (text,), commit=True)
            logger.info(f"✅ Linked Instagram {sender_id} to user {linked_user_id}")
            _send_ig_reply(sender_id, "✅ Your Instagram is now linked to Recolekt! Send me any reel URL to save it to your library.")
        else:
            logger.warning(f"⚠️ Invalid or expired PIN from {sender_id}: {text}")
            _send_ig_reply(sender_id, "❌ Invalid or expired code. Please generate a new one in the Recolekt app.")
        return

    # ── CASE 2: Known sender → save reel to inbox ──
    user_row = fetch_one(
        "SELECT user_id FROM users WHERE instagram_sender_id = %s",
        (sender_id,)
    )
    if user_row:
        linked_user_id = user_row["user_id"] if isinstance(user_row, dict) else user_row[0]

        url = None
        if "instagram.com/reel" in text or "instagram.com/p/" in text:
            url = text
        elif message.get("attachments"):
            for att in message["attachments"]:
                payload = att.get("payload", {})
                url = payload.get("url") or payload.get("src")
                if url:
                    break

        if url:
            execute(
                "INSERT INTO inbox_items (user_id, platform, sender_ig_id, raw_url, message_text, status) "
                "VALUES (%s, 'instagram', %s, %s, %s, 'PENDING')",
                (linked_user_id, sender_id, url, text),
                commit=True
            )
            logger.info(f"📥 Saved inbox item for user {linked_user_id}: {url}")
            _send_ig_reply(sender_id, "✅ Got it! Saving this reel to your Recolekt library...")
            
            # 🔥 NEW: Wake up the scraper pipeline!
            base_url = request.host_url.rstrip("/")
            threading.Thread(
                target=_trigger_summarize_job, 
                args=(base_url, url, linked_user_id)
            ).start()

    else:
        logger.info(f"👤 Unknown sender {sender_id} — not linked")
        _send_ig_reply(sender_id, "👋 To save reels, first link your Instagram in the Recolekt app at recolekt.app")


def _trigger_summarize_job(base_url: str, reel_url: str, user_id: str):
    # Give the database 1 second to fully commit the PENDING status
    time.sleep(1)
    
    # Create an internal token so the API trusts this request
    token = create_jwt_token(user_id, "webhook@recolekt.app")
    
    # Depending on how your Flask app mounts the blueprint, it's either /summarize or /api/summarize. 
    # Adjust this path if your endpoint is different!
    target_url = f"{base_url}/api/summarize"
    
    logger.info(f"🚀 Webhook triggering background scrape for {reel_url} to {target_url}")
    
    try:
        # We fire the POST request. We use a 3-second timeout because your 
        # /summarize route immediately spawns its own background thread anyway!
        requests.post(
            target_url,
            json={"url": reel_url, "force_retry": "false"},
            headers={"Authorization": f"Bearer {token}"},
            timeout=3 
        )
    except requests.exceptions.ReadTimeout:
        # This is fine! It just means the server started working on it.
        pass
    except Exception as e:
        logger.error(f"❌ Failed to trigger summarize job: {e}")


# ─────────────────────────────────────────────
# INSTAGRAM PIN LINKING
# ─────────────────────────────────────────────

@auth_bp.route("/instagram/generate-pin", methods=["POST", "OPTIONS"])
def instagram_generate_pin():
    if request.method == "OPTIONS":
        return "", 200
    try:
        user_id = get_user_id_from_request()
    except Exception:
        return jsonify({"error": "Unauthorized"}), 401

    user = fetch_one("SELECT instagram_sender_id FROM users WHERE user_id = %s", (user_id,))
    if user and (user.get("instagram_sender_id") if isinstance(user, dict) else user[0]):
        return jsonify({"error": "Instagram already linked"}), 400

    for _ in range(10):
        pin = "".join(random.choices("0123456789", k=6))
        existing = fetch_one("SELECT pin FROM link_pins WHERE pin = %s", (pin,))
        if not existing:
            break

    expires = datetime.now(timezone.utc) + timedelta(minutes=15)
    execute(
        "INSERT INTO link_pins (pin, user_id, platform, expires_at) VALUES (%s, %s, 'instagram', %s) "
        "ON CONFLICT (pin) DO UPDATE SET user_id = EXCLUDED.user_id, expires_at = EXCLUDED.expires_at",
        (pin, user_id, expires),
        commit=True
    )

    logger.info(f"🔑 PIN generated for user {user_id}: {pin}")
    return jsonify({"pin": pin, "expires_in": 900}), 200


@auth_bp.route("/instagram/link-status", methods=["GET", "OPTIONS"])
def instagram_link_status():
    if request.method == "OPTIONS":
        return "", 200
    try:
        user_id = get_user_id_from_request()
    except Exception:
        return jsonify({"error": "Unauthorized"}), 401

    user = fetch_one("SELECT instagram_sender_id FROM users WHERE user_id = %s", (user_id,))
    if not user:
        return jsonify({"linked": False}), 200

    sender_id = user.get("instagram_sender_id") if isinstance(user, dict) else user[0]
    return jsonify({"linked": bool(sender_id), "sender_id": sender_id}), 200

@auth_bp.route("/instagram/unlink", methods=["POST", "OPTIONS"])
def instagram_unlink():
    if request.method == "OPTIONS":
        return "", 200
    try:
        user_id = get_user_id_from_request()
    except Exception:
        return jsonify({"error": "Unauthorized"}), 401

    execute(
        "UPDATE users SET instagram_sender_id = NULL WHERE user_id = %s",
        (user_id,),
        commit=True
    )
    logger.info(f"🔓 Unlinked Instagram for user {user_id}")
    return jsonify({"unlinked": True}), 200

@auth_bp.route("/instagram/account-info", methods=["GET", "OPTIONS"])
def instagram_account_info():
    """Returns @recolekt IG account info — demonstrates instagram_business_basic."""
    if request.method == "OPTIONS":
        return "", 200

    ig_token = os.getenv("INSTAGRAM_PAGE_ACCESS_TOKEN")
    ig_id = os.getenv("INSTAGRAM_BUSINESS_ACCOUNT_ID", "34572224849088745")

    if not ig_token:
        return jsonify({"error": "No token configured"}), 500

    try:
        resp = requests.get(
            f"https://graph.facebook.com/v25.0/{ig_id}",
            params={"fields": "id,username,account_type", "access_token": ig_token}
        )
        return jsonify(resp.json()), 200
    except Exception as e:
        logger.error(f"❌ account-info failed: {e}")
        return jsonify({"error": str(e)}), 500

# ─────────────────────────────────────────────
# INSTAGRAM OAUTH (admin / app review)
# ─────────────────────────────────────────────

@auth_bp.route("/instagram/login", methods=["GET"])
def instagram_login():
    client_id = os.getenv("INSTAGRAM_APP_ID", "1908143659883149")
    redirect_uri = url_for("auth.instagram_callback", _external=True)

    scopes = [
        "instagram_basic",
        "instagram_manage_messages",
        "public_profile",
        "pages_show_list",
        "pages_read_engagement",
        "business_management"
    ]

    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "scope": ",".join(scopes),
        "response_type": "code",
        "state": "admin_link"
    }

    auth_url = f"https://www.facebook.com/v25.0/dialog/oauth?{urllib.parse.urlencode(params)}"
    logger.info(f"🔗 Redirecting to Meta: {redirect_uri}")
    return redirect(auth_url)


@auth_bp.route("/instagram/callback", methods=["GET"])
def instagram_callback():
    code = request.args.get("code")
    if not code:
        return redirect(f"{_get_frontend_base()}/auth?error=meta_denied")

    logger.info("✅ Meta Code Received. Exchanging for Token...")

    client_id = os.getenv("INSTAGRAM_APP_ID", "1908143659883149")
    client_secret = os.getenv("INSTAGRAM_APP_SECRET")
    redirect_uri = url_for("auth.instagram_callback", _external=True)
    PAGE_ID = os.getenv("INSTAGRAM_PAGE_ID", "852014951320759")
    IG_ID = os.getenv("INSTAGRAM_BUSINESS_ACCOUNT_ID", "17841477914830252")

    try:
        token_resp = requests.get(
            "https://graph.facebook.com/v25.0/oauth/access_token",
            params={
                "client_id": client_id,
                "client_secret": client_secret,
                "redirect_uri": redirect_uri,
                "code": code
            }
        ).json()

        access_token = token_resp.get("access_token")
        if not access_token:
            logger.error(f"❌ Token Exchange failed: {token_resp}")
            return redirect(f"{_get_frontend_base()}/gallery?setup=instagram_failed")

        page_token_resp = requests.get(
            f"https://graph.facebook.com/v25.0/{PAGE_ID}",
            params={"fields": "access_token", "access_token": access_token}
        ).json()
        page_token = page_token_resp.get("access_token", access_token)

        conv_resp = requests.get(
            f"https://graph.facebook.com/v25.0/{PAGE_ID}/conversations",
            params={"platform": "instagram", "access_token": page_token}
        ).json()
        logger.info(f"🎯 Conversations: {conv_resp}")

        basic_resp = requests.get(
            f"https://graph.facebook.com/v25.0/{IG_ID}",
            params={"fields": "id,username", "access_token": page_token}
        ).json()
        logger.info(f"🎯 Basic: {basic_resp}")

        media_resp = requests.get(
            f"https://graph.facebook.com/v25.0/{IG_ID}/media",
            params={"access_token": page_token}
        ).json()
        logger.info(f"🎯 Media: {media_resp}")

        logger.info("🎯 Dashboard Test Calls Performed.")

    except Exception as e:
        logger.error(f"❌ Meta callback crash: {e}", exc_info=True)

    return redirect(f"{_get_frontend_base()}/gallery?setup=instagram_success")


@auth_bp.route("/instagram/send-test-dm", methods=["POST", "OPTIONS"])
def instagram_send_test_dm():
    if request.method == "OPTIONS":
        return "", 200

    page_token = os.getenv("INSTAGRAM_PAGE_ACCESS_TOKEN")
    if not page_token:
        return jsonify({"success": False, "error": "INSTAGRAM_PAGE_ACCESS_TOKEN not set"}), 500

    PAGE_ID = os.getenv("INSTAGRAM_PAGE_ID", "852014951320759")
    data = request.get_json() or {}
    recipient_id = data.get("recipient_id", os.getenv("INSTAGRAM_ACCOUNT_ID", "77762021161"))
    message_text = data.get("message", "✅ Test message from Recolekt — DM flow is working!")

    logger.info(f"📤 Sending test DM to {recipient_id} via page {PAGE_ID}")

    try:
        resp = requests.post(
            f"https://graph.facebook.com/v25.0/852014951320759/messages",
            json={
                "recipient": {"id": recipient_id},
                "message": {"text": message_text},
                "messaging_type": "RESPONSE"
            },
            params={"access_token": page_token}
        )
        result = resp.json()
        logger.info(f"📤 Test DM result: {result}")

        if "error" in result:
            return jsonify({"success": False, "error": result["error"]}), 400

        return jsonify({"success": True, "result": result}), 200

    except Exception as e:
        logger.error(f"❌ send-test-dm crash: {e}", exc_info=True)
        return jsonify({"success": False, "error": str(e)}), 500


# ─────────────────────────────────────────────
# GOOGLE OAUTH
# ─────────────────────────────────────────────

@auth_bp.route("/google/login", methods=["GET"])
def google_login():
    frontend_base = _get_frontend_base()
    next_url = request.args.get("next", f"{frontend_base}/gallery")
    redirect_uri = url_for("auth.google_callback", _external=True)

    oauth = current_app.extensions["oauth"]
    try:
        session["oauth_next_url"] = next_url
        session["oauth_frontend_base"] = frontend_base
    except Exception:
        pass

    return oauth.google.authorize_redirect(redirect_uri, state=next_url)


@auth_bp.route("/google/callback", methods=["GET"])
def google_callback():
    frontend_base = _get_frontend_base()
    try:
        frontend_base = session.pop("oauth_frontend_base", frontend_base)
        frontend_next = request.args.get("state") or session.pop("oauth_next_url", f"{frontend_base}/gallery")
    except Exception:
        frontend_next = f"{frontend_base}/gallery"

    try:
        oauth = current_app.extensions["oauth"]
        token = oauth.google.authorize_access_token()
        user_info = token.get("userinfo") or {}
        email = user_info.get("email", "").strip().lower()

        if not email:
            return redirect(f"{frontend_base}/auth?error=no_email")

        user = fetch_one("SELECT user_id FROM users WHERE email = %s;", (email,))
        if user:
            user_id = user["user_id"] if isinstance(user, dict) else user[0]
            execute(
                "UPDATE users SET google_id = %s, picture = %s WHERE user_id = %s;",
                (user_info.get("sub"), user_info.get("picture"), user_id),
                commit=True
            )
        else:
            user_id = get_unique_id(email)
            execute(
                "INSERT INTO users (user_id, email, name, google_id, picture, verified, created_at) "
                "VALUES (%s, %s, %s, %s, %s, TRUE, NOW());",
                (user_id, email, user_info.get("name"), user_info.get("sub"), user_info.get("picture")),
                commit=True
            )

        jwt_token = create_jwt_token(user_id, email)
        sep = "&" if "?" in frontend_next else "?"
        return redirect(f"{frontend_next}{sep}token={jwt_token}")

    except Exception as e:
        logger.error(f"❌ Google callback failed: {e}")
        return redirect(f"{frontend_base}/auth?error=google_failed")


@auth_bp.route("/google/verify", methods=["POST", "OPTIONS"])
def google_verify():
    if request.method == "OPTIONS":
        return "", 200

    data = request.get_json() or {}
    access_token = data.get("access_token", "")

    if not access_token:
        return jsonify({"error": "No token provided"}), 400

    try:
        resp = requests.get(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            headers={"Authorization": f"Bearer {access_token}"}
        )
        user_info = resp.json()
        email = user_info.get("email", "").strip().lower()

        if not email:
            return jsonify({"error": "Could not get email from Google"}), 400

        user = fetch_one("SELECT user_id FROM users WHERE email = %s;", (email,))
        if user:
            user_id = user["user_id"] if isinstance(user, dict) else user[0]
            execute(
                "UPDATE users SET google_id = %s, picture = %s WHERE user_id = %s;",
                (user_info.get("id"), user_info.get("picture"), user_id),
                commit=True
            )
        else:
            user_id = get_unique_id(email)
            execute(
                "INSERT INTO users (user_id, email, name, google_id, picture, verified, created_at) "
                "VALUES (%s, %s, %s, %s, %s, TRUE, NOW());",
                (user_id, email, user_info.get("name"), user_info.get("id"), user_info.get("picture")),
                commit=True
            )

        logger.info(f"✅ Google verify success for {email}")
        return jsonify({
            "token": create_jwt_token(user_id, email),
            "user": {"id": user_id, "email": email, "name": user_info.get("name"), "picture": user_info.get("picture")}
        }), 200

    except Exception as e:
        logger.error(f"❌ Google verify failed: {e}")
        return jsonify({"error": "Verification failed"}), 500


# ─────────────────────────────────────────────
# USER STATS
# ─────────────────────────────────────────────
@auth_bp.route("/user/stats", methods=["GET", "OPTIONS"])
def get_user_stats():
    if request.method == "OPTIONS":
        return "", 200

    try:
        user_id = get_user_id_from_request()
    except Exception:
        return jsonify({"success": False, "error": "Unauthorized"}), 401

    rows = fetch_all("SELECT source_url AS url FROM reels WHERE user_id = %s", (user_id,))

    stats = {
        "total": 0,
        "instagram": 0,
        "youtube": 0,
        "tiktok": 0,
        "facebook": 0,
    }

    if not rows:
        return jsonify({"success": True, "stats": stats}), 200

    for row in rows:
        if isinstance(row, dict):
            raw_url = row.get("url")
        else:
            raw_url = row[0] if row and len(row) > 0 else None

        url = (raw_url or "").strip().lower()
        if not url:
            continue

        stats["total"] += 1

        if "instagram.com" in url:
            stats["instagram"] += 1
        elif "youtube.com" in url or "youtu.be" in url:
            stats["youtube"] += 1
        elif "tiktok.com" in url:
            stats["tiktok"] += 1
        elif "facebook.com" in url or "fb.watch" in url:
            stats["facebook"] += 1

    return jsonify({"success": True, "stats": stats}), 200


# ─────────────────────────────────────────────
# EMAIL / PASSWORD & CORE AUTH
# ─────────────────────────────────────────────

@auth_bp.route("/login", methods=["POST", "OPTIONS"])
def login():
    if request.method == "OPTIONS":
        return "", 200
    data = request.get_json() or {}
    email = data.get("email", "").strip().lower()
    password = data.get("password", "")

    user = fetch_one("SELECT user_id, email, name, password_hash, language FROM users WHERE email = %s;", (email,))
    if not user:
        return jsonify({"error": "No account found"}), 404

    user_dict = dict(user) if isinstance(user, dict) else {
        "user_id": user[0], "email": user[1], "name": user[2],
        "password_hash": user[3], "language": user[4]
    }
    if not check_password_hash(user_dict["password_hash"], password):
        return jsonify({"error": "Wrong password"}), 401

    return jsonify({
        "token": create_jwt_token(user_dict["user_id"], email),
        "user": {"id": user_dict["user_id"], "email": email}
    }), 200


@auth_bp.route("/register", methods=["POST", "OPTIONS"])
def register():
    if request.method == "OPTIONS":
        return "", 200
    data = request.get_json() or {}
    email = data.get("email", "").strip().lower()
    password = data.get("password", "")

    user_id = get_unique_id(email)
    password_hash = generate_password_hash(password)

    try:
        execute(
            "INSERT INTO users (user_id, email, name, password_hash, verified, created_at) "
            "VALUES (%s, %s, %s, %s, FALSE, NOW());",
            (user_id, email, data.get("name", "User"), password_hash),
            commit=True
        )

        code = "".join(random.choices("0123456789", k=6))
        execute(
            "INSERT INTO verification_codes (user_id, code, expires_at) VALUES (%s, %s, %s) "
            "ON CONFLICT (user_id) DO UPDATE SET code=EXCLUDED.code;",
            (user_id, code, datetime.now(timezone.utc) + timedelta(minutes=10)),
            commit=True
        )

        subject, html, text = _email_verification_html(code)
        send_email(email, subject, html, text)

        return jsonify({"token": create_jwt_token(user_id, email), "user": {"id": user_id}}), 201

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@auth_bp.route("/me", methods=["GET", "OPTIONS"])
def get_current_user():
    if request.method == "OPTIONS":
        return "", 200
    try:
        user_id = get_user_id_from_request()
        user = fetch_one(
            "SELECT user_id, email, name, picture, language FROM users WHERE user_id = %s", (user_id,)
        )
        if not user:
            return jsonify({"authenticated": False}), 401

        user_dict = dict(user) if isinstance(user, dict) else {
            "user_id": user[0], "email": user[1], "name": user[2],
            "picture": user[3], "language": user[4]
        }
        return jsonify({
            "authenticated": True,
            "user": {
                "id": user_dict["user_id"],
                "email": user_dict["email"],
                "name": user_dict["name"],
                "picture": user_dict["picture"],
                "language": user_dict.get("language") or "en"
            }
        }), 200
    except Exception:
        return jsonify({"authenticated": False}), 401


@auth_bp.route("/logout", methods=["POST", "OPTIONS"])
def logout():
    if request.method == "OPTIONS":
        return "", 200
    session.clear()
    return jsonify({"ok": True})


@auth_bp.route("/check", methods=["GET", "OPTIONS"])
def check_auth():
    if request.method == "OPTIONS":
        return "", 200
    try:
        user_id = get_user_id_from_request()
        return jsonify({"authenticated": user_id is not None}), 200 if user_id else 401
    except Exception:
        return jsonify({"authenticated": False}), 401


@auth_bp.route("/language", methods=["PUT", "OPTIONS"])
def update_language():
    if request.method == "OPTIONS":
        return "", 200
    try:
        user_id = get_user_id_from_request()
        if not user_id:
            return jsonify({"error": "Unauthorized"}), 401
        lang = (request.get_json() or {}).get("language", "en")
        execute("UPDATE users SET language = %s WHERE user_id = %s", (lang, user_id), commit=True)
        return jsonify({"success": True, "language": lang}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@auth_bp.route("/forgot-password", methods=["POST", "OPTIONS"])
def forgot_password():
    if request.method == "OPTIONS":
        return "", 200
    data = request.get_json() or {}
    email = (data.get("email") or "").strip().lower()
    requested_lang = data.get("lang", "en")

    user = fetch_one("SELECT user_id, language FROM users WHERE email = %s", (email,))
    if not user:
        return jsonify({"error": "No account found with this email."}), 404

    user_dict = dict(user) if isinstance(user, dict) else {"user_id": user[0], "language": user[1]}
    user_id = user_dict["user_id"]
    lang = user_dict.get("language") or requested_lang

    code = "".join(random.choices("0123456789", k=6))
    expires = datetime.now(timezone.utc) + timedelta(minutes=15)

    execute(
        "INSERT INTO reset_codes (user_id, code, expires_at) VALUES (%s, %s, %s) "
        "ON CONFLICT (user_id) DO UPDATE SET code = EXCLUDED.code, expires_at = EXCLUDED.expires_at;",
        (user_id, code, expires),
        commit=True
    )

    subject, html, text = _email_reset_html(code, lang)
    sent = send_email(to=email, subject=subject, html=html, text=text)
    if not sent:
        logger.warning("🛠️ DEV — Reset code for %s: %s", email, code)

    return jsonify({"message": "Reset code sent."}), 200


@auth_bp.route("/reset-password", methods=["POST", "OPTIONS"])
def reset_password():
    if request.method == "OPTIONS":
        return "", 200
    data = request.get_json() or {}
    email = data.get("email", "").strip().lower()
    code = data.get("code", "").strip()
    new_pw = data.get("password", "")

    user = fetch_one("SELECT user_id FROM users WHERE email = %s", (email,))
    if not user:
        return jsonify({"error": "User not found"}), 400
    user_id = user["user_id"] if isinstance(user, dict) else user[0]

    code_row = fetch_one(
        "SELECT user_id FROM reset_codes WHERE user_id = %s AND code = %s AND expires_at > NOW()",
        (user_id, code)
    )
    if not code_row:
        return jsonify({"error": "Invalid or expired code."}), 400

    execute("UPDATE users SET password_hash = %s WHERE user_id = %s",
            (generate_password_hash(new_pw), user_id), commit=True)
    execute("DELETE FROM reset_codes WHERE user_id = %s", (user_id,), commit=True)
    return jsonify({"message": "Password reset successfully!"}), 200


@auth_bp.route("/verify-email", methods=["POST", "OPTIONS"])
def verify_email():
    if request.method == "OPTIONS":
        return "", 200
    data = request.get_json() or {}
    email = data.get("email", "").strip().lower()
    code = data.get("code", "").strip()

    user = fetch_one("SELECT user_id FROM users WHERE email = %s", (email,))
    if not user:
        return jsonify({"error": "Account not found."}), 400
    user_id = user["user_id"] if isinstance(user, dict) else user[0]

    code_row = fetch_one(
        "SELECT user_id FROM verification_codes WHERE user_id = %s AND code = %s AND expires_at > NOW()",
        (user_id, code)
    )
    if not code_row:
        return jsonify({"error": "Invalid or expired code."}), 400

    execute("UPDATE users SET verified = TRUE WHERE user_id = %s", (user_id,), commit=True)
    execute("DELETE FROM verification_codes WHERE user_id = %s", (user_id,), commit=True)
    return jsonify({"message": "Email verified successfully!"}), 200


@auth_bp.route("/resend-verification", methods=["POST", "OPTIONS"])
def resend_verification():
    if request.method == "OPTIONS":
        return "", 200

    data = request.get_json() or {}
    email = (data.get("email") or "").strip().lower()
    if not email:
        return jsonify({"error": "Email required"}), 400

    user = fetch_one("SELECT user_id, verified, language FROM users WHERE email = %s", (email,))
    if not user:
        return jsonify({"error": "No account found with this email."}), 404

    user_dict = dict(user) if isinstance(user, dict) else {
        "user_id": user[0], "verified": user[1], "language": user[2]
    }

    if user_dict.get("verified"):
        return jsonify({"error": "This account is already verified."}), 400

    lang = user_dict.get("language") or "en"
    code = "".join(random.choices("0123456789", k=6))
    expires = datetime.now(timezone.utc) + timedelta(minutes=10)

    execute(
        "INSERT INTO verification_codes (user_id, code, expires_at) VALUES (%s, %s, %s) "
        "ON CONFLICT (user_id) DO UPDATE SET code = EXCLUDED.code, expires_at = EXCLUDED.expires_at;",
        (user_dict["user_id"], code, expires),
        commit=True
    )

    subject, html, text = _email_verification_html(code, lang)
    sent = send_email(to=email, subject=subject, html=html, text=text)
    if not sent:
        logger.warning("🛠️ DEV — Resend code for %s: %s", email, code)

    return jsonify({"message": "Verification code resent."}), 200