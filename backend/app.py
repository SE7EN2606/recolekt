# app.py
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
import requests

import os

RAPIDAPI_HOST = os.getenv("RAPIDAPI_HOST")  # e.g. "instagram-api-fast-reliable-data-scraper.p.rapidapi.com"
RAPIDAPI_KEY  = os.getenv("RAPIDAPI_KEY")

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
    import re
    get = lambda prop: (re.search(f'<meta[^>]+property=["\']{prop}["\'][^>]+content=["\']([^"\']+)["\']', html, re.I) or [None, None])[1]
    return {
        "thumb": get("og:image") or get("og:image:secure_url"),
        "video": get("og:video") or get("og:video:url") or get("og:video:secure_url")
    }

def get_highest_res_image(candidates):
    if not candidates:
        return None
    return max(candidates, key=lambda x: x.get("width", 0)).get("url")

def try_rapid_media_details(media_id):
    if not RAPIDAPI_HOST or not RAPIDAPI_KEY or not media_id:
        return None

    variants = [
        {"method": "GET", "path": "/media-details", "qs": {"media_id": media_id}},
        {"method": "GET", "path": "/mediaDetails",  "qs": {"media_id": media_id}},
        {"method": "GET", "path": "/media",         "qs": {"id": media_id}},
    ]
    for v in variants:
        try:
            url = f"https://{RAPIDAPI_HOST}{v['path']}"
            resp = requests.get(url, headers={
                "X-RapidAPI-Key": RAPIDAPI_KEY,
                "X-RapidAPI-Host": RAPIDAPI_HOST
            }, params=v["qs"], timeout=20)
            if resp.status_code != 200:
                continue
            data = resp.json()
            # image_versions2.candidates is the high-res thumbnail list
            candidates = data.get("image_versions2", {}).get("candidates", [])
            thumb = get_highest_res_image(candidates)
            video = first_non_empty(
                data.get("video_url"),
                data.get("video_versions", [{}])[0].get("url")
            )
            if thumb or video:
                return {"thumb": thumb, "video": video, "raw": data}
        except:
            continue
    return None

def try_rapid_resolve(share_url):
    if not RAPIDAPI_HOST or not RAPIDAPI_KEY:
        return None

    variants = [
        {"method": "GET",  "path": "/resolve-share-link", "qs": {"share_url": share_url}},
        {"method": "GET",  "path": "/resolve-share-link", "qs": {"url": share_url}},
        {"method": "GET",  "path": "/resolveShareLink",   "qs": {"url": share_url}},
        {"method": "GET",  "path": "/resolveShareLink",   "qs": {"share_url": share_url}},
        {"method": "GET",  "path": "/resolve",            "qs": {"link": share_url}},
    ]
    for v in variants:
        try:
            url = f"https://{RAPIDAPI_HOST}{v['path']}"
            resp = requests.get(url, headers={
                "X-RapidAPI-Key": RAPIDAPI_KEY,
                "X-RapidAPI-Host": RAPIDAPI_HOST
            }, params=v["qs"], timeout=20)
            if resp.status_code != 200:
                continue
            data = resp.json()
            media_id = first_non_empty(data.get("media_id"), data.get("id"), data.get("pk"), data.get("data", {}).get("media_id"))
            if media_id:
                return {"mediaId": media_id, "raw": data}
        except:
            continue
    return None

@app.get("/")
def home():
    return {"status": "ok", "message": "Recolekt API active"}

@app.post("/api/fetch")
def fetch(request: FetchRequest):
    url = request.url
    if not url or not url.startswith("https://www.instagram.com/reel/"):
        raise HTTPException(status_code=400, detail="Provide a valid Instagram reel URL.")

    # 1) Resolve media_id
    resolved = try_rapid_resolve(url)
    media_id = resolved.get("mediaId") if resolved else None

    # 2) Get Media Details (high-res)
    media = try_rapid_media_details(media_id) if media_id else None

    # 3) Fallback: OG scraping
    if not media or not (media.get("thumb") or media.get("video")):
        try:
            html = requests.get(url, headers={"User-Agent": "Mozilla/5.0"}, timeout=15).text
            og = extract_og(html)
            media = media or {}
            media["thumb"] = media.get("thumb") or og.get("thumb")
            media["video"] = media.get("video") or og.get("video")
        except:
            pass

    if not media or not (media.get("thumb") or media.get("video")):
        raise HTTPException(status_code=502, detail="Could not extract thumbnail or video.")

    return {
        "mediaId": media_id,
        "thumb": media.get("thumb"),
        "video": media.get("video")
    }
