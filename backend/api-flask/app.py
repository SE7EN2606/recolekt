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


# PROXY FIX: Critical for Railway Load Balancer HTTPS detection
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
        "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
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
# Store on app so auth.py can access it without circular imports
app.extensions["oauth"] = oauth
logger.info("✅ OAuth initialized with Google provider")


# ============================================
# 7. BLUEPRINT REGISTRATION
# ============================================
from fetcher_api.api import register_blueprints
register_blueprints(app)

# NOTE: folders_bp is already registered inside register_blueprints()
# Do NOT register it again here.


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


# TEMP DEBUG — remove after Google login is fixed
@app.route("/debug/routes")
def debug_routes():
    routes = []
    for rule in app.url_map.iter_rules():
        if "google" in rule.rule or "auth" in rule.rule:
            routes.append(f"{rule.rule} -> {rule.endpoint} [{', '.join(rule.methods)}]")
    return jsonify({"auth_routes": sorted(routes), "total_rules": len(list(app.url_map.iter_rules()))})


# ============================================
# 9. ERROR HANDLER + FRONTEND SERVING
# ============================================
# We use a SINGLE error handler that doubles as the SPA catch-all.
# This approach NEVER shadows blueprint routes because it only runs
# when Flask has already determined no blueprint matched.

if not IS_LOCAL:
    base_dir = os.path.dirname(os.path.abspath(__file__))
    frontend_dir = os.path.join(base_dir, "frontend")

    # Explicit root route for serving index.html at /
    @app.route("/")
    def serve_root():
        return send_from_directory(frontend_dir, "index.html")

    @app.errorhandler(404)
    def handle_404(e):
        path = request.path.lstrip("/")

        # API paths that no blueprint matched → JSON 404
        if path.startswith("api/"):
            return jsonify({"error": "Not Found", "code": 404}), 404

        # Static frontend file (JS, CSS, images, fonts, etc.)
        if path and os.path.exists(os.path.join(frontend_dir, path)):
            return send_from_directory(frontend_dir, path)

        # SPA fallback — React Router handles client-side routing
        return send_from_directory(frontend_dir, "index.html")

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