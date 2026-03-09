import os
import re
import tempfile
import subprocess
import logging
from typing import Optional, Tuple, Dict, List

logger = logging.getLogger("ocr_utils")

MIN_TRANSCRIPT_CHARS_DEFAULT = 80
MIN_CAPTION_SUBSTANCE_WORDS_DEFAULT = 18


def _strip_caption_noise(text: str) -> str:
    if not text:
        return ""

    t = text
    t = re.sub(r"https?://\S+", " ", t)   # urls
    t = re.sub(r"@\w+", " ", t)           # mentions
    t = re.sub(r"#\w+", " ", t)           # hashtags
    t = re.sub(r"(\.\s*){2,}", " ", t)    # .... blocks
    t = re.sub(r"[_*~`]+", " ", t)        # formatting noise
    t = re.sub(r"\s+", " ", t).strip()
    return t


def _caption_substance_words(caption_text: str) -> List[str]:
    cleaned = _strip_caption_noise(caption_text).lower()
    cleaned = re.sub(r"[^a-z0-9\s]+", " ", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    if not cleaned:
        return []
    words = [w for w in cleaned.split() if len(w) >= 3]
    return words


def caption_is_low_signal(
    caption_text: str,
    min_substance_words: int = MIN_CAPTION_SUBSTANCE_WORDS_DEFAULT
) -> bool:
    words = _caption_substance_words(caption_text or "")
    return len(words) < min_substance_words


def should_try_ocr(
    transcript_text: str,
    caption_text: str,
    min_transcript_chars: int = MIN_TRANSCRIPT_CHARS_DEFAULT,
    min_caption_substance_words: int = MIN_CAPTION_SUBSTANCE_WORDS_DEFAULT
) -> bool:
    t = (transcript_text or "").strip()
    c = (caption_text or "").strip()

    transcript_short = len(t) < min_transcript_chars
    caption_low = caption_is_low_signal(c, min_substance_words=min_caption_substance_words)

    # We only OCR when we don't have speech AND caption doesn't explain content
    return transcript_short and caption_low


def _parse_gs_uri(gs_uri: str) -> Tuple[str, str]:
    # gs://bucket/path/to/blob
    without = gs_uri[len("gs://"):]
    bucket, blob = without.split("/", 1)
    return bucket, blob


def _fetch_thumbnail_bytes(
    thumbnail_bytes: Optional[bytes],
    thumbnail_uri: Optional[str],
    timeout_s: int = 25,
) -> Tuple[Optional[bytes], Dict]:
    """
    Returns (bytes_or_none, debug).
    Supports:
      - bytes already provided
      - gs://bucket/object  (download via google-cloud-storage)
      - https://...         (download via requests)
    """
    dbg = {
        "thumb_source": None,   # "bytes" | "gcs" | "http" | None
        "thumb_uri": thumbnail_uri or "",
        "thumb_len": 0,
        "thumb_error": "",
    }

    if thumbnail_bytes:
        dbg["thumb_source"] = "bytes"
        dbg["thumb_len"] = len(thumbnail_bytes)
        return thumbnail_bytes, dbg

    uri = (thumbnail_uri or "").strip()
    if not uri:
        dbg["thumb_error"] = "No thumbnail bytes or URI"
        return None, dbg

    # gs://... -> authenticated read via storage SDK
    if uri.startswith("gs://"):
        try:
            from google.cloud import storage

            bucket_name, blob_name = _parse_gs_uri(uri)
            client = storage.Client()
            blob = client.bucket(bucket_name).blob(blob_name)
            data = blob.download_as_bytes(timeout=timeout_s, retry=None)

            dbg["thumb_source"] = "gcs"
            dbg["thumb_len"] = len(data or b"")
            return data, dbg
        except Exception as e:
            dbg["thumb_error"] = f"GCS download failed: {e}"
            return None, dbg

    # https://... -> public fetch (works for public storage.googleapis.com URLs)
    if uri.startswith("http://") or uri.startswith("https://"):
        try:
            import requests

            r = requests.get(uri, timeout=timeout_s)
            r.raise_for_status()
            data = r.content or b""

            dbg["thumb_source"] = "http"
            dbg["thumb_len"] = len(data)
            return data, dbg
        except Exception as e:
            dbg["thumb_error"] = f"HTTP download failed: {e}"
            return None, dbg

    dbg["thumb_error"] = f"Unsupported thumbnail URI scheme: {uri}"
    return None, dbg


def vision_ocr_from_bytes(image_bytes: bytes, mode: str = "document") -> str:
    """
    Google Vision OCR from bytes.
    mode:
      - "document" -> document_text_detection (usually better for quote cards)
      - "text"     -> text_detection
    """
    if not image_bytes:
        return ""

    # Import inside function so this file can be imported even if deps are missing in some envs
    from google.cloud import vision

    client = vision.ImageAnnotatorClient()
    image = vision.Image(content=image_bytes)

    mode = (mode or "document").lower().strip()
    if mode == "text":
        resp = client.text_detection(image=image)
        texts = resp.text_annotations
        text = texts[0].description if texts else ""
    else:
        resp = client.document_text_detection(image=image)
        text = resp.full_text_annotation.text if resp.full_text_annotation else ""

    if resp.error and resp.error.message:
        raise RuntimeError(resp.error.message)

    return (text or "").strip()


def _image_to_gray_array(path: str, max_size: int = 640):
    from PIL import Image
    import numpy as np

    img = Image.open(path).convert("RGB")
    w, h = img.size
    scale = min(1.0, max_size / max(w, h))
    if scale < 1.0:
        img = img.resize((int(w * scale), int(h * scale)))
    gray = img.convert("L")
    return (np.asarray(gray, dtype=np.float32) / 255.0)


def _mean_abs_diff(a, b) -> float:
    import numpy as np

    if a.shape != b.shape:
        h = min(a.shape[0], b.shape[0])
        w = min(a.shape[1], b.shape[1])
        a = a[:h, :w]
        b = b[:h, :w]
    return float(np.mean(np.abs(a - b)))


def is_video_static(
    video_path: str,
    times: Tuple[float, float, float] = (0.2, 1.0, 2.0),
    diff_threshold: float = 0.01
) -> Tuple[bool, Dict]:
    """
    Detect "still image reel" (static visuals) by comparing a few frames extracted with ffmpeg.
    Returns (is_static, debug).
    """
    if not video_path or not os.path.exists(video_path):
        return False, {"error": "video_path missing or not found"}

    try:
        with tempfile.TemporaryDirectory() as tmp:
            frame_paths = []
            for i, t in enumerate(times):
                frame_path = os.path.join(tmp, f"frame_{i}.webp")
                cmd = [
                    "ffmpeg",
                    "-hide_banner",
                    "-loglevel", "error",
                    "-ss", str(t),
                    "-i", video_path,
                    "-frames:v", "1",
                    "-q:v", "2",
                    frame_path,
                ]
                subprocess.run(cmd, check=True)
                frame_paths.append(frame_path)

            arrays = [_image_to_gray_array(p) for p in frame_paths]
            diffs = []
            for i in range(len(arrays) - 1):
                diffs.append(_mean_abs_diff(arrays[i], arrays[i + 1]))

            is_static = all(d <= diff_threshold for d in diffs)
            return is_static, {"diffs": diffs, "threshold": diff_threshold}

    except subprocess.CalledProcessError as e:
        return False, {"error": f"ffmpeg failed: {e}"}
    except Exception as e:
        return False, {"error": f"static detection failed: {e}"}


def maybe_ocr_and_merge_text(
    transcript_text: str,
    caption_text: str,
    thumbnail_bytes: Optional[bytes],
    thumbnail_uri: Optional[str] = None,
    ocr_mode: str = "document",
    min_transcript_chars: int = MIN_TRANSCRIPT_CHARS_DEFAULT,
    min_caption_substance_words: int = MIN_CAPTION_SUBSTANCE_WORDS_DEFAULT,
) -> Tuple[str, Dict]:
    """
    If (transcript is short) AND (caption is low-signal), run OCR on the thumbnail.
    You can pass either:
      - thumbnail_bytes (preferred if already available), or
      - thumbnail_uri (https://... or gs://...)
    Returns (merged_text, debug).
    """
    transcript_text = transcript_text or ""
    caption_text = caption_text or ""

    dbg: Dict = {
        "did_ocr": False,
        "ocr_len": 0,
        "reason": "",
        "mode": ocr_mode,
        "thumb_source": None,
        "thumb_len": 0,
        "thumb_uri": (thumbnail_uri or ""),
        "thumb_error": "",
    }

    if not should_try_ocr(
        transcript_text,
        caption_text,
        min_transcript_chars=min_transcript_chars,
        min_caption_substance_words=min_caption_substance_words
    ):
        dbg["reason"] = "Not low-signal; OCR not needed"
        return transcript_text, dbg

    # Ensure we have bytes (from bytes input, gs://, or https://)
    thumb_bytes, thumb_dbg = _fetch_thumbnail_bytes(
        thumbnail_bytes=thumbnail_bytes,
        thumbnail_uri=thumbnail_uri,
    )
    dbg.update(thumb_dbg)

    if not thumb_bytes:
        dbg["reason"] = "Low-signal but thumbnail not fetchable"
        return transcript_text, dbg

    try:
        ocr_text = vision_ocr_from_bytes(thumb_bytes, mode=ocr_mode)
        dbg["did_ocr"] = True
        dbg["ocr_len"] = len(ocr_text or "")
    except Exception as e:
        dbg["reason"] = f"OCR failed: {e}"
        return transcript_text, dbg

    if not (ocr_text or "").strip():
        dbg["reason"] = "OCR returned empty"
        return transcript_text, dbg

    merged = f"[OCR]\n{ocr_text}\n\n{transcript_text}".strip()
    dbg["reason"] = "OCR injected into transcript"
    return merged, dbg
