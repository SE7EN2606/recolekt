from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
import os

app = Flask(__name__)
CORS(app)

# Instagram Graph API token from environment variable
IG_TOKEN = os.getenv("IG_ACCESS_TOKEN")

@app.route("/api/fetch", methods=["POST"])
def fetch_instagram():
    data = request.get_json()
    url = data.get("url")
    print("DEBUG: received URL =", url)

    if not url:
        return jsonify({"error": "missing url"}), 400

    try:
        oembed_url = "https://graph.facebook.com/v21.0/instagram_oembed"
        params = {"url": url, "access_token": IG_TOKEN}
        print("DEBUG: calling Graph API with", params)

        r = requests.get(oembed_url, params=params, timeout=10)
        print("DEBUG: Graph API raw response:", r.text)

        # Always return raw response for debugging
        return jsonify({
            "status_code": r.status_code,
            "raw": r.text
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
