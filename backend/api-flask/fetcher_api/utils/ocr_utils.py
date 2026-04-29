"""
OCR / frame extraction utilities.
"""
from __future__ import annotations
import base64
import logging
import math
import os
import subprocess
import tempfile
from typing import List, Optional

logger = logging.getLogger("ocr_utils")


# ── maybe_ocr_and_merge_text ──────────────────────────────────────────────────

def maybe_ocr_and_merge_text(
    transcript: str,
    video_path: Optional[str] = None,
    caption: str = "",
    duration_seconds: int = None,
    max_frames: int = 3,
    min_transcript_chars: int = 80,
) -> str:
    """
    If the transcript is too short to be useful, extract frames from the video
    and attempt a basic OCR pass by returning the transcript unchanged but
    augmented with any caption text.

    This is a lightweight helper — full AI-based OCR happens inside the
    extractor via frame images sent to the vision model. This function only
    handles the pre-extraction merge step in processing.py.

    Returns the best available text string for downstream processing.
    """
    transcript = (transcript or "").strip()
    caption    = (caption or "").strip()

    # Already have enough transcript — nothing to do
    if len(transcript) >= min_transcript_chars:
        return transcript

    # Merge caption into transcript if transcript is thin
    if caption and caption not in transcript:
        merged = f"{transcript}\n{caption}".strip() if transcript else caption
        logger.info(
            "maybe_ocr_and_merge_text: transcript short (%d chars) — merged caption (%d chars)",
            len(transcript), len(caption),
        )
        return merged

    return transcript


# ── Single frame extractor ────────────────────────────────────────────────────

def extract_video_frames_base64(
    video_path: str,
    duration_seconds: int = None,
    max_frames: int = 4,
    is_silent: bool = False,
    start_offset_seconds: float = 0.0,
) -> List[str]:
    """
    Extract evenly-spaced frames as base64 JPEGs.
    Frame 1 is always at start_offset + 2s to capture opening title cards.
    """
    if not video_path or not os.path.exists(video_path):
        logger.warning("extract_video_frames_base64: video not found: %s", video_path)
        return []

    try:
        if not duration_seconds:
            probe = subprocess.run(
                [
                    "ffprobe", "-v", "error",
                    "-show_entries", "format=duration",
                    "-of", "default=noprint_wrappers=1:nokey=1",
                    video_path,
                ],
                capture_output=True, text=True, timeout=10,
            )
            duration_seconds = max(1, int(float(probe.stdout.strip() or "30")))

        usable_duration = max(1, duration_seconds - start_offset_seconds)
        first_ts  = start_offset_seconds + 2.0
        remaining = max_frames - 1
        interval  = (usable_duration - 2.0) / (remaining + 1) if remaining > 0 else usable_duration
        timestamps = [first_ts] + [first_ts + interval * i for i in range(1, remaining + 1)]

        frames = []
        for ts in timestamps:
            ts = min(ts, duration_seconds - 0.5)
            with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp:
                tmp_path = tmp.name
            result = subprocess.run(
                [
                    "ffmpeg", "-y",
                    "-ss", str(ts),
                    "-i", video_path,
                    "-vframes", "1",
                    "-q:v", "3",
                    "-vf", "scale=960:-1",
                    tmp_path,
                ],
                capture_output=True, timeout=15,
            )
            if result.returncode == 0 and os.path.exists(tmp_path):
                with open(tmp_path, "rb") as f:
                    frames.append(base64.b64encode(f.read()).decode())
                os.unlink(tmp_path)

        logger.info(
            "extract_video_frames_base64: %d/%d frames at %s",
            len(frames), max_frames,
            [f"{t:.1f}s" for t in timestamps[:len(frames)]],
        )
        return frames

    except Exception as exc:
        logger.warning("extract_video_frames_base64: failed: %s", exc)
        return []


# ── Frame stitching ───────────────────────────────────────────────────────────

def stitch_frames_into_composites(
    frames: List[str],
    frames_per_composite: int = 3,
    target_height: int = 270,
) -> List[str]:
    """
    Stitch base64 frames horizontally into composite images.

    Example: 12 frames + frames_per_composite=3 → 4 composite images.
    Each composite shows `frames_per_composite` time-consecutive frames side by side.
    This lets you stay within the 4-image API limit while giving the model
    visual coverage of 12 time points in the video.

    Requires: Pillow (pip install Pillow)
    Falls back to returning the first 4 raw frames if Pillow is not installed.
    """
    try:
        from PIL import Image
        import io
    except ImportError:
        logger.warning("stitch_frames: Pillow not installed — falling back to first 4 raw frames")
        return frames[:4]

    if not frames:
        return []

    composites: List[str] = []
    n_groups = math.ceil(len(frames) / frames_per_composite)

    for g in range(n_groups):
        group = frames[g * frames_per_composite : (g + 1) * frames_per_composite]
        pil_imgs = []
        for b64 in group:
            try:
                img = Image.open(io.BytesIO(base64.b64decode(b64))).convert("RGB")
                pil_imgs.append(img)
            except Exception as exc:
                logger.warning("stitch_frames: could not decode frame: %s", exc)

        if not pil_imgs:
            continue

        resized = []
        for img in pil_imgs:
            ratio = target_height / img.height
            new_w = max(1, int(img.width * ratio))
            resized.append(img.resize((new_w, target_height), Image.LANCZOS))

        total_w   = sum(img.width for img in resized)
        composite = Image.new("RGB", (total_w, target_height), (30, 30, 30))
        x = 0
        for img in resized:
            composite.paste(img, (x, 0))
            x += img.width

        buf = io.BytesIO()
        composite.save(buf, format="JPEG", quality=85)
        composites.append(base64.b64encode(buf.getvalue()).decode())
        logger.info(
            "stitch_frames: composite %d/%d — %d frames → %dx%d JPEG",
            g + 1, n_groups, len(resized), total_w, target_height,
        )

    return composites


# ── Convenience: extract + stitch in one call ─────────────────────────────────

def extract_and_stitch_frames(
    video_path: str,
    duration_seconds: int = None,
    n_raw_frames: int = 12,
    n_composites: int = 4,
    is_silent: bool = False,
    start_offset_seconds: float = 0.0,
) -> List[str]:
    """
    Extract `n_raw_frames` frames then stitch them into `n_composites` composites.

    Example: n_raw_frames=12, n_composites=4 → 4 composites of 3 frames each.
    Send the returned list directly to the AI — same 4-image limit, 3x the coverage.
    """
    frames_per_composite = math.ceil(n_raw_frames / n_composites)
    raw = extract_video_frames_base64(
        video_path,
        duration_seconds=duration_seconds,
        max_frames=n_raw_frames,
        is_silent=is_silent,
        start_offset_seconds=start_offset_seconds,
    )
    if not raw:
        return []

    composites = stitch_frames_into_composites(
        raw, frames_per_composite=frames_per_composite
    )
    logger.info(
        "extract_and_stitch: %d raw frames → %d composites (%d frames each)",
        len(raw), len(composites), frames_per_composite,
    )
    return composites


# ── Helpers used by the extractor ────────────────────────────────────────────

def should_extract_frames(
    transcript: str,
    caption: str,
    content_type: str,
    transcription_status: str = "",
) -> bool:
    if transcription_status == "music_only":
        return True
    if content_type in ("recipe", "workout"):
        return True
    if len(transcript.strip()) < 100 and len(caption.strip()) < 50:
        return True
    return False


def is_silent_video(video_path: str, transcript: str) -> bool:
    return len(transcript.strip()) < 20