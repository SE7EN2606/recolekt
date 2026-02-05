# fetcher_api/api/routes/auth.py

import os
import logging
from flask import Blueprint, request, jsonify, session, redirect, url_for, current_app
from fetcher_api.adapters.db import execute, fetch_one
from datetime import datetime, timedelta, timezone
import jwt

auth_bp = Blueprint('auth', __name__)
logger = logging.getLogger('auth')


def get_google_client():
    """Get Google OAuth client from app config"""
    oauth = current_app.config.get('oauth')
    if not oauth:
        raise RuntimeError('OAuth not initialized')
    return oauth.create_client('google')


@auth_bp.route('/google', methods=['GET'])
def google_login():
    """Initiate Google OAuth login"""
    try:
        google = get_google_client()
        
        # Determine scheme based on environment
        is_local = os.getenv('FLASK_ENV') == 'development' or not os.getenv('RAILWAY_ENVIRONMENT')
        scheme = 'http' if is_local else 'https'
        
        # Build callback URL
        redirect_uri = url_for('auth.google_callback', _external=True, _scheme=scheme)
        
        logger.info(f"🔐 Google OAuth redirect_uri: {redirect_uri}")
        logger.info(f"🔐 Environment: {'LOCAL' if is_local else 'PRODUCTION'}")
        
        return google.authorize_redirect(redirect_uri)
    except Exception as e:
        logger.error(f"❌ Google login failed: {e}", exc_info=True)
        return jsonify({'error': 'OAuth initialization failed', 'details': str(e)}), 500


@auth_bp.route('/google/callback')
def google_callback():
    """Handle Google OAuth callback"""
    try:
        google = get_google_client()
        
        # Get access token
        token = google.authorize_access_token()
        
        # Get user info
        resp = google.get('https://www.googleapis.com/oauth2/v3/userinfo')
        user_info = resp.json()
        
        email = user_info.get('email')
        name = user_info.get('name', '')
        picture = user_info.get('picture', '')
        google_id = user_info.get('sub')
        
        if not email or not google_id:
            logger.error("❌ Missing email or google_id in OAuth response")
            frontend_url = os.getenv('FRONTEND_BASE_URL', 'http://localhost:3000')
            return redirect(f"{frontend_url}/auth?error=missing_data")
        
        logger.info(f"✅ Google OAuth successful for: {email}")
        
        # Check if user exists
        existing_user = fetch_one(
            "SELECT id, email, name, picture FROM users WHERE email = %s",
            (email,)
        )
        
        if existing_user:
            # Handle both dict and tuple response
            if isinstance(existing_user, dict):
                user_id = existing_user['id']
            else:
                user_id = existing_user[0]
            
            logger.info(f"✅ Existing user logged in: {email} (ID: {user_id})")
            
            # Update user info
            execute(
                """
                UPDATE users 
                SET name = %s, picture = %s, googleid = %s, lastseenat = NOW(), updatedat = NOW()
                WHERE email = %s
                """,
                (name, picture, google_id, email),
                commit=True
            )
        else:
            # Create new user
            execute(
                """
                INSERT INTO users (email, name, picture, googleid, createdat, updatedat, lastseenat)
                VALUES (%s, %s, %s, %s, NOW(), NOW(), NOW())
                """,
                (email, name, picture, google_id),
                commit=True
            )
            
            new_user = fetch_one("SELECT id FROM users WHERE email = %s", (email,))
            if isinstance(new_user, dict):
                user_id = new_user['id']
            else:
                user_id = new_user[0]
            
            logger.info(f"✅ New user created: {email} (ID: {user_id})")
        
        # Create JWT token
        jwt_secret = os.getenv('SECRET_KEY', 'your-secret-key')
        jwt_token = jwt.encode(
            {
                'user_id': user_id,
                'email': email,
                'exp': datetime.now(timezone.utc) + timedelta(days=7),
                'iat': datetime.now(timezone.utc)
            },
            jwt_secret,
            algorithm='HS256'
        )
        
        # Store in session as backup
        session['user_id'] = user_id
        session['email'] = email
        session.permanent = True
        
        # Redirect to frontend with JWT token
        frontend_url = os.getenv('FRONTEND_BASE_URL', 'http://localhost:3000')
        return redirect(f"{frontend_url}/gallery?token={jwt_token}")
        
    except Exception as e:
        logger.error(f"❌ Google callback failed: {e}", exc_info=True)
        frontend_url = os.getenv('FRONTEND_BASE_URL', 'http://localhost:3000')
        return redirect(f"{frontend_url}/auth?error=auth_failed")


