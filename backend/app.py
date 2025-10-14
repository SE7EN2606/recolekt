from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
import requests, ffmpeg, os, tempfile, base64

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

    headers = {
        "x-rapidapi-key": RAPIDAPI_KEY,
        "x-rapidapi-host": RAPIDAPI_HOST
    }

    # Step 1: Resolve share link → get media_id
    r = requests.get(
        f"https://{RAPIDAPI_HOST}/resolve_share_link",
        headers=headers,
        params={"link": reel_url},
        timeout=20
    )

    print("RapidAPI resolve response:", r.text)
    if r.status_code != 200:
        return JSONResponse({"error": "RapidAPI resolve_share_link failed", "detail": r.text}, status_code=502)

    media_id = r.json().get("data", {}).get("media", {}).get("id")
    if not media_id:
        return JSONResponse({"mediaId": None, "thumb": None, "video": None, "error": "Media ID not found"})

    # Step 2: Fetch video details
    r2 = requests.get(
        f"https://{RAPIDAPI_HOST}/media_details",
        headers=headers,
        params={"media_id": media_id},
        timeout=20
    )

    print("RapidAPI media_details response:", r2.text)
    if r2.status_code != 200:
        return JSONResponse({"error": "RapidAPI media_details failed", "detail": r2.text}, status_code=502)

    media = r2.json().get("data", {})
    video_url = None
    if isinstance(media, dict) and "video_versions" in media:
        video_url = media["video_versions"][0]["url"]

    if not video_url:
        return JSONResponse({"mediaId": media_id, "thumb": None, "video": None, "error": "Video URL not found"})

    # Step 3: Download video and capture first frame
    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as video_file:
        video_data = requests.get(video_url, stream=True)
        for chunk in video_data.iter_content(chunk_size=8192):
            video_file.write(chunk)
        video_file_path = video_file.name

    image_path = tempfile.NamedTemporaryFile(suffix=".jpg", delete=False).name
    (
        ffmpeg
        .input(video_file_path, ss=0)
        .output(image_path, vframes=1, qscale=2)
        .run(capture_stdout=True, capture_stderr=True)
    )

    # Convert image to base64 for return (optional)
    with open(image_path, "rb") as img_file:
        thumb_b64 = base64.b64encode(img_file.read()).decode("utf-8")

    return {
        "mediaId": media_id,
        "video": video_url,
        "thumb_b64": thumb_b64
    }
