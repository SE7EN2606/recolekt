from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
import httpx
import os

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

RAPIDAPI_KEY = os.getenv("RAPIDAPI_KEY", "55842e9f58mshf59f6d5ec196bbbp1251a1jsn48b330063f49")
RAPIDAPI_HOST = "instagram-api-fast-reliable-data-scraper.p.rapidapi.com"
BASE_URL = f"https://{RAPIDAPI_HOST}"

@app.post("/api/fetch")
async def fetch_instagram_data(req: Request):
    body = await req.json()
    url = body.get("url")
    print("Received URL:", url)

    # Example: for testing use a fixed user_id to see if RapidAPI responds
    params = {
        "user_id": "25025320",           # example: Instagram official account
        "include_feed_video": "true"
    }

    headers = {
        "x-rapidapi-host": RAPIDAPI_HOST,
        "x-rapidapi-key": RAPIDAPI_KEY
    }

    async with httpx.AsyncClient() as client:
        r = await client.get(f"{BASE_URL}/reels", headers=headers, params=params)
        text = r.text
        print("RapidAPI response:", text)
        return {"status": r.status_code, "data": text}
