# fetcher_api/api/routes/auth.py
"""
Authentication routes and helpers for Google OAuth and Email/Password
"""
import traceback
import os
import logging
import jwt
import random
import resend
from datetime import datetime, timedelta, timezone

from flask import Blueprint, request, jsonify, redirect, url_for, session, current_app
from werkzeug.security import generate_password_hash, check_password_hash

from fetcher_api.api.helpers.auth import get_user_id_from_request
from fetcher_api.adapters.db import execute, fetch_one
from fetcher_api.utils.timestamps import get_unique_id

logger = logging.getLogger("auth")

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")

FRONTEND_BASE_URL = os.getenv("FRONTEND_BASE_URL", "http://localhost:3000").rstrip("/")

# ✅ BULLETPROOF SECRET KEY: Force it to match your .env.local exactly
JWT_SECRET = os.getenv('SECRET_KEY')
if not JWT_SECRET:
    JWT_SECRET = 'your-secret-key'

# Initialize Resend
resend.api_key = os.getenv("RESEND_API_KEY")

# ---------------------------------------------------------
# HELPER FUNCTIONS
# ---------------------------------------------------------
def get_google_client():
    oauth = current_app.config.get('oauth')
    if not oauth:
        raise RuntimeError("OAuth not initialized in app config")
    return oauth.create_client('google')

def create_jwt_token(user_id: str, email: str) -> str:
    payload = {
        'user_id': user_id,
        'email': email,
        'exp': datetime.now(timezone.utc) + timedelta(days=7),
        'iat': datetime.now(timezone.utc)
    }
    token = jwt.encode(payload, JWT_SECRET, algorithm='HS256')
    if isinstance(token, bytes):
        return token.decode('utf-8')
    return token

# ---------------------------------------------------------
# GOOGLE OAUTH ROUTES
# ---------------------------------------------------------
@auth_bp.route("/google", methods=["GET"])
def google_login():
    google = get_google_client()
    
    # Use the variable you set in Railway (https://recolekt-staging.up.railway.app/api/auth/google/callback)
    redirect_uri = os.getenv("GOOGLE_REDIRECT_URI")
    
    # Fallback for local dev only
    if not redirect_uri:
        redirect_uri = url_for('auth.google_callback', _external=True, _scheme='http')
    
    logger.info(f"🚀 OAuth Start - Redirecting to Google with URI: {redirect_uri}")
    return google.authorize_redirect(redirect_uri)

@auth_bp.route("/google/callback", methods=["GET"])
def google_callback():
    try:
        # Force HTTPS for the callback validation
        if not request.is_secure and os.getenv('RAILWAY_ENVIRONMENT'):
            from werkzeug.middleware.proxy_fix import ProxyFix
            # This helps Authlib realize it's on HTTPS
            request.environ['wsgi.url_scheme'] = 'https'
            
        google = get_google_client()
        token = google.authorize_access_token()
        user_info = token.get('userinfo') or google.get('https://www.googleapis.com/oauth2/v3/userinfo').json()
        
        google_id = user_info.get('sub')
        email = user_info.get('email')
        name = user_info.get('name', '')
        picture = user_info.get('picture', '')
        
        if not email or not google_id:
            return redirect(f'{FRONTEND_BASE_URL}/auth?error=missing_data')
            
        existing_user = fetch_one(
            "SELECT user_id FROM users WHERE email = %s OR google_id = %s;",
            (email, google_id)
        )
        
        if existing_user:
            user_id = existing_user['user_id'] if isinstance(existing_user, dict) else existing_user[0]
            execute(
                "UPDATE users SET google_id = %s, picture = %s, updated_at = NOW() WHERE user_id = %s;",
                (google_id, picture, user_id),
                commit=True
            )
        else:
            user_id = get_unique_id(email)
            execute(
                """
                INSERT INTO users (user_id, email, name, google_id, picture, verified, created_at)
                VALUES (%s, %s, %s, %s, %s, TRUE, NOW())
                ON CONFLICT (email) DO UPDATE
                SET google_id = EXCLUDED.google_id, picture = EXCLUDED.picture, verified = TRUE;
                """,
                (user_id, email, name, google_id, picture),
                commit=True
            )
        
        jwt_token = create_jwt_token(user_id, email)
        session['user_id'] = user_id
        session['email'] = email
        session.permanent = True
        
        return redirect(f'{FRONTEND_BASE_URL}/gallery?token={jwt_token}')
        
    except Exception as e:
        logger.error(f"❌ Google OAuth error: {e}", exc_info=True)
        return redirect(f'{FRONTEND_BASE_URL}/auth?error=oauth_failed')

