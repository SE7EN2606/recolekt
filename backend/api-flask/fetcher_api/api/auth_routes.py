"""
Authentication routes and helpers for Google OAuth
"""
import os
import logging
from datetime import timedelta

from flask import Blueprint, request, jsonify, session, redirect, url_for
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

# ✅ FIXED: Strip trailing slashes to prevent double slashes
FRONTEND_BASE_URL = os.getenv("FRONTEND_BASE_URL", "http://localhost:3000").rstrip("/")

# ---------------------------------------------------------
# HELPER FUNCTIONS (exported for use in other routes)
# ---------------------------------------------------------

def get_user_id_from_request():
    """Get user_id from session only (no fallback to temp_user)"""
    user_id = session.get('user_id')
    if user_id:
        logger.debug(f"Session user_id: {user_id}")
    else:
        logger.warning("No user_id in session")
    return user_id

def is_user_authenticated():
    """Check if user is logged in"""
    return 'user_id' in session and session.get('authenticated', False)

def is_user_verified():
    """Check if user account is verified"""
    if not is_user_authenticated():
        return False
    user_id = session.get('user_id')
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
    logger.info(f"🔐 User-Agent: {request.headers.get('User-Agent')}")
    return google.authorize_redirect(redirect_uri)


@auth_bp.route("/google/callback", methods=["GET"])
def google_callback():
    """Handle Google OAuth callback"""
    logger.info("=" * 60)
    logger.info("🔍 OAUTH CALLBACK TRIGGERED")
    logger.info(f"🔍 Request URL: {request.url}")
    logger.info(f"🔍 Request referrer: {request.referrer}")
    logger.info(f"🔍 User-Agent: {request.headers.get('User-Agent')}")
    logger.info(f"🔍 Request args: {dict(request.args)}")
    logger.info(f"🔍 Session before token: {dict(session)}")
    logger.info("=" * 60)
    
    try:
        token = google.authorize_access_token()
        logger.info(f"✅ Token received: {bool(token)}")
        
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
            # Update Google ID if not set
            execute(
                "UPDATE users SET google_id = %s, picture = %s WHERE user_id = %s;",
                (google_id, picture, user_id)
            )
        else:
            # Create new user
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
        
        # Set session
        session.clear()  # ✅ Clear old session first
        session['user_id'] = user_id
        session['authenticated'] = True
        session.permanent = True
        
        logger.info(f"✅ Session set: user_id={user_id}, authenticated=True")
        logger.info(f"🔍 Session after: {dict(session)}")
        logger.info(f"🔗 Redirecting to: {FRONTEND_BASE_URL}/gallery")
        
        return redirect(f'{FRONTEND_BASE_URL}/gallery')
        
    except Exception as e:
        logger.error(f"❌ Google OAuth error: {e}", exc_info=True)
        return redirect(f'{FRONTEND_BASE_URL}/auth?error=oauth_failed')

@auth_bp.route("/logout", methods=["POST"])
def logout():
    """Logout user"""
    session.clear()
    return jsonify({"status": "logged_out"}), 200


@auth_bp.route("/me", methods=["GET"])
def get_current_user():
    """Get current authenticated user"""
    logger.info(f"Session keys: {list(session.keys())}")
    logger.info(f"Session user_id: {session.get('user_id')}")
    logger.info(f"Session authenticated: {session.get('authenticated')}")
    
    if not session.get('authenticated') or not session.get('user_id'):
        logger.warning("❌ User not authenticated")
        return jsonify({'authenticated': False}), 401
    
    user_id = session.get('user_id')
    
    # Fetch user from database
    try:
        user = fetch_one(
            "SELECT user_id, email, name, picture FROM users WHERE user_id = %s",
            (user_id,)
        )
        
        if not user:
            logger.warning(f"❌ User {user_id} not found in database")
            session.clear()
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
    user_id = session.get('user_id')
    is_auth = is_user_authenticated()
    is_verified = is_user_verified()
    
    logger.info(f"Auth status check: user_id={user_id}, authenticated={is_auth}, verified={is_verified}")
    
    return jsonify({
        "authenticated": is_auth,
        "verified": is_verified,
        "user_id": user_id
    })

