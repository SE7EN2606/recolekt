# fetcher_api/api/routes/api_token.py
"""
API Token Routes - For iOS Shortcuts integration
"""
from flask import Blueprint, jsonify, request
from fetcher_api.adapters.db import execute, fetch_one
from fetcher_api.api.helpers.auth import get_user_id_from_request
import secrets
from datetime import datetime

api_bp = Blueprint('api_token', __name__, url_prefix='/api_token')

@api_bp.route('/info', methods=['GET'])
def get_token_info():
    """Check if user has an API token (without revealing it)"""
    try:
        user_id = get_user_id_from_request()
    except ValueError:
        return jsonify({"error": "Authentication required"}), 401
    
    result = fetch_one(
        "SELECT token, created_at, last_used_at FROM api_tokens WHERE user_id = %s AND is_revoked = FALSE",
        (user_id,)
    )
    
    if result:
        return jsonify({
            'has_token': True,
            'prefix': result['token'][:8] + '...',
            'created_at': result['created_at'].isoformat() if result['created_at'] else None,
            'last_used_at': result['last_used_at'].isoformat() if result['last_used_at'] else None
        })
    else:
        return jsonify({'has_token': False})

@api_bp.route('/generate', methods=['POST'])
def generate_token():
    """Generate a new API token for the user"""
    try:
        user_id = get_user_id_from_request()
    except ValueError:
        return jsonify({"error": "Authentication required"}), 401
    
    # Revoke any existing tokens
    execute(
        "UPDATE api_tokens SET is_revoked = TRUE WHERE user_id = %s",
        (user_id,),
        commit=True
    )
    
    # Generate new token
    token_value = secrets.token_urlsafe(32)
    
    execute(
        """
        INSERT INTO api_tokens (user_id, token, created_at, is_revoked)
        VALUES (%s, %s, NOW(), FALSE)
        """,
        (user_id, token_value),
        commit=True
    )
    
    return jsonify({
        'token': token_value,
        'prefix': token_value[:8] + '...',
        'message': 'Token generated successfully. Save it securely - it won\'t be shown again.'
    })

@api_bp.route('/revoke', methods=['POST'])
def revoke_token():
    """Revoke the user's API token"""
    try:
        user_id = get_user_id_from_request()
    except ValueError:
        return jsonify({"error": "Authentication required"}), 401
    
    execute(
        "UPDATE api_tokens SET is_revoked = TRUE WHERE user_id = %s AND is_revoked = FALSE",
        (user_id,),
        commit=True
    )
    
    return jsonify({'message': 'Token revoked successfully'})
