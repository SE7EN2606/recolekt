# fetcher_api/api/routes/auth.py
import os
import logging
import jwt
import requests
import random
import resend
from datetime import datetime, timedelta, timezone

from flask import Blueprint, request, jsonify, session, current_app
from werkzeug.security import generate_password_hash, check_password_hash

from fetcher_api.api.helpers.auth import get_user_id_from_request
from fetcher_api.adapters.db import execute, fetch_one
from fetcher_api.utils.timestamps import get_unique_id

logger = logging.getLogger("auth")
auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")

# Initialize Resend
resend.api_key = os.getenv("RESEND_API_KEY")

def get_signing_key():
    """Centralized key fetcher to ensure consistency across all auth routes."""
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

# ---------------------------------------------------------
# ✅ STATELESS GOOGLE OAUTH ROUTE
# ---------------------------------------------------------
@auth_bp.route("/google/verify", methods=["POST", "OPTIONS"])
def google_verify():
    if request.method == "OPTIONS": return "", 200
    
    data = request.get_json() or {}
    access_token = data.get("access_token")
    if not access_token: return jsonify({"error": "Missing access token"}), 400

    try:
        resp = requests.get("https://www.googleapis.com/oauth2/v3/userinfo",
                            headers={"Authorization": f"Bearer {access_token}"})
        
        if not resp.ok: return jsonify({"error": "Invalid token from Google"}), 401

        user_info = resp.json()
        email = (user_info.get("email") or "").strip().lower()
        google_id = user_info.get("sub")
        name = user_info.get("name", "")
        picture = user_info.get("picture", "")

        user = fetch_one("SELECT user_id FROM users WHERE email = %s OR google_id = %s;", (email, google_id))

        if user:
            user_id = user["user_id"] if isinstance(user, dict) else user[0]
            execute("UPDATE users SET google_id = %s, picture = %s WHERE user_id = %s;", (google_id, picture, user_id), commit=True)
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

# ---------------------------------------------------------
# EMAIL / PASSWORD ROUTES
# ---------------------------------------------------------
@auth_bp.route("/login", methods=["POST", "OPTIONS"])
def login():
    if request.method == "OPTIONS": return "", 200
    data = request.get_json() or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    user = fetch_one("SELECT user_id, email, name, picture, password_hash, language FROM users WHERE email = %s;", (email,))
    if not user: return jsonify({"error": "No account found."}), 401
    
    user_dict = dict(user) if isinstance(user, dict) else {
        "user_id": user[0], "email": user[1], "name": user[2], "picture": user[3], "password_hash": user[4], "language": user[5]
    }
    if not user_dict.get("password_hash") or not check_password_hash(user_dict["password_hash"], password):
        return jsonify({"error": "Invalid credentials"}), 401

    return jsonify({
        "token": create_jwt_token(user_dict["user_id"], email),
        "user": {"id": user_dict["user_id"], "email": email, "name": user_dict["name"], "picture": user_dict["picture"], "language": user_dict.get("language", "en")}
    }), 200

@auth_bp.route("/register", methods=["POST", "OPTIONS"])
def register():
    if request.method == 'OPTIONS': return '', 200

    data = request.get_json() or {}
    email = (data.get('email') or '').strip().lower()
    password = data.get('password') or ''
    name = data.get('name', 'User')

    if not email or not password: return jsonify({'error': 'Email and password required'}), 400

    try:
        existing = fetch_one("SELECT user_id FROM users WHERE email = %s;", (email,))
        if existing: return jsonify({'error': 'An account with this email already exists.'}), 409

        user_id = get_unique_id(email)
        password_hash = generate_password_hash(password)

        execute("INSERT INTO users (user_id, email, name, password_hash, verified, created_at) VALUES (%s, %s, %s, %s, FALSE, NOW());",
            (user_id, email, name, password_hash), commit=True)

        jwt_token = create_jwt_token(user_id, email)
        code = ''.join(random.choices('0123456789', k=6))
        expires = datetime.now(timezone.utc) + timedelta(minutes=10)

        execute("INSERT INTO verification_codes (user_id, code, expires_at) VALUES (%s, %s, %s) ON CONFLICT (user_id) DO UPDATE SET code = EXCLUDED.code, expires_at = EXCLUDED.expires_at;",
            (user_id, code, expires), commit=True)

        if resend.api_key:
            try:
                resend.Emails.send({
                    "from": "onboarding@resend.dev",
                    "to": email,
                    "subject": "Verify your Recolekt account",
                    "html": f"<h1>Welcome to Recolekt!</h1><p>Your verification code is:</p><p style='font-size:48px;font-weight:bold;letter-spacing:4px;'>{code}</p><p>Valid for 10 minutes.</p>"
                })
            except Exception:
                print(f"🛠️ DEV BYPASS VERIFICATION CODE: {code}")

        return jsonify({'message': 'Registered successfully. Please verify your email.', 'token': jwt_token, 'user': {'id': user_id, 'email': email, 'name': name}}), 201
    except Exception as e:
        return jsonify({'error': f"Backend Crash: {str(e)}"}), 500