# ---------------------------------------------------------
# EMAIL / PASSWORD ROUTES
# ---------------------------------------------------------
@auth_bp.route("/register", methods=["POST", "OPTIONS"])
def register():
    if request.method == 'OPTIONS':
        return '', 200

    data = request.get_json() or {}
    email = (data.get('email') or '').strip().lower()
    password = data.get('password') or ''
    name = data.get('name', 'User')

    if not email or not password:
        return jsonify({'error': 'Email and password required'}), 400

    try:
        existing = fetch_one("SELECT user_id FROM users WHERE email = %s;", (email,))
        if existing:
            return jsonify({'error': 'An account with this email already exists.'}), 409

        user_id = get_unique_id(email)
        password_hash = generate_password_hash(password)
        
        execute(
            """
            INSERT INTO users (user_id, email, name, password_hash, verified, created_at)
            VALUES (%s, %s, %s, %s, FALSE, NOW());
            """,
            (user_id, email, name, password_hash),
            commit=True
        )
        
        jwt_token = create_jwt_token(user_id, email)
        code = ''.join(random.choices('0123456789', k=6))
        expires = datetime.now(timezone.utc) + timedelta(minutes=10)
        
        execute(
            """
            INSERT INTO verification_codes (user_id, code, expires_at) VALUES (%s, %s, %s)
            ON CONFLICT (user_id) DO UPDATE SET code = EXCLUDED.code, expires_at = EXCLUDED.expires_at;
            """,
            (user_id, code, expires),
            commit=True
        )
        
        if resend.api_key:
            try:
                resend.Emails.send({
                    "from": "onboarding@resend.dev",
                    "to": email,
                    "subject": "Verify your Recolekt account",
                    "html": f"<h1>Welcome to Recolekt!</h1><p>Code: <b>{code}</b></p>"
                })
            except Exception:
                print(f"DEBUG: {email} verification code is {code}")

        return jsonify({
            'message': 'Registered successfully. Please verify your email.',
            'token': jwt_token,
            'user': {'id': user_id, 'email': email, 'name': name}
        }), 201
    except Exception as e:
        return jsonify({'error': f"Backend Crash: {str(e)}"}), 500

@auth_bp.route("/login", methods=["POST", "OPTIONS"])
def login():
    if request.method == 'OPTIONS':
        return '', 200

    data = request.get_json() or {}
    email = (data.get('email') or '').strip().lower()
    password = data.get('password') or ''

    if not email or not password:
        return jsonify({'error': 'Email and password required'}), 400

    try:
        user = fetch_one(
            "SELECT user_id, email, name, picture, password_hash, language FROM users WHERE email = %s;", 
            (email,)
        )

        if not user:
            return jsonify({'error': 'No account found with this email address.'}), 401

        user_dict = dict(user) if isinstance(user, dict) else {
            'user_id': user[0], 'email': user[1], 'name': user[2], 'picture': user[3], 
            'password_hash': user[4], 'language': user[5]
        }

        if not user_dict.get('password_hash'):
            return jsonify({'error': 'Please sign in with Google.'}), 401

        if not check_password_hash(user_dict['password_hash'], password):
            return jsonify({'error': 'Invalid password.'}), 401

        jwt_token = create_jwt_token(user_dict['user_id'], email)
        session['user_id'] = user_dict['user_id']
        session['email'] = email
        session.permanent = True

        return jsonify({
            'message': 'Login successful',
            'token': jwt_token,
            'user': {
                'id': user_dict['user_id'], 
                'email': user_dict['email'], 
                'name': user_dict['name'], 
                'picture': user_dict['picture'],
                'language': user_dict.get('language') or 'en'
            }
        }), 200
    except Exception as e:
        return jsonify({'error': f"Backend Crash: {str(e)}"}), 500

# ---------------------------------------------------------
# PASSWORD RESET & VERIFICATION ROUTES
# ---------------------------------------------------------
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
    return jsonify({"message": "Success"}), 200

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
    return jsonify({"message": "Verified"}), 200

@auth_bp.route("/logout", methods=["POST", "OPTIONS"])
def logout():
    if request.method == 'OPTIONS': return '', 200
    session.clear()
    return jsonify({"status": "logged_out"}), 200

# ---------------------------------------------------------
# ✅ ME ROUTE: DUAL AUTHENTICATION (BEARER + SESSION)
# ---------------------------------------------------------
@auth_bp.route("/me", methods=["GET", "OPTIONS"])
def get_current_user():
    if request.method == 'OPTIONS':
        return '', 200
    try:
        user_id = None
        
        # 1. Try Bearer Token (For iOS Shortcut)
        auth_header = request.headers.get('Authorization')
        if auth_header and auth_header.startswith('Bearer '):
            token = auth_header.split(" ")[1]
            try:
                payload = jwt.decode(token, JWT_SECRET, algorithms=['HS256'])
                user_id = payload.get('user_id')
            except Exception as e:
                logger.warning(f"Bearer token decode failed: {e}")

        # 2. Try Session (For Web Browser)
        if not user_id:
            user_id = session.get('user_id')

        if not user_id:
            return jsonify({'authenticated': False}), 401
        
        user = fetch_one("SELECT user_id, email, name, picture, language FROM users WHERE user_id = %s", (user_id,))
        if not user:
            return jsonify({'authenticated': False}), 401
        
        user_dict = dict(user) if isinstance(user, dict) else {
            'user_id': user[0], 'email': user[1], 'name': user[2], 'picture': user[3], 'language': user[4]
        }
        
        return jsonify({
            'authenticated': True,
            'user': {
                'id': user_dict['user_id'],
                'email': user_dict.get('email'),
                'name': user_dict.get('name'),
                'picture': user_dict.get('picture'),
                'language': user_dict.get('language') or 'en'
            }
        }), 200
    except Exception as e:
        logger.error(f"❌ AUTH ME ERROR: {traceback.format_exc()}")
        return jsonify({'error': "Backend error"}), 500

@auth_bp.route("/language", methods=["PUT", "OPTIONS"])
def update_language():
    if request.method == 'OPTIONS': return '', 200
    try:
        # Fallback helper for easy user_id extraction
        user_id = get_user_id_from_request()
        if not user_id: return jsonify({'error': 'Unauthorized'}), 401
        data = request.get_json() or {}
        lang = data.get('language', 'en')
        execute("UPDATE users SET language = %s WHERE user_id = %s", (lang, user_id), commit=True)
        return jsonify({'success': True, 'language': lang}), 200
    except Exception as e: return jsonify({'error': str(e)}), 500
