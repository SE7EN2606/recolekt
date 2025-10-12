from flask import Flask, request, render_template, jsonify
import logging
import yt_dlp
import os

app = Flask(__name__)

# Enable debug logging
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
                "format": "best",
                "noplaylist": True,
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

    return render_template("index.html")


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 10000))
    app.run(host="0.0.0.0", port=port)
