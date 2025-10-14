import os
import requests
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# Use your RapidAPI key (store securely in Render later)
RAPID_API_KEY = os.environ.get("RAPID_API_KEY")

@app.route("/api/instagram", methods=["GET"])
def get_instagram_post():
    media_id = request.args.get("id")
    if not media_id:
        return jsonify({"error": "Missing ?id= parameter"}), 400

    try:
        url = f"https://instagram-api-fast-reliable-data-scraper.p.rapidapi.com/media?id={media_id}"
        headers = {
            "x-rapidapi-host": "instagram-api-fast-reliable-data-scraper.p.rapidapi.com",
            "x-rapidapi-key": RAPID_API_KEY
        }
        r = requests.get(url, headers=headers, timeout=10)

        if r.status_code != 200:
            return jsonify({"error": "RapidAPI error", "detail": r.text}), r.status_code

        data = r.json()
        return jsonify(data)

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/test", methods=["GET"])
def test():
    return jsonify({"status": "ok", "message": "API running"})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)))
