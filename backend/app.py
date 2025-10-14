from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import requests

# ----- Config -----
RAPIDAPI_KEY = "55842e9f58mshf59f6d5ec196bbbp1251a1jsn48b330063f49"
RAPIDAPI_HOST = "instagram-api-fast-reliable-data-scraper.p.rapidapi.com"

# ----- Request Body -----
class ReelRequest(BaseModel):
    url: str  # full https://www.instagram.com/reel/... link

# ----- App -----
app = FastAPI()

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def home():
    return {"status": "ok", "message": "Recolekt API active"}

@app.post("/api/fetch")
def fetch_reel_thumbnail(request: ReelRequest):
    """
    Fetch thumbnail from a public Instagram Reel URL
    Flow:
    1. Resolve Share Link → get media_id
    2. Media Details → get thumbnail_url
    """
    url = request.url
    if not url:
        raise HTTPException(status_code=400, detail="Missing URL")

    try:
        # 1️⃣ Resolve Share Link
        resolve_endpoint = f"https://{RAPIDAPI_HOST}/resolve_share_link"
        headers = {
            "X-Rapidapi-Key": RAPIDAPI_KEY,
            "X-Rapidapi-Host": RAPIDAPI_HOST,
        }
        params = {"url": url}

        res = requests.get(resolve_endpoint, headers=headers, params=params, timeout=20)
        if res.status_code != 200:
            raise HTTPException(status_code=res.status_code, detail=res.text)
        media_id = res.json().get("media_id")
        if not media_id:
            raise HTTPException(status_code=404, detail="Could not resolve media ID")

        # 2️⃣ Get Media Details
        media_endpoint = f"https://{RAPIDAPI_HOST}/media/{media_id}"
        media_res = requests.get(media_endpoint, headers=headers, timeout=20)
        if media_res.status_code != 200:
            raise HTTPException(status_code=media_res.status_code, detail=media_res.text)

        media_data = media_res.json()
        # Try common paths for thumbnail
        thumbnail_url = (
            media_data.get("thumbnail_url")
            or media_data.get("cover_frame_url")
            or media_data.get("image_versions2", {})
                   .get("candidates", [{}])[0]
                   .get("url")
        )
        if not thumbnail_url:
            raise HTTPException(status_code=404, detail="Thumbnail not found")

        return {"status": 200, "thumbnail_url": thumbnail_url}

    except requests.RequestException as e:
        raise HTTPException(status_code=500, detail=str(e))
