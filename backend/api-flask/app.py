# api-flask/app.py


# ============================================
# LOAD ENVIRONMENT VARIABLES FIRST
# ============================================
import os
import sys
from pathlib import Path
from dotenv import load_dotenv

# ✅ Detect environment: Railway > Docker > Local
IS_RAILWAY = bool(os.getenv('RAILWAY_ENVIRONMENT') or os.getenv('RAILWAY_PROJECT_ID'))
IS_DOCKER = os.path.exists("/app/.env") or IS_RAILWAY
IS_LOCAL = not IS_DOCKER

print(f"🔍 Environment: {'RAILWAY' if IS_RAILWAY else 'DOCKER' if IS_DOCKER else 'LOCAL DEVELOPMENT'}")
print(f"🔍 RAILWAY_ENVIRONMENT: {os.getenv('RAILWAY_ENVIRONMENT', 'Not set')}")
print(f"🔍 RAILWAY_PROJECT_ID: {os.getenv('RAILWAY_PROJECT_ID', 'Not set')[:20] if os.getenv('RAILWAY_PROJECT_ID') else 'Not set'}...")

if IS_LOCAL:
    # Load .env.local for local development
    env_local = Path(__file__).parent / '.env.local'
    if env_local.exists():
        print(f"✅ Loading local environment: {env_local}")
        load_dotenv(env_local, override=True)
    else:
        print("⚠️ WARNING: .env.local not found in local mode!")
elif IS_DOCKER and not IS_RAILWAY:
    # Production Docker: Load /app/.env
    ROOT_ENV = Path("/app/.env")
    if ROOT_ENV.exists():
        print(f"✅ Loading production environment: {ROOT_ENV}")
        load_dotenv(ROOT_ENV, override=True)
else:
    print("✅ Railway detected - using environment variables from Railway dashboard")

# Verify critical variables
print(f"🔍 DATABASE_URL: {'✅ Set' if os.getenv('DATABASE_URL') else '❌ Missing'}")
print(f"🔍 MISTRAL_API_KEY: {'✅ Set' if os.getenv('MISTRAL_API_KEY') else '❌ Missing'}")
print(f"🔍 FRONTEND_BASE_URL: {os.getenv('FRONTEND_BASE_URL', 'Not set')}")

# ============================================
# NOW IMPORT EVERYTHING ELSE
# ============================================
import logging
import warnings
import tempfile
import subprocess
from datetime import timedelta

from flask import Flask, send_from_directory, request, jsonify
from flask_cors import CORS
from flask_session import Session
from werkzeug.exceptions import HTTPException
import requests
import numpy as np
from PIL import Image

from google.cloud import vision

# Add backend root to Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Set Mistral API key
os.environ.setdefault("MISTRAL_API_KEY", os.getenv("MISTRAL_API_KEY", ""))

warnings.filterwarnings("ignore")
os.environ["PYTHONWARNINGS"] = "ignore"
os.environ["TRANSFORMERS_OFFLINE"] = "1"

# -------------------------------------------------
# 🧠 Import AI Service
# -------------------------------------------------
print("Python executable:", sys.executable)
for p in sys.path[:3]:
    print("   ", p)

from fetcher_api.services.ai_service import ai_service

print("DEBUG: Using AI Service")
print("AIService class:", ai_service.__class__)
print("Has analyze_content:", hasattr(ai_service, "analyze_content"))

# -------------------------------------------------
# ⚙️ Flask setup
# -------------------------------------------------
from fetcher_api import create_app
from fetcher_api.api import register_blueprints

app = create_app()
if not app:
    raise RuntimeError("Flask app not created. Check fetcher_api/__init__.py.")

# Configure session
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'your-secret-key-change-in-production')
app.config['SESSION_TYPE'] = 'filesystem'
app.config['SESSION_FILE_DIR'] = '/tmp/flask_session'
app.config['SESSION_PERMANENT'] = True
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(days=7)
app.config['SESSION_COOKIE_NAME'] = 'recolekt_session'
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SECURE'] = not IS_LOCAL
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['SESSION_COOKIE_DOMAIN'] = None
app.config['SESSION_COOKIE_PATH'] = '/'
app.config['SESSION_REFRESH_EACH_REQUEST'] = False

