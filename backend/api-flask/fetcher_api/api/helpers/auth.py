# fetcher_api/api/helpers/auth.py

import os
import logging
from flask import session, request
from fetcher_api.adapters.db import execute, fetch_one

logger = logging.getLogger('auth')

def get_user_id_from_request():
    """
    Get user_id from:
    1) Flask session (web app)
    2) Authorization: Bearer <jwt> (React frontend)
    3) Authorization: Bearer <api_token> (API clients)

    Raises ValueError if not authenticated.
    """
    # -------------------------------------------------
    # 1) Try session first (browser/web app)
    # -------------------------------------------------
    user_id = session.get('user_id')
    if user_id:
        logger.debug(f"✅ User authenticated via session: {user_id}")
        return user_id

    # -------------------------------------------------
    # 2) Try Authorization header
    # -------------------------------------------------
    auth_header = request.headers.get('Authorization', '') or ''
    if auth_header.startswith('Bearer '):
        token = auth_header.replace('Bearer ', '').strip()

        if token:
            # 2a) FIRST: Check if it is a JWT (Fast, stateless, no DB query)
            # JWTs consist of 3 base64url encoded parts separated by dots.
            if len(token.split('.')) == 3:
                try:
                    import jwt
                    jwt_secret = os.getenv('SECRET_KEY', 'your-secret-key')
                    payload = jwt.decode(token, jwt_secret, algorithms=['HS256'])
                    jwt_user_id = payload.get('user_id')

                    if jwt_user_id:
                        logger.info(f"✅ User authenticated via JWT: {jwt_user_id}")
                        return jwt_user_id
                except jwt.ExpiredSignatureError:
                    logger.warning("⚠️ JWT token has expired.")
                except Exception as e:
                    logger.warning(f"⚠️ JWT decode error: {e}")

            # 2b) SECOND: check api_tokens table (plain text tokens)
            try:
                row = fetch_one(
                    """
                    SELECT user_id
                    FROM api_tokens
                    WHERE token = %s AND is_revoked = FALSE
                    """,
                    (token,)
                )
                
                if row and row.get('user_id'):
                    api_user_id = row['user_id']

                    # Update last_used_at safely
                    try:
                        execute(
                            "UPDATE api_tokens SET last_used_at = NOW() WHERE token = %s",
                            (token,),
                            commit=True
                        )
                    except Exception as e:
                        logger.warning(f"⚠️ Failed to update last_used_at: {e}")

                    logger.info(f"✅ User authenticated via API token (api_tokens): {api_user_id}")
                    return api_user_id
            except Exception as e:
                logger.warning(f"⚠️ API token lookup failed: {e}")

            # 2c) THIRD: check user_api_tokens table (hashed tokens)
            try:
                from fetcher_api.utils.tokens import hash_token
                token_hash = hash_token(token)
                
                row = fetch_one(
                    """
                    SELECT user_id
                    FROM user_api_tokens
                    WHERE token_hash = %s AND is_active = TRUE
                    """,
                    (token_hash,)
                )
                
                if row and row.get('user_id'):
                    api_user_id = row['user_id']

                    # Update last_used_at safely
                    try:
                        execute(
                            "UPDATE user_api_tokens SET last_used_at = NOW() WHERE token_hash = %s",
                            (token_hash,),
                            commit=True
                        )
                    except Exception as e:
                        logger.warning(f"⚠️ Failed to update last_used_at: {e}")

                    logger.info(f"✅ User authenticated via API token (user_api_tokens): {api_user_id}")
                    return api_user_id
            except Exception as e:
                logger.warning(f"⚠️ Hashed API token lookup failed: {e}")

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
