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
import hashlib
import tempfile
from datetime import datetime, timedelta

from flask import send_from_directory, request, jsonify, render_template
from flask_cors import CORS
from werkzeug.exceptions import HTTPException
from werkzeug.middleware.proxy_fix import ProxyFix
import requests
from google.cloud import vision

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

# ✅ THE CORS INTERCEPTOR: This forces perfectly formatted headers on all preflight requests 
# and overrides the broken manual `OPTIONS` handlers in your blueprint files!
@app.before_request
def intercept_options():
    if request.method == "OPTIONS":
        from flask import jsonify
        response = jsonify({"ok": True})
        origin = request.headers.get("Origin")
        if origin:
            response.headers.add("Access-Control-Allow-Origin", origin)
            response.headers.add("Access-Control-Allow-Credentials", "true")
        
        response.headers.add("Access-Control-Allow-Headers", "Content-Type, Authorization, Cache-Control, Pragma")
        response.headers.add("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        return response, 200

# ✅ PROXY FIX: Critical for Railway Load Balancer HTTPS detection
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_port=1, x_prefix=1)

# ============================================
# 4. SESSION & COOKIE CONFIG (THE FIX)
# ============================================
# Ensure SECRET_KEY is stable from Railway env
SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    # If missing, we force a crash so you know it's misconfigured in Railway
    raise RuntimeError("FATAL: SECRET_KEY not set in Railway environment variables.")

app.config.update(
    SECRET_KEY=SECRET_KEY,
    SESSION_PERMANENT=True,
    PERMANENT_SESSION_LIFETIME=timedelta(days=7),
    SESSION_COOKIE_NAME="recolekt_auth_session",
    SESSION_COOKIE_HTTPONLY=True,
    # ✅ CRITICAL: SameSite=None + Secure=True is required for Google OAuth redirects
    SESSION_COOKIE_SECURE=True,
    SESSION_COOKIE_SAMESITE="None",
    SESSION_COOKIE_PATH="/",
    # Letting Domain default to None is safer for subdomains
    SESSION_COOKIE_DOMAIN=None, 
)

# Template folder for admin pages
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
    ]
    env_frontend = _norm_origin(os.getenv("FRONTEND_BASE_URL", ""))
    if env_frontend:
        cors_origins.append(env_frontend)

cors_origins = list(set(_norm_origin(o) for o in cors_origins if o))

# ✅ FIXED: Adding resources={r"/*":...} ensures CORS headers are attached even to 404/500 errors!
CORS(
    app,
    resources={r"/*": {"origins": cors_origins}},
    supports_credentials=True,
    allow_headers=["Content-Type", "Authorization", "Cache-Control", "Pragma"],
    expose_headers=["Set-Cookie"],
    methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
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
app.config["oauth"] = oauth
logger.info("✅ OAuth initialized with Google provider")

# ============================================
# 7. BLUEPRINT REGISTRATION
# ============================================
from fetcher_api.api import register_blueprints
register_blueprints(app)

# ✅ EXPLICITLY REGISTER FOLDERS: Prevents the 404 "Missing Route" CORS illusion
try:
    from fetcher_api.api.routes.folders import folders_bp
    # check if not already registered by register_blueprints
    if 'folders' not in app.blueprints:
        app.register_blueprint(folders_bp)
        logger.info("✅ Folders blueprint registered explicitly")
except Exception as e:
    logger.error(f"❌ Failed to register folders blueprint: {e}")

# ============================================
# 8. UTILITY & ADMIN ROUTES
# ============================================
from fetcher_api.services.rate_monitor import get_mistral_limits

@app.route("/api/rate-limits", methods=["GET"])
def rate_limits():
    return jsonify(get_mistral_limits())

ADMIN_SECRET = os.getenv("ADMIN_SECRET", "change-me-in-env")

@app.route("/api/admin/dashboard", methods=["GET"])
def admin_dashboard():
    key = request.args.get("key", "")
    if key != ADMIN_SECRET:
        return jsonify({"error": "Unauthorized"}), 401

    from fetcher_api.services.usage_tracker import get_usage
    from fetcher_api.adapters.db import get_db_connection

    usage = get_usage()
    limits = get_mistral_limits()

    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("SELECT COUNT(*) FROM users")
            total_users = cur.fetchone()[0]
            cur.execute("SELECT COUNT(DISTINCT user_id) FROM reels WHERE created_at >= NOW() - INTERVAL '24 hours'")
            active_users_today = cur.fetchone()[0]
            cur.execute("SELECT COUNT(*) FROM reels")
            total_reels = cur.fetchone()[0]
            cur.execute("SELECT COUNT(*) FROM reels WHERE created_at >= NOW() - INTERVAL '24 hours'")
            reels_today = cur.fetchone()[0]
            cur.execute("SELECT MAX(created_at) FROM reels")
            last_reel_at = cur.fetchone()[0]
            if last_reel_at:
                last_reel_at = last_reel_at.isoformat()
            cur.execute("SELECT email, created_at FROM users ORDER BY created_at DESC LIMIT 5")
            newest_users = [{"email": r[0], "joined": r[1].isoformat()} for r in cur.fetchall()]
            cur.close()
    except Exception as e:
        logger.error("Admin DB query failed: %s", e)
        total_users = active_users_today = total_reels = reels_today = "n/a"
        last_reel_at = None
        newest_users = []

    return jsonify({
        "status": "online",
        "environment": "RAILWAY" if IS_RAILWAY else "LOCAL",
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "mistral": {
            "calls_today": usage.get("calls_today"),
            "tokens_estimated_today": usage.get("tokens_estimated_today"),
            "errors_today": usage.get("errors_today"),
            "limits": limits,
        },
        "users": {"total": total_users, "active_today": active_users_today, "newest": newest_users},
        "reels": {"total": total_reels, "processed_today": reels_today, "last_processed_at": last_reel_at},
    })

@app.route("/admin", methods=["GET"])
def admin_page():
    key = request.args.get("key", "")
    if key != ADMIN_SECRET:
        return render_template("admin_login.html"), 401
    return render_template("admin.html", admin_key=key)

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
# 9. FRONTEND SERVING (PRODUCTION)
# ============================================
if not IS_LOCAL:
    base_dir = os.path.dirname(os.path.abspath(__file__))
    frontend_dir = os.path.join(base_dir, "frontend")

    @app.route("/", defaults={"path": ""})
    @app.route("/<path:path>")
    def serve(path):
        if path.startswith("api/"):
            return jsonify({"error": "Not Found"}), 404
        if path != "" and os.path.exists(os.path.join(frontend_dir, path)):
            return send_from_directory(frontend_dir, path)
        return send_from_directory(frontend_dir, "index.html")

# ============================================
# 10. MAIN ENTRY POINT
# ============================================
if __name__ == "__main__":
    # ✅ FIXED: Default to 5001 so it perfectly matches your React frontend config!
    port = int(os.environ.get("PORT", 5001))
    app.run(host="0.0.0.0", port=port, debug=IS_LOCAL, threaded=True)
