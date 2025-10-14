from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
import os
import requests
import re

RAPIDAPI_HOST = os.getenv("RAPIDAPI_HOST")
RAPIDAPI_KEY = os.getenv("RAPIDAPI_KEY")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class FetchRequest(BaseModel):
    url: str

def first_non_empty(*vals):
    for v in vals:
        if v:
            return v
    return None

def extract_og(html: str):
    def get(prop):
        m = re.search(rf'<meta[^>]+property=["\']{prop}["\'][^>]+content=["\']([^"\']+)["\']', html, re.I)
        return m.group(1) if m else None
    return {
        "thumb": get("og:image") or get("og:image:secure_url"),
        "video": get("og:video") or get("og:video:url") or get("og:video:secure_url")
    }

def try_rapid_resolve(url: str):
    if not RAPIDAPI_HOST or not RAPIDAPI_KEY:
        return None
    candidates = [
        {"method": "GET", "path": "/resolve-share-link", "qs": {"share_url": url}},
        {"method": "GET", "path": "/resolve-share-link", "qs": {"url": url}},
        {"method": "GET", "path": "/resolveShareLink", "qs": {"url": url}},
        {"method": "GET", "path": "/resolveShareLink", "qs": {"share_url": url}},
        {"method": "GET", "path": "/resolve", "qs": {"link": url}},
    ]
    for c in candidates:
        try:
            full_url = f"https://{RAPIDAPI_HOST}{c['path']}"
            res = requests.get(full_url, headers={
                "X-RapidAPI-Key": RAPIDAPI_KEY,
                "X-RapidAPI-Host": RAPIDAPI_HOST,
            }, params=c.get("qs"), timeout=15)
            if res.status_code != 200:
                continue
            json_data = res.json()
            media_id = json_data.get("media_id") or json_data.get("id") or json_data.get("pk") or json_data.get("data", {}).get("media_id")
            thumb = first_non_empty(
                json_data.get("thumbnail_url"),
                json_data.get("cover_frame_url"),
                json_data.get("image_versions2", {}).get("candidates", [{}])[0].get("url"),
                json_data.get("data", {}).get("thumbnail_url")
            )
            video = first_non_empty(
                json_data.get("video_url"),
                json_data.get("video_versions", [{}])[0].get("url"),
                json_data.get("data", {}).get("video_url")
            )
            if media_id or thumb or video:
                return {"mediaId": media_id, "thumb": thumb, "video": video}
        except:
            continue
    return None

@app.get("/")
def home():
    return {"status": "ok", "message": "Recolekt API active"}

@app.post("/api/fetch")
def fetch_instagram_thumbnail(request: FetchRequest):
    share_url = request.url
    if not share_url.startswith("https://www.instagram.com/reel/"):
        raise HTTPException(status_code=400, detail="Provide a valid Instagram reel URL.")

    resolved = try_rapid_resolve(share_url)

    # Fallback: OG tags
    if not resolved or not (resolved.get("thumb") or resolved.get("video")):
        try:
            res = requests.get(share_url, headers={"User-Agent": "Mozilla/5.0"}, timeout=15)
            og = extract_og(res.text)
            resolved = resolved or {}
            resolved["thumb"] = resolved.get("thumb") or og.get("thumb")
            resolved["video"] = resolved.get("video") or og.get("video")
        except:
            pass

    if not resolved or not (resolved.get("thumb") or resolved.get("video")):
        raise HTTPException(status_code=502, detail="Could not extract thumbnail or video.")

    return {
        "mediaId": resolved.get("mediaId"),
        "thumb": resolved.get("thumb"),
        "video": resolved.get("video")
    }
