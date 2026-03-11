# fetcher_api/utils/ocr_utils.py
"""
Video frame extraction for Mistral Vision OCR.

Instead of a separate OCR step, we extract key frames from the video
and send them as base64 images alongside the text prompt in Call 1.
Mistral Small has vision capabilities and can read on-screen text
(ingredient quantities, titles, instructions) directly from frames.

Also retains the legacy maybe_ocr_and_merge_text for backward compat.
"""

import os
import re
import base64
import tempfile
import subprocess
import logging
from typing import Optional, Tuple, Dict, List

logger = logging.getLogger("ocr_utils")

MIN_TRANSCRIPT_CHARS_DEFAULT = 80
MIN_CAPTION_SUBSTANCE_WORDS_DEFAULT = 18

# Frame extraction settings
MAX_FRAMES = 5
FRAME_QUALITY = 60          # JPEG quality (lower = smaller, 60 is fine for text OCR)
FRAME_MAX_WIDTH = 720       # Downscale to this width (saves tokens)
FRAME_FORMAT = "jpg"


# ══════════════════════════════════════════════════════════════
# FRAME EXTRACTION (NEW — for Mistral Vision)
# ══════════════════════════════════════════════════════════════

def extract_video_frames_base64(
    video_path: str,
    duration_seconds: Optional[int] = None,
    max_frames: int = MAX_FRAMES,
) -> List[str]:
    """
    Extract evenly-spaced frames from a video and return as base64 JPEG strings.
    
    Args:
        video_path: Path to the video file
        duration_seconds: Video duration (if known). If None, we probe it.
        max_frames: Maximum number of frames to extract (default 5)
    
    Returns:
        List of base64-encoded JPEG strings (ready for Mistral vision API)
    """
    if not video_path or not os.path.exists(video_path):
        logger.warning("⚠️ Video not found for frame extraction: %s", video_path)
        return []

    try:
        # Get duration if not provided
        if not duration_seconds:
            duration_seconds = _probe_duration(video_path)
        
        if not duration_seconds or duration_seconds <= 0:
            logger.warning("⚠️ Could not determine video duration")
            return []

        # Calculate frame timestamps — evenly spaced, skip first/last 10%
        start = max(0.5, duration_seconds * 0.1)
        end = max(start + 1, duration_seconds * 0.9)
        
        if duration_seconds <= 10:
            # Short video: just grab 3 frames
            timestamps = [
                duration_seconds * 0.2,
                duration_seconds * 0.5,
                duration_seconds * 0.8,
            ]
            max_frames = min(max_frames, 3)
        else:
            # Normal video: evenly space frames
            step = (end - start) / max(1, max_frames - 1)
            timestamps = [start + (step * i) for i in range(max_frames)]

        # Extract frames with FFmpeg
        frames_b64 = []
        with tempfile.TemporaryDirectory() as tmp_dir:
            for i, ts in enumerate(timestamps[:max_frames]):
                frame_path = os.path.join(tmp_dir, f"frame_{i}.{FRAME_FORMAT}")
                
                cmd = [
                    "ffmpeg",
                    "-hide_banner",
                    "-loglevel", "error",
                    "-ss", str(round(ts, 2)),
                    "-i", video_path,
                    "-frames:v", "1",
                    "-vf", f"scale={FRAME_MAX_WIDTH}:-2",  # Scale width, keep aspect ratio
                    "-q:v", str(FRAME_QUALITY),
                    "-y",
                    frame_path,
                ]
                
                result = subprocess.run(cmd, capture_output=True, timeout=10)
                
                if result.returncode == 0 and os.path.exists(frame_path):
                    file_size = os.path.getsize(frame_path)
                    if file_size > 500:  # Skip blank/corrupt frames
                        with open(frame_path, "rb") as f:
                            b64 = base64.b64encode(f.read()).decode("utf-8")
                        frames_b64.append(b64)

        logger.info(
            "🎞️ Extracted %d/%d frames from video (%ds)",
            len(frames_b64), max_frames, duration_seconds
        )
        return frames_b64

    except subprocess.TimeoutExpired:
        logger.error("❌ FFmpeg timeout during frame extraction")
        return []
    except Exception as e:
        logger.error("❌ Frame extraction failed: %s", e)
        return []


