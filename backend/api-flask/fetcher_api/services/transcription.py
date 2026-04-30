"""
Parallel transcription service — Deepgram + Voxtral.

Decision matrix:
  Deepgram=OK    + Voxtral=OK    → send dual-block to AI; store Voxtral as primary (better proper nouns)
  Deepgram=EMPTY + Voxtral=OK    → return empty  (Deepgram = authoritative "no speech" signal)
  Deepgram=ERROR + Voxtral=OK    → use Voxtral
  Deepgram=OK    + Voxtral=ERROR → use Deepgram
  Deepgram=ERROR + Voxtral=ERROR → return empty
  Deepgram=EMPTY + Voxtral=ERROR → return empty
"""

from __future__ import annotations

import asyncio
import logging
import os
import subprocess
import tempfile
from dataclasses import asdict, dataclass
from typing import Optional

import httpx

logger = logging.getLogger(__name__)


# ── Status constants ──────────────────────────────────────────────────────────

DEEPGRAM_STATUS_OK = "ok"
DEEPGRAM_STATUS_EMPTY = "empty"
DEEPGRAM_STATUS_ERROR = "error"

VOXTRAL_MODEL = os.getenv("VOXTRAL_MODEL", "voxtral-mini-2507")
DEEPGRAM_API_KEY = os.getenv("DEEPGRAM_API_KEY", "")
MISTRAL_API_KEY = os.getenv("MISTRAL_API_KEY", "")

# Deepgram is the authoritative silence detector.
# When Deepgram returns empty the video has no intelligible speech —
# Voxtral hallucinated from background music/noise.
DEEPGRAM_EMPTY_IS_AUTHORITATIVE = True

DEEPGRAM_PAD_START_MS = 500


# ── Result dataclasses ────────────────────────────────────────────────────────

@dataclass
class SingleTranscriptResult:
    status: str
    transcript: str = ""
    language: Optional[str] = None
    source: str = ""
    chars: int = 0

    def is_ok(self) -> bool:
        return self.status == DEEPGRAM_STATUS_OK and bool(self.transcript.strip())


@dataclass
class TranscriptionResult:
    status: str
    transcript: str = ""                # primary displayed transcript
    detected_language: Optional[str] = None
    transcription_source: str = ""      # "deepgram" | "voxtral" | "merged" | "empty"
    deepgram: Optional[SingleTranscriptResult] = None
    voxtral: Optional[SingleTranscriptResult] = None


# ── Sync wrapper helpers ──────────────────────────────────────────────────────

def _run_async(coro):
    try:
        return asyncio.run(coro)
    except RuntimeError:
        loop = asyncio.new_event_loop()
        try:
            return loop.run_until_complete(coro)
        finally:
            loop.close()


def transcribe_video_sync(video_path: str) -> TranscriptionResult:
    return _run_async(transcribe_video(video_path))


def transcribe_video_deepgram(video_path: str) -> dict:
    """
    Backward-compatible wrapper for older callers.
    Despite the legacy name, this now runs the full parallel transcription path.
    """
    result = transcribe_video_sync(video_path)
    return asdict(result)


# ── Audio compression ─────────────────────────────────────────────────────────

def _run_ffmpeg(cmd: list[str], timeout: int = 60) -> None:
    result = subprocess.run(cmd, capture_output=True, timeout=timeout)
    if result.returncode != 0:
        raise RuntimeError(result.stderr.decode(errors="ignore")[:400])


def _compress_audio(video_path: str, pad_start_ms: int = DEEPGRAM_PAD_START_MS) -> str:
    tmp = tempfile.NamedTemporaryFile(suffix=".mp3", delete=False)
    tmp.close()

    silence_sec = max(pad_start_ms / 1000.0, 0.0)

    # 1) Best path: prepend a short silence pad to real audio
    try:
        padded_cmd = [
            "ffmpeg", "-y",
            "-f", "lavfi", "-t", str(silence_sec), "-i", "anullsrc=r=16000:cl=mono",
            "-i", video_path,
            "-filter_complex", "[0:a][1:a]concat=n=2:v=0:a=1[out]",
            "-map", "[out]",
            "-vn", "-ar", "16000", "-ac", "1", "-b:a", "32k",
            tmp.name,
        ]
        _run_ffmpeg(padded_cmd)
        size_kb = os.path.getsize(tmp.name) // 1024
        logger.info(
            "🎵 Audio compressed+padded (%dms silence): %dKB → %s",
            pad_start_ms, size_kb, tmp.name,
        )
        return tmp.name
    except Exception as exc:
        logger.warning("transcription: padded audio extraction failed, retrying plain extract: %s", exc)

    # 2) Fallback: plain audio extract
    try:
        plain_cmd = [
            "ffmpeg", "-y",
            "-i", video_path,
            "-vn", "-ar", "16000", "-ac", "1", "-b:a", "32k",
            tmp.name,
        ]
        _run_ffmpeg(plain_cmd)
        size_kb = os.path.getsize(tmp.name) // 1024
        logger.info("🎵 Audio compressed (plain extract): %dKB → %s", size_kb, tmp.name)
        return tmp.name
    except Exception as exc:
        logger.warning("transcription: plain audio extraction failed, generating silence-only audio: %s", exc)

    # 3) Final fallback: silence-only clip
    silence_cmd = [
        "ffmpeg", "-y",
        "-f", "lavfi", "-t", "2", "-i", "anullsrc=r=16000:cl=mono",
        "-ar", "16000", "-ac", "1", "-b:a", "32k",
        tmp.name,
    ]
    _run_ffmpeg(silence_cmd)
    size_kb = os.path.getsize(tmp.name) // 1024
    logger.info("🎵 Silence-only audio generated: %dKB → %s", size_kb, tmp.name)
    return tmp.name


