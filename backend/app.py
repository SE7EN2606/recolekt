import os
import re
import subprocess
import tempfile
import requests
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import uuid
import time
import json
import shutil
import base64

# Try to import Google Cloud Storage, with fallback
try:
    from google.cloud import storage
    GCS_AVAILABLE = True
except ImportError:
    print("Google Cloud Storage module not available. Using fallback.")
    GCS_AVAILABLE = False

# ------------------------
# Config - Render Environment Variables
# ------------------------
GCS_BUCKET = os.getenv("GCS_BUCKET", "recolekt-storage")
CREDENTIALS_JSON = os.getenv("GOOGLE_APPLICATION_CREDENTIALS_JSON")
INSTAGRAM_API_KEY = os.getenv("INSTAGRAM_API_KEY", "YOUR_INSTAGRAM_API_KEY_HERE")  # We'll use this as a fallback

# Initialize Google Cloud Storage client if available
storage_client = None
if GCS_AVAILABLE and CREDENTIALS_JSON:
    try:
        # Create a temporary file with the JSON content
        import tempfile
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as temp_file:
            temp_file.write(CREDENTIALS_JSON)
            temp_path = temp_file.name
        
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = temp_path
        storage_client = storage.Client()
        print("Google Cloud Storage client initialized successfully.")
    except Exception as e:
        print(f"Failed to initialize Google Cloud Storage client: {e}")
        storage_client = None

# ------------------------
# Request schema
# ------------------------
class FetchRequest(BaseModel):
    url: str

# ------------------------
# FastAPI app
# ------------------------
app = FastAPI(title="Instagram Thumbnail Extractor API")

# Configure CORS for your frontend
allowed_origins = [
    "https://recolekt-frontend.onrender.com",  # Your frontend URL
    "http://localhost:3000",  # For local development
    "https://localhost:3000",
    "https://recolekt-backend.onrender.com",  # Allow backend to call itself
    "*"  # Allow all origins (temporary for debugging)
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# ------------------------
# Helper functions
# ------------------------

def check_ffmpeg():
    """Check if FFmpeg is installed and available"""
    return shutil.which("ffmpeg") is not None

def extract_thumbnail_with_instagram_api(url: str) -> str | None:
    """Extract thumbnail using a third-party Instagram API service"""
    
    try:
        # Method 1: Use InstaSave API (free tier available)
        api_url = "https://insta-save.com/api/instagram"
        
        payload = {
            "url": url,
            "action": "thumbnail"
        }
        
        headers = {
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        }
        
        response = requests.post(api_url, json=payload, headers=headers, timeout=15)
        
        if response.status_code == 200:
            data = response.json()
            if 'thumbnail' in data and data['thumbnail']:
                print(f"Found thumbnail with InstaSave API: {data['thumbnail']}")
                return data['thumbnail']
        
        return None
    except Exception as e:
        print(f"Error with InstaSave API: {e}")
        return None

def extract_thumbnail_with_insta_api(url: str) -> str | None:
    """Extract thumbnail using Insta API"""
    
    if not INSTAGRAM_API_KEY or INSTAGRAM_API_KEY == "YOUR_INSTAGRAM_API_KEY_HERE":
        print("Insta API key not configured. Skipping this method.")
        return None
    
    try:
        # Extract the shortcode from the URL
        shortcode = url.split('/reel/')[-1].split('/')[0].split('?')[0]
        
        api_url = f"https://graph.instagram.com/v13.0/ig_shortcode_media?shortcode={shortcode}&fields=thumbnail_url"
        
        headers = {
            "Authorization": f"Bearer {INSTAGRAM_API_KEY}",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        }
        
        response = requests.get(api_url, headers=headers, timeout=15)
        
        if response.status_code == 200:
            data = response.json()
            if 'data' in data and len(data['data']) > 0:
                media = data['data'][0]
                if 'thumbnail_url' in media:
                    print(f"Found thumbnail with Insta API: {media['thumbnail_url']}")
                    return media['thumbnail_url']
        
        return None
    except Exception as e:
        print(f"Error with Insta API: {e}")
        return None

def extract_thumbnail_with_pixelpo(url: str) -> str | None:
    """Extract thumbnail using Pixelpo API"""
    
    try:
        api_url = "https://api.pixelpo.com/api/instagram"
        
        payload = {
            "url": url,
            "size": "large"
        }
        
        headers = {
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        }
        
        response = requests.post(api_url, json=payload, headers=headers, timeout=15)
        
        if response.status_code == 200:
            data = response.json()
            if 'response' in data and 'media' in data['response']:
                for media in data['response']['media']:
                    if media.get('type') == 'image':
                        print(f"Found thumbnail with Pixelpo API: {media['url']}")
                        return media['url']
        
        return None
    except Exception as e:
        print(f"Error with Pixelpo API: {e}")
        return None

def extract_frame_with_ffmpeg(video_url: str, output_path: str) -> tuple[bool, int, int]:
    """Extract first frame using FFmpeg at original resolution"""
    
    if not check_ffmpeg():
        print("FFmpeg not found. Please install FFmpeg on the server.")
        return False, 1080, 1920
    
    try:
        # First, get video information to determine original resolution
        info_cmd = [
            "ffmpeg",
            "-i", video_url,
            "-f", "null",
            "-"
        ]
        
        info_result = subprocess.run(
            info_cmd,
            capture_output=True,
            text=True,
            timeout=15
        )
        
        # Parse resolution from stderr
        width, height = 1080, 1920  # Default values
        resolution_match = re.search(r'(\d{3,4})x(\d{3,4})', info_result.stderr)
        if resolution_match:
            width = int(resolution_match.group(1))
            height = int(resolution_match.group(2))
            print(f"Original video resolution: {width}x{height}")
            
            # Determine if we need to scale up
            target_width = width
            target_height = height
            
            # For Instagram Reels, we want at least 1080px width
            if width < 1080:
                scale_factor = 1080 / width
                target_width = 1080
                target_height = int(height * scale_factor)
                print(f"Scaling up to: {target_width}x{target_height}")
            else:
                target_width = width
                target_height = height
        else:
            print(f"Could not get video info, using default resolution")
            target_width = 1080
            target_height = 1920  # Default to 9:16 aspect ratio
        
        # Extract frame with original aspect ratio
        cmd = [
            "ffmpeg",
            "-i", video_url,
            "-ss", "0.5",  # Skip first 0.5 seconds to avoid black frames
            "-vframes", "1",  # Extract only 1 frame
            "-f", "image2",
            "-y",  # Overwrite output file
            "-vf", f"scale={target_width}:{target_height}",
            "-q:v", "2",  # High quality
            output_path
        ]
        
        print(f"Running FFmpeg command: {' '.join(cmd[:10])}... (truncated)")
        
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=45  # Increased timeout
        )
        
        if result.returncode != 0:
            print(f"FFmpeg error: {result.stderr}")
            return False, target_width, target_height
        else:
            print(f"FFmpeg success! Output file size: {os.path.getsize(output_path) if os.path.exists(output_path) else 0} bytes")
            return True, target_width, target_height
        
    except subprocess.TimeoutExpired:
        print("FFmpeg timeout")
        return False, 1080, 1920
    except Exception as e:
        print(f"FFmpeg error: {e}")
        return False, 1080, 1920

