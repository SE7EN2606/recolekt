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
BUCKET_NAME = "recolekt-videos"  # change if different
os.makedirs(DOWNLOAD_DIR, exist_ok=True)

logging.basicConfig(level=logging.DEBUG)
app = Flask(__name__)
CORS(app)

# ---- GCS CREDS ----
cred_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
if not cred_path:
    raise RuntimeError("Missing GOOGLE_APPLICATION_CREDENTIALS env variable")

credentials = service_account.Credentials.from_service_account_file(cred_path)
gcs_client = storage.Client(credentials=credentials, project=credentials.project_id)
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
    blob = bucket.blob(object_name)
    blob.upload_from_filename(local_path)
    # avoid object ACL calls (uniform bucket-level access)
    return f"https://storage.googleapis.com/{BUCKET_NAME}/{object_name}"

# ---- API ----
@app.route("/api/fetch", methods=["POST"])
def fetch_video():
    body = request.get_json() or {}
    url = body.get("url")
    if not url:
        return jsonify({"error": "No URL provided"}), 400

    # cleanup
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
