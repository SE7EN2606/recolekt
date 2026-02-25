# api-flask/app.py

# ============================================
# LOAD ENVIRONMENT VARIABLES FIRST
# ============================================
import os
import sys
from pathlib import Path
from dotenv import load_dotenv

# ✅ Detect environment: Railway > Docker > Local
IS_RAILWAY = bool(os.getenv("RAILWAY_ENVIRONMENT") or os.getenv("RAILWAY_PROJECT_ID"))
IS_DOCKER = os.path.exists("/app/.env") or IS_RAILWAY
IS_LOCAL = not IS_DOCKER

print(f"🔍 Environment: {'RAILWAY' if IS_RAILWAY else 'DOCKER' if IS_DOCKER else 'LOCAL DEVELOPMENT'}")

if IS_LOCAL:
    env_local = Path(__file__).parent / ".env.local"
    if env_local.exists():
        print(f"✅ Loading local environment: {env_local}")
        load_dotenv(env_local, override=True)
    else:
        print("⚠️ WARNING: .env.local not found in local mode!")
elif IS_DOCKER and not IS_RAILWAY:
    ROOT_ENV = Path("/app/.env")
    if ROOT_ENV.exists():
        print(f"✅ Loading production environment: {ROOT_ENV}")
        load_dotenv(ROOT_ENV, override=True)

# ============================================
# NOW IMPORT EVERYTHING ELSE
# ============================================
import logging
import warnings
import tempfile
import subprocess
from datetime import datetime, timedelta

from flask import send_from_directory, request, jsonify, render_template
from flask_cors import CORS
from werkzeug.exceptions import HTTPException
from werkzeug.middleware.proxy_fix import ProxyFix
import requests
import numpy as np
from PIL import Image

from google.cloud import vision

# Add backend root to Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

os.environ.setdefault("MISTRAL_API_KEY", os.getenv("MISTRAL_API_KEY", ""))

warnings.filterwarnings("ignore")
os.environ["PYTHONWARNINGS"] = "ignore"
os.environ["TRANSFORMERS_OFFLINE"] = "1"

from fetcher_api.services.ai_service import ai_service

# -------------------------------------------------
# ⚙️ Flask setup
# -------------------------------------------------
from fetcher_api import create_app

app = create_app()
if not app:
    raise RuntimeError("Flask app not created. Check fetcher_api/__init__.py.")

# ✅ Tell Flask where templates live
app.template_folder = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fetcher_api", "templates")

# ✅ Tell Flask it's behind a secure Railway load balancer
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_prefix=1)

# -------------------------------------------------
# 🧾 Logging
# -------------------------------------------------
werkzeug_log = logging.getLogger("werkzeug")
werkzeug_log.setLevel(logging.WARNING)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger(__name__)

# -------------------------------------------------
# Configure Native Flask Session
# -------------------------------------------------
app.config["SECRET_KEY"] = os.getenv("SECRET_KEY", "your-secret-key-change-in-production")
app.config["SESSION_PERMANENT"] = True
app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(days=7)
app.config["SESSION_COOKIE_NAME"] = "recolekt_session"
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SECURE"] = not IS_LOCAL
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
app.config["SESSION_COOKIE_PATH"] = "/"

# -------------------------------------------------
# 🌐 CORS - Environment-aware
# -------------------------------------------------
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
    env_frontend = _norm_origin(os.getenv("FRONTEND_BASE_URL", ""))
    cors_origins = [
        "https://recolekt.app",
        "https://www.recolekt.app",
    ]
    if env_frontend:
        cors_origins.append(env_frontend)

cors_origins = sorted({ _norm_origin(o) for o in cors_origins if _norm_origin(o) })

CORS(
    app,
    origins=cors_origins,
    supports_credentials=True,
    allow_headers=["Content-Type", "Authorization", "Cache-Control", "Pragma"],
    expose_headers=["Set-Cookie", "Content-Type"],
    methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    max_age=3600
)

# -------------------------------------------------
# 🔐 Initialize OAuth
# -------------------------------------------------
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

# -------------------------------------------------
# Register all blueprints
# -------------------------------------------------
from fetcher_api.api import register_blueprints
register_blueprints(app)

# ============================================
# 🚀 Rate Limits Endpoint
# ============================================
from fetcher_api.services.rate_monitor import get_mistral_limits

@app.route("/api/rate-limits", methods=["GET"])
def rate_limits():
    """Control panel: current Mistral rate limit status."""
    return jsonify(get_mistral_limits())

# ============================================
# 🔐 ADMIN API ENDPOINT
# ============================================
ADMIN_SECRET = os.getenv("ADMIN_SECRET", "change-me-in-env")

