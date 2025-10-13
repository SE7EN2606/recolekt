import os
import requests
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

IG_TOKEN = os.environ.get("IG_ACCESS_TOKEN")

@app.route("/api/fetch", methods=["POST"])
def fetch_instagram():
    data = request.get_json()
    url = data.get("url")
    if not url:
        return jsonify({"error": "missing url"}), 400

    try:
        oembed_url = f"https://graph.facebook.com/v17.0/instagram_oembed"
        params = {"url": url, "access_token": IG_TOKEN}
        r = requests.get(oembed_url, params=params, timeout=10)
        if r.status_code != 200:
            return jsonify({"error": "Graph API error", "detail": r.text}), r.status_code

        info = r.json()
        # Optional: extract video or thumbnail
        return jsonify({
            "author_name": info.get("author_name"),
            "title": info.get("title"),
            "thumbnail_url": info.get("thumbnail_url"),
            "html": info.get("html"),
            "provider_url": info.get("provider_url"),
            "type": info.get("type"),
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)))
