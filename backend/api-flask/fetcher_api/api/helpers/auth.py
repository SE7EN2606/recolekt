# fetcher_api/api/helpers/auth.py

import os
import logging
from flask import session, request
from fetcher_api.adapters.db import execute, fetch_one

logger = logging.getLogger('auth')


def get_user_id_from_request():
    """
    Get user_id from session or Authorization header (JWT).
    Raises ValueError if not authenticated.
    """
    # Try session first
    user_id = session.get('user_id')
    
    if user_id:
        logger.debug(f"✅ User authenticated via session: {user_id}")
        return user_id
    
    # Try JWT from Authorization header
    auth_header = request.headers.get('Authorization', '')
    if auth_header.startswith('Bearer '):
        token = auth_header.replace('Bearer ', '').strip()
        if token:
            try:
                import jwt
                jwt_secret = os.getenv('SECRET_KEY', 'your-secret-key')
                payload = jwt.decode(token, jwt_secret, algorithms=['HS256'])
                user_id = payload.get('user_id')
                
                if user_id:
                    logger.debug(f"✅ User authenticated via JWT: {user_id}")
                    return user_id
            except jwt.ExpiredSignatureError:
                logger.warning("JWT token expired")
            except jwt.InvalidTokenError as e:
                logger.warning(f"Invalid JWT token: {e}")
    
    logger.warning("❌ No valid authentication found")
    raise ValueError("User not authenticated")


def ensure_billing_customer(user_id: str):
    """Ensure billing customer record exists"""
    execute(
        "INSERT INTO billing_customers (user_id) VALUES (%s) ON CONFLICT (user_id) DO NOTHING",
        (user_id,),
        commit=True
    )


def get_plan(user_id: str) -> str:
    """Get user's subscription plan"""
    ensure_billing_customer(user_id)
    row = fetch_one("SELECT plan FROM user_entitlements WHERE user_id=%s", (user_id,))
    return (row or {}).get('plan', 'free')


def count_saves(user_id: str) -> int:
    """Count user's saved reels"""
    row = fetch_one("SELECT COUNT(*)::int AS c FROM reels WHERE user_id=%s", (user_id,))
    return int((row or {}).get('c', 0))
