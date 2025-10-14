import os
import re
import requests
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from bs4 import BeautifulSoup  # requires beautifulsoup4 in requirements

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

def extract_og(html: str):
    """Extract OpenGraph thumbnail + video from HTML."""
    soup = BeautifulSoup(html, "html.parser")
    thumb = None
    video = None
    og_img = soup.find("meta", property="og:image")
    if og_img and og_img.get("content"):
        thumb = og_img["content"]
    og_vid = (soup.find("meta", property="og:video") or
              soup.find("meta", property="og:video:url") or
              soup.find("meta", property="og:video:secure_url"))
    if og_vid and og_vid.get("content"):
        video = og_vid["content"]
    return {"thumb": thumb, "video": video}

def first_non_empty(*vals):
    for v in vals:
        if v:
            return v
    return None

def get_highest_res(candidates):
    """Pick the candidate with max width."""
    if not candidates:
        return None
    return max(candidates, key=lambda c: c.get("width", 0)).get("url")

def try_media_details(media_id: str):
    """Call RapidAPI media-details or equivalent to get high-res thumb + video."""
    if not media_id or not RAPIDAPI_HOST or not RAPIDAPI_KEY:
        return None

    variants = [
        {"path": "/media-details", "param": "media_id"},
        {"path": "/mediaDetails",  "param": "media_id"},
        {"path": "/media",         "param": "id"},
    ]
    headers = {
        "X-RapidAPI-Key": RAPIDAPI_KEY,
        "X-RapidAPI-Host": RAPIDAPI_HOST,
    }
    for v in variants:
        try:
            url = f"https://{RAPIDAPI_HOST}{v['path']}"
            params = {v["param"]: media_id}
            resp = requests.get(url, headers=headers, params=params, timeout=15)
            if resp.status_code != 200:
                continue
            data = resp.json()
            candidates = data.get("image_versions2", {}).get("candidates", [])
            thumb = get_highest_res(candidates)
            video = first_non_empty(
                data.get("video_url"),
                (data.get("video_versions") or [{}])[0].get("url")
            )
            if thumb or video:
                return {"thumb": thumb, "video": video, "raw": data}
        except Exception:
            continue
    return None

def try_resolve_media_id(share_url: str):
    """Try multiple resolve endpoint variants to get media_id."""
    if not RAPIDAPI_HOST or not RAPIDAPI_KEY:
        return None
    variants = [
        {"path": "/resolve-share-link", "qs": {"share_url": share_url}},
        {"path": "/resolve-share-link", "qs": {"url": share_url}},
        {"path": "/resolveShareLink",   "qs": {"url": share_url}},
        {"path": "/resolveShareLink",   "qs": {"share_url": share_url}},
        {"path": "/resolve",            "qs": {"link": share_url}},
    ]
    headers = {
        "X-RapidAPI-Key": RAPIDAPI_KEY,
        "X-RapidAPI-Host": RAPIDAPI_HOST,
    }
    for v in variants:
        try:
            url = f"https://{RAPIDAPI_HOST}{v['path']}"
            resp = requests.get(url, headers=headers, params=v["qs"], timeout=15)
            if resp.status_code != 200:
                continue
            data = resp.json()
            media_id = first_non_empty(
                data.get("media_id"),
                data.get("id"),
                data.get("pk"),
                data.get("data", {}).get("media_id")
            )
            if media_id:
                return {"mediaId": media_id, "raw": data}
        except Exception:
            continue
    return None

@app.get("/")
def home():
    return {"status": "ok", "message": "Recolekt API active"}

@app.post("/api/fetch")
def fetch(request: FetchRequest):
    url = request.url
    # Validate input
    if not url or "instagram.com/reel/" not in url:
        raise HTTPException(status_code=400, detail="Must be an Instagram Reel URL")

    # Step 1: try to resolve media_id
    resolved = try_resolve_media_id(url)
    media_id = resolved.get("mediaId") if resolved else None

    # Step 2: if media_id available, fetch high-res details
    media = try_media_details(media_id) if media_id else None

    # Step 3: fallback via OG scraping
    if not media or (media.get("thumb") is None and media.get("video") is None):
        try:
            resp = requests.get(url, headers={"User-Agent": "Mozilla/5.0"}, timeout=15)
            og = extract_og(resp.text)
            media = media or {}
            media["thumb"] = media.get("thumb") or og.get("thumb")
            media["video"] = media.get("video") or og.get("video")
        except Exception:
            pass

    if not media or (media.get("thumb") is None and media.get("video") is None):
        raise HTTPException(status_code=502, detail="Could not extract thumbnail or video")

    return {
        "mediaId": media_id,
        "thumb": media.get("thumb"),
        "video": media.get("video")
    }
