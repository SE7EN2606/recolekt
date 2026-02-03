# fetcher_api/services/transcription.py
"""
Transcription service - Upgraded for Multi-Language Detection.
"""
import logging
import json
from fetcher_api.adapters.deepgram_client import deepgram_client

logger = logging.getLogger('transcription')

def transcribe_video_deepgram(audio_path: str) -> str:
    """
    Wrapper for backward compatibility.
    Now utilizes the full result from Deepgram to capture detected language.
    """
    try:
        # Pass detect_language=True to the adapter if supported
        raw_result = deepgram_client.transcribe(audio_path)
        
        # 1. Handle Empty/Music/Error
        if raw_result is None:
            return json.dumps({
                "status": "music_only",
                "transcript": "",
                "detected_language": "unknown"
            })
        
        # 2. Extract Data
        # Note: If your deepgram_client.transcribe returns a dict with metadata, 
        # we extract it here. If it returns just a string, we default to unknown.
        transcript_text = ""
        detected_lang = "unknown"

        if isinstance(raw_result, dict):
            transcript_text = raw_result.get("transcript", "")
            detected_lang = raw_result.get("detected_language", "en")
        else:
            # Fallback if raw_result is just a string
            transcript_text = raw_result
            detected_lang = "auto"

        return json.dumps({
            "status": "ok",
            "transcript": transcript_text,
            "detected_language": detected_lang
        })
        
    except Exception as e:
        logger.error(f"Transcription error: {e}")
        return json.dumps({
            "status": "error",
            "transcript": "",
            "detected_language": "unknown"
        })

def transcribe_audio_url(audio_url: str) -> str:
    """Transcribe via URL (wrapper) with language awareness."""
    try:
        raw_result = deepgram_client.transcribe_url(audio_url)
        
        if raw_result is None:
            return json.dumps({
                "status": "music_only",
                "transcript": "",
                "detected_language": "unknown"
            })
        
        transcript_text = ""
        detected_lang = "unknown"

        if isinstance(raw_result, dict):
            transcript_text = raw_result.get("transcript", "")
            detected_lang = raw_result.get("detected_language", "en")
        else:
            transcript_text = raw_result
            detected_lang = "auto"

        return json.dumps({
            "status": "ok",
            "transcript": transcript_text,
            "detected_language": detected_lang
        })
        
    except Exception as e:
        logger.error(f"URL transcription error: {e}")
        return json.dumps({
            "status": "error",
            "transcript": "",
            "detected_language": "unknown"
        })

__all__ = ['transcribe_video_deepgram', 'transcribe_audio_url', 'deepgram_client']
