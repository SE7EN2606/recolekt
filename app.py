import os
import re
import yt_dlp
import ffmpeg
from flask import Flask, request, jsonify, send_from_directory, abort

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DOWNLOADS = os.path.join(BASE_DIR, "downloads")
os.makedirs(DOWNLOADS, exist_ok=True)

app = Flask(__name__)

def extract_reel_id(url: str) -> str:
    """Extract Instagram short ID from URL."""
    match = re.search(r"/(?:p|reel)/([^/?#]+)/?", url)
    return match.group(1) if match else "unknown"

def download_video(url: str, dest_dir: str) -> str:
    """Download video using yt_dlp."""
    ydl_opts = {
        "format": "best",
        "outtmpl": os.path.join(dest_dir, "video.%(ext)s"),
        "quiet": True,
        "http_headers": {
            "User-Agent": "Mozilla/5.0"
        },
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        ydl.download([url])

    for fn in os.listdir(dest_dir):
        if fn.startswith("video."):
            return os.path.join(dest_dir, fn)
    raise FileNotFoundError("video not found")

def generate_thumbnail(video_path: str, dest_dir: str) -> str:
    """Extract first frame as thumbnail."""
    thumbnail_path = os.path.join(dest_dir, "thumbnail.jpg")
    (
        ffmpeg
        .input(video_path, ss=0)
        .output(thumbnail_path, vframes=1, **{"update": 1})
        .overwrite_output()
        .run(quiet=True)
    )
    return thumbnail_path

@app.route("/fetch-thumbnail", methods=["POST"])
def fetch_thumbnail():
    data = request.get_json()
    url = data.get("url")
    if not url:
        return jsonify({"error": "No URL provided"}), 400

    reel_id = extract_reel_id(url)
    reel_dir = os.path.join(DOWNLOADS, reel_id)
    os.makedirs(reel_dir, exist_ok=True)

    thumb_path = os.path.join(reel_dir, "thumbnail.jpg")
    if not os.path.exists(thumb_path):
        try:
            video_path = download_video(url, reel_dir)
            generate_thumbnail(video_path, reel_dir)
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    return jsonify({"thumbnail_url": f"/thumbnail/{reel_id}"})

@app.route("/thumbnail/<reel_id>")
def serve_thumbnail(reel_id):
    dirpath = os.path.join(DOWNLOADS, reel_id)
    fname = "thumbnail.jpg"
    if not os.path.exists(os.path.join(dirpath, fname)):
        abort(404)
    return send_from_directory(dirpath, fname)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001, debug=True, use_reloader=False)