@app.route("/api/admin/dashboard", methods=["GET"])
def admin_dashboard():
    """Super admin dashboard JSON - protected by secret key."""
    key = request.args.get("key", "")
    if key != ADMIN_SECRET:
        return jsonify({"error": "Unauthorized"}), 401

    from fetcher_api.services.usage_tracker import get_usage
    from fetcher_api.adapters.db import get_db_connection

    usage = get_usage()
    limits = get_mistral_limits()

    total_users = active_users_today = total_reels = reels_today = "n/a"
    last_reel_at = None
    newest_users = []

    try:
        with get_db_connection() as conn:
            cur = conn.cursor()

            cur.execute("SELECT COUNT(*) FROM users")
            total_users = cur.fetchone()[0]

            cur.execute("""
                SELECT COUNT(DISTINCT user_id) FROM reels
                WHERE created_at >= NOW() - INTERVAL '24 hours'
            """)
            active_users_today = cur.fetchone()[0]

            cur.execute("SELECT COUNT(*) FROM reels")
            total_reels = cur.fetchone()[0]

            cur.execute("""
                SELECT COUNT(*) FROM reels
                WHERE created_at >= NOW() - INTERVAL '24 hours'
            """)
            reels_today = cur.fetchone()[0]

            cur.execute("SELECT MAX(created_at) FROM reels")
            last_reel_at = cur.fetchone()[0]
            if last_reel_at:
                last_reel_at = last_reel_at.isoformat()

            cur.execute("""
                SELECT email, created_at FROM users
                ORDER BY created_at DESC LIMIT 5
            """)
            rows = cur.fetchall()
            newest_users = [{"email": r[0], "joined": r[1].isoformat()} for r in rows]

            cur.close()

    except Exception as e:
        logger.error("Admin DB query failed: %s", e)

    return jsonify({
        "status": "online",
        "environment": "RAILWAY" if IS_RAILWAY else "LOCAL",
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "mistral": {
            "calls_today": usage["calls_today"],
            "calls_total": usage["calls_total"],
            "estimated_remaining": max(0, 200 - usage["calls_today"]),
            "tokens_estimated_today": usage["tokens_estimated_today"],
            "remaining_tokens_month": limits.get("remaining_tokens_month"),
            "errors_today": usage["errors_today"],
            "last_call_at": usage["last_call_at"],
        },
        "users": {
            "total": total_users,
            "active_today": active_users_today,
            "newest": newest_users,
        },
        "reels": {
            "total": total_reels,
            "processed_today": reels_today,
            "last_processed_at": last_reel_at,
        },
        "server": {
            "extractor_version": "universal-v15-guides",
            "python_version": sys.version.split(" ")[0],
        },
    })


# ============================================
# 📧 ADMIN DAILY DIGEST ENDPOINT
# ============================================
DIGEST_SECRET = os.getenv("ADMIN_DIGEST_SECRET", "")

@app.route("/api/admin/digest", methods=["POST", "GET"])
def admin_digest():
    """Trigger daily digest email — protected by ADMIN_DIGEST_SECRET."""
    secret = request.args.get("secret", "") or request.headers.get("X-Cron-Secret", "")
    if not DIGEST_SECRET or secret != DIGEST_SECRET:
        return jsonify({"error": "Unauthorized"}), 401

    try:
        from fetcher_api.services.digest import get_daily_stats, send_admin_digest_email
        stats = get_daily_stats()
        sent = send_admin_digest_email(stats)
        return jsonify({
            "status": "ok" if sent else "email_failed",
            "stats": stats,
        })
    except Exception as e:
        logger.error("Digest failed: %s", e)
        return jsonify({"error": str(e)}), 500


# ============================================
# 🖥️ ADMIN HTML PAGE
# ============================================
@app.route("/admin", methods=["GET"])
def admin_page():
    """Visual admin dashboard - protected by secret key."""
    key = request.args.get("key", "")
    if key != ADMIN_SECRET:
        return render_template("admin_login.html"), 401
    return render_template("admin.html", admin_key=key)

# -------------------------------------------------
# ✅ Global Error Handlers
# -------------------------------------------------
@app.errorhandler(Exception)
def handle_error(e):
    code = 500
    message = str(e)
    error_type = type(e).__name__

    if isinstance(e, HTTPException):
        code = e.code
        message = e.description

    logger.error(f"❌ Error {code} ({error_type}): {message}", exc_info=True)
    return jsonify({"error": message, "code": code, "type": error_type}), code

@app.errorhandler(404)
def not_found(e):
    return jsonify({"error": "Endpoint not found", "code": 404, "path": request.path}), 404

# -------------------------------------------------
# 🔎 OCR helpers
# -------------------------------------------------
def _download_to_file(url: str, out_path: str, timeout: int = 30) -> None:
    r = requests.get(url, stream=True, timeout=timeout)
    r.raise_for_status()
    with open(out_path, "wb") as f:
        for chunk in r.iter_content(chunk_size=1024 * 1024):
            if chunk:
                f.write(chunk)

