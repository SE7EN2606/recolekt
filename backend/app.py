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
RAPIDAPI_KEY = os.getenv("RAPIDAPI_KEY", "YOUR_RAPIDAPI_KEY_HERE")  # We'll use this as a fallback

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

def extract_video_url_with_rapidapi(url: str) -> str | None:
    """Extract video URL using RapidAPI as a fallback"""
    
    if not RAPIDAPI_KEY or RAPIDAPI_KEY == "YOUR_RAPIDAPI_KEY_HERE":
        print("RapidAPI key not configured. Skipping this method.")
        return None
    
    try:
        api_url = "https://instagram-downloader-download-instagram-videos-stories.p.rapidapi.com/index"
        
        querystring = {"url": url}
        
        headers = {
            "X-RapidAPI-Key": RAPIDAPI_KEY,
            "X-RapidAPI-Host": "instagram-downloader-download-instagram-videos-stories.p.rapidapi.com"
        }
        
        response = requests.get(api_url, headers=headers, params=querystring, timeout=15)
        
        if response.status_code == 200:
            data = response.json()
            if 'media' in data and data['media']:
                print(f"Found video URL with RapidAPI: {data['media']}")
                return data['media']
        
        return None
    except Exception as e:
        print(f"Error with RapidAPI extraction: {e}")
        return None

def extract_video_url_with_ytdlp(url: str) -> str | None:
    """Extract video URL using yt-dlp with special options"""
    
    try:
        import yt_dlp
        
        # Special options to bypass Instagram restrictions
        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'extract_flat': False,
            'user_agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
            'referer': 'https://www.instagram.com/',
            'extractor_args': {
                'youtube': {
                    'player_client': 'android',
                    'player_skip': ['configs', 'webpage', 'dash'],
                }
            }
        }
        
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            
            if 'url' in info:
                print(f"Found video URL with yt-dlp: {info['url']}")
                return info['url']
            
            # Try to find the best format
            if 'formats' in info:
                for format in info['formats']:
                    if format.get('vcodec') != 'none' and format.get('acodec') != 'none':
                        print(f"Found video URL with yt-dlp: {format['url']}")
                        return format['url']
        
        return None
    except Exception as e:
        print(f"Error with yt-dlp extraction: {e}")
        return None

