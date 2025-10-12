import os
import glob
import logging
import json
from flask import Flask, request, render_template, jsonify
import yt_dlp
import ffmpeg
from google.cloud import storage

# ----------------------
# Config
# ----------------------
logging.basicConfig(level=logging.DEBUG)
app = Flask(__name__)

# Google Cloud Storage
GCS_BUCKET_NAME = "recolekt-videos"  # replace with your bucket
cred_json = json.loads(os.environ["GOOGLE_APPLICATION_CREDENTIALS_JSON"])
storage_client = storage.Client.from_service_account_info(cred_json)
bucket = storage_client.bucket(GCS_BUCKET_NAME)

# Local temp storage
TEMP_DIR = "/tmp/recolekt"
os.makedirs(TEMP_DIR, exist_ok=True)


# ----------------------
# Video download
# ----------------------
def download_video(url):
    outtmpl = os.path.join(TEMP_DIR, "video.%(ext)s")
    ydl_opts = {
        "outtmpl": outtmpl,
        "format": "best",
        "noplaylist": True,
        "quiet": True,
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=True)
    matches = glob.glob(os.path.join(TEMP_DIR, "video.*"))
    if not matches:
        raise RuntimeError("Downloaded file not found")
    for m in matches:
        if m.lower().endswith(".mp4"):
            return m, info
    return matches[0], info


# ----------------------
# Thumbnail generation
# ----------------------
def generate_thumbnail(video_path):
    thumbnail_path = os.path.join(TEMP_DIR, "thumbnail.jpg")
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


# ----------------------
# Upload to GCS
# ----------------------
def upload_to_gcs(local_path, dest_name):
    blob = bucket.blob(dest_name)
    blob.upload_from_filename(local_path)
    # Make public
    blob.make_public()
    return blob.public_url


# ----------------------
# Routes
# ----------------------
@app.route("/", methods=["GET"])
def index_get():
    return render_template("index.html")


@app.route("/", methods=["POST"])
def index_post():
    url = request.form.get("url") or request.args.get("url")
    logging.debug("Received URL: %s", url)
    if not url:
        return jsonify({"error": "No URL provided"}), 400

    # Cleanup temp folder
    for f in glob.glob(os.path.join(TEMP_DIR, "*")):
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
        logging.exception("Thumbnail generation failed")
        thumb_path = None

    try:
        video_name = f"{info['id']}.mp4"
        video_url = upload_to_gcs(video_path, video_name)
        thumb_url = upload_to_gcs(thumb_path, f"{info['id']}_thumb.jpg") if thumb_path else None
        logging.debug("Uploaded to GCS: video_url=%s, thumb_url=%s", video_url, thumb_url)
    except Exception as e:
        logging.exception("Upload to GCS failed")
        return jsonify({"error": "Upload failed", "detail": str(e)}), 500

    return jsonify({
        "title": info.get("title"),
        "url": info.get("webpage_url"),
        "duration": info.get("duration"),
        "thumbnail": thumb_url,
        "download": video_url
    })


# ----------------------
# Local dev only
# ----------------------
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 10000))
    app.run(host="0.0.0.0", port=port)
