from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
import requests, ffmpeg, os, tempfile

app = FastAPI()

RAPIDAPI_KEY = os.getenv("RAPIDAPI_KEY")
RAPIDAPI_HOST = "instagram-api-fast-reliable-data-scraper.p.rapidapi.com"

@app.get("/")
def home():
    return {"status": "ok", "message": "Recolekt API active"}

@app.post("/api/fetch")
async def fetch_instagram_data(request: Request):
    data = await request.json()
    reel_url = data.get("url")
    if not reel_url:
        return JSONResponse({"error": "Missing URL"}, status_code=400)

    # Step 1: Resolve share link → get media_id
    headers = {"x-rapidapi-key": RAPIDAPI_KEY, "x-rapidapi-host": RAPIDAPI_HOST}
    r = requests.get(
        f"https://{RAPIDAPI_HOST}/resolve_share_link",
        headers=headers,
        params={"link": reel_url}
    )
    media_id = r.json().get("data", {}).get("media", {}).get("id")
    if not media_id:
        return JSONResponse({"mediaId": None, "thumb": None, "video": None})

    # Step 2: Fetch video URL from media details
    r2 = requests.get(
        f"https://{RAPIDAPI_HOST}/media_details",
        headers=headers,
        params={"media_id": media_id}
    )
    media = r2.json().get("data", {})
    video_url = None
    if "video_versions" in media:
        video_url = media["video_versions"][0]["url"]

    if not video_url:
        return JSONResponse({"mediaId": media_id, "thumb": None, "video": None})

    # Step 3: Download and capture first frame
    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as video_file:
        video_data = requests.get(video_url)
        video_file.write(video_data.content)
        video_file_path = video_file.name

    image_path = tempfile.NamedTemporaryFile(suffix=".jpg", delete=False).name
    (
        ffmpeg
        .input(video_file_path, ss=0)
        .output(image_path, vframes=1, qscale=2)
        .run(capture_stdout=True, capture_stderr=True)
    )

    # You can now upload the image or return it as base64
    # For now just confirm it was created
    return {"mediaId": media_id, "thumb": image_path, "video": video_url}
