from flask import Flask
import logging

logger = logging.getLogger("init")

def create_app():
    app = Flask(__name__)
    
    # ❌ REMOVED CORS from here - will be configured in app.py
    
    logger.info("✅ Flask app created successfully")
    return app
