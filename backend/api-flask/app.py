import os
import sys
import logging
import warnings
import tempfile
import subprocess
from pathlib import Path
from datetime import timedelta

from flask import Flask, send_from_directory, request, jsonify
from flask_cors import CORS
from flask_session import Session
from werkzeug.exceptions import HTTPException
from dotenv import load_dotenv
import requests
import numpy as np
from PIL import Image

from google.cloud import vision  # google-cloud-vision

# -------------------------------------------------
# 🪄 1. Environment setup (FORCE root .env)
# -------------------------------------------------

# Path to project root .env
ROOT_ENV = Path(__file__).resolve().parents[2] / ".env"

print("DEBUG: ROOT_ENV path =", ROOT_ENV)
print("DEBUG: ROOT_ENV exists? ", ROOT_ENV.exists())

# Force load root .env
load_dotenv(ROOT_ENV, override=True)

print("DEBUG: Loaded DATABASE_URL =", os.getenv("DATABASE_URL"))

# Add backend root to Python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# ✅ Use Mistral instead of Gemini
os.environ.setdefault(
    "MISTRAL_API_KEY",
    os.getenv("MISTRAL_API_KEY", "")
)

warnings.filterwarnings("ignore")
os.environ["PYTHONWARNINGS"] = "ignore"
os.environ["TRANSFORMERS_OFFLINE"] = "1"

# -------------------------------------------------
# 🧠 2. Diagnostics before creating Flask app
# -------------------------------------------------
print("Python executable:", sys.executable)
for p in sys.path:
    print("   ", p)

from fetcher_api.services.ai_service import ai_service

print("DEBUG: Using AI Service")
print("AIService class:", ai_service.__class__)
print("Has analyze_content:", hasattr(ai_service, "analyze_content"))

# -------------------------------------------------
# ⚙️ 3. Flask setup
# -------------------------------------------------
from fetcher_api import create_app
from fetcher_api.api import register_blueprints

app = create_app()
from werkzeug.middleware.proxy_fix import ProxyFix
app.wsgi_app = ProxyFix(app.wsgi_app, x_proto=1, x_host=1)

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
app.config['SESSION_COOKIE_DOMAIN'] = None
app.config['SESSION_COOKIE_PATH'] = '/'
app.config['SESSION_REFRESH_EACH_REQUEST'] = True
app.config.update(
    SESSION_COOKIE_SAMESITE="None",
    SESSION_COOKIE_SECURE=True
)

# Initialize Flask-Session
Session(app)

# Register blueprints
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
# 🌐 CORS - FIXED FOR DELETE REQUESTS
# -------------------------------------------------
ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:5173",
    "https://recolekt-front.netlify.app"
]

CORS(
    app,
    origins=ALLOWED_ORIGINS,
    supports_credentials=True,
    allow_headers=["Content-Type", "Authorization", "X-Requested-With"],
    methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    expose_headers=["Content-Type", "Authorization"],
    max_age=3600
)

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
# ✅ CRITICAL: Global Error Handlers (JSON responses)
# -------------------------------------------------
@app.errorhandler(Exception)
def handle_error(e):
    """Return JSON instead of HTML for all errors"""
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
# 🔎 OCR helpers (Google Vision + stillness detection)
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
    """
    JSON body:
      {
        "thumbnail_url": "...",
        "video_url": "...",
        "mode": "document",
        "force_ocr": false
      }
    """
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
# 🎨 4. Serve frontend
# -------------------------------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.join(BASE_DIR, "frontend")

@app.route("/")
def index():
    return send_from_directory(FRONTEND_DIR, "index.html")

@app.route("/frontend/<path:path>")
def frontend_static(path):
    return send_from_directory(FRONTEND_DIR, path)

# -------------------------------------------------
# 🚀 5. Entry point
# -------------------------------------------------
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5001))
    logger.info(f"🚀 Running Instagram Summarization API on port {port}")
    app.run(host="0.0.0.0", port=port, debug=False, threaded=True)
