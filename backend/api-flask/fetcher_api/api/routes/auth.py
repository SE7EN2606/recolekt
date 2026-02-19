# fetcher_api/api/routes/auth.py
"""
Authentication routes and helpers for Google OAuth and Email/Password
"""
import os
import logging
import jwt
from datetime import datetime, timedelta, timezone
from functools import wraps

from flask import Blueprint, request, jsonify, redirect, url_for, make_response, session, current_app
from werkzeug.security import generate_password_hash, check_password_hash

from fetcher_api.api.helpers.auth import get_user_id_from_request
from fetcher_api.adapters.db import execute, fetch_one
from fetcher_api.utils.timestamps import get_unique_id

logger = logging.getLogger("auth")

# Force the url_prefix here so we are 100% sure /register maps to /api/auth/register
auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")

FRONTEND_BASE_URL = os.getenv("FRONTEND_BASE_URL", "http://localhost:3000").rstrip("/")
JWT_SECRET = os.getenv('SECRET_KEY', 'your-secret-key')

# ✅ CORS allowed origins
ALLOWED_ORIGINS = [
    'https://recolekt-front.netlify.app',
    'https://recolekt.app',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
]

# ---------------------------------------------------------
# CORS DECORATOR
# ---------------------------------------------------------
def add_cors_headers(f):
    """Add CORS headers to response for cross-origin requests"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if request.method == 'OPTIONS':
            response = make_response('', 200)
        else:
            rv = f(*args, **kwargs)
            if isinstance(rv, tuple):
                response = make_response(rv[0], rv[1])
            else:
                response = make_response(rv)
        
        origin = request.headers.get('Origin', '')
        if origin in ALLOWED_ORIGINS:
            response.headers['Access-Control-Allow-Origin'] = origin
            response.headers['Access-Control-Allow-Credentials'] = 'true'
            response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, Cache-Control, Pragma'
            response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
            response.headers['Access-Control-Max-Age'] = '3600'
        
        return response
    return decorated_function

# ---------------------------------------------------------
# HELPER FUNCTIONS
# ---------------------------------------------------------
def get_google_client():
    """Retrieve the Google OAuth client from the main app config"""
    oauth = current_app.config.get('oauth')
    if not oauth:
        raise RuntimeError("OAuth not initialized in app config")
    return oauth.create_client('google')

def create_jwt_token(user_id: str, email: str) -> str:
    """Create a JWT token for the user"""
    payload = {
        'user_id': user_id,
        'email': email,
        'exp': datetime.now(timezone.utc) + timedelta(days=7),
        'iat': datetime.now(timezone.utc)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm='HS256')

# ---------------------------------------------------------
# GOOGLE OAUTH ROUTES
# ---------------------------------------------------------
@auth_bp.route("/google", methods=["GET"])
def google_login():
    """Initiate Google OAuth flow"""
    google = get_google_client()
    
    is_local = os.getenv('FLASK_ENV') == 'development' or not os.getenv('RAILWAY_ENVIRONMENT')
    
    if is_local:
        redirect_uri = url_for('auth.google_callback', _external=True, _scheme='http')
    else:
        # ✅ FIX : On force la redirection vers le frontend proxy
        redirect_uri = "https://recolekt.app/api/auth/google/callback"
        
    logger.info(f"🔐 Google OAuth redirect_uri: {redirect_uri}")
    
    return google.authorize_redirect(redirect_uri)

@auth_bp.route("/google/callback", methods=["GET"])
def google_callback():
    """Handle Google OAuth callback"""
    try:
        google = get_google_client()
        token = google.authorize_access_token()
        user_info = token.get('userinfo') or google.get('https://www.googleapis.com/oauth2/v3/userinfo').json()
        
        google_id = user_info.get('sub')
        email = user_info.get('email')
        name = user_info.get('name', '')
        picture = user_info.get('picture', '')
        
        if not email or not google_id:
            logger.error("❌ Missing email or google_id in OAuth response")
            return redirect(f'{FRONTEND_BASE_URL}/auth?error=missing_data')
            
        logger.info(f"✅ Google OAuth successful for: {email}")
        
        # Check if user exists
        existing_user = fetch_one(
            "SELECT user_id FROM users WHERE email = %s OR google_id = %s;",
            (email, google_id)
        )
        
        if existing_user:
            user_id = existing_user['user_id'] if isinstance(existing_user, dict) else existing_user[0]
            logger.info(f"👤 Existing user found: {user_id}")
            execute(
                "UPDATE users SET google_id = %s, picture = %s, updated_at = NOW() WHERE user_id = %s;",
                (google_id, picture, user_id),
                commit=True
            )
        else:
            user_id = get_unique_id(email)
            logger.info(f"✨ Creating new user: {user_id}")
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
        
        # Create tokens
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
@add_cors_headers
def register():
    """Handle email/password registration"""
    if request.method == 'OPTIONS':
        return '', 200

    data = request.get_json() or {}
    email = data.get('email')
    password = data.get('password')
    name = data.get('name', 'User')

    if not email or not password:
        return jsonify({'error': 'Email and password required'}), 400

    existing = fetch_one("SELECT user_id FROM users WHERE email = %s;", (email,))
    if existing:
        return jsonify({'error': 'User already exists with this email'}), 409

    try:
        user_id = get_unique_id(email)
        password_hash = generate_password_hash(password)
        
        execute(
            """
            INSERT INTO users (user_id, email, name, password_hash, verified, created_at)
            VALUES (%s, %s, %s, %s, TRUE, NOW());
            """,
            (user_id, email, name, password_hash),
            commit=True
        )
        
        jwt_token = create_jwt_token(user_id, email)
        
        # Match Google OAuth session perfectly
        session['user_id'] = user_id
        session['email'] = email
        session.permanent = True
        
        logger.info(f"✅ User registered via email: {email}")
        return jsonify({
            'message': 'Registered successfully',
            'token': jwt_token,
            'user': {'id': user_id, 'email': email, 'name': name}
        }), 201
    except Exception as e:
        logger.error(f"❌ Registration error: {e}")
        return jsonify({'error': 'Registration failed due to server error'}), 500


@auth_bp.route("/login", methods=["POST", "OPTIONS"])
@add_cors_headers
def login():
    """Handle email/password login"""
    if request.method == 'OPTIONS':
        return '', 200

    data = request.get_json() or {}
    email = data.get('email')
    password = data.get('password')

    if not email or not password:
        return jsonify({'error': 'Email and password required'}), 400

    user = fetch_one(
        "SELECT user_id, email, name, picture, password_hash FROM users WHERE email = %s;", 
        (email,)
    )

    if not user:
        return jsonify({'error': 'Invalid credentials'}), 401

    if isinstance(user, dict):
        user_id = user['user_id']
        stored_hash = user.get('password_hash')
        name = user.get('name')
        picture = user.get('picture')
    else:
        # Tuple fallback
        user_id = user[0]
        stored_hash = user[4]
        name = user[2]
        picture = user[3]

    if not stored_hash or not check_password_hash(stored_hash, password):
        return jsonify({'error': 'Invalid credentials'}), 401

    jwt_token = create_jwt_token(user_id, email)
    
    # Match Google OAuth session perfectly
    session['user_id'] = user_id
    session['email'] = email
    session.permanent = True

    logger.info(f"✅ User logged in via email: {email}")
    return jsonify({
        'message': 'Login successful',
        'token': jwt_token,
        'user': {'id': user_id, 'email': email, 'name': name, 'picture': picture}
    }), 200


@auth_bp.route("/logout", methods=["POST", "OPTIONS"])
@add_cors_headers
def logout():
    """Logout user"""
    if request.method == 'OPTIONS':
        return '', 200
    
    session.clear()
    return jsonify({"status": "logged_out"}), 200


@auth_bp.route("/me", methods=["GET", "OPTIONS"])
@add_cors_headers
def get_current_user():
    """Get current authenticated user data"""
    if request.method == 'OPTIONS':
        return '', 200
    
    user_id = get_user_id_from_request()
    
    if not user_id:
        return jsonify({'authenticated': False}), 401
    
    try:
        user = fetch_one(
            "SELECT user_id, email, name, picture FROM users WHERE user_id = %s",
            (user_id,)
        )
        
        if not user:
            return jsonify({'authenticated': False}), 401
        
        user_dict = dict(user) if isinstance(user, dict) else {
            'user_id': user[0], 'email': user[1], 'name': user[2], 'picture': user[3]
        }
        
        return jsonify({
            'authenticated': True,
            'user': {
                'id': user_dict['user_id'],
                'email': user_dict.get('email'),
                'name': user_dict.get('name'),
                'picture': user_dict.get('picture')
            }
        }), 200
    except Exception as e:
        logger.error(f"❌ Error fetching user /me: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@auth_bp.route("/check", methods=["GET", "OPTIONS"])
@add_cors_headers
def check_auth():
    """Quick boolean check if token/session is valid"""
    if request.method == 'OPTIONS':
        return '', 200
    
    user_id = get_user_id_from_request()
    return jsonify({'authenticated': user_id is not None}), 200 if user_id else 401
