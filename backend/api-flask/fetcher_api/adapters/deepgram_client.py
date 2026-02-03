# fetcher_api/services/adapters/deepgram_client.py

import requests
import logging
import time
import subprocess
import tempfile
import os
import re
from typing import Optional, Dict, Any
from collections import Counter
from config.settings import DEEPGRAM_API_KEY

logger = logging.getLogger('transcription')

def is_song_lyrics(transcript: str) -> bool:
    """
    Detect if transcript is likely song lyrics.
    Returns True if it's a song (should be ignored).
    """
    if not transcript or len(transcript.strip()) < 10:
        return False
    
    text = transcript.lower().strip()
    
    # 1. Check for common song patterns
    song_indicators = [
        r'\bla la la\b', r'\bna na na\b', r'\booh+\b', r'\byeah yeah\b',
        r'\boh oh\b', r'\bdoo doo\b', r'\bsha la la\b', r'\bah+\s+ah+\b',
        r'\bcome fly with me\b', r'\bfly away\b', r'\bpretty inside\b', r'\bharley\b',
    ]
    
    for pattern in song_indicators:
        if re.search(pattern, text):
            logger.info(f"🎵 Song detected: pattern '{pattern}' found")
            return True
    
    # 2. Check for short transcripts
    words = text.split()
    if len(words) < 15:
        incomplete_indicators = [
            not text.endswith(('.', '!', '?')),
            len([w for w in words if w in ['the', 'to', 'a', 'that', 'will', 'but', 'inside']]) > len(words) * 0.4,
        ]
        if sum(incomplete_indicators) >= 1:
            logger.info(f"🎵 Song detected: short incomplete sentence ({len(words)} words)")
            return True
    
    # 3. Check for excessive repetition
    sentences = re.split(r'[.!?]\s+', text)
    if len(sentences) >= 3:
        sentence_counts = Counter(s.strip() for s in sentences if s.strip())
        if any(count > 1 for count in sentence_counts.values()):
            logger.info(f"🎵 Song detected: repeated sentences")
            return True
    
    # 4. Check word repetition ratio
    if len(words) > 15:
        unique_words = len(set(words))
        repetition_ratio = unique_words / len(words)
        if repetition_ratio < 0.5:
            logger.info(f"🎵 Song detected: high repetition (ratio={repetition_ratio:.2f})")
            return True
    
    return False

class DeepgramClient:
    def __init__(self, api_key=None):
        self.api_key = api_key or DEEPGRAM_API_KEY
        self.base_url = "https://api.deepgram.com/v1/listen"
        self.max_file_size_mb = 2
    
    def _get_headers(self, is_audio=False):
        headers = {"Authorization": f"Token {self.api_key}"}
        if not is_audio:
            headers["Content-Type"] = "application/json"
        return headers
    
    def _compress_audio(self, input_path: str) -> Optional[str]:
        try:
            temp_fd, temp_path = tempfile.mkstemp(suffix='.mp3')
            os.close(temp_fd)
            cmd = [
                'ffmpeg', '-i', input_path, '-vn', '-ac', '1',
                '-ar', '16000', '-b:a', '32k', '-y', temp_path
            ]
            result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=60)
            if result.returncode == 0 and os.path.exists(temp_path):
                return temp_path
            return None
        except Exception as e:
            logger.warning(f"Compression error: {e}")
            return None
    
    def _make_request(self, url, data=None, json_payload=None, retries=2):
        for attempt in range(retries):
            session = None
            try:
                session = requests.Session()
                if data:
                    response = session.post(url, headers=self._get_headers(is_audio=True), data=data, timeout=120)
                elif json_payload:
                    response = session.post(url, headers=self._get_headers(is_audio=False), json=json_payload, timeout=120)
                else:
                    raise ValueError("Must provide either data or json_payload")
                return response
            except Exception as e:
                logger.warning(f"Request attempt {attempt + 1} failed: {e}")
                if attempt < retries - 1: time.sleep(2)
                else: raise
            finally:
                if session: session.close()

    def transcribe(self, audio_path: str, enhanced: bool = False) -> Optional[Dict[str, Any]]:
        """File-based transcription with LANGUAGE DETECTION."""
        compressed_path = None
        try:
            file_size_mb = os.path.getsize(audio_path) / (1024 * 1024)
            if file_size_mb > self.max_file_size_mb:
                compressed_path = self._compress_audio(audio_path)
                if compressed_path: audio_path = compressed_path
                else: return None
            
            with open(audio_path, 'rb') as audio_file:
                audio_data = audio_file.read()
            
            model = "nova-2" if not enhanced else "nova-2-general"
            # ✅ FIXED: Removed smart_format (causes hallucinations), added diarize and filler_words
            url = f"{self.base_url}?model={model}&detect_language=true&punctuate=true&diarize=false&filler_words=false"
            
            response = self._make_request(url, data=audio_data)
            
            if response.status_code == 200:
                result = response.json()
                try:
                    alt = result["results"]["channels"][0]["alternatives"][0]
                    transcript = alt["transcript"]
                    # ✅ CAPTURE DETECTED LANGUAGE
                    detected_lang = result["results"]["channels"][0].get("detected_language", "en")
                    
                    if not transcript.strip(): return None
                    if is_song_lyrics(transcript): return None
                    
                    return {
                        "transcript": transcript,
                        "detected_language": detected_lang
                    }
                except (KeyError, IndexError): return None
            return None
                
        except Exception as e:
            logger.error(f"Transcription error: {e}")
            return None
        finally:
            if compressed_path and os.path.exists(compressed_path):
                os.remove(compressed_path)

    def transcribe_url(self, audio_url: str, enhanced: bool = False) -> Optional[Dict[str, Any]]:
        """Transcribe via URL with LANGUAGE DETECTION."""
        try:
            model = "nova-2" if not enhanced else "nova-2-general"
            payload = {"url": audio_url}
            # ✅ FIXED: Same improvements
            url = f"{self.base_url}?model={model}&detect_language=true&punctuate=true&diarize=false&filler_words=false"
            
            response = self._make_request(url, json_payload=payload)
            
            if response.status_code == 200:
                result = response.json()
                try:
                    alt = result["results"]["channels"][0]["alternatives"][0]
                    transcript = alt["transcript"]
                    detected_lang = result["results"]["channels"][0].get("detected_language", "en")
                    
                    if not transcript.strip() or is_song_lyrics(transcript): return None
                    
                    return {
                        "transcript": transcript,
                        "detected_language": detected_lang
                    }
                except (KeyError, IndexError): return None
            return None
        except Exception as e:
            logger.error(f"URL transcription error: {e}")
            return None

def create_deepgram_client():
    return DeepgramClient()

deepgram_client = DeepgramClient()
