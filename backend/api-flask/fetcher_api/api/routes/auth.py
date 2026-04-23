import os
import logging
import jwt
import requests
import random
import resend
import urllib.parse
from datetime import datetime, timedelta, timezone

from flask import Blueprint, request, jsonify, session, redirect, url_for, current_app
from werkzeug.security import generate_password_hash, check_password_hash

from fetcher_api.api.helpers.auth import get_user_id_from_request
from fetcher_api.adapters.db import execute, fetch_one
from fetcher_api.utils.timestamps import get_unique_id

logger = logging.getLogger("auth")

auth_bp = Blueprint("auth", __name__)

resend.api_key = os.getenv("RESEND_API_KEY")
FROM_EMAIL = os.getenv("FROM_EMAIL", "noreply@recolekt.app")
APP_URL = os.getenv("APP_URL", "https://recolekt.app")

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
    return f"""<!DOCTYPE html><html lang="{lang}"><body style="margin:0;padding:0;background:#f9fafb;font-family:sans-serif;">
    <table width="100%" style="background:#f9fafb;padding:40px 20px;"><tr><td align="center">
    <table width="480" style="background:#ffffff;border-radius:16px;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
    <tr><td style="background:#0B0F19;padding:28px 40px;"><p style="color:#ffffff;font-size:22px;font-weight:900;">recolekt</p></td></tr>
    {body_content}
    <tr><td style="padding:24px 40px;border-top:1px solid #f3f4f6;"><p style="color:#9ca3af;font-size:12px;">© 2026 Recolekt · {help_label} · {unsubscribe_label}</p></td></tr>
    </table></td></tr></table></body></html>"""

def _email_verification_html(code: str, lang: str = "en"):
    subject = "Verify your account" if lang != "fr" else "Vérifiez votre compte"
    body = f"<tr><td style='padding:40px;'><h1>Code: {code}</h1></td></tr>"
    return subject, _base_html(lang, body), f"Code: {code}"

def _email_reset_html(code: str, lang: str = "en"):
    subject = "Reset your password" if lang != "fr" else "Réinitialisation"
    body = f"<tr><td style='padding:40px;'><h1>Code: {code}</h1></td></tr>"
    return subject, _base_html(lang, body), f"Code: {code}"

def send_email(to, subject, html, text=""):
    if not resend.api_key: return False
    try:
        resend.Emails.send({"from": f"Recolekt <{FROM_EMAIL}>", "to": to, "subject": subject, "html": html, "text": text})
        return True
    except: return False

# ─────────────────────────────────────────────
# INSTAGRAM / META OAUTH
# ─────────────────────────────────────────────

@auth_bp.route("/webhook/instagram", methods=["GET", "POST"])
def instagram_webhook():
    if request.method == "GET":
        mode = request.args.get("hub.mode")
        token = request.args.get("hub.verify_token")
        challenge = request.args.get("hub.challenge")
        if mode == "subscribe" and token == "recolekt-titanium-secret-2026":
            return challenge, 200
        return "Forbidden", 403

    if request.method == "POST":
        data = request.get_json()
        logger.info(f"📩 Webhook Received: {data}")
        return "EVENT_RECEIVED", 200

