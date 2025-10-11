import os
from flask import Flask, render_template, send_from_directory
import yt_dlp
import ffmpeg

app = Flask(__name__)
os.makedirs("downloads", exist_ok=True)

# Download Instagram Reel video
def download_video(url):
    ydl_opts = {
        'format': 'best',
        'outtmpl': 'downloads/video.%(ext)s',
        'quiet': True,
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info_dict = ydl.extract_info(url, download=True)
        return 'downloads/video.mp4'

# Generate thumbnail from first frame
def generate_thumbnail(video_path):
    thumbnail_path = "downloads/thumbnail.jpg"
    ffmpeg.input(video_path, ss=0).output(thumbnail_path, vframes=1).run(overwrite_output=True)
    return thumbnail_path

@app.route('/')
def index():
    # Example URL for testing; you can replace dynamically later
    url = "https://www.instagram.com/reel/DN_IrioALTK/?hl=en"
    video_path = download_video(url)
    generate_thumbnail(video_path)
    return render_template('index.html', thumbnail='/thumbnail')

@app.route('/thumbnail')
def thumbnail():
    return send_from_directory('downloads', 'thumbnail.jpg')

if __name__ == "__main__":
    from waitress import serve
    serve(app, host="0.0.0.0", port=int(os.environ.get("PORT", 5000)))
