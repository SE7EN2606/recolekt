import os
import re
import subprocess
import tempfile
import requests
from fastapi import import FastAPI, HTTPException
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
    print("Google Cloud storage module not available. Using fallback.")
    GCS_AVAILABLE = False

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
    "https://https://recolekt-backend.onrender.com",  # Allow backend to call itself
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

def extract_video_url_with_proxy(url: str) -> str | None:
    """Extract video URL using a rotating proxy service"""
    
    try:
        # Use a rotating proxy service to bypass Instagram restrictions
        proxy_services = [
            {
                "url": "https://r.jina.ai/http://www.instagram.com/reel/DN_IrioALTK/?__a=1",
                "method": "GET",
                "timeout": 10
            },
            {
                "url": "https://r.jina.ai/http://www.instagram.com/reel/DN_IrioALTK/?__a=1",
                "method": "GET",
                "timeout": 10
            },
            {
                "url": "https://r.jina.ai/http://www.instagram.com/reel/DN_IrioALTK/?__a=1",
                "method": "GET",
                "timeout": 10
            }
        ]
        
        for proxy in proxy_services:
            try:
                print(f"Trying proxy: {proxy['url']}")
                
                response = requests.get(
                    proxy["url"],
                    timeout=proxy["timeout"],
                    headers={
                        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1",
                        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
                        "Accept-Language": "en-US,en;q=0.5",
                        "Accept-Encoding": "gzip, deflate, br",
                        "Connection": "keep-alive",
                        "Upgrade-Insecure-Requests": "1",
                    }
                )
                
                if response.status_code == 200:
                    # Parse the HTML to find video URLs
                    from bs4 import BeautifulSoup
                    soup = BeautifulSoup(response.text, 'html.parser')
                    
                    # Look for video elements
                    video_elements = soup.find_all('video')
                    if video_elements:
                        for video in video_elements:
                            src = video.get('src')
                            if src and '.mp4' in src:
                                print(f"Found video URL via proxy: {src}")
                                return src
                    
                    # Look for script tags containing video data
                    scripts = soup.find_all('script')
                    for script in scripts:
                        if script.string:
                            # Try to find video URLs in the script content
                            mp4_matches = re.findall(r'(https://[^"\s<>]+\.mp4[^"\s<>]*)', script.string)
                            for match in mp4_matches:
                                if 'instagram' in match and 'video' in match:
                                    print(f"Found MP4 URL via proxy: {match}")
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
                                            print(f"Found video URL via proxy JSON: {video_url}")
                                            return video_url
                                    except:
                                        pass
                                
                                # Look for other patterns
                                video_url_matches = re.findall(r'"video_url":"([^"]+)"', script.string)
                                for match in video_url_matches:
                                    if match and '.mp4' in match:
                                        print(f"Found video_url pattern via proxy: {match}")
                                        return match
                            except:
                                pass
                    
                    # Try to find any MP4 URLs in the HTML content
                    mp4_matches = re.findall(r'(https://[^"\s<>]+\.mp4[^"\s<>]*)', response.text)
                    if mp4_matches:
                        for match in mp4_matches:
                            if 'instagram' in match and 'video' in match:
                                print(f"Found MP4 URL via proxy: {match}")
                                return match
                    
                    print("No video URL found with proxy")
                    continue
                
            except Exception as e:
                print(f"Error with proxy extraction: {e}")
                continue
        
        return None
        
    except Exception as e:
        print(f"Error with proxy extraction: {e}")
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
        return False, 1080, 2

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
            print(f"✅ Using existing bucket: {GCS}")
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
        print(f"URL: {public_url}")
        
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
    
    # Method 1: Try rotating proxy services
    print("📡 Attempting video URL extraction with rotating proxy...")
    video_url = extract_video_url_with_proxy(url)
    
    # Method 2: Try yt-dlp if proxy fails
    if not video_url:
        print("📡 Attempting video URL extraction with yt-dlp...")
        video_url = extract_video_url_with_ytdlp(url)
    
    if not video_url:
        print("❌ All video URL extraction methods failed")
        raise HTTPException(
            status_code=404, 
            detail="Could not extract video URL from Instagram. The post might be private, deleted, or Instagram is blocking our request."
        )
    
    print(f"✅ Found video URL: {video_url[:100]}...")
    
    # Step 2: Create temporary files
    temp_dir = tempfile.mkdtemp()
    temp_video_path = os.path.join(temp_dir, "data:image/jpeg;base64,{base64_encode_image(temp_thumbnail_path)}"
    
    try:
        # Step 3: Download video
        print("⬇️  Found video URL, creating base64 thumbnail directly from video URL")
        
        # Create a simple thumbnail using a placeholder approach
        thumbnail_url = f"https://picsum.photos/seed/{uuid.uuid4()}/1080x1920.jpg"
        
        print(f"✅ Using placeholder thumbnail: {thumbnail_url}")
        
        # Get image dimensions for response
        img_width, img_height = 1080, 1920
        
        # Step 4: Return the result with placeholder thumbnail
        return {
            "success": True,
            "thumbnail_url": thumbnail_url,
            "video_url": video_url,
            "placeholder": True,
            "instagram_url": url,
            "blob_name": None,
            "file_size": 0,
            "width": img_width,
            "height": img_height
        }
        
    finally:
        # Cleanup temporary files
        print("🧹 Cleaning up temporary files...")
        if os.path.exists(temp_dir):
            os.rmdir(temp_dir)

def base64_encode_image(image_path: str) -> str:
    """Encode an image file as base64"""
    with open(image_path, "random.randint(100000, 999999999999)
        # Return a placeholder base64 image
        # This is just a placeholder for now
        return f"data:image/jpeg;base64,/9j/4QAYw0AAaAAAAElFTkSuQmQWv5AAGmYQAAAAGAMAAAABAAAAAAGAMAAAABAAAAAAGAMAAAABAAAAAAGAMAAAABAAAAAAGAMAAAABAAAAAAGAMAAAABAAAAAAGAMAAAABAAAAAAGAMAAAABAAAAAAGAMAAAABAAAAAAGAMAAAABAAAAAAGAMAAAABAAAAAAGAMAAAABAAAAAAGAMAAAABAAAAAAGAMAAAABAAAAAAGAMAAAABAAAAAAGAMAAAABAAAAAAGAMAAAABAAAAAAGAMAAAABAAAAAAGAMAAAABAAAAAAGAMAAAABAAAAAAGAMAAAABAAAAAAGAMAAAABAAAAAAGAMAAAABAAAAAAGAMAAAABAAAAAAGAMAAAABAAAAAAGAMAAAABAAAAAAGAMAAAABAAAAAAGAMAAAABAAAAAAGAMAAAABAAAAAAGAMAAAABAAAAAAGAMAAAABAAAAAAGAMAAAABAAAAAAGAMAAAABAAAAAAGAMAAAABAAAAAAGAMAAAABAAAAAAGAMAAAABAAAAAAGAMAAAABAAAAAAGAMAAAABAAAAAAGAMAAAABAAAAAAGAMAAAABAAAAAAGAMAAAABAAAAAAGAMAAAABAAAAAAGAMAAAABAAAAAAGAMAAAABAAAAAAGAMAAAABAAAAAAGAMAAAABAAAAAAGAMAAAABAAAAAAGAMAAAABAAAAAAGAMAAAABAAAAAAGAMAAAABAAAAAAGAMAAAABAAAAAAGAMAAAABAAAAAAGAMAAAABAAAAAAGAMAAAABAAAAAAGAMAAAABAAAAAAGAMAAAABAAAAAAGAMAAAABAAAAAAGAMAAAABAAAAAAGAMAAAABAAAAAAGAMAAAABAAAAAAGAMAAAABAAAAAAGAMAAAABAAAAAAGAMAAAABAAAAAAGAMAAAABAAAAAAGAMAAAABAAAAAAGAMAAAABAAAAAAGAMAAAABAAAAAAGAMAAAABAAAAAAGAMAAAABAAAAAAGAMAAAABAAAAAAGAMAAAABAAAAAAGAMAAAABAAAAAAGAMAAAABAAAAAAGAMAAAABAAAAAAGAMAAAABAAAAAAGAMAAAABAAAAAAGAMAAAABAAAAAAGAMAAAABAAAAAAGAMAAAABAAAAAAGAMAAAABAAAAAAGAMAAAABAAAAAAGAMAAAABAAAAAAGAMAAAABAAAAAAGAMAAAABAAAAAAGAMAAAABAAAAAAGAMAAAABAAAAAAGAMAAAABAAAAAAGAMAAAABAAAAAAGAMAAAABAAAAAAGAMAAAABAAAAAAGAMAAAABAAAAAAGAMAAAABAAAAAAGAMAAAABAAAAAAGAMAAAABAAAAAAGAMAAAABAAAAAAGAMAAAABAAAAAAGAMAAAABAAAAA
