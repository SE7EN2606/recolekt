from flask import Flask, request, jsonify
from flask_cors import CORS
import requests

app = Flask(__name__)
CORS(app)

@app.route("/")
def home():
    return jsonify({"status": "ok", "message": "Recolekt API active"})

@app.route("/api/fetch", methods=["POST"])
def fetch_instagram_thumbnail():
    try:
        data = request.get_json(force=True)
        url = data.get("url")
        if not url:
            return jsonify({"status": 400, "error": "Missing URL"}), 400

        API_URL = "https://instagram-scraper-api2.p.rapidapi.com/media_info_v2"
        headers = {
            "x-rapidapi-key": "55842e9f58mshf59f6d5ec196bbbp1251a1jsn48b330063f49",
            "x-rapidapi-host": "instagram-scraper-api2.p.rapidapi.com",
        }
        query = {"url": url}

        response = requests.get(API_URL, headers=headers, params=query, timeout=20)
        if response.status_code != 200:
            return jsonify({"status": response.status_code, "error": response.text}), response.status_code

        data = response.json()
        thumbnail_url = (
            data.get("data", {}).get("items", [{}])[0]
            .get("image_versions2", {})
            .get("candidates", [{}])[0]
            .get("url")
        )

        if not thumbnail_url:
            return jsonify({"status": 404, "error": "Thumbnail not found"}), 404

        return jsonify({"status": 200, "thumbnail_url": thumbnail_url})

    except Exception as e:
        return jsonify({"status": 500, "error": str(e)}), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
