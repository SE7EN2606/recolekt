from flask import Flask, request, send_file, render_template, jsonify
import yt_dlp
import os

app = Flask(__name__)

DOWNLOAD_FOLDER = "downloads"
os.makedirs(DOWNLOAD_FOLDER, exist_ok=True)

def download_video(url):
    ydl_opts = {
        "outtmpl": os.path.join(DOWNLOAD_FOLDER, "video.%(ext)s"),
        "format": "best",
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=True)
        video_path = ydl.prepare_filename(info)
    return video_path

@app.route("/", methods=["GET", "POST"])
def index():
    # Get URL from form (POST) or query parameter (GET)
    url = request.form.get("url") or request.args.get("url")
    if not url:
        return render_template("index.html")  # show form if no URL provided

    try:
        video_path = download_video(url)
        return send_file(video_path, as_attachment=True)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=10000)
