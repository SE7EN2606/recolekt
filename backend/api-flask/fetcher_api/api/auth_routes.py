"""
Authentication routes and helpers for Google OAuth
"""
import os
import logging
import jwt
from datetime import datetime, timedelta
from functools import wraps

from flask import Blueprint, request, jsonify, redirect, url_for, make_response
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

# ✅ CORS allowed origins
ALLOWED_ORIGINS = [
    'https://recolekt-front.netlify.app',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
]

# ---------------------------------------------------------
# CORS DECORATOR
# ---------------------------------------------------------

def add_cors_headers(f):
    """Add CORS headers to response"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Handle OPTIONS preflight
        if request.method == 'OPTIONS':
            response = make_response('', 200)
        else:
            response = make_response(f(*args, **kwargs))
        
        origin = request.headers.get('Origin', '')
        
        if origin in ALLOWED_ORIGINS:
            response.headers['Access-Control-Allow-Origin'] = origin
            response.headers['Access-Control-Allow-Credentials'] = 'true'
            response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, Cache-Control, Pragma'
            response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
            response.headers['Access-Control-Max-Age'] = '3600'
            logger.debug(f"✅ CORS headers added for origin: {origin}")
        else:
            logger.warning(f"⚠️ CORS: Origin not allowed: {origin}")
        
        return response
    return decorated_function

# ---------------------------------------------------------
# HELPER FUNCTIONS (USED BY ALL ROUTES)
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
        logger.warning("JWT token expired")
        return None
    except jwt.InvalidTokenError as e:
        logger.warning(f"Invalid JWT token: {e}")
        return None

def get_user_id_from_request():
    """
    Get user_id from Authorization header (JWT token)
    This function is used by ALL protected routes
    """
    # Check Authorization header for JWT token
    auth_header = request.headers.get('Authorization', '')
    
    if auth_header.startswith('Bearer '):
        token = auth_header.replace('Bearer ', '').strip()
        
        if not token:
            logger.debug("Empty Bearer token")
            return None
        
        payload = decode_jwt_token(token)
        
        if not payload:
            logger.debug("Invalid or expired JWT token")
            return None
        
        user_id = payload.get('user_id')
        logger.debug(f"✅ JWT authenticated user_id: {user_id}")
        return user_id
    
    logger.debug("No Authorization header with Bearer token found")
    return None

def is_user_authenticated():
    """Check if user is authenticated via JWT"""
    user_id = get_user_id_from_request()
    is_auth = user_id is not None
    logger.debug(f"is_user_authenticated: {is_auth} (user_id: {user_id})")
    return is_auth

def is_user_verified():
    """Check if user account is verified"""
    user_id = get_user_id_from_request()
    if not user_id:
        logger.debug("is_user_verified: False (no user_id)")
        return False
    
    try:
        row = fetch_one("SELECT verified FROM users WHERE user_id = %s;", (user_id,))
        verified = (row or {}).get('verified', False)
        logger.debug(f"is_user_verified: {verified} for user {user_id}")
        return verified
    except Exception as e:
        logger.error(f"Error checking user verification: {e}")
        return False

# ---------------------------------------------------------
# AUTH ROUTES
# ---------------------------------------------------------

@auth_bp.route("/google", methods=["GET"])
def google_login():
    """Initiate Google OAuth flow"""
    redirect_uri = url_for('auth.google_callback', _external=True, _scheme='https')
    logger.info(f"🔐 Google OAuth redirect_uri: {redirect_uri}")
    logger.info(f"🔐 User-Agent: {request.headers.get('User-Agent', 'Unknown')}")
    return google.authorize_redirect(redirect_uri)


@auth_bp.route("/google/callback", methods=["GET"])
def google_callback():
    """Handle Google OAuth callback - returns JWT token in URL"""
    logger.info("============================================================")
    logger.info("🔍 OAUTH CALLBACK TRIGGERED")
    logger.info(f"🔍 Request URL: {request.url}")
    logger.info(f"🔍 Request referrer: {request.referrer}")
    logger.info(f"🔍 User-Agent: {request.headers.get('User-Agent', 'Unknown')}")
    logger.info(f"🔍 Request args: {dict(request.args)}")
    logger.info("============================================================")
    
    try:
        token = google.authorize_access_token()
        logger.info(f"✅ Token received: {token is not None}")
        
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


@auth_bp.route("/logout", methods=["POST", "OPTIONS"])
@add_cors_headers
def logout():
    """Logout user (client-side token removal)"""
    if request.method == 'OPTIONS':
        return '', 200
    
    logger.info("👋 User logged out")
    return jsonify({"status": "logged_out"}), 200


@auth_bp.route("/me", methods=["GET", "OPTIONS"])
@add_cors_headers
def get_current_user():
    """Get current authenticated user from JWT token"""
    if request.method == 'OPTIONS':
        return '', 200
    
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


@auth_bp.route("/status", methods=["GET", "OPTIONS"])
@add_cors_headers
def auth_status():
    """Check if user is authenticated and verified"""
    if request.method == 'OPTIONS':
        return '', 200
    
    user_id = get_user_id_from_request()
    is_auth = is_user_authenticated()
    is_verified = is_user_verified()
    
    logger.info(f"Auth status check - authenticated: {is_auth}, verified: {is_verified}, user_id: {user_id}")
    
    return jsonify({
        "authenticated": is_auth,
        "verified": is_verified,
        "user_id": user_id
    })
