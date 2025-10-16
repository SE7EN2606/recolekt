import os
import tempfile
import time
import random
import subprocess
import requests
import json
import uuid
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from urllib.parse import urlencode
import yt_dlp
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Configuration
GCS_BUCKET = os.environ.get("GCS_BUCKET", "recolekt-storage")
CREDENTIALS_PATH = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "service-account.json")
CRAWLBASE_TOKEN = os.environ.get("CRAWLBASE_TOKEN", "l-a9kEqGcONKdgYJfKIQuw")
CRAWLBASE_HOST = os.environ.get("CRAWLBASE_HOST", "smartproxy.crawlbase.com")
CRAWLBASE_HTTP_PORT = os.environ.get("CRAWLBASE_HTTP_PORT", "8012")
CRAWLBASE_HTTPS_PORT = os.environ.get("CRAWLBASE_HTTPS_PORT", "8013")

# Initialize FastAPI
app = FastAPI(title="Instagram Thumbnail Extractor API")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Google Cloud Storage
bucket = None
try:
    # Try to initialize with service account file if it exists
    if os.path.exists(CREDENTIALS_PATH):
        from google.cloud import storage
        storage_client = storage.Client.from_service_account_json(CREDENTIALS_PATH)
        bucket = storage_client.get_bucket(GCS_BUCKET)
        print(f"✅ Connected to GCS bucket: {GCS_BUCKET}")
    else:
        print(f"⚠️ Service account file not found at {CREDENTIALS_PATH}")
        print("⚠️ GCS functionality will be disabled. Uploads will be stored locally.")
except Exception as e:
    print(f"❌ Error connecting to GCS: {str(e)}")
    print("⚠️ GCS functionality will be disabled. Uploads will be stored locally.")

# Request model
class ThumbnailRequest(BaseModel):
    url: str
    timestamp: str = "00:00:01"

# List of realistic user agents
USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Safari/605.1.15"
]

def get_random_headers():
    """Generate random headers to mimic a real browser"""
    return {
        "User-Agent": random.choice(USER_AGENTS),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Accept-Encoding": "gzip, deflate, br",
        "DNT": "1",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Pragma": "no-cache",
        "Cache-Control": "no-cache"
    }

def add_random_delay(min_seconds=1, max_seconds=3):
    """Add a random delay to mimic human behavior"""
    delay = random.uniform(min_seconds, max_seconds)
    time.sleep(delay)

def make_request_with_crawlbase(url, headers=None, timeout=30):
    """Make a request using Crawlbase to bypass Instagram's blocking"""
    try:
        # Set up proxy URL with your access token
        proxy_url = f"http://{CRAWLBASE_TOKEN}@{CRAWLBASE_HOST}:{CRAWLBASE_HTTP_PORT}"
        https_proxy_url = f"https://{CRAWLBASE_TOKEN}@{CRAWLBASE_HOST}:{CRAWLBASE_HTTPS_PORT}"
        
        # Set up the proxies dictionary
        proxies = {
            "http": proxy_url,
            "https": https_proxy_url
        }
        
        # Make the request using the requests library
        response = requests.get(
            url=url, 
            headers=headers, 
            proxies=proxies, 
            verify=False,
            timeout=timeout
        )
        
        return response
    except Exception as e:
        print(f"Error with Crawlbase: {str(e)}")
        # Fallback to direct request (might be blocked)
        return requests.get(url, headers=headers, timeout=timeout)

def extract_video_url_with_ytdlp(instagram_url):
    """Extract video URL using yt-dlp with proxy support"""
    try:
        # Configure yt-dlp options with Crawlbase proxy
        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'extract_flat': False,
            'format': 'best',
            'proxy': f"http://{CRAWLBASE_TOKEN}@{CRAWLBASE_HOST}:{CRAWLBASE_HTTP_PORT}",
        }
        
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(instagram_url, download=False)
            return info['url']
    except Exception as e:
        print(f"yt-dlp error with Crawlbase: {str(e)}")
        # Fallback to direct request (might be blocked)
        try:
            ydl_opts = {
                'quiet': True,
                'no_warnings': True,
                'extract_flat': False,
                'format': 'best',
            }
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(instagram_url, download=False)
                return info['url']
        except Exception as e2:
            print(f"yt-dlp error without proxy: {str(e2)}")
            return None

