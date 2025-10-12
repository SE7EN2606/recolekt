import os
import glob
import logging
from flask import Flask, request, render_template, jsonify
import yt_dlp
import ffmpeg
from google.cloud import storage

# Config
DOWNLOAD_DIR = "downloads"
BUCKET_NAME = "recolekt-videos"
os.makedirs(DOWNLOAD_DIR, exist_ok=True)

logging.basicConfig(level=logging.DEBUG)
app = Flask(__name__)

# Initialize GCS client (reads GOOGLE_APPLICATION_CREDENTIALS_JSON from env)
gcs_client = storage.Client()
bucket = gcs_client.bucket(BUCKET_NAME)

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

def upload_to_gcs(local_path, object_name):
    blob = bucket.blob(object_name)
    blob.upload_from_filename(local_path)  # ✅ no ACL changes
    return f"https://storage.googleapis.com/{BUCKET_NAME}/{object_name}"

@app.route("/", methods=["GET"])
def index_get():
    return render_template("index.html")

@app.route("/", methods=["POST"])
def index_post():
    url = request.form.get("url") or request.args.get("url")
    logging.debug("Received URL: %s", url)
    if not url:
        return jsonify({"error": "No URL provided"}), 400

    # Cleanup previous downloads
    for f in glob.glob(os.path.join(DOWNLOAD_DIR, "*")):
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

    try:
        video_filename = f"{info.get('id')}.mp4"
        video_url = upload_to_gcs(video_path, video_filename)
        thumb_url = upload_to_gcs(thumb_path, f"{info.get('id')}.jpg") if thumb_path else None
    except Exception as e:
        logging.exception("GCS upload failed")
        return jsonify({"error": "Upload failed", "detail": str(e)}), 500

    return jsonify({
        "title": info.get("title"),
        "url": info.get("webpage_url"),
        "duration": info.get("duration"),
        "thumbnail": thumb_url,
        "download": video_url
    })

# Only for local dev. Gunicorn will handle production
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 10000))
    app.run(host="0.0.0.0", port=port)
