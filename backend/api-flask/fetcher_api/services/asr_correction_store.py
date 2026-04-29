# fetcher_api/services/asr_correction_store.py
"""
AsrCorrectionStore — a self-learning ASR corrections database.

Stores known Deepgram mishearings → correct brand / tool names.
Auto-learns new corrections from successful tool extractions.
Persists to fetcher_api/data/asr_corrections.json.

Two correction tables:
  tool_names        {garbled_norm → canonical}  — for isolated tool name tokens
  text_replacements [[garbled, canonical], ...]  — for substring fix in free text

Lookup order for tool names:
  1. Exact normalised match
  2. 8-char prefix match
  3. Fuzzy match via rapidfuzz (optional — graceful fallback if not installed)

Auto-learning (tool names only):
  After every successful Call 1 extraction, scan the ASR transcript for
  n-gram windows that are fuzzy-close to any canonical tool name that
  Mistral found. If similarity >= LEARN_THRESHOLD, store the mapping.
  Text replacements are NOT auto-learned (too risky for free text).
"""

from __future__ import annotations

import json
import logging
import os
import re
import threading
from datetime import date
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

# ── File location ─────────────────────────────────────────────────────────────
_DATA_DIR = Path(__file__).parent.parent / "data"
_CORRECTIONS_FILE = _DATA_DIR / "asr_corrections.json"

# ── Fuzzy matching — optional dependency ─────────────────────────────────────
try:
    from rapidfuzz import fuzz
    from rapidfuzz import process as fuzz_process
    _FUZZY_AVAILABLE = True
except ImportError:
    _FUZZY_AVAILABLE = False
    logger.warning("📚 ASR store: rapidfuzz not installed — fuzzy matching disabled. Run: pip install rapidfuzz")

# ── Thresholds ────────────────────────────────────────────────────────────────
# How similar (0-100) a transcript n-gram must be to a known canonical name
# before we store a new garbled→canonical mapping.
_LEARN_THRESHOLD  = 88

# How similar a stored key must be to an incoming name to auto-apply the fix.
_APPLY_THRESHOLD  = 85

# Minimum length of a garbled token we'll store (avoids noise like "it", "is")
_MIN_GARBLED_LEN  = 4


def _norm(name: str) -> str:
    """Lowercase + strip non-alphanumeric. Used as storage key."""
    return re.sub(r"[^a-z0-9]", "", name.lower())


def _find_garbled_form(transcript: str, canonical: str) -> Optional[str]:
    """
    Slide a word-window over the transcript and find the span that most
    closely resembles the canonical name phonetically.
    Returns the raw transcript span if similarity >= LEARN_THRESHOLD, else None.
    """
    if not _FUZZY_AVAILABLE or not transcript or not canonical:
        return None

    words = transcript.lower().split()
    canonical_norm = _norm(canonical)
    canonical_word_count = len(canonical.split())

    best_score = 0
    best_span: Optional[str] = None

    # Try windows of ±1 word around the expected length
    for window_size in range(
        max(1, canonical_word_count - 1),
        canonical_word_count + 3
    ):
        for i in range(len(words) - window_size + 1):
            span = " ".join(words[i : i + window_size])
            span_norm = _norm(span)
            score = fuzz.ratio(span_norm, canonical_norm)
            if score > best_score:
                best_score = score
                best_span = span

    if best_score >= _LEARN_THRESHOLD and best_span and len(best_span) >= _MIN_GARBLED_LEN:
        return best_span
    return None


# ─────────────────────────────────────────────────────────────────────────────


