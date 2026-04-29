# fetcher_api/adapters/voxtral_client.py  — top of file, replace the import block

import os
import logging
import requests
from typing import Optional, Dict, Any

from config.settings import MISTRAL_API_KEY

logger = logging.getLogger('transcription')

if not MISTRAL_API_KEY:
    logger.warning(
        "⚠️ MISTRAL_API_KEY not set — Voxtral transcription disabled. "
        "Deepgram will be used as the sole engine."
    )

VOXTRAL_API_URL = "https://api.mistral.ai/v1/audio/transcriptions"
VOXTRAL_MODEL = os.getenv("VOXTRAL_MODEL", "voxtral-mini-2507")


class VoxtralClient:
    def __init__(self, api_key: str = None):
        self.api_key = api_key or MISTRAL_API_KEY
        self.model = VOXTRAL_MODEL

    def _get_headers(self) -> dict:
        return {"Authorization": f"Bearer {self.api_key}"}

    def transcribe(self, audio_path: str) -> Optional[Dict[str, Any]]:
        if not self.api_key:
            logger.debug("Voxtral skipped — no API key")
            return None
        """
        Transcribe a local audio/video file.
        Expects a pre-compressed mp3 (16kHz mono) for best speed.
        """
        try:
            filename = os.path.basename(audio_path)
            ext = os.path.splitext(filename)[1].lower()
            mime_map = {
                ".mp3": "audio/mpeg",
                ".mp4": "audio/mp4",
                ".m4a": "audio/mp4",
                ".wav": "audio/wav",
                ".ogg": "audio/ogg",
                ".webm": "audio/webm",
            }
            mime = mime_map.get(ext, "audio/mpeg")

            with open(audio_path, "rb") as f:
                audio_bytes = f.read()

            logger.info(
                f"📤 Voxtral: sending {len(audio_bytes) // 1024}KB ({filename}) "
                f"model={self.model}"
            )

            response = requests.post(
                VOXTRAL_API_URL,
                headers=self._get_headers(),
                files={"file": (filename, audio_bytes, mime)},
                data={"model": self.model},
                timeout=150,
            )

            return self._parse_response(response)

        except Exception as e:
            logger.error(f"Voxtral transcription error: {e}")
            return None

    def transcribe_url(self, audio_url: str) -> Optional[Dict[str, Any]]:
        """
        Transcribe from a URL directly — Voxtral accepts file_url in the form body.
        No download needed, unlike Deepgram's JSON payload approach.
        """
        try:
            logger.info(f"📤 Voxtral URL transcription: {audio_url[:80]}...")

            response = requests.post(
                VOXTRAL_API_URL,
                headers=self._get_headers(),
                data={
                    "model": self.model,
                    "file_url": audio_url,
                },
                timeout=150,
            )

            return self._parse_response(response)

        except Exception as e:
            logger.error(f"Voxtral URL transcription error: {e}")
            return None

    def _parse_response(self, response: requests.Response) -> Optional[Dict[str, Any]]:
        if response.status_code == 200:
            result = response.json()
            transcript = (result.get("text") or "").strip()
            detected_lang = (result.get("language") or "unknown").strip()

            if not transcript:
                logger.warning("⚠️ Voxtral returned empty transcript")
                return None

            logger.info(
                f"✅ Voxtral: {len(transcript)} chars, lang={detected_lang}"
            )
            return {
                "transcript": transcript,
                "detected_language": detected_lang,
            }
        else:
            logger.error(
                f"❌ Voxtral API error: {response.status_code} — {response.text[:300]}"
            )
            return None


voxtral_client = VoxtralClient()
