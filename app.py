import os
import glob
import logging
import json
from flask import Flask, request, render_template, jsonify, send_from_directory, abort
import yt_dlp
import ffmpeg
from google.cloud import storage
from google.oauth2 import service_account

# Config
DOWNLOAD_DIR = "downloads"
BUCKET_NAME = "recolekt-videos"  # your GCS bucket
os.makedirs(DOWNLOAD_DIR, exist_ok=True)

logging.basicConfig(level=logging.DEBUG)
app = Flask(__name__)

# Setup GCS client from env var
cred_json = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS_JSON")
if not cred_json:
    raise RuntimeError("Missing GOOGLE_APPLICATION_CREDENTIALS_JSON env variable")

credentials = service_account.Credentials.from_service_account_info(json.loads(cred_json))
gcs_client = storage.Client(credentials=credentials, project=credentials.project_id)
bucket = gcs_client.bucket(BUCKET_NAME)

# ----------------- VIDEO DOWNLOAD -----------------
def download_video(url):
    outtmpl = os.path.join(DOWNLOAD_DIR, "video.%(ext)s")
    ydl_opts = {
        "outtmpl": outtmpl,
        "format": "best",
        "noplaylist": True,
        "quiet": True,
    }
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
        raise RuntimeError("Thumbnail generation failed")
    return thumbnail_path

# ----------------- GCS UPLOAD -----------------
def upload_to_gcs(local_path, object_name):
    blob = bucket.blob(object_name)
    blob.upload_from_filename(local_path)
    blob.make_public()  # exposes publicly
    return blob.public_url

# ----------------- ROUTES -----------------
@app.route("/", methods=["GET"])
def index_get():
    return render_template("index.html")

@app.route("/", methods=["POST"])
def index_post():
    url = request.form.get("url") or request.args.get("url")
    logging.debug("Received URL: %s", url)
    if not url:
        return jsonify({"error": "No URL provided"}), 400

    # Cleanup previous outputs
    for f in glob.glob(os.path.join(DOWNLOAD_DIR, "video.*")) + glob.glob(os.path.join(DOWNLOAD_DIR, "thumbnail.*")):
        try:
            os.remove(f)
        except Exception:
            pass

    try:
        video_path, info = download_video(url)
        logging.debug("Downloaded video: %s", video_path)
    except Exception as e:
        logging.exception("Download failed")
        return jsonify({"error": "Download failed", "detail": str(e)}), 500

    try:
        thumb_path = generate_thumbnail(video_path)
        logging.debug("Thumbnail created: %s", thumb_path)
    except Exception as e:
        logging.exception("Thumbnail failed")
        thumb_path = None

    # Upload video + thumbnail to GCS
    try:
        video_public_url = upload_to_gcs(video_path, f"{info.get('id')}.mp4")
        thumb_public_url = upload_to_gcs(thumb_path, f"{info.get('id')}.jpg") if thumb_path else None
    except Exception as e:
        logging.exception("GCS upload failed")
        return jsonify({"error": "Upload failed", "detail": str(e)}), 500

    return jsonify({
        "title": info.get("title"),
        "url": info.get("webpage_url"),
        "duration": info.get("duration"),
        "thumbnail": thumb_public_url,
        "download": video_public_url
    })

# Only for local dev. Gunicorn will handle production
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 10000))
    app.run(host="0.0.0.0", port=port)