def extract_video_url_with_direct_api(url: str) -> str | None:
    """Extract video URL using a direct API approach"""
    
    try:
        # Extract the shortcode from the URL
        shortcode = url.split('/reel/')[-1].split('/')[0].split('?')[0]
        
        # Try different API endpoints
        api_urls = [
            f"https://www.instagram.com/reel/{shortcode}/?__a=1",
            f"https://www.instagram.com/p/{shortcode}/?__a=1",
        ]
        
        headers = {
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15",
            "Accept": "application/json",
            "Referer": "https://www.instagram.com/",
            "X-IG-App-ID": "936619743392459",  # Instagram's web app ID
        }
        
        for api_url in api_urls:
            try:
                response = requests.get(api_url, headers=headers, timeout=15)
                
                if response.status_code == 200:
                    try:
                        data = response.json()
                        
                        # Try to extract video URL from the JSON response
                        if 'graphql' in data and 'shortcode_media' in data['graphql']:
                            media = data['graphql']['shortcode_media']
                            if 'video_url' in media:
                                return media['video_url']
                        
                        # Try other possible locations
                        if 'items' in data and len(data['items']) > 0:
                            item = data['items'][0]
                            if 'video_versions' in item and len(item['video_versions']) > 0:
                                return item['video_versions'][0]['url']
                        
                    except json.JSONDecodeError:
                        pass
            except:
                continue
        
        return None
    except Exception as e:
        print(f"Error with direct extraction: {e}")
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
    
    # Step 1: Extract video URL using multiple methods
    video_url = None
    
    # Method 1: Try RapidAPI first (most reliable for production)
    print("📡 Attempting video URL extraction with RapidAPI...")
    video_url = extract_video_url_with_rapidapi(url)
    
    # Method 2: Try yt-dlp if RapidAPI fails
    if not video_url:
        print("📡 Attempting video URL extraction with yt-dlp...")
        video_url = extract_video_url_with_ytdlp(url)
    
    # Method 3: Try direct API if all else fails
    if not video_url:
        print("📡 Attempting direct API extraction...")
        video_url = extract_video_url_with_direct_api(url)
    
    if not video_url:
        print("❌ All video URL extraction methods failed")
        raise HTTPException(
            status_code=404, 
            detail="Could not extract video URL from Instagram. The post might be private, deleted, or Instagram is blocking our request."
        )
    
    print(f"✅ Found video URL: {video_url[:100]}...")
    
    # Step 2: Create temporary files
    temp_dir = tempfile.mkdtemp()
    temp_video_path = os.path.join(temp_dir, "temp_video.mp4")
    temp_thumbnail_path = os.path.join(temp_dir, "thumbnail.jpg")
    
    try:
        # Step 3: Download video
        print("⬇️  Downloading video...")
        
        headers = {
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15",
            "Accept": "*/*",
            "Accept-Encoding": "identity",  # Disable compression for video
        }
        
        video_resp = requests.get(video_url, stream=True, timeout=30, headers=headers)
        video_resp.raise_for_status()
        
        total_size = 0
        with open(temp_video_path, 'wb') as f:
            for chunk in video_resp.iter_content(chunk_size=8192):
                f.write(chunk)
                total_size += len(chunk)
        
        print(f"✅ Video downloaded: {total_size} bytes to {temp_video_path}")
        
        # Step 4: Extract frame
        print("📸 Extracting frame with FFmpeg...")
        success, img_width, img_height = extract_frame_with_ffmpeg(temp_video_path, temp_thumbnail_path)
        
        if not success:
            raise HTTPException(status_code=500, detail="Failed to extract video frame with FFmpeg")
        
        print(f"✅ Frame extracted to: {temp_thumbnail_path}")
        
        # Get image dimensions for response
        try:
            img_info_cmd = [
                "ffprobe",
                "-v", "error",
                "-select_streams", "v:0",
                "-show_entries", "stream=width,height",
                "-of", "csv=s=x:p=0",
                temp_thumbnail_path
            ]
            
            img_info_result = subprocess.run(
                img_info_cmd,
                capture_output=True,
                text=True,
                timeout=15
            )
            
            if img_info_result.returncode == 0:
                resolution_str = img_info_result.stdout.strip()
                if 'x' in resolution_str:
                    img_width, img_height = map(int, resolution_str.split('x'))
                    print(f"Extracted image resolution: {img_width}x{img_height}")
        except:
            # Use the values from the extraction function
            pass
        
        # Step 5: Upload to Google Cloud Storage if available
        thumbnail_url = None
        if GCS_AVAILABLE and storage_client:
            print("☁️  Uploading to Google Cloud Storage...")
            unique_id = str(uuid.uuid4())
            blob_name = f"thumbnails/instagram_{unique_id}_high.jpg"
            thumbnail_url = upload_to_gcs(temp_thumbnail_path, blob_name)
            
            if not thumbnail_url:
                print("⚠️ Failed to upload to GCS, but continuing with local file")
        
        # If GCS upload failed or is not available, return a placeholder URL
        if not thumbnail_url:
            thumbnail_url = f"data:image/jpeg;base64,{base64_encode_image(temp_thumbnail_path)}"
        
        print(f"✅ Thumbnail ready: {thumbnail_url[:50]}...")
        
        return {
            "success": True,
            "thumbnail_url": thumbnail_url,
            "video_url": video_url,
            "instagram_url": url,
            "blob_name": blob_name if GCS_AVAILABLE and storage_client else None,
            "file_size": os.path.getsize(temp_thumbnail_path),
            "width": img_width,
            "height": img_height
        }
        
    finally:
        # Cleanup temporary files
        print("🧹 Cleaning up temporary files...")
        for file_path in [temp_video_path, temp_thumbnail_path]:
            if os.path.exists(file_path):
                os.remove(file_path)
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
    
    # Check RapidAPI key
    rapidapi_ok = RAPIDAPI_KEY is not None and RAPIDAPI_KEY != "YOUR_RAPIDAPI_KEY_HERE"
    rapidapi_message = "Available" if rapidapi_ok else "Not available"
    
    # Check yt-dlp availability
    try:
        import yt_dlp
        ytdlp_ok = True
        ytdlp_version = yt_dlp.version.__version__
    except:
        ytdlp_ok = False
        ytdlp_version = "Not available"
    
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
        "rapidapi": {
            "available": rapidapi_ok,
            "message": rapidapi_message
        },
        "ytdlp": {
            "available": ytdlp_ok,
            "version": ytdlp_version
        }
    }

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