# ── Deepgram ──────────────────────────────────────────────────────────────────

async def _transcribe_deepgram(audio_path: str) -> SingleTranscriptResult:
    if not DEEPGRAM_API_KEY:
        logger.warning("transcription: Deepgram API key not set")
        return SingleTranscriptResult(status=DEEPGRAM_STATUS_ERROR, source="deepgram")

    try:
        with open(audio_path, "rb") as f:
            audio_bytes = f.read()

        logger.info("transcription: 📤 Deepgram: sending %d bytes...", len(audio_bytes))

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                "https://api.deepgram.com/v1/listen",
                params={
                    "model": "nova-2",
                    "detect_language": "true",
                    "smart_format": "true",
                    "punctuate": "true",
                },
                headers={
                    "Authorization": f"Token {DEEPGRAM_API_KEY}",
                    "Content-Type": "audio/mpeg",
                },
                content=audio_bytes,
            )
            resp.raise_for_status()
            data = resp.json()

        channels = data.get("results", {}).get("channels", [])
        transcript = ""
        language = None

        if channels:
            alts = channels[0].get("alternatives", [])
            if alts:
                transcript = (alts[0].get("transcript") or "").strip()
            language = channels[0].get("detected_language") or None

        if not transcript:
            logger.warning("transcription: ⚠️ Deepgram returned empty transcript")
            return SingleTranscriptResult(
                status=DEEPGRAM_STATUS_EMPTY,
                source="deepgram",
                language=language,
            )

        logger.info(
            "transcription: ✅ Deepgram: %d chars, lang=%s",
            len(transcript),
            language or "unknown",
        )
        return SingleTranscriptResult(
            status=DEEPGRAM_STATUS_OK,
            transcript=transcript,
            language=language,
            source="deepgram",
            chars=len(transcript),
        )

    except Exception as exc:
        logger.warning("transcription: ❌ Deepgram error: %s", exc)
        return SingleTranscriptResult(status=DEEPGRAM_STATUS_ERROR, source="deepgram")


# ── Voxtral ───────────────────────────────────────────────────────────────────

async def _transcribe_voxtral(audio_path: str, audio_filename: str) -> SingleTranscriptResult:
    """
    Mistral audio transcription via multipart/form-data.
    Voxtral is preferred as primary when both sources succeed — it is often
    more accurate for proper nouns than Deepgram nova-2.
    """
    if not MISTRAL_API_KEY:
        logger.warning("transcription: Mistral API key not set — skipping Voxtral")
        return SingleTranscriptResult(status=DEEPGRAM_STATUS_ERROR, source="voxtral")

    size_kb = os.path.getsize(audio_path) // 1024
    logger.info(
        "transcription: 📤 Voxtral: sending %dKB (%s) model=%s",
        size_kb, audio_filename, VOXTRAL_MODEL,
    )

    try:
        with open(audio_path, "rb") as f:
            audio_bytes = f.read()

        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                "https://api.mistral.ai/v1/audio/transcriptions",
                headers={"Authorization": f"Bearer {MISTRAL_API_KEY}"},
                data={"model": VOXTRAL_MODEL},
                files={
                    "file": (
                        audio_filename,
                        audio_bytes,
                        "audio/mpeg",
                    )
                },
            )

        logger.info("transcription: Voxtral HTTP %d", resp.status_code)

        if resp.status_code != 200:
            logger.warning(
                "transcription: ❌ Voxtral %d — body: %s",
                resp.status_code,
                resp.text[:600],
            )
            return SingleTranscriptResult(status=DEEPGRAM_STATUS_ERROR, source="voxtral")

        data = resp.json()
        transcript = (data.get("text") or "").strip()
        language = data.get("language") or data.get("detected_language") or "unknown"

        if not transcript:
            logger.info("transcription: ✅ Voxtral finished: empty")
            return SingleTranscriptResult(
                status=DEEPGRAM_STATUS_EMPTY,
                source="voxtral",
                language=language,
            )

        logger.info("transcription: ✅ Voxtral: %d chars, lang=%s", len(transcript), language)
        return SingleTranscriptResult(
            status=DEEPGRAM_STATUS_OK,
            transcript=transcript,
            language=language,
            source="voxtral",
            chars=len(transcript),
        )

    except Exception as exc:
        logger.warning("transcription: ❌ Voxtral exception: %s", exc)
        return SingleTranscriptResult(status=DEEPGRAM_STATUS_ERROR, source="voxtral")


