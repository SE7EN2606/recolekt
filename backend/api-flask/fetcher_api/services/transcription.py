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
import json
import logging
import os
import subprocess
import tempfile
from dataclasses import asdict, dataclass, field
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
    debug: Optional[dict] = None


@dataclass
class AudioPreparationResult:
    status: str
    audio_path: Optional[str] = None
    debug: dict = field(default_factory=dict)


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

def _extract_useful_ffmpeg_stderr(stderr: bytes | str) -> str:
    text = stderr.decode(errors="ignore") if isinstance(stderr, bytes) else str(stderr or "")
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    if not lines:
        return "ffmpeg_failed_without_stderr"

    noise_prefixes = (
        "ffmpeg version",
        "built with",
        "configuration:",
        "libavutil",
        "libavcodec",
        "libavformat",
        "libavdevice",
        "libavfilter",
        "libswscale",
        "libswresample",
        "libpostproc",
    )
    useful_lines = [line for line in lines if not line.startswith(noise_prefixes)]
    if not useful_lines:
        useful_lines = lines[-6:]
    return " | ".join(useful_lines[:8])[:800]


def _run_ffmpeg(cmd: list[str], timeout: int = 60) -> None:
    result = subprocess.run(cmd, capture_output=True, timeout=timeout)
    if result.returncode != 0:
        raise RuntimeError(_extract_useful_ffmpeg_stderr(result.stderr))


def _probe_media_file(path: str) -> dict:
    summary = {
        "path": path,
        "file_size": None,
        "video_streams": 0,
        "audio_streams": 0,
        "video_codecs": [],
        "audio_codecs": [],
        "duration": None,
        "ffprobe_error": None,
    }

    if not path or not os.path.exists(path):
        summary["ffprobe_error"] = "file_missing"
        return summary

    try:
        summary["file_size"] = os.path.getsize(path)
    except OSError as exc:
        summary["ffprobe_error"] = f"stat_failed: {exc}"
        return summary

    try:
        result = subprocess.run(
            [
                "ffprobe",
                "-v", "error",
                "-print_format", "json",
                "-show_entries", "format=duration:stream=index,codec_type,codec_name",
                path,
            ],
            capture_output=True,
            text=True,
            timeout=15,
        )
    except subprocess.TimeoutExpired:
        summary["ffprobe_error"] = "timeout"
        return summary
    except Exception as exc:
        summary["ffprobe_error"] = str(exc)
        return summary

    if result.returncode != 0:
        summary["ffprobe_error"] = _extract_useful_ffmpeg_stderr(result.stderr or result.stdout)
        return summary

    try:
        payload = json.loads(result.stdout or "{}")
    except json.JSONDecodeError as exc:
        summary["ffprobe_error"] = f"invalid_json: {exc}"
        return summary

    streams = payload.get("streams") or []
    for stream in streams:
        codec_type = stream.get("codec_type")
        codec_name = stream.get("codec_name")
        if codec_type == "video":
            summary["video_streams"] += 1
            if codec_name and codec_name not in summary["video_codecs"]:
                summary["video_codecs"].append(codec_name)
        elif codec_type == "audio":
            summary["audio_streams"] += 1
            if codec_name and codec_name not in summary["audio_codecs"]:
                summary["audio_codecs"].append(codec_name)

    duration_raw = ((payload.get("format") or {}).get("duration") or "").strip()
    if duration_raw:
        try:
            summary["duration"] = round(float(duration_raw), 3)
        except ValueError:
            summary["duration"] = duration_raw

    return summary


def _compress_audio(video_path: str, pad_start_ms: int = DEEPGRAM_PAD_START_MS) -> AudioPreparationResult:
    tmp = tempfile.NamedTemporaryFile(suffix=".mp3", delete=False)
    tmp.close()
    media_probe = _probe_media_file(video_path)
    debug = {"media_probe": media_probe}

    silence_sec = max(pad_start_ms / 1000.0, 0.0)

    if media_probe.get("ffprobe_error") is None and media_probe.get("audio_streams", 0) == 0:
        logger.warning(
            "transcription: source has no audio stream; skipping ASR path audio_streams=%s video_streams=%s path=%s",
            media_probe.get("audio_streams"),
            media_probe.get("video_streams"),
            video_path,
        )
        try:
            os.unlink(tmp.name)
        except OSError:
            pass
        return AudioPreparationResult(status="no_audio_stream", debug=debug)

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
        return AudioPreparationResult(status="ok", audio_path=tmp.name, debug=debug)
    except Exception as exc:
        debug["padded_extract_error"] = str(exc)
        logger.warning("transcription: padded audio extraction failed: %s", exc)

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
        return AudioPreparationResult(status="ok", audio_path=tmp.name, debug=debug)
    except Exception as exc:
        debug["plain_extract_error"] = str(exc)
        logger.warning("transcription: plain audio extraction failed: %s", exc)

    try:
        os.unlink(tmp.name)
    except OSError:
        pass

    return AudioPreparationResult(status="audio_extraction_failed", debug=debug)


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
        prep = _compress_audio(video_path)
        if prep.status != "ok" or not prep.audio_path:
            logger.warning(
                "transcription: aborting ASR before providers status=%s debug=%s",
                prep.status,
                prep.debug,
            )
            return TranscriptionResult(
                status=prep.status,
                transcript="",
                detected_language="unknown",
                transcription_source="empty",
                debug=prep.debug,
            )

        audio_path = prep.audio_path
        audio_filename = os.path.basename(audio_path)

        dg_task = asyncio.create_task(_transcribe_deepgram(audio_path))
        vx_task = asyncio.create_task(_transcribe_voxtral(audio_path, audio_filename))

        dg_result, vx_result = await asyncio.gather(dg_task, vx_task)
        result = _select_transcript(dg_result, vx_result)
        result.debug = prep.debug

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
