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
import random

# Try to import Google Cloud Storage, with fallback
try:
    from google.cloud import storage
    GCS_AVAILABLE = True
except ImportError:
    print("Google Cloud Storage module not available. Using fallback.")
    GCS_AVAILABLE = False

# Try to import Selenium, with fallback
try:
    from selenium import webdriver
    from selenium.webdriver.chrome.service import Service
    from selenium.webdriver.chrome.options import Options
    from webdriver_manager.chrome import ChromeDriverManager
    from bs4 import BeautifulSoup
    SELENIUM_AVAILABLE = True
except ImportError:
    print("Selenium modules not available. Using fallback.")
    SELENIUM_AVAILABLE = False

# ------------------------
# Config - Render Environment Variables
# ------------------------
GCS_BUCKET = os.getenv("GCS_BUCKET", "recolekt-storage")
CREDENTIALS_JSON = os.getenv("GOOGLE_APPLICATION_CREDENTIALS_JSON")

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

def get_random_user_agent():
    """Get a random user agent to avoid detection"""
    user_agents = [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        "Mozilla/5.0 (iPhone; CPU iPhone OS 14_7_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.2 Mobile/15E148 Safari/604.1",
        "Mozilla/5.0 (iPad; CPU OS 14_7_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.2 Mobile/15E148 Safari/604.1"
    ]
    return random.choice(user_agents)

def extract_video_url_with_selenium(url: str) -> str | None:
    """Extract video URL using Selenium to bypass Instagram restrictions"""
    
    if not SELENIUM_AVAILABLE:
        print("Selenium not available. Skipping this method.")
        return None
    
    try:
        # Configure Chrome options
        chrome_options = Options()
        chrome_options.add_argument("--headless")
        chrome_options.add_argument("--no-sandbox")
        chrome_options.add_argument("--disable-dev-shm-usage")
        chrome_options.add_argument("--disable-gpu")
        chrome_options.add_argument("--window-size=1920,1080")
        chrome_options.add_argument(f"--user-agent={get_random_user_agent()}")
        
        # Initialize the WebDriver
        service = Service(ChromeDriverManager().install())
        driver = webdriver.Chrome(service=service, options=chrome_options)
        
        print(f"Loading Instagram URL with Selenium: {url}")
        driver.get(url)
        
        # Wait for the page to load
        time.sleep(5)
        
        # Get the page source after JavaScript has executed
        page_source = driver.page_source
        
        # Parse with BeautifulSoup
        soup = BeautifulSoup(page_source, 'html.parser')
        
        # Look for video elements
        video_elements = soup.find_all('video')
        if video_elements:
            for video in video_elements:
                src = video.get('src')
                if src and '.mp4' in src:
                    print(f"Found video URL in video element: {src}")
                    driver.quit()
                    return src
        
        # Look for script tags containing video data
        scripts = soup.find_all('script')
        for script in scripts:
            if script.string:
                # Try to find video URLs in the script content
                mp4_matches = re.findall(r'(https://[^"\s<>]+\.mp4[^"\s<>]*)', script.string)
                for match in mp4_matches:
                    if 'instagram' in match and 'video' in match:
                        print(f"Found MP4 URL in script: {match}")
                        driver.quit()
                        return match
                
                # Try to extract JSON data from script
                try:
                    # Look for JSON objects in the script
                    json_matches = re.findall(r'({[^{}]*"video_url"[^{}]*})', script.string)
                    for match in json_matches:
                        try:
                            data = json.loads(match)
                            if 'video_url' in data:
                                video_url = data['video_url']
                                print(f"Found video URL in script JSON: {video_url}")
                                driver.quit()
                                return video_url
                        except:
                            pass
                    
                    # Look for other patterns
                    video_url_matches = re.findall(r'"video_url":"([^"]+)"', script.string)
                    for match in video_url_matches:
                        if match and '.mp4' in match:
                            print(f"Found video_url pattern: {match}")
                            driver.quit()
                            return match
                except:
                    pass
        
        # Try to find any MP4 URLs in the page source
        mp4_matches = re.findall(r'(https://[^"\s<>]+\.mp4[^"\s<>]*)', page_source)
        if mp4_matches:
            for match in mp4_matches:
                if 'instagram' in match and 'video' in match:
                    print(f"Found MP4 URL in page source: {match}")
                    driver.quit()
                    return match
        
        driver.quit()
        print("No video URL found with Selenium")
        return None
        
    except Exception as e:
        print(f"Error with Selenium extraction: {e}")
        try:
            driver.quit()
        except:
            pass
        return None

def extract_video_url_with_api(url: str) -> str | None:
    """Extract video URL using a third-party API as fallback"""
    
    try:
        # Using a third-party service as fallback
        api_url = "https://instagram-downloader-download-instagram-videos-stories.p.rapidapi.com/index"
        
        querystring = {"url": url}
        
        headers = {
            "X-RapidAPI-Key": "YOUR_RAPIDAPI_KEY",  # Replace with your actual API key
            "X-RapidAPI-Host": "instagram-downloader-download-instagram-videos-stories.p.rapidapi.com"
        }
        
        response = requests.get(api_url, headers=headers, params=querystring, timeout=15)
        
        if response.status_code == 200:
            data = response.json()
            if 'media' in data and data['media']:
                video_url = data['media']
                print(f"Found video URL with API: {video_url}")
                return video_url
        
        return None
    except Exception as e:
        print(f"Error with API extraction: {e}")
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
    
    # Method 1: Try Selenium first (most reliable)
    print("📡 Attempting video URL extraction with Selenium...")
    video_url = extract_video_url_with_selenium(url)
    
    # Method 2: Try yt-dlp if Selenium fails
    if not video_url:
        print("📡 Attempting video URL extraction with yt-dlp...")
        try:
            import yt_dlp
            
            ydl_opts = {
                'quiet': True,
                'no_warnings': True,
                'extract_flat': False,
                'user_agent': get_random_user_agent(),
            }
            
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=False)
                
                if 'url' in info:
                    print(f"Found video URL with yt-dlp: {info['url']}")
                    video_url = info['url']
                
                # Try to find the best format
                if 'formats' in info and not video_url:
                    for format in info['formats']:
                        if format.get('vcodec') != 'none' and format.get('acodec') != 'none':
                            print(f"Found video URL with yt-dlp: {format['url']}")
                            video_url = format['url']
                            break
        except Exception as e:
            print(f"Error with yt-dlp extraction: {e}")
    
    # Method 3: Try API if all else fails
    if not video_url:
        print("📡 Attempting video URL extraction with API...")
        video_url = extract_video_url_with_api(url)
    
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
        # Step 3: Download video for better reliability
        print("⬇️  Downloading video...")
        
        headers = {
            "User-Agent": get_random_user_agent(),
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
    
    # Check Selenium availability
    selenium_ok = SELENIUM_AVAILABLE
    selenium_message = "Available" if selenium_ok else "Not available"
    
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
        "selenium": {
            "available": selenium_ok,
            "message": selenium_message
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
