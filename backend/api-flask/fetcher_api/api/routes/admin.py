"""
Admin routes - cleanup and maintenance
"""
import logging
from flask import Blueprint, jsonify

from fetcher_api.adapters.db import execute, fetch_all
from fetcher_api.api.helpers.auth import get_user_id_from_request

logger = logging.getLogger("admin")

admin_bp = Blueprint("admin", __name__)


@admin_bp.route("/admin/cleanup_duplicates", methods=["POST"])
def cleanup_duplicates():
    """Remove duplicate entries by source_url"""
    try:
        user_id = get_user_id_from_request()
    except ValueError:
        return jsonify({"error": "Authentication required"}), 401
    
    sql = """
        DELETE FROM reels
        WHERE id IN (
            SELECT id FROM (
                SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id, source_url ORDER BY created_at DESC) as rn
                FROM reels
                WHERE user_id = %s
            ) t
            WHERE rn > 1
        )
        RETURNING id
    """
    
    deleted = fetch_all(sql, (user_id,))
    deleted_ids = [row[0] if not hasattr(row, 'keys') else row["id"] for row in deleted]
    
    logger.info(f"🧹 Cleaned {len(deleted_ids)} duplicate entries for user {user_id}")
    
    return jsonify({"cleaned": len(deleted_ids), "ids": deleted_ids})


@admin_bp.route("/user/preferences", methods=["PATCH"])
def update_user_preferences():
    """Update user preferences (language, dark mode)"""
    try:
        user_id = get_user_id_from_request()
        data = request.get_json()
        
        if "language" in data:
            execute("UPDATE users SET language = %s WHERE id = %s", (data["language"], user_id))
        
        if "darkMode" in data:
            execute("UPDATE users SET dark_mode = %s WHERE id = %s", (data["darkMode"], user_id))
        
        return jsonify({"success": True})
    
    except Exception as e:
        logger.error(f"Error saving prefs: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500
