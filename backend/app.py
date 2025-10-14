import os
import requests
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware

# ------------------------
# Config
# ------------------------
RAPIDAPI_KEY = os.getenv("RAPIDAPI_KEY")
RAPIDAPI_HOST = os.getenv("RAPIDAPI_HOST")

# ------------------------
# Request schema
# ------------------------
class FetchRequest(BaseModel):
    url: str

# ------------------------
# FastAPI app
# ------------------------
app = FastAPI()

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ------------------------
# Helper functions
# ------------------------
def extract_media_id_from_html(html: str) -> str | None:
    """Fallback: extract media_id from OG or embedded JSON"""
    import re
    m = re.search(r'"media_id":"(\d+)"', html)
    return m.group(1) if m else None

def get_media_details(media_id: str) -> dict | None:
    """Fetch Media Details via RapidAPI"""
    urls_to_try = [
        {"path": "/media-details", "qs": {"media_id": media_id}},
        {"path": "/mediaDetails", "qs": {"media_id": media_id}},
        {"path": "/media", "qs": {"id": media_id}},
    ]
    headers = {
        "X-RapidAPI-Key": RAPIDAPI_KEY,
        "X-RapidAPI-Host": RAPIDAPI_HOST,
    }
    for u in urls_to_try:
        try:
            url = f"https://{RAPIDAPI_HOST}{u['path']}"
            resp = requests.get(url, headers=headers, params=u["qs"], timeout=20)
            if resp.status_code != 200:
                continue
            data = resp.json()
            # Extract clean thumbnail and video
            thumb = (
                data.get("thumbnail_url") or
                data.get("cover_frame_url") or
                data.get("image_versions2", {}).get("candidates", [{}])[0].get("url")
            )
            video = (
                data.get("video_url") or
                data.get("video_versions", [{}])[0].get("url")
            )
            if thumb or video:
                return {"thumb": thumb, "video": video, "raw": data}
        except Exception:
            continue
    return None

def extract_og(html: str) -> dict:
    """Fallback OG parser"""
    import re
    def get(prop):
        m = re.search(f'<meta[^>]+property=["\']{prop}["\'][^>]+content=["\']([^"\']+)["\']', html)
        return m.group(1) if m else None
    return {
        "thumb": get("og:image") or get("og:image:secure_url"),
        "video": get("og:video") or get("og:video:url") or get("og:video:secure_url")
    }

# ------------------------
# Routes
# ------------------------
@app.get("/")
def home():
    return {"status": "ok", "message": "Recolekt API active"}

@app.post("/api/fetch")
def fetch_instagram_thumbnail(req: FetchRequest):
    url = req.url
    if not url.startswith("https://www.instagram.com/reel/"):
        raise HTTPException(status_code=400, detail="Provide a valid Instagram reel URL.")

    # Step 1: Fetch page HTML
    try:
        resp = requests.get(url, headers={"User-Agent": "Mozilla/5.0"}, timeout=10)
        html = resp.text
    except Exception:
        raise HTTPException(status_code=502, detail="Could not fetch URL")

    # Step 2: Extract media_id if possible
    media_id = extract_media_id_from_html(html)

    # Step 3: Try Media Details via RapidAPI
    result = get_media_details(media_id) if media_id else None

    # Step 4: Fallback OG scraping
    if not result:
        og = extract_og(html)
        result = {"thumb": og.get("thumb"), "video": og.get("video"), "raw": None}

    if not result.get("thumb") and not result.get("video"):
        raise HTTPException(
            status_code=502,
            detail="Could not extract thumbnail or video. Check RapidAPI endpoint."
        )

    return {"mediaId": media_id, "thumb": result.get("thumb"), "video": result.get("video")}