def extract_frame_with_ffmpeg(video_path, output_path, timestamp="00:00:01"):
    """Extract a frame from video using FFmpeg while maintaining aspect ratio"""
    try:
        # First get video resolution
        cmd = [
            "ffprobe", "-v", "error", "-select_streams", "v:0", 
            "-show_entries", "stream=width,height", "-of", "csv=s=x:p=0", video_path
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        if result.returncode != 0:
            print(f"FFprobe error: {result.stderr}")
            # Default to 1080x1920 (9:16 aspect ratio) if we can't detect
            width, height = 1080, 1920
        else:
            # Parse the resolution string correctly
            resolution = result.stdout.strip()
            if 'x' in resolution:
                width_str, height_str = resolution.split('x')
                width = int(width_str)
                height = int(height_str)
            else:
                # Fallback to default
                width, height = 1080, 1920
        
        print(f"Original video resolution: {width}x{height}")
        
        # Ensure minimum width of 1080 while maintaining aspect ratio
        if width < 1080:
            scale_factor = 1080 / width
            width = 1080
            height = int(height * scale_factor)
            print(f"Scaling up to: {width}x{height}")
        
        # Convert timestamp to seconds for FFmpeg
        if ":" in timestamp:
            h, m, s = timestamp.split(":")
            seconds = int(h) * 3600 + int(m) * 60 + float(s)
        else:
            seconds = float(timestamp)
        
        # Extract frame at the specified timestamp
        cmd = [
            "ffmpeg", "-i", video_path, "-ss", str(seconds), 
            "-vframes", "1", "-vf", f"scale={width}:{height}",
            "-y", output_path
        ]
        
        print(f"Running FFmpeg command: {' '.join(cmd)}")
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        if result.returncode != 0:
            print(f"FFmpeg error: {result.stderr}")
            return False, 0, 0
        
        # Check if output file was created and has content
        if os.path.exists(output_path) and os.path.getsize(output_path) > 0:
            print(f"FFmpeg success! Output file size: {os.path.getsize(output_path)} bytes")
            return True, width, height
        else:
            print("FFmpeg output file not created or empty")
            return False, 0, 0
    except Exception as e:
        print(f"Error extracting frame: {str(e)}")
        return False, 0, 0

@app.post("/api/extract-thumbnail")
async def extract_thumbnail(request: ThumbnailRequest):
    """Extract thumbnail from Instagram reel"""
    try:
        # Add random delay to mimic human behavior
        add_random_delay()
        
        # Get random headers
        headers = get_random_headers()
        
        # Extract video URL using yt-dlp with Crawlbase proxy
        print(f"🎬 Processing Instagram reel: {request.url}")
        print("📡 Attempting video URL extraction with yt-dlp...")
        
        video_url = extract_video_url_with_ytdlp(request.url)
        
        if not video_url:
            raise HTTPException(status_code=404, detail="Could not extract video URL")
        
        print(f"Found video URL with yt-dlp: {video_url}")
        print(f"✅ Found video URL: {video_url[:50]}...")
        
        # Download video using Crawlbase proxy
        print("⬇️  Downloading video...")
        with tempfile.TemporaryDirectory() as temp_dir:
            video_path = os.path.join(temp_dir, "temp_video.mp4")
            
            response = make_request_with_crawlbase(video_url, headers=headers)
            response.raise_for_status()
            
            with open(video_path, "wb") as f:
                f.write(response.content)
            
            print(f"✅ Video downloaded: {len(response.content)} bytes to {video_path}")
            
            # Extract frame using FFmpeg
            print("📸 Extracting frame with FFmpeg...")
            output_path = os.path.join(temp_dir, "thumbnail.jpg")
            success, width, height = extract_frame_with_ffmpeg(video_path, output_path, request.timestamp)
            
            if not success:
                raise HTTPException(status_code=500, detail="Failed to extract frame")
            
            print(f"✅ Frame extracted to: {output_path}")
            print(f"Extracted image resolution: {width}x{height}")
            
            # Upload to Google Cloud Storage or save locally
            print("☁️  Uploading thumbnail...")
            
            # Generate a unique filename
            timestamp_str = str(int(time.time()))
            unique_id = str(uuid.uuid4())[:8]
            filename = f"instagram_{unique_id}_{timestamp_str}_high.jpg"
            
            if bucket:
                # Upload to Google Cloud Storage
                blob_name = f"thumbnails/{filename}"
                blob = bucket.blob(blob_name)
                blob.upload_from_filename(output_path, content_type="image/jpeg")
                
                # Make the blob publicly accessible
                blob.make_public()
                
                public_url = blob.public_url
                print(f"✅ Using existing bucket: {GCS_BUCKET}")
                print(f"File uploaded to GCS: {public_url}")
                
                # Verify the URL is accessible
                try:
                    verify_response = requests.get(public_url)
                    if verify_response.status_code == 200:
                        print(f"✅ GCS URL is accessible: {public_url}")
                    else:
                        print(f"⚠️ GCS URL returned status: {verify_response.status_code}")
                except Exception as e:
                    print(f"⚠️ Error verifying GCS URL: {str(e)}")
            else:
                # Save locally if GCS is not available
                local_dir = "thumbnails"
                os.makedirs(local_dir, exist_ok=True)
                local_path = os.path.join(local_dir, filename)
                
                # Copy the file to the local directory
                import shutil
                shutil.copy2(output_path, local_path)
                
                # Return a local URL (this won't work in production without a static file server)
                public_url = f"http://localhost:8000/{local_path}"
                print(f"✅ File saved locally: {local_path}")
            
            print(f"✅ Thumbnail uploaded: {public_url}")
            
            return {
                "success": True,
                "thumbnail_url": public_url,
                "width": width,
                "height": height,
                "message": "Thumbnail extracted successfully"
            }
    
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Processing error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Processing error: {str(e)}")

@app.get("/api/health")
def health_check():
    """Health check endpoint"""
    
    # Check FFmpeg availability
    try:
        result = subprocess.run(["ffmpeg", "-version"], capture_output=True, timeout=5)
        ffmpeg_ok = result.returncode == 0
        ffmpeg_version = result.stdout.decode().split('\n')[0] if ffmpeg_ok else "Not available"
    except:
        ffmpeg_ok = False
        ffmpeg_version = "Not available"
    
    # Check Google Cloud Storage connectivity
    gcs_ok = bucket is not None
    gcs_message = f"Connected to bucket: {GCS_BUCKET}" if gcs_ok else "Not available"
    
    # Check yt-dlp availability
    try:
        import yt_dlp
        ytdlp_ok = True
        ytdlp_version = yt_dlp.version.__version__
    except:
        ytdlp_ok = False
        ytdlp_version = "Not available"
    
    # Check Crawlbase token
    crawlbase_ok = CRAWLBASE_TOKEN != "YOUR_CRAWLBASE_TOKEN"
    
    return {
        "status": "ok",
        "timestamp": int(time.time()),
        "ffmpeg": {
            "available": ffmpeg_ok,
            "version": ffmpeg_version
        },
        "gcs": {
            "available": gcs_ok,
            "message": gcs_message
        },
        "ytdlp": {
            "available": ytdlp_ok,
            "version": ytdlp_version
        },
        "crawlbase": {
            "configured": crawlbase_ok,
            "token_set": crawlbase_ok
        }
    }

if __name__ == "__main__":
    import uvicorn
    print("🚀 Starting Instagram Thumbnail Extractor API...")
    print(f"📁 Using GCS bucket: {GCS_BUCKET}")
    print(f"🔑 Using credentials: {CREDENTIALS_PATH}")
    print(f"🕷️ Using Crawlbase token: {CRAWLBASE_TOKEN[:10]}..." if CRAWLBASE_TOKEN != "YOUR_CRAWLBASE_TOKEN" else "⚠️ Crawlbase token not configured")
    uvicorn.run(app, host="0.0.0.0", port=8000)
