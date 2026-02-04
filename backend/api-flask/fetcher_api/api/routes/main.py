# fetcher_api/api/routes/main.py

"""
Main API routes - Health checks and simple queries
"""
import logging
from flask import Blueprint, jsonify

from fetcher_api.api.helpers.auth import get_user_id_from_request
from fetcher_api.api.routes.billing import _get_plan, _count_saves

logger = logging.getLogger("main")

main_bp = Blueprint("main", __name__)


@main_bp.route("/", methods=["GET"])
def root():
    """API health check"""
    return jsonify({"ok": True, "message": "Recolekt API active"})


@main_bp.route("/health", methods=["GET"])
def health():
    """Detailed health check"""
    return jsonify({
        "status": "healthy",
        "service": "recolekt-api",
        "version": "2.0.0"
    })


@main_bp.route("/plan", methods=["GET"])
def get_plan():
    """Get user's subscription plan"""
    try:
        user_id = get_user_id_from_request()
    except ValueError:
        return jsonify({"error": "Authentication required"}), 401
    
    plan = _get_plan(user_id)
    return jsonify({"plan": plan})


@main_bp.route("/saves/count", methods=["GET"])
def count_saves():
    """Get count of user's saved reels"""
    try:
        user_id = get_user_id_from_request()
    except ValueError:
        return jsonify({"error": "Authentication required"}), 401
    
    count = _count_saves(user_id)
    return jsonify({"count": count})
