# fetcher_api/api/__init__.py
"""
API Package - Register all route blueprints
"""
from flask import Flask


def register_blueprints(app: Flask):
    """Register all API blueprints with /api prefix"""
    
    from fetcher_api.api.routes import (
        main_bp,
        auth_bp,
        video_bp,
        reel_bp,
        billing_bp,
        admin_bp,
        api_bp,
        cleanup_bp,
    )
    
    # Register all blueprints
    app.register_blueprint(main_bp, url_prefix="/api")
    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(video_bp, url_prefix="/api")
    app.register_blueprint(reel_bp, url_prefix="/api")
    app.register_blueprint(billing_bp, url_prefix="/api")
    app.register_blueprint(admin_bp, url_prefix="/api")
    app.register_blueprint(api_bp)  # ✅ Already has /api_token prefix
    app.register_blueprint(cleanup_bp)  # ✅ Already has /api prefix in routes
