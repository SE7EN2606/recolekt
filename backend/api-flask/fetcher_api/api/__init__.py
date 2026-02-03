from flask import Blueprint
from .auth_routes import auth_bp, oauth
from .routes import api_bp
from .billing_routes import billing_bp

def register_blueprints(app):
    # Initialize OAuth with the app instance
    oauth.init_app(app)

    # Register blueprints
    app.register_blueprint(api_bp, url_prefix="/api")
    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(billing_bp, url_prefix="/api/billing")
