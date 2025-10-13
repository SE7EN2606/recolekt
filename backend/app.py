import os
import glob
import logging
import json
from flask import Flask, request, jsonify
from flask_cors import CORS
import yt_dlp
import ffmpeg
from google.cloud import storage
from google.oauth2 import service_account

# ---- CONFIG ----
DOWNLOAD_DIR = "downloads"
BUCKET_NAME = os.environ.get("GCP_BUCKET", "recolekt-videos")
os.makedirs(DOWNLOAD_DIR, exist_ok=True)

logging.basicConfig(level=logging.INFO)
app = Flask(__name__)
CORS(app)

# ---- GCS CREDS ----
# Two supported methods:
# 1) Set GOOGLE_APPLICATION_CREDENTIALS to a path (recommended for local)
# 2) Set GOOGLE_APPLICATION_CREDENTIALS_JSON to the JSON string (Render env var). This will create an in-memory credentials object.
cred_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
cred_json = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS_JSON")

if not cred_path and not cred_json:
    raise RuntimeError("Missing Google credentials. Set GOOGLE_APPLICATION_CREDENTIALS or GOOGLE_APPLICATION_CREDENTIALS_JSON env var")

if cred_json:
    try:
        credentials_info = json.loads(cred_json)
        credentials = service_account.Credentials.from_service_account_info(credentials_info)
        gcs_client = storage.Client(credentials=credentials, project=credentials.project_id)
    except Exception as e:
        logging.exception("Invalid GOOGLE_APPLICATION_CREDENTIALS_JSON")
        raise
else:
    # use file path
    credentials = None
    gcs_client = storage.Client()  # will pick credentials from path env var GOOGLE_APPLICATION_CREDENTIALS

bucket = gcs_client.bucket(BUCKET_NAME)

# ---- HELPERS ----
def download_video(url):
    outtmpl = os.path.join(DOWNLOAD_DIR, "video.%(ext)s")
    ydl_opts = {"outtmpl": outtmpl, "format": "best", "quiet": True, "noplaylist": True}
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=True)
    matches = glob.glob(os.path.join(DOWNLOAD_DIR, "video.*"))
    if not matches:
        raise RuntimeError("Downloaded file not found")
    for m in matches:
        if m.lower().endswith(".mp4"):
            return m, info
    return matches[0], info

def generate_thumbnail(video_path):
    thumbnail_path = os.path.join(DOWNLOAD_DIR, "thumbnail.jpg")
    (
        ffmpeg
        .input(video_path, ss=0)
        .output(thumbnail_path, vframes=1)
        .overwrite_output()
        .run(quiet=True)
    )
    if not os.path.exists(thumbnail_path):
        raise RuntimeError("Thumbnail creation failed")
    return thumbnail_path

def upload_to_gcs(local_path, object_name):
    if not local_path:
        return None
    blob = bucket.blob(object_name)
    blob.upload_from_filename(local_path)
    return f"https://storage.googleapis.com/{BUCKET_NAME}/{object_name}"

# ---- API ----
@app.route("/api/fetch", methods=["POST"])
def fetch_video():
    body = request.get_json() or {}
    url = body.get("url")
    if not url:
        return jsonify({"error": "No URL provided"}), 400

    # cleanup old files
    for f in glob.glob(os.path.join(DOWNLOAD_DIR, "*")):
        try: os.remove(f)
        except: pass

    try:
        video_path, info = download_video(url)
    except Exception as e:
        logging.exception("download failed")
        return jsonify({"error": "Download failed", "detail": str(e)}), 500

    try:
        thumb_path = generate_thumbnail(video_path)
    except Exception as e:
        logging.exception("thumbnail failed")
        thumb_path = None

    try:
        vid_obj = f"{info.get('id')}.mp4"
        thumb_obj = f"{info.get('id')}.jpg" if thumb_path else None
        vid_url = upload_to_gcs(video_path, vid_obj)
        thumb_url = upload_to_gcs(thumb_path, thumb_obj) if thumb_path else None
    except Exception as e:
        logging.exception("upload failed")
        return jsonify({"error": "Upload failed", "detail": str(e)}), 500

    return jsonify({
        "id": info.get("id"),
        "title": info.get("title"),
        "thumbnail": thumb_url,
        "download": vid_url,
        "source_url": info.get("webpage_url"),
        "duration": info.get("duration")
    })

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5001))
    app.run(host="0.0.0.0", port=port)
