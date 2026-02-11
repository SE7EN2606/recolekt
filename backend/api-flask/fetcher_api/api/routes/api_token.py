# fetcher_api/api/routes/api_token.py
"""
API Token Routes - For iOS Shortcuts integration
"""
from flask import Blueprint, jsonify, request
from fetcher_api.adapters.db import execute, fetch_one
from fetcher_api.api.helpers.auth import get_user_id_from_request
from fetcher_api.utils.tokens import generate_api_token, get_token_prefix
import os
import logging
from datetime import datetime

logger = logging.getLogger('api_token')

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
            'prefix': get_token_prefix(result['token']),
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
    token_value = generate_api_token()
    
    execute(
        """
        INSERT INTO api_tokens (user_id, token, created_at, is_revoked)
        VALUES (%s, %s, NOW(), FALSE)
        """,
        (user_id, token_value),
        commit=True
    )
    
    logger.info(f"✅ Generated API token for user {user_id}: {get_token_prefix(token_value)}")
    
    return jsonify({
        'token': token_value,
        'prefix': get_token_prefix(token_value),
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
    
    logger.info(f"✅ Revoked API token for user {user_id}")
    
    return jsonify({'message': 'Token revoked successfully'})


@api_bp.route('/install-shortcut', methods=['GET'])
def install_shortcut():
    """
    Get user's API token and the universal iCloud shortcut link
    """
    try:
        user_id = get_user_id_from_request()
        
        # Get or create token
        token_row = fetch_one("""
            SELECT token FROM api_tokens 
            WHERE user_id = %s AND is_revoked = FALSE 
            ORDER BY created_at DESC 
            LIMIT 1
        """, (user_id,))
        
        if not token_row:
            token_value = generate_api_token()
            execute("""
                INSERT INTO api_tokens (user_id, token, created_at, is_revoked)
                VALUES (%s, %s, NOW(), FALSE)
            """, (user_id, token_value), commit=True)
            logger.info(f"✅ Auto-generated token for user {user_id}")
        else:
            token_value = token_row['token']
        
        # Universal iCloud shortcut link (same for everyone!)
        icloud_shortcut_url = os.getenv(
            'ICLOUD_SHORTCUT_URL',
            'https://www.icloud.com/shortcuts/YOUR_SHORTCUT_ID_HERE'
        )
        
        return jsonify({
            'success': True,
            'api_token': token_value,
            'shortcut_url': icloud_shortcut_url,
            'instructions': [
                'Tap "Get Shortcut" to install',
                'When prompted, paste your API token',
                'Done! Share any Instagram reel to Recolekt'
            ]
        })
        
    except Exception as e:
        logger.error(f"❌ Failed to get install info: {e}")
        return jsonify({"error": str(e)}), 500
