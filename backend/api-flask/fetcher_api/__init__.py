from flask import Flask
from flask_cors import CORS
import logging

logger = logging.getLogger("init")

def create_app():
    app = Flask(__name__)

    # Global CORS for /api/*
    CORS(
        app,
        resources={r"/api/*": {"origins": "*"}},
        supports_credentials=True,
        allow_headers=["Content-Type", "Authorization"],
        methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    )

    logger.info("✅ Flask app created successfully")
    return app
