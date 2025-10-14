import requests
from bs4 import BeautifulSoup
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware

# ------------------------
# Config
# ------------------------
app = FastAPI()

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class FetchRequest(BaseModel):
    url: str

def extract_og_thumbnail(url: str) -> str:
    """Extract the thumbnail image URL using OpenGraph (og:image) from Instagram"""
    headers = {
        "User-Agent": "Mozilla/5.0"
    }
    
    # Fetch the Instagram page HTML
    try:
        response = requests.get(url, headers=headers)
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Look for OpenGraph image meta tag
        og_image = soup.find("meta", property="og:image")
        
        if og_image:
            return og_image["content"]
        else:
            raise HTTPException(status_code=502, detail="Could not find the thumbnail.")
    
    except requests.exceptions.RequestException as e:
        raise HTTPException(status_code=502, detail=f"Error fetching the URL: {str(e)}")

@app.get("/")
def home():
    return {"status": "ok", "message": "Recolekt API active"}

@app.post("/api/fetch")
def fetch_instagram_thumbnail(req: FetchRequest):
    url = req.url
    if not url.startswith("https://www.instagram.com/reel/"):
        raise HTTPException(status_code=400, detail="Provide a valid Instagram reel URL.")
    
    # Step 1: Extract the thumbnail image using OpenGraph meta tag
    thumb_url = extract_og_thumbnail(url)
    
    return {"thumb": thumb_url}
