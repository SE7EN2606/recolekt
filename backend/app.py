from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
import os

app = Flask(__name__)
CORS(app)  # Allow all origins. Can restrict later.

# RapidAPI credentials from Render environment
RAPIDAPI_KEY = os.getenv("RAPIDAPI_KEY")
RAPIDAPI_HOST = os.getenv("RAPIDAPI_HOST")  # Provided by RapidAPI

@app.route("/api/fetch", methods=["POST"])
def fetch_instagram():
    data = request.get_json()
    url = data.get("url")
    print("DEBUG: received URL =", url)

    if not url:
        return jsonify({"error": "missing url"}), 400

    try:
        # Replace with your exact RapidAPI endpoint
        endpoint = "https://instagram-scraper-api.p.rapidapi.com/instagram/reel"
        headers = {
            "X-RapidAPI-Key": RAPIDAPI_KEY,
            "X-RapidAPI-Host": RAPIDAPI_HOST
        }
        params = {"url": url}
        print("DEBUG: calling RapidAPI with params", params)

        response = requests.get(endpoint, headers=headers, params=params, timeout=15)
        print("DEBUG: RapidAPI status code:", response.status_code)
        print("DEBUG: RapidAPI response text:", response.text)

        # Return raw response
        content_type = response.headers.get("Content-Type", "")
        if "application/json" in content_type:
            return jsonify(response.json()), response.status_code
        else:
            return jsonify({"raw": response.text}), response.status_code

    except requests.exceptions.RequestException as e:
        print("DEBUG: Requests exception:", e)
        return jsonify({"error": str(e)}), 500
    except Exception as e:
        print("DEBUG: Other exception:", e)
        return jsonify({"error": str(e)}), 500

@app.route("/")
def index():
    return jsonify({"message": "API is running"}), 200

if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)