def upload_to_gcs(file_path: str, blob_name: str) -> str | None:
    """Upload file to Google Cloud Storage and return public URL"""
    if not GCS_AVAILABLE or not storage_client:
        print("Google Cloud Storage not available. Skipping upload.")
        return None
    
    try:
        # Get or create bucket
        bucket = None
        try:
            # Try to get the existing bucket
            bucket = storage_client.get_bucket(GCS_BUCKET)
            print(f"✅ Using existing bucket: {GCS_BUCKET}")
        except Exception as e:
            print(f"Bucket doesn't exist or can't be accessed: {e}")
            try:
                # Try to create the bucket
                bucket = storage_client.create_bucket(GCS_BUCKET)
                print(f"✅ Created new bucket: {GCS_BUCKET}")
            except Exception as create_error:
                print(f"Failed to create bucket: {create_error}")
                # Try one more time to get the bucket (in case it was created by another process)
                try:
                    bucket = storage_client.get_bucket(GCS_BUCKET)
                    print(f"✅ Retrieved bucket on second attempt: {GCS_BUCKET}")
                except Exception as final_error:
                    print(f"❌ Could not access bucket: {final_error}")
                    raise HTTPException(status_code=500, detail=f"Failed to access GCS bucket: {final_error}")
        
        # Create blob and upload file
        blob = bucket.blob(blob_name)
        
        # Set content type to ensure proper serving
        blob.content_type = 'image/jpeg'
        
        # Upload the file
        blob.upload_from_filename(file_path)
        
        # Make the blob publicly readable
        blob.make_public()
        
        # Verify the public URL
        public_url = blob.public_url
        print(f"File uploaded to GCS: {public_url}")
        
        # Test if the URL is accessible
        try:
            test_response = requests.head(public_url, timeout=5)
            if test_response.status_code == 200:
                print(f"✅ GCS URL is accessible: {public_url}")
                return public_url
            else:
                print(f"⚠️ GCS URL returned status {test_response.status_code}")
                # Return the URL anyway, but log the issue
                return public_url
        except Exception as e:
            print(f"⚠️ Could not verify GCS URL accessibility: {e}")
            # Return the URL anyway, but log the issue
            return public_url
        
    except Exception as e:
        print(f"GCS upload error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to upload to cloud storage: {e}")

