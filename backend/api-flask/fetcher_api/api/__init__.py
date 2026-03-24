# fetcher_api/api/__init__.py
from flask import Flask

def register_blueprints(app: Flask):
    from fetcher_api.api.routes import (
        main_bp,
        auth_bp,
        video_bp,
        reel_bp,
        billing_bp,
        admin_bp,
        api_bp,
        cleanup_bp,
        folders_bp,
    )
    from fetcher_api.api.routes.webhook import webhook_bp

    app.register_blueprint(main_bp, url_prefix="/api")
    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(video_bp, url_prefix="/api")
    app.register_blueprint(reel_bp, url_prefix="/api")
    app.register_blueprint(billing_bp, url_prefix="/api")
    app.register_blueprint(admin_bp, url_prefix="/api")
    app.register_blueprint(folders_bp)
    app.register_blueprint(api_bp)
    app.register_blueprint(cleanup_bp)
    app.register_blueprint(webhook_bp, url_prefix="/api")
