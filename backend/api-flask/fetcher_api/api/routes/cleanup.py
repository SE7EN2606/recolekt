# fetcher_api/api/routes/cleanup.py

"""
Cleanup job for stuck processing reels
"""
import logging
from flask import Blueprint, jsonify
from fetcher_api.api.helpers.auth import get_user_id_from_request
from fetcher_api.services.processing_recovery import recover_stale_processing_reels

logger = logging.getLogger("cleanup")

cleanup_bp = Blueprint("cleanup", __name__)

@cleanup_bp.route("/api/cleanup/stuck-reels", methods=["POST"])
def cleanup_stuck_reels():
    """
    Mark stale 'processing' reels as error so users can retry.
    """
    try:
        # ✅ Get user_id (raises ValueError if not authenticated)
        try:
            user_id = get_user_id_from_request()
        except ValueError as e:
            logger.warning(f"❌ Unauthorized cleanup attempt: {e}")
            return jsonify({"error": "Not authenticated"}), 401
        
        recovery = recover_stale_processing_reels(user_id=user_id)
        logger.info("✅ Cleaned up %s stuck reels for user %s", recovery["cleaned"], user_id)
        
        return jsonify({
            "message": f"Cleaned up {recovery['cleaned']} stuck reels",
            "cleaned": recovery["cleaned"],
            "reel_ids": recovery["reel_ids"],
            "error_message": recovery["error_message"],
        }), 200
                
    except Exception as e:
        logger.error(f"❌ Error cleaning stuck reels: {e}")
        return jsonify({"error": "Failed to cleanup stuck reels"}), 500