def _run_ffmpeg_extract_frames(video_path: str, out_dir: str, times) -> list:
    frame_paths = []
    for i, t in enumerate(times):
        frame_path = os.path.join(out_dir, f"frame_{i}.jpg")
        cmd = [
            "ffmpeg", "-hide_banner", "-loglevel", "error",
            "-ss", str(t), "-i", video_path,
            "-frames:v", "1", "-q:v", "2", frame_path,
        ]
        subprocess.run(cmd, check=True)
        frame_paths.append(frame_path)
    return frame_paths

def _image_to_gray_array(path: str, max_size: int = 640) -> np.ndarray:
    img = Image.open(path).convert("RGB")
    w, h = img.size
    scale = min(1.0, max_size / max(w, h))
    if scale < 1.0:
        img = img.resize((int(w * scale), int(h * scale)))
    gray = img.convert("L")
    arr = np.asarray(gray, dtype=np.float32) / 255.0
    return arr

def _mean_abs_diff(a: np.ndarray, b: np.ndarray) -> float:
    if a.shape != b.shape:
        h, w = min(a.shape[0], b.shape[1]), min(a.shape[1], b.shape[1])
        a, b = a[:h, :w], b[:h, :w]
    return float(np.mean(np.abs(a - b)))

def _is_static_frames(frame_paths: list, diff_threshold: float = 0.01):
    arrays = [_image_to_gray_array(p) for p in frame_paths]
    diffs = []
    for i in range(len(arrays) - 1):
        diffs.append(_mean_abs_diff(arrays[i], arrays[i + 1]))
    is_static = all(d <= diff_threshold for d in diffs)
    return is_static, {"diffs": diffs, "threshold": diff_threshold}

def _vision_ocr_from_bytes(image_bytes: bytes, mode: str = "document") -> str:
    client = vision.ImageAnnotatorClient()
    image = vision.Image(content=image_bytes)

    mode = (mode or "document").lower().strip()
    if mode == "text":
        response = client.text_detection(image=image)
        texts = response.text_annotations
        ocr_text = texts[0].description if texts else ""
    else:
        response = client.document_text_detection(image=image)
        ocr_text = response.full_text_annotation.text if response.full_text_annotation else ""

    if response.error.message:
        raise RuntimeError(response.error.message)
    return (ocr_text or "").strip()

# -------------------------------------------------
# 🧾 OCR endpoint
# -------------------------------------------------
@app.route("/api/ocr", methods=["POST", "OPTIONS"])
def api_ocr():
    if request.method == "OPTIONS":
        return "", 200

    payload = request.get_json(silent=True) or {}
    thumbnail_url = (payload.get("thumbnail_url") or "").strip()
    video_url = (payload.get("video_url") or "").strip()
    mode = (payload.get("mode") or "document").strip()
    force_ocr = bool(payload.get("force_ocr", False))

    if not thumbnail_url and not video_url:
        return jsonify({"error": "Provide thumbnail_url or video_url"}), 400

    try:
        with tempfile.TemporaryDirectory() as tmp:
            if thumbnail_url and not video_url:
                img_path = os.path.join(tmp, "thumb.jpg")
                _download_to_file(thumbnail_url, img_path)
                with open(img_path, "rb") as f:
                    ocr_text = _vision_ocr_from_bytes(f.read(), mode=mode)
                return jsonify({"is_static": True, "ocr_text": ocr_text, "used_source": "thumbnail"})

            video_path = os.path.join(tmp, "input.mp4")
            _download_to_file(video_url, video_path)
            frames_dir = os.path.join(tmp, "frames")
            os.makedirs(frames_dir, exist_ok=True)

            times = [0.2, 1.0, 2.0]
            frame_paths = _run_ffmpeg_extract_frames(video_path, frames_dir, times)
            is_static, dbg = _is_static_frames(frame_paths, diff_threshold=0.01)

            if not is_static and not force_ocr:
                return jsonify({"is_static": False, "ocr_text": "", "used_source": "frame", "debug": dbg})

            chosen = frame_paths[1]
            with open(chosen, "rb") as f:
                ocr_text = _vision_ocr_from_bytes(f.read(), mode=mode)

            return jsonify({"is_static": is_static, "ocr_text": ocr_text, "used_source": "frame", "debug": dbg})

    except Exception as e:
        logger.exception("OCR failed")
        return jsonify({"error": f"OCR failed: {e}"}), 500

# -------------------------------------------------
# 🎨 Serve frontend (production only)
# -------------------------------------------------
if not IS_LOCAL:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    FRONTEND_DIR = os.path.join(BASE_DIR, "frontend")

    @app.route("/")
    def index():
        return send_from_directory(FRONTEND_DIR, "index.html")

    @app.route("/frontend/<path:path>")
    def frontend_static(path):
        return send_from_directory(FRONTEND_DIR, path)

# -------------------------------------------------
# 🚀 Entry point
# -------------------------------------------------
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5001))
    app.run(host="0.0.0.0", port=port, debug=IS_LOCAL, threaded=True)
