import os
import sys
from pathlib import Path
from dotenv import load_dotenv


# ============================================
# 1. ENVIRONMENT LOADING
# ============================================
IS_RAILWAY = bool(os.getenv("RAILWAY_ENVIRONMENT") or os.getenv("RAILWAY_PROJECT_ID"))
IS_DOCKER = os.path.exists("/app/.env") or IS_RAILWAY
IS_LOCAL = not IS_DOCKER


if IS_LOCAL:
    env_local = Path(__file__).parent / ".env.local"
    if env_local.exists():
        load_dotenv(env_local, override=True)
elif IS_DOCKER and not IS_RAILWAY:
    root_env = Path("/app/.env")
    if root_env.exists():
        load_dotenv(root_env, override=True)


import logging
import warnings
from datetime import datetime, timedelta
from flask import send_from_directory, request, jsonify, render_template
from flask_cors import CORS
from werkzeug.exceptions import HTTPException
from werkzeug.middleware.proxy_fix import ProxyFix


sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


warnings.filterwarnings("ignore")
os.environ["PYTHONWARNINGS"] = "ignore"
os.environ["TRANSFORMERS_OFFLINE"] = "1"


# ============================================
# 2. LOGGING CONFIG
# ============================================
werkzeug_log = logging.getLogger("werkzeug")
werkzeug_log.setLevel(logging.WARNING)


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("app")


# ============================================
# 3. FLASK APP INITIALIZATION
# ============================================
from fetcher_api import create_app


app = create_app()
if not app:
    raise RuntimeError("Flask app not created. Check fetcher_api/__init__.py.")


app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_port=1, x_prefix=1)


# ============================================
# 4. SESSION & COOKIE CONFIG
# ============================================
SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    raise RuntimeError("FATAL: SECRET_KEY not set in environment variables.")


app.config.update(
    SECRET_KEY=SECRET_KEY,
    SESSION_PERMANENT=True,
    PERMANENT_SESSION_LIFETIME=timedelta(days=7),
    SESSION_COOKIE_NAME="recolekt_auth_session",
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SECURE=True,
    SESSION_COOKIE_SAMESITE="None",
    SESSION_COOKIE_PATH="/",
    SESSION_COOKIE_DOMAIN=None,
)


app.template_folder = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "fetcher_api",
    "templates",
)


# ============================================
# 5. CORS CONFIGURATION
# ============================================
def _norm_origin(o: str) -> str:
    return (o or "").strip().rstrip("/")


if IS_LOCAL:
    cors_origins = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]
else:
    cors_origins = [
        "https://recolekt.app",
        "https://www.recolekt.app",
        "https://staging.recolekt.app",
        "https://recolekt-staging.up.railway.app",
    ]
    env_frontend = _norm_origin(os.getenv("FRONTEND_BASE_URL", ""))
    if env_frontend:
        cors_origins.append(env_frontend)


cors_origins = list(set(_norm_origin(o) for o in cors_origins if o))


CORS(
    app,
    resources={r"/*": {
        "origins": cors_origins,
        "methods": ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],  # ← PATCH added
        "allow_headers": "*",
        "supports_credentials": True,
        "expose_headers": ["Content-Type", "Authorization"]
    }},
    max_age=3600,
)


# ============================================
# 6. OAUTH INITIALIZATION
# ============================================
from authlib.integrations.flask_client import OAuth


oauth = OAuth(app)
oauth.register(
    name="google",
    client_id=os.getenv("GOOGLE_CLIENT_ID"),
    client_secret=os.getenv("GOOGLE_CLIENT_SECRET"),
    server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
    client_kwargs={"scope": "openid email profile"},
)
app.extensions["oauth"] = oauth
logger.info("✅ OAuth initialized with Google provider")


# ============================================
# 7. BLUEPRINT REGISTRATION
# ============================================
from fetcher_api.api import register_blueprints
register_blueprints(app)


# ============================================
# 8. UTILITY & ADMIN ROUTES
# ============================================
from fetcher_api.services.rate_monitor import get_mistral_limits


@app.route("/api/rate-limits", methods=["GET"])
def rate_limits():
    return jsonify(get_mistral_limits())


@app.route("/admin", methods=["GET"])
def admin_page():
    admin_key = (
        os.getenv("ADMIN_KEY") or
        os.getenv("ADMIN_SECRET") or
        "recolekt-admin-2026"
    ).strip()
    key = request.args.get("key", "").strip()
    logger.info(f"🔑 /admin: received={repr(key)} expected={repr(admin_key)} match={key == admin_key}")
    if key != admin_key:
        return render_template("admin_login.html"), 401
    return render_template("admin.html", admin_key=key)


# ============================================
# 9. ERROR HANDLER + FRONTEND SERVING
# ============================================
if not IS_LOCAL:
    base_dir = os.path.dirname(os.path.abspath(__file__))
    frontend_dir = os.path.join(base_dir, "frontend")


    @app.route("/")
    def serve_root():
        index_path = os.path.join(frontend_dir, "index.html")
        if os.path.exists(index_path):
            return send_from_directory(frontend_dir, "index.html")
        return jsonify({"status": "API running", "frontend": "not bundled"}), 200


    @app.errorhandler(404)
    def handle_404(e):
        path = request.path.lstrip("/")

        if path.startswith("api/"):
            return jsonify({"error": "Not Found", "code": 404}), 404

        if path and os.path.exists(os.path.join(frontend_dir, path)):
            return send_from_directory(frontend_dir, path)

        index_path = os.path.join(frontend_dir, "index.html")
        if os.path.exists(index_path):
            return send_from_directory(frontend_dir, "index.html")

        return jsonify({"error": "Not Found", "code": 404}), 404


    @app.errorhandler(Exception)
    def handle_error(e):
        if isinstance(e, HTTPException) and e.code == 404:
            return handle_404(e)
        code = 500
        message = str(e)
        if isinstance(e, HTTPException):
            code = e.code
            message = e.description
        logger.error("❌ Error %s: %s", code, message, exc_info=True)
        return jsonify({"error": message, "code": code}), code


else:
    @app.errorhandler(Exception)
    def handle_error(e):
        code = 500
        message = str(e)
        if isinstance(e, HTTPException):
            code = e.code
            message = e.description
        logger.error("❌ Error %s: %s", code, message, exc_info=True)
        return jsonify({"error": message, "code": code}), code


# ============================================
# 10. MAIN ENTRY POINT
# ============================================
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5001))
    app.run(host="0.0.0.0", port=port, debug=IS_LOCAL, threaded=True)