# ── Selection logic ───────────────────────────────────────────────────────────

def _select_transcript(
    dg: SingleTranscriptResult,
    vx: SingleTranscriptResult,
) -> TranscriptionResult:
    """
    Core decision matrix.

    When both sources succeed, Voxtral is stored as the primary displayed transcript
    because it is often more accurate for proper nouns.
    Deepgram is still sent to the AI as part of the dual-block via get_prompt_transcript().
    Deepgram remains the authoritative "no speech" detector — its EMPTY status wins.
    """

    if dg.status == DEEPGRAM_STATUS_EMPTY and DEEPGRAM_EMPTY_IS_AUTHORITATIVE:
        if vx.is_ok():
            logger.info(
                "transcription: 🔇 Deepgram confirmed no speech — suppressing Voxtral (%d chars)",
                vx.chars,
            )
        else:
            logger.info("transcription: 🔇 Deepgram confirmed no speech — returning empty")
        return TranscriptionResult(
            status="empty/music",
            transcript="",
            detected_language=None,
            transcription_source="empty",
            deepgram=dg,
            voxtral=vx,
        )

    if dg.status == DEEPGRAM_STATUS_ERROR:
        if vx.is_ok():
            logger.info("transcription: 🎯 Using Voxtral only (Deepgram failed)")
            return TranscriptionResult(
                status="ok",
                transcript=vx.transcript,
                detected_language=vx.language,
                transcription_source="voxtral",
                deepgram=dg,
                voxtral=vx,
            )
        logger.warning("transcription: ❌ Both Deepgram and Voxtral failed — returning empty")
        return TranscriptionResult(
            status="error",
            transcript="",
            transcription_source="empty",
            deepgram=dg,
            voxtral=vx,
        )

    if dg.is_ok() and vx.is_ok():
        logger.info(
            "transcription: 🎯 Both OK — primary=voxtral (dg=%d chars, vx=%d chars)",
            len(dg.transcript),
            len(vx.transcript),
        )
        return TranscriptionResult(
            status="ok",
            transcript=vx.transcript,
            detected_language=(vx.language if vx.language and vx.language != "unknown" else None) or dg.language,
            transcription_source="merged",
            deepgram=dg,
            voxtral=vx,
        )

    if dg.is_ok():
        logger.info("transcription: 🎯 Using Deepgram only (Voxtral unavailable)")
        return TranscriptionResult(
            status="ok",
            transcript=dg.transcript,
            detected_language=dg.language,
            transcription_source="deepgram",
            deepgram=dg,
            voxtral=vx,
        )

    if vx.is_ok():
        logger.info("transcription: 🎯 Using Voxtral only (Deepgram empty, non-authoritative mode)")
        return TranscriptionResult(
            status="ok",
            transcript=vx.transcript,
            detected_language=vx.language,
            transcription_source="voxtral",
            deepgram=dg,
            voxtral=vx,
        )

    return TranscriptionResult(
        status="empty/music",
        transcript="",
        transcription_source="empty",
        deepgram=dg,
        voxtral=vx,
    )


def _build_merged_transcript_block(
    dg: SingleTranscriptResult,
    vx: SingleTranscriptResult,
) -> str:
    """
    Dual-block sent to Mistral Call 1 when both sources returned content.
    """
    lines = ["[TRANSCRIPT — two ASR sources provided, use the more coherent one]", ""]
    if dg.is_ok():
        lines += [f"[Deepgram]\n{dg.transcript}", ""]
    if vx.is_ok():
        lines += [f"[Voxtral]\n{vx.transcript}", ""]
    return "\n".join(lines).strip()


# ── Public API ────────────────────────────────────────────────────────────────

async def transcribe_video(video_path: str) -> TranscriptionResult:
    logger.info("transcription: 🚀 Parallel transcription starting: %s", video_path)

    audio_path = None
    try:
        audio_path = _compress_audio(video_path)
        audio_filename = os.path.basename(audio_path)

        dg_task = asyncio.create_task(_transcribe_deepgram(audio_path))
        vx_task = asyncio.create_task(_transcribe_voxtral(audio_path, audio_filename))

        dg_result, vx_result = await asyncio.gather(dg_task, vx_task)
        result = _select_transcript(dg_result, vx_result)

        logger.info(
            "transcription: 📊 Final — status=%s source=%s chars=%d",
            result.status,
            result.transcription_source,
            len(result.transcript),
        )
        return result

    except Exception as exc:
        logger.exception("transcription: ❌ Unexpected error: %s", exc)
        return TranscriptionResult(status="error", transcript="", transcription_source="empty")
    finally:
        if audio_path and os.path.exists(audio_path):
            try:
                os.unlink(audio_path)
            except OSError:
                pass


def get_prompt_transcript(result: TranscriptionResult) -> str:
    """
    Returns the transcript string for Mistral Call 1.
    When source=merged, returns the dual-block so the AI sees both.
    """
    if result.transcription_source == "merged" and result.deepgram and result.voxtral:
        return _build_merged_transcript_block(result.deepgram, result.voxtral)
    return result.transcript or ""