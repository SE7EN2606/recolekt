# fetcher_api/api/routes.py

"""
Main API routes - Simple endpoints and health checks
"""
import logging
from flask import Blueprint, jsonify

from fetcher_api.adapters.db import fetch_one
from fetcher_api.api.helpers.auth import get_user_id_from_request

logger = logging.getLogger("api")

api_bp = Blueprint("api", __name__)


@api_bp.route("/", methods=["GET"])
def root():
    """API health check"""
    return jsonify({"ok": True, "message": "Recolekt API active"})


@api_bp.route("/health", methods=["GET"])
def health():
    """Detailed health check"""
    return jsonify({
        "status": "healthy",
        "service": "recolekt-api",
        "version": "2.0.0"
    })


@api_bp.route("/plan", methods=["GET"])
def get_plan():
    """Get user's subscription plan"""
    try:
        user_id = get_user_id_from_request()
    except ValueError:
        return jsonify({"error": "Authentication required"}), 401
    
    row = fetch_one("SELECT plan FROM user_entitlements WHERE user_id=%s", (user_id,))
    plan = (row or {}).get("plan", "free")
    
    return jsonify({"plan": plan})


@api_bp.route("/saves/count", methods=["GET"])
def count_saves():
    """Get count of user's saved reels"""
    try:
        user_id = get_user_id_from_request()
    except ValueError:
        return jsonify({"error": "Authentication required"}), 401
    
    row = fetch_one("SELECT COUNT(*)::int AS c FROM reels WHERE user_id=%s", (user_id,))
    count = int((row or {}).get("c", 0))
    
    return jsonify({"count": count})
