import os
import hashlib
from pathlib import Path
from werkzeug.utils import secure_filename
from config.settings import ALLOWED_EXTENSIONS, UPLOAD_FOLDER

def get_upload_folder():
    """Ensure upload folder exists and return path."""
    Path(UPLOAD_FOLDER).mkdir(parents=True, exist_ok=True)
    return UPLOAD_FOLDER

def allowed_file(filename):
    """Return True if filename has an allowed extension."""
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS

def save_uploaded_file(file, upload_folder=None):
    """Save uploaded file to upload_folder and return its path."""
    upload_folder = upload_folder or get_upload_folder()
    filename = secure_filename(file.filename)
    file_path = os.path.join(upload_folder, filename)
    file.save(file_path)
    return file_path

def calculate_file_hash(file_path):
    """Return MD5 hash of file."""
    hash_md5 = hashlib.md5()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(4096), b""):
            hash_md5.update(chunk)
    return hash_md5.hexdigest()

def get_file_info(file_path):
    """Return dict with file path, size, and hash."""
    if not os.path.exists(file_path):
        return None
    return {
        "path": file_path,
        "size": os.path.getsize(file_path),
        "hash": calculate_file_hash(file_path)
    }

def cleanup_file(file_path):
    """Delete file if it exists."""
    try:
        if os.path.exists(file_path):
            os.remove(file_path)
            return True
    except Exception as e:
        print(f"⚠️ Error removing file {file_path}: {e}")
    return False
