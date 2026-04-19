# fetcher_api/adapters/deepgram_client.py

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
        r'\boh oh\b', r'\bdoo doo\b', r'\bsha la la\b', r'\bah+\s+ah+\b'
    ]

    for pattern in song_indicators:
        if re.search(pattern, text):
            logger.info(f"🎵 Song detected: pattern '{pattern}' found")
            return True

    words = text.split()

    # 2. Check for AI Hallucination loops
    sentences = [s.strip() for s in re.split(r'[.!?]\s+', text) if len(s.strip()) > 2]
    if len(sentences) >= 5:
        sentence_counts = Counter(sentences)
        most_common_sentence, most_common_count = sentence_counts.most_common(1)[0]

        if most_common_count >= 4 and (most_common_count / len(sentences)) > 0.35:
            logger.info(f"🎵 Song/Hallucination detected: sentence looped {most_common_count} times")
            return True

    # 3. Check word repetition ratio
    if len(words) > 30:
        unique_words = len(set(words))
        repetition_ratio = unique_words / len(words)
        if repetition_ratio < 0.15:
            logger.info(f"🎵 Song detected: high word repetition (ratio={repetition_ratio:.2f})")
            return True

    return False


class DeepgramClient:
    def __init__(self, api_key=None):
        self.api_key = api_key or DEEPGRAM_API_KEY
        self.base_url = "https://api.deepgram.com/v1/listen"
        self.max_file_size_mb = 50

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
                if attempt < retries - 1:
                    time.sleep(2)
                else:
                    raise
            finally:
                if session:
                    session.close()

    def _build_url(self) -> str:
        return (
            f"{self.base_url}"
            f"?model=nova-3"
            f"&detect_language=true"
            f"&punctuate=true"
            f"&diarize=false"
            f"&filler_words=false"
        )

    def _parse_deepgram_response(self, response) -> Optional[Dict[str, Any]]:
        if response.status_code == 200:
            result = response.json()
            try:
                alt = result["results"]["channels"][0]["alternatives"][0]
                transcript = alt.get("transcript", "")
                detected_lang = result["results"]["channels"][0].get("detected_language", "en")

                if not transcript.strip():
                    logger.warning("⚠️ Deepgram returned empty transcript")
                    return None

                if is_song_lyrics(transcript):
                    return None

                return {
                    "transcript": transcript,
                    "detected_language": detected_lang,
                }
            except (KeyError, IndexError):
                return None
        else:
            logger.error(f"❌ Deepgram API error: {response.status_code} - {response.text}")
            return None

    def transcribe(self, audio_path: str, enhanced: bool = False) -> Optional[Dict[str, Any]]:
        """
        File-based transcription with compression + language detection.
        Compresses audio first for reliability with Facebook/TikTok codecs.
        """
        compressed_path = None
        try:
            logger.info("🎵 Deepgram: extracting clean audio track...")
            compressed_path = self._compress_audio(audio_path)
            file_to_send = compressed_path if compressed_path else audio_path

            with open(file_to_send, 'rb') as audio_file:
                audio_data = audio_file.read()

            logger.info(f"📤 Deepgram: sending {len(audio_data)} bytes...")
            response = self._make_request(self._build_url(), data=audio_data)
            return self._parse_deepgram_response(response)

        except Exception as e:
            logger.error(f"Deepgram transcription error: {e}")
            return None
        finally:
            if compressed_path and os.path.exists(compressed_path):
                os.remove(compressed_path)

    def transcribe_compressed(self, compressed_path: str) -> Optional[Dict[str, Any]]:
        """
        Transcribe a pre-compressed audio file — skips ffmpeg step.
        Called by transcription.py when audio has already been compressed once
        to be shared with Voxtral in the parallel pipeline.
        """
        try:
            with open(compressed_path, 'rb') as audio_file:
                audio_data = audio_file.read()

            logger.info(f"📤 Deepgram (pre-compressed): sending {len(audio_data)} bytes...")
            response = self._make_request(self._build_url(), data=audio_data)
            return self._parse_deepgram_response(response)

        except Exception as e:
            logger.error(f"Deepgram compressed transcription error: {e}")
            return None

    def transcribe_url(self, audio_url: str, enhanced: bool = False) -> Optional[Dict[str, Any]]:
        """Transcribe via URL with language detection."""
        try:
            payload = {"url": audio_url}
            response = self._make_request(self._build_url(), json_payload=payload)

            if response.status_code == 200:
                result = response.json()
                try:
                    alt = result["results"]["channels"][0]["alternatives"][0]
                    transcript = alt["transcript"]
                    detected_lang = result["results"]["channels"][0].get("detected_language", "en")

                    if not transcript.strip() or is_song_lyrics(transcript):
                        return None

                    return {
                        "transcript": transcript,
                        "detected_language": detected_lang,
                    }
                except (KeyError, IndexError):
                    return None
            return None
        except Exception as e:
            logger.error(f"Deepgram URL transcription error: {e}")
            return None


def create_deepgram_client():
    return DeepgramClient()


deepgram_client = DeepgramClient()