# Initialize Flask-Session
Session(app)

# -------------------------------------------------
# 🔐 Initialize OAuth BEFORE registering blueprints
# -------------------------------------------------
from authlib.integrations.flask_client import OAuth

oauth = OAuth(app)
oauth.register(
    name='google',
    client_id=os.getenv('GOOGLE_CLIENT_ID'),
    client_secret=os.getenv('GOOGLE_CLIENT_SECRET'),
    server_metadata_url='https://accounts.google.com/.well-known/openid-configuration',
    client_kwargs={'scope': 'openid email profile'}
)

# Store oauth in app config so routes can access it
app.config['oauth'] = oauth
logger.info("✅ OAuth initialized with Google provider")

# Register all blueprints AFTER OAuth initialization
from fetcher_api.api import register_blueprints
register_blueprints(app)

# -------------------------------------------------
# 🔍 Environment Variables Check
# -------------------------------------------------

print("=" * 50)
print("🔍 Environment Variables Check:")
google_client_id = os.getenv('GOOGLE_CLIENT_ID', 'NOT SET')
google_secret = os.getenv('GOOGLE_CLIENT_SECRET', 'NOT SET')
flask_secret = os.getenv('SECRET_KEY', 'NOT SET')

print(f"GOOGLE_CLIENT_ID: {google_client_id[:30]}..." if len(google_client_id) > 30 else f"GOOGLE_CLIENT_ID: {google_client_id}")
print(f"GOOGLE_CLIENT_SECRET: {google_secret[:20]}..." if len(google_secret) > 20 else f"GOOGLE_CLIENT_SECRET: {google_secret}")
print(f"SECRET_KEY: {flask_secret[:25]}..." if len(flask_secret) > 25 else f"SECRET_KEY: {flask_secret}")
print("=" * 50)

# -------------------------------------------------
# 🌐 CORS - Environment-aware
# -------------------------------------------------
if IS_LOCAL:
    # Local: Allow localhost origins
    cors_origins = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]
else:
    # Production: Allow production frontend
    frontend_url = os.getenv('FRONTEND_BASE_URL', 'https://recolekt-front.netlify.app')
    cors_origins = [
        frontend_url,
        "https://recolekt-front.netlify.app",
    ]

print(f"🔍 CORS Origins: {cors_origins}")

# ✅ Apply CORS globally
CORS(
    app,
    origins=cors_origins,
    supports_credentials=True,
    allow_headers=["Content-Type", "Authorization", "Cache-Control", "Pragma"],
    expose_headers=["Set-Cookie", "Content-Type"],
    methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    max_age=3600,
    send_wildcard=False,
    always_send=True
)

# ✅ Global after_request handler for ALL routes
@app.after_request
def add_cors_headers_global(response):
    """Add CORS headers to ALL responses"""
    origin = request.headers.get('Origin', '')
    
    if origin in cors_origins:
        response.headers['Access-Control-Allow-Origin'] = origin
        response.headers['Access-Control-Allow-Credentials'] = 'true'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, Cache-Control, Pragma'
        response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
        response.headers['Access-Control-Max-Age'] = '3600'
        logger.debug(f"✅ CORS headers added to response from: {request.path}")
    
    return response

# ✅ Global OPTIONS handler
@app.before_request
def handle_preflight():
    """Handle OPTIONS preflight for all routes"""
    if request.method == "OPTIONS":
        origin = request.headers.get("Origin", "")
        
        if origin in cors_origins:
            response = jsonify({"status": "ok"})
            response.headers['Access-Control-Allow-Origin'] = origin
            response.headers['Access-Control-Allow-Credentials'] = 'true'
            response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, Cache-Control, Pragma'
            response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
            response.headers['Access-Control-Max-Age'] = '3600'
            return response, 200
        else:
            logger.warning(f"⚠️ CORS: Blocked preflight from unauthorized origin: {origin}")
            return jsonify({"error": "CORS origin not allowed"}), 403

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

