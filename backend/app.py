from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import requests
from fastapi.middleware.cors import CORSMiddleware

class FetchRequest(BaseModel):
    url: str

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
def fetch_instagram_thumbnail(request: FetchRequest):
    url = request.url
    if not url:
        raise HTTPException(status_code=400, detail="Missing URL")

    API_URL = "https://instagram-scraper-api2.p.rapidapi.com/media_info_v2"
    headers = {
        "x-rapidapi-key": "55842e9f58mshf59f6d5ec196bbbp1251a1jsn48b330063f49",
        "x-rapidapi-host": "iinstagram-api-fast-reliable-data-scraper.p.rapidapi.com",
    }
    query = {"url": url}

    try:
        response = requests.get(API_URL, headers=headers, params=query, timeout=20)
        if response.status_code != 200:
            raise HTTPException(status_code=response.status_code, detail=response.text)

        data = response.json()
        thumbnail_url = (
            data.get("data", {}).get("items", [{}])[0]
            .get("image_versions2", {})
            .get("candidates", [{}])[0]
            .get("url")
        )

        if not thumbnail_url:
            raise HTTPException(status_code=404, detail="Thumbnail not found")

        return {"status": 200, "thumbnail_url": thumbnail_url}

    except requests.RequestException as e:
        raise HTTPException(status_code=500, detail=str(e))
