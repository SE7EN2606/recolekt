import os
import requests
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from tempfile import NamedTemporaryFile
from bs4 import BeautifulSoup
import re
import json

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
    allow_origins=["*"],  # Allow all origins for testing purposes
    allow_methods=["*"],  # Allow all methods (GET, POST, etc.)
    allow_headers=["*"],  # Allow all headers
)

# ------------------------
# Helper functions
# ------------------------

def extract_video_url_from_html(html: str) -> str | None:
    """Fallback: Extract video URL directly from Instagram HTML."""
    # Parse the HTML with BeautifulSoup
    soup = BeautifulSoup(html, 'html.parser')

    # Try to extract the video URL directly from <meta> tags (og:video)
    video_url = None
    og_video_tag = soup.find('meta', property='og:video')
    if og_video_tag:
        video_url = og_video_tag.get('content')

    # If no video URL found from og:video, try to extract the video URL from the inline script
    if not video_url:
        script_tag = soup.find('script', text=re.compile('window\._sharedData'))
        if script_tag:
            shared_data = script_tag.string
            start_idx = shared_data.find('"video_url":"') + len('"video_url":"')
            end_idx = shared_data.find('",', start_idx)
            if start_idx != -1 and end_idx != -1:
                video_url = shared_data[start_idx:end_idx]

    return video_url

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

    # Step 2: Try extracting the video URL using fallback HTML extraction
    video_url = extract_video_url_from_html(html)

    if not video_url:
        raise HTTPException(status_code=502, detail="Could not extract video URL.")

    # Step 3: Download the video
    video_path = download_video(video_url)

    # Step 4: Extract thumbnail from the video
    thumbnail_path = extract_thumbnail_from_video(video_path)

    return {"thumb": thumbnail_path, "video": video_url}