@auth_bp.route('/logout', methods=['POST', 'OPTIONS'])
def logout():
    """Logout user"""
    if request.method == 'OPTIONS':
        return '', 200
    
    session.clear()
    return jsonify({'message': 'Logged out successfully'}), 200


@auth_bp.route('/me', methods=['GET', 'OPTIONS'])
def get_current_user():
    """Get current authenticated user"""
    if request.method == 'OPTIONS':
        return '', 200
    
    try:
        user_id = None
        
        # Try JWT first
        auth_header = request.headers.get('Authorization', '')
        if auth_header.startswith('Bearer '):
            token = auth_header.replace('Bearer ', '').strip()
            try:
                jwt_secret = os.getenv('SECRET_KEY', 'your-secret-key')
                payload = jwt.decode(token, jwt_secret, algorithms=['HS256'])
                user_id = payload.get('user_id')
                logger.info(f"✅ JWT auth successful for user_id: {user_id}")
            except jwt.ExpiredSignatureError:
                logger.warning("⚠️ JWT token expired")
            except jwt.InvalidTokenError as e:
                logger.warning(f"⚠️ Invalid JWT token: {e}")
        
        # Fall back to session
        if not user_id:
            user_id = session.get('user_id')
            if user_id:
                logger.info(f"✅ Session auth successful for user_id: {user_id}")
        
        if not user_id:
            logger.warning("❌ No authentication found")
            return jsonify({'authenticated': False, 'error': 'Not authenticated'}), 401
        
        # Fetch user from database
        user = fetch_one(
            "SELECT id, email, name, picture FROM users WHERE id = %s",
            (user_id,)
        )
        
        if not user:
            logger.error(f"❌ User not found in database: {user_id}")
            return jsonify({'authenticated': False, 'error': 'User not found'}), 404
        
        # Handle both dict and tuple response
        if isinstance(user, dict):
            user_data = {
                'id': user['id'],
                'email': user['email'],
                'name': user['name'],
                'picture': user['picture']
            }
        else:
            user_data = {
                'id': user[0],
                'email': user[1],
                'name': user[2],
                'picture': user[3]
            }
        
        logger.info(f"✅ /me endpoint successful for: {user_data['email']}")
        return jsonify({
            'authenticated': True,
            'user': user_data
        }), 200
        
    except Exception as e:
        logger.error(f"❌ /me endpoint error: {e}", exc_info=True)
        return jsonify({'authenticated': False, 'error': 'Internal server error', 'details': str(e)}), 500


@auth_bp.route('/check', methods=['GET', 'OPTIONS'])
def check_auth():
    """Quick auth check endpoint"""
    if request.method == 'OPTIONS':
        return '', 200
    
    # Try JWT
    auth_header = request.headers.get('Authorization', '')
    if auth_header.startswith('Bearer '):
        token = auth_header.replace('Bearer ', '').strip()
        try:
            jwt_secret = os.getenv('SECRET_KEY', 'your-secret-key')
            payload = jwt.decode(token, jwt_secret, algorithms=['HS256'])
            if payload.get('user_id'):
                return jsonify({'authenticated': True}), 200
        except:
            pass
    
    # Try session
    if session.get('user_id'):
        return jsonify({'authenticated': True}), 200
    
    return jsonify({'authenticated': False}), 401