class AsrCorrectionStore:
    """
    Thread-safe, self-learning store for ASR corrections.
    Instantiate once (use the module-level singleton via get_store()).
    """

    def __init__(self, path: Path = _CORRECTIONS_FILE):
        self._path = path
        self._lock = threading.RLock()
        # Internal maps — keys are always _norm()-ed for consistent lookup
        self._tool_names: dict[str, str] = {}
        self._text_replacements: list[tuple[str, str]] = []
        self._dirty = False
        self._load()

    # ── Public: correction API ────────────────────────────────────────────────

    def canonicalize_tool_name(self, name: str) -> str:
        """
        Return the canonical brand spelling for a tool name if a correction
        is known. Falls through: exact → 8-char prefix → fuzzy.
        Returns `name` unchanged if no correction is found.
        """
        if not name:
            return name

        with self._lock:
            n  = _norm(name)
            n8 = n[:8]

            # 1. Exact normalised match
            if n in self._tool_names:
                canonical = self._tool_names[n]
                if canonical != name:
                    logger.info("🔧 ASR store [exact]: '%s' → '%s'", name, canonical)
                return canonical

            # 2. 8-char prefix match
            if n8 in self._tool_names:
                canonical = self._tool_names[n8]
                if canonical != name:
                    logger.info("🔧 ASR store [prefix]: '%s' → '%s'", name, canonical)
                return canonical

            # 3. Fuzzy match against all stored keys
            if _FUZZY_AVAILABLE and self._tool_names:
                candidates = list(self._tool_names.keys())
                result = fuzz_process.extractOne(n, candidates, scorer=fuzz.ratio)
                if result and result[1] >= _APPLY_THRESHOLD:
                    canonical = self._tool_names[result[0]]
                    logger.info(
                        "🔧 ASR store [fuzzy %.0f%%]: '%s' → '%s'",
                        result[1], name, canonical
                    )
                    return canonical

            return name

    def fix_text(self, text: str) -> str:
        """
        Apply all known text_replacements to a free-text string.
        Case-insensitive substring replacement.
        """
        if not text:
            return text
        with self._lock:
            result = text
            for garbled, canonical in self._text_replacements:
                if garbled.lower() in result.lower():
                    result = re.sub(
                        re.escape(garbled), canonical, result, flags=re.IGNORECASE
                    )
            return result

    def learn_tool(self, garbled: str, canonical: str, source: str = "auto") -> bool:
        """
        Persist a new garbled → canonical tool name mapping.
        Returns True if the mapping was genuinely new.
        Silently ignores conflicts (existing mapping wins — avoids drift).
        """
        if not garbled or not canonical or len(garbled.strip()) < _MIN_GARBLED_LEN:
            return False

        n = _norm(garbled)
        with self._lock:
            existing = self._tool_names.get(n)
            if existing == canonical:
                return False  # Already known, nothing to do
            if existing and existing != canonical:
                logger.warning(
                    "⚠️ ASR store conflict for '%s': existing='%s' new='%s' — keeping existing",
                    garbled, existing, canonical
                )
                return False

            self._tool_names[n] = canonical
            self._dirty = True
            logger.info("📚 ASR store: learned '%s' → '%s' [%s]", garbled, canonical, source)
            self._save_if_dirty()
            return True

    def learn_from_extraction(
        self,
        transcript: str,
        tools_categories: list[dict] | None,
    ) -> None:
        """
        Called after a successful Call 1 extraction.

        For every canonical tool name that Mistral identified:
          - If it already appears verbatim in the transcript → nothing to learn
          - Otherwise, search the transcript for a fuzzy-close n-gram span
          - If found above threshold → store garbled→canonical for future runs

        This is the "learn as you go" mechanism. Over time the store accumulates
        corrections for every new tool, accent, and language encountered.
        """
        if not tools_categories or not transcript or not _FUZZY_AVAILABLE:
            return

        transcript_lower = transcript.lower()

        for cat in tools_categories:
            for item in cat.get("items", []):
                canonical = item.get("name", "").strip()
                if not canonical or len(canonical) < _MIN_GARBLED_LEN:
                    continue

                # Already correct in transcript — nothing to learn
                if canonical.lower() in transcript_lower:
                    continue

                # Also skip if the normalised form is already in the store
                if _norm(canonical) in self._tool_names.values():
                    pass  # Still search — may find a new garbled form

                garbled = _find_garbled_form(transcript, canonical)
                if garbled and _norm(garbled) != _norm(canonical):
                    self.learn_tool(garbled, canonical, source="auto")

    def stats(self) -> dict:
        """Return a summary dict — useful for health endpoints or logging."""
        with self._lock:
            return {
                "tool_corrections": len(self._tool_names),
                "text_replacements": len(self._text_replacements),
                "fuzzy_available": _FUZZY_AVAILABLE,
                "path": str(self._path),
            }

    # ── I/O ──────────────────────────────────────────────────────────────────

    def _load(self) -> None:
        with self._lock:
            if not self._path.exists():
                logger.warning(
                    "📚 ASR store: %s not found — store is empty. "
                    "Create fetcher_api/data/asr_corrections.json to seed it.",
                    self._path,
                )
                return

            try:
                with open(self._path, "r", encoding="utf-8") as f:
                    data = json.load(f)

                raw_tools = data.get("tool_names", {})
                # Keys in JSON may be readable (e.g. "chat gpt") — normalise them
                self._tool_names = {_norm(k): v for k, v in raw_tools.items()}

                raw_text = data.get("text_replacements", [])
                self._text_replacements = [
                    tuple(pair) for pair in raw_text if len(pair) == 2
                ]

                logger.info(
                    "📚 ASR store: loaded %d tool corrections, %d text replacements",
                    len(self._tool_names), len(self._text_replacements),
                )
            except Exception as exc:
                logger.error("❌ ASR store: failed to load %s — %s", self._path, exc)

    def _save_if_dirty(self) -> None:
        if not self._dirty:
            return

        try:
            self._path.parent.mkdir(parents=True, exist_ok=True)

            # Re-read existing file to preserve human-readable keys for known entries
            existing_data: dict = {}
            if self._path.exists():
                try:
                    with open(self._path, "r", encoding="utf-8") as f:
                        existing_data = json.load(f)
                except Exception:
                    pass

            existing_tool_names: dict = existing_data.get("tool_names", {})

            # Build output: keep original readable keys where possible,
            # add new entries (keyed by their normalised form)
            output_tool_names = dict(existing_tool_names)
            existing_norms = {_norm(k): k for k in existing_tool_names}
            for norm_key, canonical in self._tool_names.items():
                if norm_key in existing_norms:
                    output_tool_names[existing_norms[norm_key]] = canonical
                else:
                    # New entry — store with normalised key (readable enough)
                    output_tool_names[norm_key] = canonical

            data_out = {
                "_meta": {
                    "description": (
                        "Self-learning ASR corrections. "
                        "Auto-populated + manually curated. Do not delete — edit freely."
                    ),
                    "last_updated": str(date.today()),
                    "total_tool_corrections": len(output_tool_names),
                },
                "tool_names": output_tool_names,
                "text_replacements": [list(p) for p in self._text_replacements],
            }

            with open(self._path, "w", encoding="utf-8") as f:
                json.dump(data_out, f, ensure_ascii=False, indent=2)

            self._dirty = False
            logger.debug("📚 ASR store: saved to %s", self._path)
        except Exception as exc:
            logger.error("❌ ASR store: failed to save — %s", exc)


# ─────────────────────────────────────────────────────────────────────────────
# Module-level singleton — one instance per process, shared across all workers
# ─────────────────────────────────────────────────────────────────────────────

_store: Optional[AsrCorrectionStore] = None
_store_lock = threading.Lock()


def get_store() -> AsrCorrectionStore:
    """Return the shared AsrCorrectionStore singleton."""
    global _store
    if _store is None:
        with _store_lock:
            if _store is None:
                _store = AsrCorrectionStore()
    return _store
