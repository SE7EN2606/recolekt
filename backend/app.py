from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
import os

app = Flask(__name__)
CORS(app)

# RapidAPI credentials from environment variables
RAPIDAPI_KEY = os.getenv("RAPIDAPI_KEY")
RAPIDAPI_HOST = os.getenv("RAPIDAPI_HOST")  # usually provided by RapidAPI

@app.route("/api/fetch", methods=["POST"])
def fetch_instagram():
    data = request.get_json()
    url = data.get("url")
    print("DEBUG: received URL =", url)

    if not url:
        return jsonify({"error": "missing url"}), 400

    try:
        endpoint = "https://instagram-scraper-api.p.rapidapi.com/instagram/reel"  # example endpoint
        headers = {
            "X-RapidAPI-Key": RAPIDAPI_KEY,
            "X-RapidAPI-Host": RAPIDAPI_HOST
        }
        params = {"url": url}
        print("DEBUG: calling RapidAPI with", params)

        r = requests.get(endpoint, headers=headers, params=params, timeout=10)
        print("DEBUG: RapidAPI raw response:", r.text)

        return jsonify({
            "status_code": r.status_code,
            "raw": r.json() if r.headers.get("Content-Type") == "application/json" else r.text
        }), r.status_code

    except Exception as e:
        print("DEBUG: Exception occurred:", e)
        return jsonify({"error": str(e)}), 500

@app.route("/")
def index():
    return jsonify({"message": "API is running"}), 200

if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)
