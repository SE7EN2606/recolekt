import os
import requests
import subprocess
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from tempfile import NamedTemporaryFile
import shutil

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
            thumb = data.get("thumbnail_url") or data.get("video_url")
            video = data.get("video_url")
            if thumb or video:
                return {"thumb": thumb, "video": video, "raw": data}
        except Exception:
            continue
    return None

def download_video(url: str) -> str:
    """Download video from the provided URL and save it to a temporary file."""
    video_response = requests.get(url, stream=True)
    if video_response.status_code == 200:
        with NamedTemporaryFile(delete=False, suffix=".mp4") as temp_file:
            for chunk in video_response.iter_content(chunk_size=1024):
                if chunk:
                    temp_file.write(chunk)
            return temp_file.name
    else:
        raise HTTPException(status_code=400, detail="Failed to download video.")

def extract_thumbnail_from_video(video_path: str) -> str:
    """Extract the first frame from the video as a thumbnail using FFmpeg."""
    output_image_path = f"{video_path}.jpg"
    command = [
        "ffmpeg",
        "-i", video_path,                # Input video file
        "-vf", "select=eq(n\,0)",        # Select the first frame
        "-vsync", "vfr",                 # Ensures proper frame extraction
        "-q:v", "2",                     # Set quality for image output
        output_image_path                # Output image file
    ]
    subprocess.run(command, check=True)
    return output_image_path

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

    if not result.get("video"):
        raise HTTPException(
            status_code=502,
            detail="Could not extract video URL. Check RapidAPI endpoint."
        )

    # Step 5: Download the video
    video_path = download_video(result["video"])

    # Step 6: Extract thumbnail from the video
    thumbnail_path = extract_thumbnail_from_video(video_path)

    return {"mediaId": media_id, "thumb": thumbnail_path, "video": result["video"]}