@auth_bp.route("/me", methods=["GET", "OPTIONS"])
def get_current_user():
    if request.method == 'OPTIONS': return '', 200
    try:
        user_id = get_user_id_from_request()
        
        user = fetch_one("SELECT user_id, email, name, picture, language FROM users WHERE user_id = %s", (user_id,))
        if not user: return jsonify({'authenticated': False}), 401

        user_dict = dict(user) if isinstance(user, dict) else {'user_id': user[0], 'email': user[1], 'name': user[2], 'picture': user[3], 'language': user[4]}
        return jsonify({
            'authenticated': True, 
            'user': {'id': user_dict['user_id'], 'email': user_dict['email'], 'name': user_dict['name'], 'picture': user_dict['picture'], 'language': user_dict.get('language') or 'en'}
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
    
    user = fetch_one("SELECT user_id FROM users WHERE email = %s", (email,))
    if not user: return jsonify({"error": "No account found."}), 404
    user_id = user['user_id'] if isinstance(user, dict) else user[0]
    
    code = ''.join(random.choices('0123456789', k=6))
    expires = datetime.now(timezone.utc) + timedelta(minutes=15)
    
    execute("INSERT INTO reset_codes (user_id, code, expires_at) VALUES (%s, %s, %s) ON CONFLICT (user_id) DO UPDATE SET code = EXCLUDED.code, expires_at = EXCLUDED.expires_at;", (user_id, code, expires), commit=True)
    
    if resend.api_key:
        try:
            resend.Emails.send({
                "from": "onboarding@resend.dev",
                "to": email,
                "subject": "Reset your Recolekt password",
                "html": f"<h1>Password reset request</h1><p>Your 6-digit reset code is:</p><p style='font-size:48px;font-weight:bold;letter-spacing:4px;'>{code}</p><p>Valid for 15 minutes.</p>"
            })
        except Exception:
            print(f"🛠️ DEV BYPASS RESET CODE: {code}")
            
    return jsonify({"message": "Code sent successfully"}), 200

@auth_bp.route('/reset-password', methods=['POST', 'OPTIONS'])
def reset_password():
    if request.method == 'OPTIONS': return '', 200
    data = request.get_json() or {}
    email, code, new_pw = data.get('email', '').strip().lower(), data.get('code', '').strip(), data.get('password', '')
    
    user = fetch_one("SELECT user_id FROM users WHERE email = %s", (email,))
    if not user: return jsonify({"error": "User not found"}), 400
    user_id = user['user_id'] if isinstance(user, dict) else user[0]
    
    code_row = fetch_one("SELECT user_id FROM reset_codes WHERE user_id = %s AND code = %s AND expires_at > NOW()", (user_id, code))
    if not code_row: return jsonify({"error": "Invalid code."}), 400
    
    hashed_pw = generate_password_hash(new_pw)
    execute("UPDATE users SET password_hash = %s WHERE user_id = %s", (hashed_pw, user_id), commit=True)
    execute("DELETE FROM reset_codes WHERE user_id = %s", (user_id,), commit=True)
    return jsonify({"message": "Password reset successfully!"}), 200

@auth_bp.route('/verify-email', methods=['POST', 'OPTIONS'])
def verify_email():
    if request.method == 'OPTIONS': return '', 200
    data = request.get_json() or {}
    email, code = data.get('email', '').strip().lower(), data.get('code', '').strip()
    
    user = fetch_one("SELECT user_id FROM users WHERE email = %s", (email,))
    if not user: return jsonify({"error": "Not found"}), 400
    user_id = user['user_id'] if isinstance(user, dict) else user[0]
    
    code_row = fetch_one("SELECT user_id FROM verification_codes WHERE user_id = %s AND code = %s AND expires_at > NOW()", (user_id, code))
    if not code_row: return jsonify({"error": "Invalid code."}), 400
    
    execute("UPDATE users SET verified = TRUE WHERE user_id = %s", (user_id,), commit=True)
    execute("DELETE FROM verification_codes WHERE user_id = %s", (user_id,), commit=True)
    return jsonify({"message": "Email verified successfully!"}), 200