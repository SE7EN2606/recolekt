# fetcher_api/api/routes/cleanup.py

"""
Cleanup job for stuck processing reels
"""
import logging
from datetime import datetime, timedelta
from flask import Blueprint, jsonify
from fetcher_api.api.helpers.auth import get_user_id_from_request, require_auth
from fetcher_api.db.neon_db import get_neon_pool

logger = logging.getLogger("cleanup")

cleanup_bp = Blueprint("cleanup", __name__)

@cleanup_bp.route("/api/cleanup/stuck-reels", methods=["POST"])
@require_auth
def cleanup_stuck_reels():
    """
    Mark reels stuck in 'processing' for >30 minutes as 'failed'
    """
    try:
        user_id = get_user_id_from_request()
        
        pool = get_neon_pool()
        
        with pool.connection() as conn:
            with conn.cursor() as cur:
                # Find stuck reels
                threshold = datetime.utcnow() - timedelta(minutes=30)
                
                cur.execute("""
                    SELECT id, source_url, created_at
                    FROM reels
                    WHERE user_id = %s
                      AND status = 'processing'
                      AND created_at < %s
                """, (user_id, threshold))
                
                stuck_reels = cur.fetchall()
                
                if not stuck_reels:
                    return jsonify({
                        "message": "No stuck reels found",
                        "cleaned": 0
                    }), 200
                
                # Mark as failed
                stuck_ids = [r[0] for r in stuck_reels]
                
                cur.execute("""
                    UPDATE reels
                    SET status = 'failed',
                        error_message = 'Processing timeout - please try again'
                    WHERE id = ANY(%s)
                """, (stuck_ids,))
                
                conn.commit()
                
                logger.info(f"✅ Cleaned up {len(stuck_ids)} stuck reels for user {user_id}")
                
                return jsonify({
                    "message": f"Cleaned up {len(stuck_ids)} stuck reels",
                    "cleaned": len(stuck_ids),
                    "reel_ids": stuck_ids
                }), 200
                
    except Exception as e:
        logger.error(f"❌ Error cleaning stuck reels: {e}")
        return jsonify({"error": "Failed to cleanup stuck reels"}), 500
