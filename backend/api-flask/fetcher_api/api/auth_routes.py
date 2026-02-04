"""
Authentication routes and helpers for Google OAuth
"""
import os
import logging
import jwt
from datetime import datetime, timedelta

from flask import Blueprint, request, jsonify, redirect, url_for
from authlib.integrations.flask_client import OAuth

from fetcher_api.adapters.db import execute, fetch_one
from fetcher_api.utils.timestamps import get_unique_id

logger = logging.getLogger("auth")

# Create auth blueprint
auth_bp = Blueprint("auth", __name__)

# Initialize OAuth
oauth = OAuth()
google = oauth.register(
    name='google',
    client_id=os.getenv('GOOGLE_CLIENT_ID'),
    client_secret=os.getenv('GOOGLE_CLIENT_SECRET'),
    server_metadata_url='https://accounts.google.com/.well-known/openid-configuration',
    client_kwargs={'scope': 'openid email profile'}
)

FRONTEND_BASE_URL = os.getenv("FRONTEND_BASE_URL", "http://localhost:3000").rstrip("/")
JWT_SECRET = os.getenv('SECRET_KEY', 'your-secret-key')

# ---------------------------------------------------------
# HELPER FUNCTIONS
# ---------------------------------------------------------

def create_jwt_token(user_id: str) -> str:
    """Create a JWT token for the user"""
    payload = {
        'user_id': user_id,
        'exp': datetime.utcnow() + timedelta(days=7),
        'iat': datetime.utcnow()
    }
    return jwt.encode(payload, JWT_SECRET, algorithm='HS256')

def decode_jwt_token(token: str):
    """Decode and validate JWT token"""
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=['HS256'])
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None

def get_user_id_from_request():
    """Get user_id from Authorization header (JWT token)"""
    auth_header = request.headers.get('Authorization', '')
    if not auth_header.startswith('Bearer '):
        logger.warning("No Bearer token in Authorization header")
        return None
    
    token = auth_header.replace('Bearer ', '')
    payload = decode_jwt_token(token)
    
    if not payload:
        logger.warning("Invalid or expired token")
        return None
    
    user_id = payload.get('user_id')
    logger.debug(f"JWT user_id: {user_id}")
    return user_id

def is_user_authenticated():
    """Check if user is authenticated via JWT"""
    return get_user_id_from_request() is not None

def is_user_verified():
    """Check if user account is verified"""
    user_id = get_user_id_from_request()
    if not user_id:
        return False
    row = fetch_one("SELECT verified FROM users WHERE user_id = %s;", (user_id,))
    return (row or {}).get('verified', False)

# ---------------------------------------------------------
# AUTH ROUTES
# ---------------------------------------------------------

@auth_bp.route("/google", methods=["GET"])
def google_login():
    """Initiate Google OAuth flow"""
    redirect_uri = url_for('auth.google_callback', _external=True)
    logger.info(f"🔐 Google OAuth redirect_uri: {redirect_uri}")
    return google.authorize_redirect(redirect_uri)


@auth_bp.route("/google/callback", methods=["GET"])
def google_callback():
    """Handle Google OAuth callback - returns JWT token in URL"""
    logger.info("🔍 OAUTH CALLBACK TRIGGERED")
    
    try:
        token = google.authorize_access_token()
        user_info = token.get('userinfo')
        
        if not user_info:
            logger.error("❌ No userinfo in Google OAuth response")
            return redirect(f'{FRONTEND_BASE_URL}/auth?error=oauth_failed')
        
        google_id = user_info.get('sub')
        email = user_info.get('email')
        name = user_info.get('name')
        picture = user_info.get('picture')
        
        logger.info(f"✅ Google OAuth successful for: {email}")
        
        # Check if user exists
        existing_user = fetch_one(
            "SELECT user_id, verified FROM users WHERE email = %s OR google_id = %s;",
            (email, google_id)
        )
        
        if existing_user:
            user_id = existing_user['user_id']
            logger.info(f"👤 Existing user found: {user_id}")
            execute(
                "UPDATE users SET google_id = %s, picture = %s WHERE user_id = %s;",
                (google_id, picture, user_id)
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
                (user_id, email, name, google_id, picture)
            )
        
        # Create JWT token
        jwt_token = create_jwt_token(user_id)
        
        logger.info(f"✅ JWT token created for user: {user_id}")
        logger.info(f"🔗 Redirecting to: {FRONTEND_BASE_URL}/gallery?token={jwt_token[:20]}...")
        
        # Redirect to frontend with token in URL
        return redirect(f'{FRONTEND_BASE_URL}/gallery?token={jwt_token}')
        
    except Exception as e:
        logger.error(f"❌ Google OAuth error: {e}", exc_info=True)
        return redirect(f'{FRONTEND_BASE_URL}/auth?error=oauth_failed')


@auth_bp.route("/logout", methods=["POST"])
def logout():
    """Logout user (client-side token removal)"""
    return jsonify({"status": "logged_out"}), 200


@auth_bp.route("/me", methods=["GET"])
def get_current_user():
    """Get current authenticated user from JWT token"""
    user_id = get_user_id_from_request()
    
    if not user_id:
        logger.warning("❌ User not authenticated")
        return jsonify({'authenticated': False}), 401
    
    try:
        user = fetch_one(
            "SELECT user_id, email, name, picture FROM users WHERE user_id = %s",
            (user_id,)
        )
        
        if not user:
            logger.warning(f"❌ User {user_id} not found in database")
            return jsonify({'authenticated': False}), 401
        
        user_dict = dict(user) if hasattr(user, 'keys') else user._asdict()
        
        logger.info(f"✅ Authenticated user: {user_id}")
        return jsonify({
            'authenticated': True,
            'user': {
                'id': user_dict['user_id'],
                'email': user_dict.get('email'),
                'name': user_dict.get('name'),
                'picture': user_dict.get('picture')
            }
        })
    except Exception as e:
        logger.error(f"Error fetching user: {e}")
        return jsonify({'error': 'Internal error'}), 500


@auth_bp.route("/status", methods=["GET"])
def auth_status():
    """Check if user is authenticated and verified"""
    user_id = get_user_id_from_request()
    is_auth = is_user_authenticated()
    is_verified = is_user_verified()
    
    return jsonify({
        "authenticated": is_auth,
        "verified": is_verified,
        "user_id": user_id
    })
