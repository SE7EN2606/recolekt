from flask import Flask, request, render_template, jsonify
import logging
import yt_dlp

app = Flask(__name__)

# Enable debug logging
logging.basicConfig(level=logging.DEBUG)


@app.route("/", methods=["GET", "POST"])
def index():
    if request.method == "POST":
        # Get URL from form field named "url"
        url = request.form.get("url")
        logging.debug(f"Received URL: {url}")

        if not url:
            return jsonify({"error": "No URL provided"}), 400

        try:
            # yt-dlp options: best quality, no playlist downloads
            ydl_opts = {
                "format": "best",
                "noplaylist": True,
            }

            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=False)

            logging.debug(f"Extracted info: {info.get('title')}")

            # Return minimal info as JSON
            return jsonify({
                "title": info.get("title"),
                "url": info.get("webpage_url"),
                "duration": info.get("duration"),
            })

        except Exception as e:
            logging.exception("Failed to process URL")
            return jsonify({"error": str(e)}), 500

    # For GET requests, render HTML form
    return render_template("index.html")


# Do NOT include app.run() — Gunicorn will handle it.
# Render expects a Procfile at the project root:
#   web: gunicorn app:app
