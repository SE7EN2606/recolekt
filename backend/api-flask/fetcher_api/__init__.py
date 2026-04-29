import os
import logging

from flask import Flask
from werkzeug.middleware.proxy_fix import ProxyFix

from fetcher_api.api import register_blueprints

logger = logging.getLogger("init")


def create_app():
    app = Flask(__name__)

    app.wsgi_app = ProxyFix(app.wsgi_app, x_proto=1, x_host=1)

    if os.getenv("RAILWAY_ENVIRONMENT") or os.getenv("RAILWAY_PROJECT_ID"):
        app.config["PREFERRED_URL_SCHEME"] = "https"
        logger.info("HTTPS scheme enabled for Railway deployment")

    from fetcher_api.utils.geocode import geocode_bp
    app.register_blueprint(geocode_bp, url_prefix="/api")

    register_blueprints(app)

    logger.info("Flask app created successfully")
    return app