from flask import Flask, request, render_template, send_file
import yt_dlp
import ffmpeg
import os
import logging

logging.basicConfig(level=logging.DEBUG)

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = 'downloads'
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

@app.route('/', methods=['GET', 'POST'])
def index():
    if request.method == 'POST':
        url = request.form.get('url')
        logging.debug(f"Received URL: {url}")

        if not url:
            logging.debug("No URL provided")
            return "Error: No URL provided"

        video_path = os.path.join(app.config['UPLOAD_FOLDER'], 'video.mp4')
        thumbnail_path = os.path.join(app.config['UPLOAD_FOLDER'], 'thumbnail.jpg')

        ydl_opts = {
            'outtmpl': video_path,
            'format': 'mp4',
        }

        try:
            logging.debug("Starting download with yt-dlp...")
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.download([url])
            logging.debug("Download completed.")
        except Exception as e:
            logging.error(f"Download failed: {e}")
            return f"Error during download: {e}"

        try:
            logging.debug("Generating thumbnail...")
            (
                ffmpeg
                .input(video_path, ss=0)
                .output(thumbnail_path, vframes=1)
                .overwrite_output()
                .run(capture_stdout=True, capture_stderr=True)
            )
            logging.debug("Thumbnail generated.")
        except ffmpeg.Error as e:
            logging.error(f"Thumbnail generation failed: {e.stderr.decode()}")
            return f"Error generating thumbnail: {e.stderr.decode()}"

        return f"Download and thumbnail success! Video saved to {video_path}, thumbnail saved to {thumbnail_path}"

    return render_template('index.html')

if __name__ == '__main__':
    app.debug = True
    app.run(host='0.0.0.0', port=10000)