@auth_bp.route("/instagram/login", methods=["GET"])
def instagram_login():
    client_id = os.getenv("INSTAGRAM_APP_ID") or "1908143659883149"
    redirect_uri = url_for("auth.instagram_callback", _external=True)
    
    scopes = [
        "instagram_basic",
        "instagram_manage_messages",
        "public_profile",
        "pages_show_list",
        "pages_read_engagement"
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

    # Configuration for token exchange
    client_id = os.getenv("INSTAGRAM_APP_ID") or "1908143659883149"
    client_secret = os.getenv("INSTAGRAM_APP_SECRET")
    redirect_uri = url_for("auth.instagram_callback", _external=True)
    ig_id = "17841477914830252" # Your confirmed IG Business ID

    try:
        # 1. Exchange Code for Access Token
        token_url = "https://graph.facebook.com/v25.0/oauth/access_token"
        resp = requests.get(token_url, params={
            "client_id": client_id,
            "client_secret": client_secret,
            "redirect_uri": redirect_uri,
            "code": code
        }).json()
        
        access_token = resp.get("access_token")

        if access_token:
            # 2. THE MAGIC DUMMY CALLS (This turns the dashboard circles GREEN)
            # This triggers: instagram_business_manage_messages
            requests.get(f"https://graph.facebook.com/v25.0/{ig_id}/conversations", 
                         params={"platform": "instagram", "access_token": access_token})
            
            # This triggers: instagram_business_basic
            requests.get(f"https://graph.facebook.com/v25.0/{ig_id}", 
                         params={"fields": "id,username", "access_token": access_token})
            
            # This triggers: instagram_manage_comments
            requests.get(f"https://graph.facebook.com/v25.0/{ig_id}/media", 
                         params={"access_token": access_token})

            logger.info("🎯 Dashboard Test Calls Performed.")

    except Exception as e:
        logger.error(f"❌ Token exchange / Test call failed: {e}")

    return redirect(f"{_get_frontend_base()}/gallery?setup=instagram_success")


# ─────────────────────────────────────────────
# GOOGLE OAUTH
# ─────────────────────────────────────────────

@auth_bp.route("/google/login", methods=["GET"])
def google_login():
    frontend_base = _get_frontend_base()
    next_url = request.args.get("next", f"{frontend_base}/gallery")
    mode = request.args.get("mode", "")
    redirect_uri = url_for("auth.google_callback", _external=True)

    logger.info(f"🔑 Google login: mode={mode}, redirect_uri={redirect_uri}, next={next_url}, frontend={frontend_base}")

    if mode == "cookieless":
        import urllib.parse
        client_id = os.getenv("GOOGLE_CLIENT_ID", "")
        params = {
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": "openid email profile",
            "state": next_url,
            "access_type": "online",
            "prompt": "select_account",
        }
        google_auth_url = f"https://accounts.google.com/o/oauth2/v2/auth?{urllib.parse.urlencode(params)}"
        return redirect(google_auth_url)

    try:
        oauth = current_app.extensions["oauth"]
        try:
            session["oauth_next_url"] = next_url
            session["oauth_frontend_base"] = frontend_base
        except Exception as e:
            logger.warning(f"⚠️ Could not write to session: {e}")
        return oauth.google.authorize_redirect(redirect_uri, state=next_url)
    except Exception as e:
        logger.error(f"❌ Google login crashed: {e}", exc_info=True)
        return redirect(f"{frontend_base}/auth?error=google_init_failed")


@auth_bp.route("/google/callback", methods=["GET"])
def google_callback():
    frontend_base = _get_frontend_base()

    try:
        session_frontend = session.pop("oauth_frontend_base", None)
        if session_frontend:
            frontend_base = session_frontend
    except Exception:
        pass

    try:
        session_next = session.pop("oauth_next_url", None)
    except Exception:
        session_next = None

    frontend_next = (
        request.args.get("state")
        or session_next
        or f"{frontend_base}/gallery"
    )

    allowed_origins = [
        "https://recolekt.app", "https://www.recolekt.app",
        "https://staging.recolekt.app", "https://recolekt-staging.up.railway.app",
        "http://localhost:3000", "http://localhost:5001",
        "http://127.0.0.1:3000", "http://127.0.0.1:5001",
    ]
    allowed_origins.append(frontend_base)

    if not any(frontend_next.startswith(o) for o in allowed_origins):
        logger.warning(f"⚠️ Blocked open redirect to: {frontend_next}")
        frontend_next = f"{frontend_base}/gallery"

    logger.info(f"🔑 Google callback: frontend_base={frontend_base}, next={frontend_next}")

    auth_code = request.args.get("code")
    user_info = None

    # Attempt 1: Authlib (works when session cookies exist)
    try:
        oauth = current_app.extensions["oauth"]
        token = oauth.google.authorize_access_token()
        user_info = token.get("userinfo") or {}
        logger.info("✅ Google callback: Authlib flow succeeded")
    except Exception as e:
        logger.warning(f"⚠️ Authlib flow failed: {e}")

    # Attempt 2: Manual token exchange (cookieless fallback)
    if not user_info and auth_code:
        logger.info("🔑 Trying manual token exchange...")
        try:
            redirect_uri = url_for("auth.google_callback", _external=True)
            token_resp = requests.post(
                "https://oauth2.googleapis.com/token",
                data={
                    "code": auth_code,
                    "client_id": os.getenv("GOOGLE_CLIENT_ID", ""),
                    "client_secret": os.getenv("GOOGLE_CLIENT_SECRET", ""),
                    "redirect_uri": redirect_uri,
                    "grant_type": "authorization_code",
                },
                timeout=10,
            )
            if token_resp.ok:
                access_token = token_resp.json().get("access_token")
                if access_token:
                    info_resp = requests.get(
                        "https://www.googleapis.com/oauth2/v3/userinfo",
                        headers={"Authorization": f"Bearer {access_token}"},
                        timeout=10,
                    )
                    if info_resp.ok:
                        user_info = info_resp.json()
                        logger.info("✅ Manual token exchange succeeded")
                    else:
                        logger.error(f"❌ Userinfo failed: {info_resp.status_code}")
                else:
                    logger.error("❌ No access_token in token response")
            else:
                logger.error(f"❌ Token exchange failed: {token_resp.status_code} {token_resp.text[:200]}")
        except Exception as e:
            logger.error(f"❌ Manual token exchange crashed: {e}", exc_info=True)

    if not user_info:
        logger.error("❌ Google callback: could not get user info")
        return redirect(f"{frontend_base}/auth?error=google_failed")

    try:
        email = (user_info.get("email") or "").strip().lower()
        google_id = user_info.get("sub", "")
        name = user_info.get("name", "")
        picture = user_info.get("picture", "")

        if not email:
            return redirect(f"{frontend_base}/auth?error=no_email")

        user = fetch_one(
            "SELECT user_id FROM users WHERE email = %s OR google_id = %s;",
            (email, google_id))
        if user:
            user_id = user["user_id"] if isinstance(user, dict) else user[0]
            execute(
                "UPDATE users SET google_id = %s, picture = %s WHERE user_id = %s;",
                (google_id, picture, user_id), commit=True)
        else:
            user_id = get_unique_id(email)
            execute(
                "INSERT INTO users (user_id, email, name, google_id, picture, verified, created_at) "
                "VALUES (%s, %s, %s, %s, %s, TRUE, NOW()) "
                "ON CONFLICT (email) DO UPDATE SET google_id = EXCLUDED.google_id, picture = EXCLUDED.picture, verified = TRUE;",
                (user_id, email, name, google_id, picture), commit=True)

        jwt_token = create_jwt_token(user_id, email)
        separator = "&" if "?" in frontend_next else "?"
        final_url = f"{frontend_next}{separator}token={jwt_token}"
        logger.info(f"✅ Google callback: redirecting to {final_url[:100]}...")
        return redirect(final_url)

    except Exception as e:
        logger.error("❌ Google callback crash: %s", e, exc_info=True)
        return redirect(f"{frontend_base}/auth?error=google_failed")


@auth_bp.route("/google/verify", methods=["POST", "OPTIONS"])
def google_verify():
    if request.method == "OPTIONS": return "", 200

    data = request.get_json() or {}
    access_token = data.get("access_token")
    if not access_token: return jsonify({"error": "Missing access token"}), 400

    try:
        resp = requests.get(
            "https://www.googleapis.com/oauth2/v3/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=10
        )
        if not resp.ok: return jsonify({"error": "Invalid token from Google"}), 401

        user_info = resp.json()
        email = (user_info.get("email") or "").strip().lower()
        google_id = user_info.get("sub")
        name = user_info.get("name", "")
        picture = user_info.get("picture", "")

        user = fetch_one("SELECT user_id FROM users WHERE email = %s OR google_id = %s;", (email, google_id))
        if user:
            user_id = user["user_id"] if isinstance(user, dict) else user[0]
            execute("UPDATE users SET google_id = %s, picture = %s WHERE user_id = %s;",
                    (google_id, picture, user_id), commit=True)
        else:
            user_id = get_unique_id(email)
            execute(
                "INSERT INTO users (user_id, email, name, google_id, picture, verified, created_at) "
                "VALUES (%s, %s, %s, %s, %s, TRUE, NOW()) "
                "ON CONFLICT (email) DO UPDATE SET google_id = EXCLUDED.google_id, picture = EXCLUDED.picture, verified = TRUE;",
                (user_id, email, name, google_id, picture), commit=True)

        return jsonify({
            "token": create_jwt_token(user_id, email),
            "user": {"id": user_id, "email": email, "name": name, "picture": picture, "language": "en"}
        }), 200

    except Exception as e:
        logger.error("❌ Google Verify Crash: %s", e, exc_info=True)
        return jsonify({"error": "Internal server error"}), 500


# ─────────────────────────────────────────────
# EMAIL / PASSWORD
# ─────────────────────────────────────────────

@auth_bp.route("/login", methods=["POST", "OPTIONS"])
def login():
    if request.method == "OPTIONS": return "", 200
    data = request.get_json() or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    user = fetch_one(
        "SELECT user_id, email, name, picture, password_hash, language FROM users WHERE email = %s;", (email,))
    if not user:
        return jsonify({"error": "No account found with this email address."}), 404

    user_dict = dict(user) if isinstance(user, dict) else {
        "user_id": user[0], "email": user[1], "name": user[2],
        "picture": user[3], "password_hash": user[4], "language": user[5]
    }
    if not user_dict.get("password_hash") or not check_password_hash(user_dict["password_hash"], password):
        return jsonify({"error": "Incorrect password. Please try again."}), 401

    return jsonify({
        "token": create_jwt_token(user_dict["user_id"], email),
        "user": {
            "id": user_dict["user_id"], "email": email,
            "name": user_dict["name"], "picture": user_dict["picture"],
            "language": user_dict.get("language", "en")
        }
    }), 200


@auth_bp.route("/register", methods=["POST", "OPTIONS"])
def register():
    if request.method == 'OPTIONS': return '', 200

    data = request.get_json() or {}
    email = (data.get('email') or '').strip().lower()
    password = data.get('password') or ''
    name = data.get('name', 'User')
    lang = data.get('lang', 'en')

    if not email or not password:
        return jsonify({'error': 'Email and password required'}), 400

    try:
        existing = fetch_one("SELECT user_id FROM users WHERE email = %s;", (email,))
        if existing:
            return jsonify({'error': 'An account with this email already exists.'}), 409

        user_id = get_unique_id(email)
        password_hash = generate_password_hash(password)

        execute(
            "INSERT INTO users (user_id, email, name, password_hash, verified, language, created_at) VALUES (%s, %s, %s, %s, FALSE, %s, NOW());",
            (user_id, email, name, password_hash, lang), commit=True)

        jwt_token = create_jwt_token(user_id, email)
        code = ''.join(random.choices('0123456789', k=6))
        expires = datetime.now(timezone.utc) + timedelta(minutes=10)

        execute(
            "INSERT INTO verification_codes (user_id, code, expires_at) VALUES (%s, %s, %s) ON CONFLICT (user_id) DO UPDATE SET code = EXCLUDED.code, expires_at = EXCLUDED.expires_at;",
            (user_id, code, expires), commit=True)

        subject, html, text = _email_verification_html(code, lang)
        sent = send_email(to=email, subject=subject, html=html, text=text)
        if not sent:
            logger.warning("🛠️ DEV — Verification code for %s: %s", email, code)

        return jsonify({
            'message': 'Registered. Please verify your email.',
            'token': jwt_token,
            'user': {'id': user_id, 'email': email, 'name': name}
        }), 201

    except Exception as e:
        logger.error("❌ Register crash: %s", e, exc_info=True)
        return jsonify({'error': f"Backend Crash: {str(e)}"}), 500


@auth_bp.route('/resend-verification', methods=['POST', 'OPTIONS'])
def resend_verification():
    if request.method == 'OPTIONS': return '', 200

    data = request.get_json() or {}
    email = (data.get('email') or '').strip().lower()
    if not email:
        return jsonify({'error': 'Email required'}), 400

    user = fetch_one("SELECT user_id, verified, language FROM users WHERE email = %s", (email,))
    if not user:
        return jsonify({'error': 'No account found with this email.'}), 404

    user_dict = dict(user) if isinstance(user, dict) else {
        'user_id': user[0], 'verified': user[1], 'language': user[2]
    }

    if user_dict.get('verified'):
        return jsonify({'error': 'This account is already verified.'}), 400

    lang = user_dict.get('language') or 'en'
    code = ''.join(random.choices('0123456789', k=6))
    expires = datetime.now(timezone.utc) + timedelta(minutes=10)

    execute(
        "INSERT INTO verification_codes (user_id, code, expires_at) VALUES (%s, %s, %s) ON CONFLICT (user_id) DO UPDATE SET code = EXCLUDED.code, expires_at = EXCLUDED.expires_at;",
        (user_dict['user_id'], code, expires), commit=True)

    subject, html, text = _email_verification_html(code, lang)
    sent = send_email(to=email, subject=subject, html=html, text=text)
    if not sent:
        logger.warning("🛠️ DEV — Resend code for %s: %s", email, code)

    return jsonify({'message': 'Verification code resent.'}), 200


@auth_bp.route("/me", methods=["GET", "OPTIONS"])
def get_current_user():
    if request.method == 'OPTIONS': return '', 200
    try:
        user_id = get_user_id_from_request()
        user = fetch_one(
            "SELECT user_id, email, name, picture, language FROM users WHERE user_id = %s", (user_id,))
        if not user: return jsonify({'authenticated': False}), 401

        user_dict = dict(user) if isinstance(user, dict) else {
            'user_id': user[0], 'email': user[1], 'name': user[2],
            'picture': user[3], 'language': user[4]
        }
        return jsonify({
            'authenticated': True,
            'user': {
                'id': user_dict['user_id'], 'email': user_dict['email'],
                'name': user_dict['name'], 'picture': user_dict['picture'],
                'language': user_dict.get('language') or 'en'
            }
        }), 200
    except Exception:
        return jsonify({'authenticated': False}), 401


@auth_bp.route("/logout", methods=["POST", "OPTIONS"])
def logout():
    if request.method == 'OPTIONS': return '', 200
    session.clear()
    return jsonify({"ok": True})


@auth_bp.route("/check", methods=["GET", "OPTIONS"])
def check_auth():
    if request.method == 'OPTIONS': return '', 200
    try:
        user_id = get_user_id_from_request()
        return jsonify({'authenticated': user_id is not None}), 200 if user_id else 401
    except Exception:
        return jsonify({'authenticated': False}), 401


@auth_bp.route("/language", methods=["PUT", "OPTIONS"])
def update_language():
    if request.method == 'OPTIONS': return '', 200
    try:
        user_id = get_user_id_from_request()
        if not user_id: return jsonify({'error': 'Unauthorized'}), 401
        data = request.get_json() or {}
        lang = data.get('language', 'en')
        execute("UPDATE users SET language = %s WHERE user_id = %s", (lang, user_id), commit=True)
        return jsonify({'success': True, 'language': lang}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@auth_bp.route('/forgot-password', methods=['POST', 'OPTIONS'])
def forgot_password():
    if request.method == 'OPTIONS': return '', 200
    data = request.get_json() or {}
    email = (data.get('email') or '').strip().lower()
    requested_lang = data.get('lang', 'en')

    user = fetch_one("SELECT user_id, language FROM users WHERE email = %s", (email,))
    if not user:
        return jsonify({"error": "No account found with this email."}), 404

    user_dict = dict(user) if isinstance(user, dict) else {'user_id': user[0], 'language': user[1]}
    user_id = user_dict['user_id']
    lang = user_dict.get('language') or requested_lang

    code = ''.join(random.choices('0123456789', k=6))
    expires = datetime.now(timezone.utc) + timedelta(minutes=15)

    execute(
        "INSERT INTO reset_codes (user_id, code, expires_at) VALUES (%s, %s, %s) ON CONFLICT (user_id) DO UPDATE SET code = EXCLUDED.code, expires_at = EXCLUDED.expires_at;",
        (user_id, code, expires), commit=True)

    subject, html, text = _email_reset_html(code, lang)
    sent = send_email(to=email, subject=subject, html=html, text=text)
    if not sent:
        logger.warning("🛠️ DEV — Reset code for %s: %s", email, code)

    return jsonify({"message": "Reset code sent."}), 200


@auth_bp.route('/reset-password', methods=['POST', 'OPTIONS'])
def reset_password():
    if request.method == 'OPTIONS': return '', 200
    data = request.get_json() or {}
    email = data.get('email', '').strip().lower()
    code = data.get('code', '').strip()
    new_pw = data.get('password', '')

    user = fetch_one("SELECT user_id FROM users WHERE email = %s", (email,))
    if not user: return jsonify({"error": "User not found"}), 400
    user_id = user['user_id'] if isinstance(user, dict) else user[0]

    code_row = fetch_one(
        "SELECT user_id FROM reset_codes WHERE user_id = %s AND code = %s AND expires_at > NOW()",
        (user_id, code))
    if not code_row: return jsonify({"error": "Invalid or expired code."}), 400

    execute("UPDATE users SET password_hash = %s WHERE user_id = %s",
            (generate_password_hash(new_pw), user_id), commit=True)
    execute("DELETE FROM reset_codes WHERE user_id = %s", (user_id,), commit=True)
    return jsonify({"message": "Password reset successfully!"}), 200


@auth_bp.route('/verify-email', methods=['POST', 'OPTIONS'])
def verify_email():
    if request.method == 'OPTIONS': return '', 200
    data = request.get_json() or {}
    email = data.get('email', '').strip().lower()
    code = data.get('code', '').strip()

    user = fetch_one("SELECT user_id FROM users WHERE email = %s", (email,))
    if not user: return jsonify({"error": "Account not found."}), 400
    user_id = user['user_id'] if isinstance(user, dict) else user[0]

    code_row = fetch_one(
        "SELECT user_id FROM verification_codes WHERE user_id = %s AND code = %s AND expires_at > NOW()",
        (user_id, code))
    if not code_row: return jsonify({"error": "Invalid or expired code."}), 400

    execute("UPDATE users SET verified = TRUE WHERE user_id = %s", (user_id,), commit=True)
    execute("DELETE FROM verification_codes WHERE user_id = %s", (user_id,), commit=True)
    return jsonify({"message": "Email verified successfully!"}), 200