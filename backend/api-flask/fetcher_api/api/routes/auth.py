# fetcher_api/api/routes/auth.py
import os
import logging
import jwt
import requests
import random
import resend
from datetime import datetime, timedelta, timezone

from flask import Blueprint, request, jsonify, session, redirect, url_for, current_app
from werkzeug.security import generate_password_hash, check_password_hash

from fetcher_api.api.helpers.auth import get_user_id_from_request
from fetcher_api.adapters.db import execute, fetch_one
from fetcher_api.utils.timestamps import get_unique_id

logger = logging.getLogger("auth")

# ⚠️ NO url_prefix here — it comes from register_blueprints() in __init__.py
auth_bp = Blueprint("auth", __name__)

resend.api_key = os.getenv("RESEND_API_KEY")
FROM_EMAIL = os.getenv("FROM_EMAIL", "noreply@recolekt.app")
APP_URL = os.getenv("APP_URL", "https://recolekt.app")
FRONTEND_URL = os.getenv("FRONTEND_URL", "https://recolekt.app")


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


# ─────────────────────────────────────────────
# FRONTEND BASE URL HELPER
# ─────────────────────────────────────────────

def _get_frontend_base() -> str:
    """
    Return the correct frontend base URL for redirects.
    Priority:
      1. FRONTEND_URL env var (if explicitly set)
      2. Inferred from the current request Host header
      3. Fallback to the FRONTEND_URL constant
    
    This prevents staging from redirecting to production
    when FRONTEND_URL isn't configured on the staging env.
    """
    env_url = os.getenv("FRONTEND_URL", "").strip().rstrip("/")
    if env_url:
        return env_url

    # If FRONTEND_URL is not set at all, infer from request
    host = request.host  # e.g. "recolekt-staging.up.railway.app"
    scheme = request.scheme  # "https" (via ProxyFix)
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
  <meta name="supported-color-schemes" content="light">
</head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f9fafb;padding:40px 20px;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);max-width:480px;">

        <!-- Header -->
        <tr>
          <td style="background:#0B0F19;padding:28px 40px;">
            <p style="margin:0;color:#ffffff;font-size:22px;font-weight:900;letter-spacing:-0.5px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">recolekt</p>
          </td>
        </tr>

        <!-- Body -->
        {body_content}

        <!-- Footer -->
        <tr>
          <td style="padding:24px 40px;border-top:1px solid #f3f4f6;">
            <p style="margin:0;color:#9ca3af;font-size:12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
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
        text = f"Bienvenue sur Recolekt !\n\nVotre code de vérification : {code}\n\nValide pendant 10 minutes.\nSi vous n'avez pas créé de compte, ignorez cet e-mail.\n\n© 2026 Recolekt\n{APP_URL}"
    else:
        subject = "Verify your Recolekt account"
        title = "Welcome to Recolekt!"
        subtitle = "Your email verification code:"
        note1 = "Valid for 10 minutes."
        note2 = "If you didn't create an account, you can safely ignore this email."
        text = f"Welcome to Recolekt!\n\nYour verification code: {code}\n\nValid for 10 minutes.\nIf you didn't create an account, you can safely ignore this email.\n\n© 2026 Recolekt\n{APP_URL}"

    body = f"""
        <tr><td style="padding:40px;">
          <h1 style="margin:0 0 8px;font-size:24px;font-weight:900;color:#0B0F19;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">{title}</h1>
          <p style="margin:0 0 32px;color:#6b7280;font-size:15px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">{subtitle}</p>
          <div style="background:#f3f0ff;border-radius:12px;padding:24px;text-align:center;margin-bottom:32px;">
            <p style="margin:0;font-size:48px;font-weight:900;letter-spacing:12px;color:#7c3aed;font-family:'Courier New',monospace;">{code}</p>
          </div>
          <p style="margin:0 0 8px;color:#9ca3af;font-size:13px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">{note1}</p>
          <p style="margin:0;color:#9ca3af;font-size:13px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">{note2}</p>
        </td></tr>"""

    return subject, _base_html(lang, body), text


def _email_reset_html(code: str, lang: str = "en") -> tuple[str, str, str]:
    if lang == "fr":
        subject = "Réinitialiser votre mot de passe Recolekt"
        title = "Réinitialisation du mot de passe"
        subtitle = "Votre code de réinitialisation à 6 chiffres :"
        note1 = "Valide pendant 15 minutes."
        note2 = "Si vous n'avez pas demandé cela, ignorez cet e-mail."
        text = f"Réinitialisation du mot de passe Recolekt\n\nVotre code : {code}\n\nValide pendant 15 minutes.\nSi vous n'avez pas demandé cela, ignorez cet e-mail.\n\n© 2026 Recolekt\n{APP_URL}"
    else:
        subject = "Reset your Recolekt password"
        title = "Password reset"
        subtitle = "Your 6-digit reset code:"
        note1 = "Valid for 15 minutes."
        note2 = "If you didn't request this, you can safely ignore this email."
        text = f"Recolekt password reset\n\nYour 6-digit reset code: {code}\n\nValid for 15 minutes.\nIf you didn't request this, you can safely ignore this email.\n\n© 2026 Recolekt\n{APP_URL}"

    body = f"""
        <tr><td style="padding:40px;">
          <h1 style="margin:0 0 8px;font-size:24px;font-weight:900;color:#0B0F19;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">{title}</h1>
          <p style="margin:0 0 32px;color:#6b7280;font-size:15px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">{subtitle}</p>
          <div style="background:#fff0f3;border-radius:12px;padding:24px;text-align:center;margin-bottom:32px;">
            <p style="margin:0;font-size:48px;font-weight:900;letter-spacing:12px;color:#f43f5e;font-family:'Courier New',monospace;">{code}</p>
          </div>
          <p style="margin:0 0 8px;color:#9ca3af;font-size:13px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">{note1}</p>
          <p style="margin:0;color:#9ca3af;font-size:13px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">{note2}</p>
        </td></tr>"""

    return subject, _base_html(lang, body), text


