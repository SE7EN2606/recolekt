import os
import requests
import subprocess
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
    """Fallback: Extract the video URL directly from Instagram HTML."""
    # Regex to find the embedded JSON data containing the video URL
    pattern = re.compile(r'window\._sharedData = ({.*?});</script>', re.DOTALL)
    match = pattern.search(html)
    
    if not match:
        return None
    
    # Extract JSON data from the matched string
    shared_data = match.group(1)
    
    # Load the shared data into a Python dictionary
    try:
        data = json.loads(shared_data)
        
        # Extract the video URL (this is generally within the 'graphql' key)
        video_url = None
        if "graphql" in data:
            # Traverse the JSON structure to find the video URL
            video_data = data["graphql"].get("shortcode_media", {})
            video_url = video_data.get("video_url")
        
        return video_url
    
    except json.JSONDecodeError:
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

    # Step 2: Try extracting the video URL using RapidAPI (optional)
    video_url = extract_video_url_from_html(html)
    
    if not video_url:
        raise HTTPException(status_code=502, detail="Could not extract video URL.")

    # Step 3: Download the video
    video_path = download_video(video_url)

    # Step 4: Extract thumbnail from the video
    thumbnail_path = extract_thumbnail_from_video(video_path)

    return {"thumb": thumbnail_path, "video": video_url}