def process_instagram_reel(url: str) -> dict:
    """Main processing function"""
    
    print(f"\n🎬 Processing Instagram reel: {url}")
    
    # Step 1: Extract thumbnail using multiple methods
    thumbnail_url = None
    
    # Method 1: Try InstaSave API first
    print("📡 Attempting thumbnail extraction with InstaSave API...")
    thumbnail_url = extract_thumbnail_with_insta_save(url)
    
    # Method 2: Try Insta API if InstaSave fails
    if not thumbnail_url:
        print("📡 Attempting thumbnail extraction with Insta API...")
        thumbnail_url = extract_thumbnail_with_insta_api(url)
    
    # Method 3: Try Pixelpo API if others fail
    if not thumbnail_url:
        print("📡 Attempting thumbnail extraction with Pixelpo API...")
        thumbnail_url = extract_thumbnail_with_pixelpo(url)
    
    if not thumbnail_url:
        print("❌ All thumbnail extraction methods failed")
        raise HTTPException(
            status_code=404, 
            detail="Could not extract thumbnail from Instagram. The post might be private, deleted, or Instagram is blocking our request."
        )
    
    print(f"✅ Found thumbnail: {thumbnail_url[:100]}...")
    
    # Step 2: Create temporary files
    temp_dir = tempfile.mkdtemp()
    temp_thumbnail_path = os.path.join(temp_dir, "thumbnail.jpg")
    
    try:
        # Step 3: Download thumbnail
        print("⬇️  Downloading thumbnail...")
        
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        }
        
        thumbnail_resp = requests.get(thumbnail_url, stream=True, timeout=30, headers=headers)
        thumbnail_resp.raise_for_status()
        
        total_size = 0
        with open(temp_thumbnail_path, 'wb') as f:
            for chunk in thumbnail_resp.iter_content(chunk_size=8192):
                f.write(chunk)
                total_size += len(chunk)
        
        print(f"✅ Thumbnail downloaded: {total_size} bytes to {temp_thumbnail_path}")
        
        # Step 4: Upload to Google Cloud Storage if available
        final_thumbnail_url = thumbnail_url
        if GCS_AVAILABLE and storage_client:
            print("☁️  Uploading to Google Cloud Storage...")
            unique_id = str(uuid.uuid4())
            blob_name = f"thumbnails/instagram_{unique_id}_high.jpg"
            gcs_url = upload_to_gcs(temp_thumbnail_path, blob_name)
            
            if gcs_url:
                final_thumbnail_url = gcs_url
        
        print(f"✅ Thumbnail ready: {final_thumbnail_url[:50]}...")
        
        return {
            "success": True,
            "thumbnail_url": final_thumbnail_url,
            "instagram_url": url,
            "blob_name": blob_name if GCS_AVAILABLE and storage_client else None,
            "file_size": os.path.getsize(temp_thumbnail_path)
        }
        
    finally:
        # Cleanup temporary files
        print("🧹 Cleaning up temporary files...")
        if os.path.exists(temp_thumbnail_path):
            os.remove(temp_thumbnail_path)
        if os.path.exists(temp_dir):
            os.rmdir(temp_dir)

def base64_encode_image(image_path: str) -> str:
    """Encode an image file as base64"""
    with open(image_path, "rb") as image_file:
        return base64.b64encode(image_file.read()).decode('utf-8')

# ------------------------
# Routes
# ------------------------

@app.get("/")
def home():
    return {"status": "ok", "message": "Instagram Thumbnail Extractor API", "timestamp": int(time.time())}

@app.post("/api/extract-thumbnail")
def extract_thumbnail(req: FetchRequest):
    """Extract clean thumbnail from Instagram Reel"""
    
    url = req.url.strip()
    if not url or not re.match(r'https://www\.instagram\.com/reel/[\w-]+', url):
        raise HTTPException(status_code=400, detail="Invalid Instagram reel URL")
    
    try:
        result = process_instagram_reel(url)
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Processing error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Processing error: {str(e)}")

@app.get("/api/health")
def health_check():
    """Health check endpoint"""
    
    # Check FFmpeg availability
    ffmpeg_ok = check_ffmpeg()
    ffmpeg_version = "Not available"
    if ffmpeg_ok:
        try:
            result = subprocess.run(["ffmpeg", "-version"], capture_output=True, timeout=5)
            if result.returncode == 0:
                ffmpeg_version = result.stdout.decode().split('\n')[0]
        except:
            pass
    
    # Check Google Cloud Storage connectivity
    gcs_ok = GCS_AVAILABLE and storage_client is not None
    gcs_message = "Available" if gcs_ok else "Not available"
    
    # Check Insta API key
    insta_api_ok = INSTAGRAM_API_KEY is not None and INSTAGRAM_API_KEY != "YOUR_INSTAGRAM_API_KEY_HERE"
    insta_message = "Available" if insta_api_ok else "Not available"
    
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
        "insta": {
            "available": insta_api_ok,
            "message": insta_message
        }
    }

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
