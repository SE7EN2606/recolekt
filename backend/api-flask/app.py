import os
import sys
from pathlib import Path
from dotenv import load_dotenv


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
from datetime import timedelta
from flask import send_from_directory, request, jsonify, render_template
from flask_cors import CORS
from werkzeug.exceptions import HTTPException, NotFound
from werkzeug.middleware.proxy_fix import ProxyFix


sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

warnings.filterwarnings("ignore")
os.environ["PYTHONWARNINGS"] = "ignore"
os.environ["TRANSFORMERS_OFFLINE"] = "1"


werkzeug_log = logging.getLogger("werkzeug")
werkzeug_log.setLevel(logging.WARNING)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("app")


from fetcher_api import create_app


app = create_app()
if not app:
    raise RuntimeError("Flask app not created. Check fetcher_api/__init__.py.")

app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_port=1, x_prefix=1)


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


def _norm_origin(o: str) -> str:
    return (o or "").strip().rstrip("/")


if IS_LOCAL:
    cors_origins = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5001",
        "http://127.0.0.1:5001",
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
    resources={
        r"/*": {
            "origins": cors_origins,
            "methods": ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
            "allow_headers": "*",
            "supports_credentials": True,
            "expose_headers": ["Content-Type", "Authorization"],
        }
    },
    max_age=3600,
)


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


from fetcher_api.api import register_blueprints


register_blueprints(app)


from fetcher_api.services.rate_monitor import get_mistral_limits


@app.route("/api/rate-limits", methods=["GET"])
def rate_limits():
    return jsonify(get_mistral_limits())


@app.route("/admin", methods=["GET"])
def admin_page():
    admin_key = (
        os.getenv("ADMIN_KEY")
        or os.getenv("ADMIN_SECRET")
        or "recolekt-admin-2026"
    ).strip()
    key = request.args.get("key", "").strip()
    logger.info(
        "🔑 /admin: received=%r expected=%r match=%s",
        key,
        admin_key,
        key == admin_key,
    )
    if key != admin_key:
        return render_template("admin_login.html"), 401
    return render_template("admin.html", admin_key=key)


base_dir = os.path.dirname(os.path.abspath(__file__))
frontend_dir = os.path.join(base_dir, "frontend")


def _json_404():
    return jsonify({
        "error": "Not Found",
        "code": 404,
        "path": request.path,
        "method": request.method,
    }), 404


def _log_404():
    logger.warning(
        "❌ 404 %s %s qs=%r ref=%r ua=%r remote=%r",
        request.method,
        request.path,
        request.query_string.decode("utf-8", errors="ignore"),
        request.referrer,
        request.headers.get("User-Agent"),
        request.headers.get("X-Forwarded-For", request.remote_addr),
    )


@app.route("/")
def serve_root():
    if IS_LOCAL:
        return jsonify({"status": "API running", "mode": "local"}), 200

    index_path = os.path.join(frontend_dir, "index.html")
    if os.path.exists(index_path):
        return send_from_directory(frontend_dir, "index.html")
    return jsonify({"status": "API running", "frontend": "not bundled"}), 200


@app.errorhandler(NotFound)
def handle_404(e):
    _log_404()

    if IS_LOCAL:
        return _json_404()

    path = request.path.lstrip("/")

    if path.startswith("api/"):
        return _json_404()

    static_candidate = os.path.join(frontend_dir, path)
    if path and os.path.exists(static_candidate) and os.path.isfile(static_candidate):
        return send_from_directory(frontend_dir, path)

    index_path = os.path.join(frontend_dir, "index.html")
    if os.path.exists(index_path):
        return send_from_directory(frontend_dir, "index.html")

    return _json_404()


@app.errorhandler(Exception)
def handle_error(e):
    if isinstance(e, NotFound):
        return handle_404(e)

    code = 500
    message = str(e)

    if isinstance(e, HTTPException):
        code = e.code or 500
        message = e.description

    logger.error(
        "❌ Error %s on %s %s: %s",
        code,
        request.method,
        request.path,
        message,
        exc_info=True,
    )
    return jsonify({
        "error": message,
        "code": code,
        "path": request.path,
        "method": request.method,
    }), code


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5001))
    app.run(host="0.0.0.0", port=port, debug=IS_LOCAL, threaded=True)