def _probe_duration(video_path: str) -> Optional[int]:
    """Get video duration in seconds using ffprobe."""
    try:
        result = subprocess.run(
            [
                "ffprobe",
                "-v", "error",
                "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1",
                video_path,
            ],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if result.returncode == 0 and result.stdout.strip():
            return int(float(result.stdout.strip()))
    except Exception:
        pass
    return None


def should_extract_frames(
    transcript_text: str,
    caption_text: str,
    content_type: str = "general",
) -> bool:
    """
    Decide whether to extract video frames for vision OCR.
    
    We extract frames when:
    - Transcript is short/empty (no speech = text is on screen)
    - OR content is a recipe (quantities might be on screen even with speech)
    - OR caption is low-signal (not much text context available)
    
    We skip when:
    - Both transcript and caption are rich (enough text context already)
    """
    transcript = (transcript_text or "").strip()
    caption = (caption_text or "").strip()
    
    transcript_short = len(transcript) < MIN_TRANSCRIPT_CHARS_DEFAULT
    caption_low = caption_is_low_signal(caption)
    
    # Always extract for recipes — quantities are often only on screen
    if content_type == "recipe":
        return True
    
    # Extract if transcript is empty/short
    if transcript_short:
        return True
    
    # Extract if caption is low-signal (even with transcript, screen text helps)
    if caption_low and len(transcript) < 300:
        return True
    
    return False


# ══════════════════════════════════════════════════════════════
# LEGACY HELPERS (kept for backward compat)
# ══════════════════════════════════════════════════════════════

def _strip_caption_noise(text: str) -> str:
    if not text:
        return ""
    t = text
    t = re.sub(r"https?://\S+", " ", t)
    t = re.sub(r"@\w+", " ", t)
    t = re.sub(r"#\w+", " ", t)
    t = re.sub(r"(\.\s*){2,}", " ", t)
    t = re.sub(r"[_*~`]+", " ", t)
    t = re.sub(r"\s+", " ", t).strip()
    return t


def _caption_substance_words(caption_text: str) -> List[str]:
    cleaned = _strip_caption_noise(caption_text).lower()
    cleaned = re.sub(r"[^a-z0-9\s]+", " ", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    if not cleaned:
        return []
    return [w for w in cleaned.split() if len(w) >= 3]


def caption_is_low_signal(
    caption_text: str,
    min_substance_words: int = MIN_CAPTION_SUBSTANCE_WORDS_DEFAULT,
) -> bool:
    words = _caption_substance_words(caption_text or "")
    return len(words) < min_substance_words


def should_try_ocr(
    transcript_text: str,
    caption_text: str,
    min_transcript_chars: int = MIN_TRANSCRIPT_CHARS_DEFAULT,
    min_caption_substance_words: int = MIN_CAPTION_SUBSTANCE_WORDS_DEFAULT,
) -> bool:
    t = (transcript_text or "").strip()
    c = (caption_text or "").strip()
    transcript_short = len(t) < min_transcript_chars
    caption_low = caption_is_low_signal(c, min_substance_words=min_caption_substance_words)
    return transcript_short and caption_low


def maybe_ocr_and_merge_text(
    transcript_text: str,
    caption_text: str,
    thumbnail_bytes: Optional[bytes] = None,
    thumbnail_uri: Optional[str] = None,
    ocr_mode: str = "document",
    min_transcript_chars: int = MIN_TRANSCRIPT_CHARS_DEFAULT,
    min_caption_substance_words: int = MIN_CAPTION_SUBSTANCE_WORDS_DEFAULT,
) -> Tuple[str, Dict]:
    """
    Legacy OCR merge function — kept for backward compat.
    Now primarily used as a passthrough since vision OCR is handled
    in the Mistral call directly.
    """
    transcript_text = transcript_text or ""
    caption_text = caption_text or ""

    dbg: Dict = {
        "did_ocr": False,
        "reason": "Vision OCR now handled in Mistral call",
    }

    return transcript_text, dbg
