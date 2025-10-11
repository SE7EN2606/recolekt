from flask import Flask, request, render_template, jsonify
import logging
import yt_dlp

app = Flask(__name__)

# Enable logging
logging.basicConfig(level=logging.DEBUG)

@app.route("/", methods=["GET", "POST"])
def index():
    if request.method == "POST":
        url = request.form.get("url")
        logging.debug(f"Received URL: {url}")

        if not url:
            return jsonify({"error": "No URL provided"}), 400

        try:
            ydl_opts = {
                'format': 'best',
                'noplaylist': True,
            }
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=False)
            logging.debug(f"Extracted info: {info.get('title')}")
            return jsonify({
                "title": info.get("title"),
                "url": info.get("webpage_url"),
                "duration": info.get("duration"),
            })
        except Exception as e:
            logging.exception("Failed to process URL")
            return jsonify({"error": str(e)}), 500

    # GET request
    return render_template("index.html")

# Remove app.run() – Gunicorn will run the app
