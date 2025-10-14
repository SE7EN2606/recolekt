from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
import json

app = Flask(__name__)
CORS(app)

@app.route("/")
def home():
    return jsonify({"status": "ok", "message": "Recolekt API active"})

@app.route("/api/fetch", methods=["POST"])
def fetch_instagram_data():
    try:
        data = request.get_json(force=True)
        url = data.get("url")
        if not url:
            return jsonify({"status": 400, "error": "Missing URL"}), 400

        # External API (RapidAPI or other)
        API_URL = "https://instagram-scraper-api2.p.rapidapi.com/media_info_v2"
        headers = {
            "x-rapidapi-key": "55842e9f58mshf59f6d5ec196bbbp1251a1jsn48b330063f49",
            "x-rapidapi-host": "instagram-scraper-api2.p.rapidapi.com",
        }
        query = {"url": url}

        response = requests.get(API_URL, headers=headers, params=query, timeout=20)
        if response.status_code != 200:
            return jsonify({"status": response.status_code, "error": response.text}), response.status_code

        parsed = response.json()
        return jsonify({"status": 200, "data": json.dumps(parsed)})

    except Exception as e:
        return jsonify({"status": 500, "error": str(e)}), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
