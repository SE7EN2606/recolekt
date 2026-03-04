# fetcher_api/api/routes/__init__.py
"""
API Routes Package - All route blueprints
"""
from fetcher_api.api.routes.main import main_bp
from fetcher_api.api.routes.auth import auth_bp
from fetcher_api.api.routes.video import video_bp
from fetcher_api.api.routes.reel import reel_bp
from fetcher_api.api.routes.billing import billing_bp
from fetcher_api.api.routes.admin import admin_bp
from fetcher_api.api.routes.api_token import api_bp
from fetcher_api.api.routes.cleanup import cleanup_bp
from fetcher_api.api.routes.folders import folders_bp  # ✅ Added

__all__ = [
    'main_bp',
    'auth_bp',
    'video_bp',
    'reel_bp',
    'billing_bp',
    'admin_bp',
    'api_bp',
    'cleanup_bp',
    'folders_bp',  # ✅ Added
]