def send_email(to: str, subject: str, html: str, text: str = "") -> bool:
    if not resend.api_key:
        logger.warning("⚠️ RESEND_API_KEY not set — email not sent to %s", to)
        return False
    try:
        resend.Emails.send({
            "from": f"Recolekt <{FROM_EMAIL}>",
            "to": to,
            "subject": subject,
            "html": html,
            "text": text,
            "headers": {
                "X-Entity-Ref-ID": f"recolekt-{random.randint(100000, 999999)}",
                "List-Unsubscribe": "<mailto:unsubscribe@recolekt.app>",
                "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            }
        })
        logger.info("✅ Email sent to %s — subject: %s", to, subject)
        return True
    except Exception as e:
        logger.error("❌ Resend failed for %s: %s", to, e, exc_info=True)
        return False


# ─────────────────────────────────────────────
# GOOGLE OAUTH — REDIRECT FLOW
# ─────────────────────────────────────────────

@auth_bp.route("/google/login", methods=["GET"])
def google_login():
    try:
        oauth = current_app.extensions["oauth"]
    except KeyError:
        logger.error("❌ Google login: OAuth not initialized on app.extensions")
        return jsonify({"error": "OAuth not configured"}), 500

    frontend_base = _get_frontend_base()
    next_url = request.args.get("next", f"{frontend_base}/gallery")
    redirect_uri = url_for("auth.google_callback", _external=True)

    # Store in session as backup — privacy browsers strip OAuth state param
    # Wrapped in try/except because some browsers block session cookies entirely
    try:
        session["oauth_next_url"] = next_url
        session["oauth_frontend_base"] = frontend_base
    except Exception as e:
        logger.warning(f"⚠️ Could not write to session (browser may block cookies): {e}")

    logger.info(f"🔑 Google login: redirect_uri={redirect_uri}, next={next_url}, frontend={frontend_base}")

    try:
        return oauth.google.authorize_redirect(redirect_uri, state=next_url)
    except Exception as e:
        logger.error(f"❌ Google login: authorize_redirect crashed: {e}", exc_info=True)
        return redirect(f"{frontend_base}/auth?error=google_init_failed")


@auth_bp.route("/google/callback", methods=["GET"])
def google_callback():
    try:
        oauth = current_app.extensions["oauth"]
    except KeyError:
        logger.error("❌ Google callback: OAuth not initialized")
        return jsonify({"error": "OAuth not configured"}), 500

    # Recover frontend base — try session first, then infer
    try:
        frontend_base = session.pop("oauth_frontend_base", None)
    except Exception:
        frontend_base = None
    frontend_base = frontend_base or _get_frontend_base()

    # Recover the intended next URL
    try:
        session_next = session.pop("oauth_next_url", None)
    except Exception:
        session_next = None
    
    frontend_next = (
        request.args.get("state")
        or session_next
        or f"{frontend_base}/gallery"
    )

    # Security: ensure redirect stays on our own domain(s)
    allowed_origins = [
        "https://recolekt.app",
        "https://www.recolekt.app",
        "https://staging.recolekt.app",
        "https://recolekt-staging.up.railway.app",
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
    ]
    allowed_origins.append(frontend_base)

    is_safe = any(frontend_next.startswith(origin) for origin in allowed_origins)
    if not is_safe:
        logger.warning(f"⚠️ Blocked open redirect to: {frontend_next}")
        frontend_next = f"{frontend_base}/gallery"

    logger.info(f"🔑 Google callback: frontend_base={frontend_base}, next={frontend_next}")

    try:
        token = oauth.google.authorize_access_token()
        user_info = token.get("userinfo") or {}
        email = (user_info.get("email") or "").strip().lower()
        google_id = user_info.get("sub", "")
        name = user_info.get("name", "")
        picture = user_info.get("picture", "")

        if not email:
            logger.error("❌ Google callback: no email in user_info")
            return redirect(f"{frontend_base}/auth?error=no_email")

        user = fetch_one(
            "SELECT user_id FROM users WHERE email = %s OR google_id = %s;",
            (email, google_id))
        if user:
            user_id = user["user_id"] if isinstance(user, dict) else user[0]
            execute(
                "UPDATE users SET google_id = %s, picture = %s WHERE user_id = %s;",
                (google_id, picture, user_id), commit=True)
            logger.info(f"✅ Google callback: existing user {user_id} ({email})")
        else:
            user_id = get_unique_id(email)
            execute(
                "INSERT INTO users (user_id, email, name, google_id, picture, verified, created_at) "
                "VALUES (%s, %s, %s, %s, %s, TRUE, NOW()) "
                "ON CONFLICT (email) DO UPDATE SET google_id = EXCLUDED.google_id, picture = EXCLUDED.picture, verified = TRUE;",
                (user_id, email, name, google_id, picture), commit=True)
            logger.info(f"✅ Google callback: new user {user_id} ({email})")

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
                "INSERT INTO users (user_id, email, name, google_id, picture, verified, created_at) VALUES (%s, %s, %s, %s, %s, TRUE, NOW()) ON CONFLICT (email) DO UPDATE SET google_id = EXCLUDED.google_id, picture = EXCLUDED.picture, verified = TRUE;",
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