import os
import glob
import logging
from flask import Flask, request, render_template, jsonify, send_from_directory, abort
import yt_dlp
import ffmpeg

# Config
DOWNLOAD_DIR = "downloads"
os.makedirs(DOWNLOAD_DIR, exist_ok=True)

logging.basicConfig(level=logging.DEBUG)
app = Flask(__name__)

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
    # find the saved file (video.*)
    matches = glob.glob(os.path.join(DOWNLOAD_DIR, "video.*"))
    if not matches:
        raise RuntimeError("Downloaded file not found")
    # Prefer .mp4 if present
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

@app.route("/", methods=["GET"])
def index_get():
    return render_template("index.html")

@app.route("/", methods=["POST"])
def index_post():
    url = request.form.get("url") or request.args.get("url")
    logging.debug("Received URL: %s", url)
    if not url:
        return jsonify({"error": "No URL provided"}), 400

    # cleanup previous outputs so responses are deterministic
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
        thumb = generate_thumbnail(video_path)
        logging.debug("Thumbnail created: %s", thumb)
    except Exception as e:
        logging.exception("Thumbnail failed")
        # not fatal; continue and return video info but indicate no thumbnail
        return jsonify({
            "title": info.get("title"),
            "url": info.get("webpage_url"),
            "duration": info.get("duration"),
            "thumbnail": None,
            "warning": f"Thumbnail failed: {e}"
        })

    return jsonify({
        "title": info.get("title"),
        "url": info.get("webpage_url"),
        "duration": info.get("duration"),
        "thumbnail": "/thumbnail",
        "download": "/file"
    })

@app.route("/file")
def serve_file():
    matches = glob.glob(os.path.join(DOWNLOAD_DIR, "video.*"))
    if not matches:
        abort(404)
    filename = os.path.basename(matches[0])
    return send_from_directory(DOWNLOAD_DIR, filename, as_attachment=True)

@app.route("/thumbnail")
def serve_thumbnail():
    path = os.path.join(DOWNLOAD_DIR, "thumbnail.jpg")
    if not os.path.exists(path):
        abort(404)
    return send_from_directory(DOWNLOAD_DIR, "thumbnail.jpg")

# Only for local dev. When running under gunicorn, this block won't be executed.
if __name__ == "__main__":
    import os as _os
    port = int(_os.environ.get("PORT", 10000))
    app.run(host="0.0.0.0", port=port)