if os.getenv("MISTRAL_API_KEY"):
    logger.info("✅ MISTRAL_API_KEY loaded successfully.")
else:
    logger.warning("⚠️ MISTRAL_API_KEY not found. AI summaries will not work.")

# Verify OAuth credentials
if google_client_id != 'NOT SET' and google_secret != 'NOT SET':
    logger.info("✅ Google OAuth credentials loaded successfully.")
else:
    logger.warning("⚠️ Google OAuth credentials missing. Login will not work.")

if flask_secret != 'NOT SET' and flask_secret != 'your-secret-key-change-in-production':
    logger.info("✅ Flask SECRET_KEY configured.")
else:
    logger.warning("⚠️ Flask SECRET_KEY not configured. Sessions will be insecure!")

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
    
    return jsonify({
        "error": message,
        "code": code,
        "type": error_type
    }), code

@app.errorhandler(404)
def not_found(e):
    logger.warning(f"404 Not Found: {request.url}")
    return jsonify({
        "error": "Endpoint not found",
        "code": 404,
        "path": request.path
    }), 404

@app.errorhandler(401)
def unauthorized(e):
    return jsonify({
        "error": "Authentication required",
        "code": 401
    }), 401

@app.errorhandler(403)
def forbidden(e):
    return jsonify({
        "error": "Forbidden",
        "code": 403
    }), 403

@app.errorhandler(500)
def internal_error(e):
    logger.error(f"500 Internal Server Error: {e}", exc_info=True)
    return jsonify({
        "error": "Internal server error",
        "code": 500,
        "message": str(e)
    }), 500

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
            "ffmpeg",
            "-hide_banner",
            "-loglevel", "error",
            "-ss", str(t),
            "-i", video_path,
            "-frames:v", "1",
            "-q:v", "2",
            frame_path,
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
        h = min(a.shape[0], b.shape[0])
        w = min(a.shape[1], b.shape[1])
        a = a[:h, :w]
        b = b[:h, :w]
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

                return jsonify({
                    "is_static": True,
                    "ocr_text": ocr_text,
                    "used_source": "thumbnail",
                    "debug": {"note": "OCR ran on thumbnail_url (treated as static)."}
                })

            video_path = os.path.join(tmp, "input.mp4")
            _download_to_file(video_url, video_path)

            frames_dir = os.path.join(tmp, "frames")
            os.makedirs(frames_dir, exist_ok=True)

            times = [0.2, 1.0, 2.0]
            frame_paths = _run_ffmpeg_extract_frames(video_path, frames_dir, times)

            is_static, dbg = _is_static_frames(frame_paths, diff_threshold=0.01)

            if not is_static and not force_ocr:
                return jsonify({
                    "is_static": False,
                    "ocr_text": "",
                    "used_source": "frame",
                    "debug": {"note": "Video appears non-static; OCR skipped.", **dbg}
                })

            chosen = frame_paths[1]
            with open(chosen, "rb") as f:
                ocr_text = _vision_ocr_from_bytes(f.read(), mode=mode)

            return jsonify({
                "is_static": is_static,
                "ocr_text": ocr_text,
                "used_source": "frame",
                "debug": {"chosen_frame": os.path.basename(chosen), **dbg}
            })

    except subprocess.CalledProcessError as e:
        logger.exception("ffmpeg failed")
        return jsonify({"error": f"ffmpeg failed: {e}"}), 500
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
    debug_mode = IS_LOCAL
    
    logger.info("=" * 60)
    logger.info(f"🚀 Starting Flask app")
    logger.info(f"   Environment: {'RAILWAY' if IS_RAILWAY else 'DOCKER' if IS_DOCKER else 'LOCAL DEV'}")
    logger.info(f"   Port: {port}")
    logger.info(f"   Debug: {debug_mode}")
    logger.info(f"   CORS Origins: {cors_origins}")
    logger.info("=" * 60)
    
    app.run(
        host="0.0.0.0",
        port=port,
        debug=debug_mode,
        threaded=True
    )
