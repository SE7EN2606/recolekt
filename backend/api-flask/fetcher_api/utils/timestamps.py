import os
import logging
from datetime import datetime

def get_timestamp():
    """Get current timestamp as string"""
    return datetime.now().strftime("%Y%m%d_%H%M_%S")

def get_unique_id(source_string):
    """Generate a unique ID from a source string"""
    import hashlib
    return hashlib.md5(source_string.encode()).hexdigest()[:8]

def get_platform_from_url(url):
    """Extract platform from URL"""
    from urllib.parse import urlparse
    
    parsed_url = urlparse(url)
    domain = parsed_url.netloc.lower()
    
    if 'instagram.com' in domain:
        return 'IG_reels'
    elif 'facebook.com' in domain:
        return 'FB_reels'
    else:
        return 'general'

def extract_unique_id_from_url(url):
    """Extract unique ID from URL"""
    from urllib.parse import urlparse
    
    parsed_url = urlparse(url)
    path_parts = parsed_url.path.strip('/').split('/')
    
    # For Instagram URLs
    if 'instagram.com' in parsed_url.netloc.lower():
        # Extract the shortcode from Instagram URLs
        for part in path_parts:
            if part and part not in ['reel', 'p', 'tv'] and part != '':
                return part
    
    # For Facebook URLs
    elif 'facebook.com' in parsed_url.netloc.lower():
        # Extract the unique ID from Facebook URLs
        for part in path_parts:
            if part and part not in ['reel', 'p', 'tv'] and part != '':
                return part
    
    # Fallback to first non-empty path part
    for part in path_parts:
        if part:
            return part
    
    return "unknown"

def get_platform_folder_name(url):
    """Get the platform folder name from URL"""
    platform = get_platform_from_url(url)
    unique_id = extract_unique_id_from_url(url)
    return f"{platform}_{unique_id}"

def create_folder_structure(base_path, platform, unique_id):
    """Create the folder structure for a video"""
    folder_path = os.path.join(base_path, platform, unique_id)
    os.makedirs(folder_path, exist_ok=True)
    return folder_path
