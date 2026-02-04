# fetcher_api/__init__.py

import os
from flask import Flask
from werkzeug.middleware.proxy_fix import ProxyFix
import logging

logger = logging.getLogger("init")

def create_app():
    app = Flask(__name__)
    
    # ✅ Force HTTPS URLs in production (Railway/Cloud platforms)
    app.wsgi_app = ProxyFix(app.wsgi_app, x_proto=1, x_host=1)
    
    # ✅ Tell Flask to use HTTPS for url_for() when deployed
    if os.getenv('RAILWAY_ENVIRONMENT') or os.getenv('RAILWAY_PROJECT_ID'):
        app.config['PREFERRED_URL_SCHEME'] = 'https'
        logger.info("🔒 HTTPS scheme enabled for Railway deployment")
    
    logger.info("✅ Flask app created successfully")
    return app
