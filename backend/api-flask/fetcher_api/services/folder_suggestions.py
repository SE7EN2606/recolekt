import json
import logging
import re
import time
import uuid
from collections import Counter
from typing import Any

from fetcher_api.adapters.db import fetch_all, fetch_one, get_db_connection

logger = logging.getLogger("folder_suggestions")

UNSORTED_FOLDER_IDS = {"", "default", "unsorted", "all"}
MIN_CONFIDENCE = 40
DEFAULT_GENERATE_LIMIT = 100
MAX_GENERATE_LIMIT = 200
FOLDER_PROFILE_REELS_PER_FOLDER = 30
STOP_WORDS = {
    "the", "and", "for", "with", "that", "this", "from", "into", "your", "you",
    "are", "was", "were", "have", "has", "how", "what", "when", "where", "why",
    "recipe", "video", "reel", "make", "made", "easy", "best", "new", "use",
}


def _row_to_dict(row: Any) -> dict:
    if not row:
        return {}
    if hasattr(row, "keys"):
        return dict(row)
    if hasattr(row, "_asdict"):
        return row._asdict()
    return {}


def _rows_to_dicts(rows: list[Any]) -> list[dict]:
    return [_row_to_dict(row) for row in rows or []]


def _json_parse(value: Any):
    if value is None:
        return None
    if isinstance(value, (dict, list)):
        return value
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        try:
            return json.loads(text)
        except Exception:
            return value
    return value


def _tokens(text: str) -> set[str]:
    raw = re.findall(r"[a-zA-Z][a-zA-Z0-9_-]{2,}", (text or "").lower())
    return {token for token in raw if token not in STOP_WORDS and len(token) >= 3}


def _title(row: dict) -> str:
    title = row.get("summary_title")
    parsed = _json_parse(title)
    if isinstance(parsed, dict):
        for key in ("title", "english", "original"):
            value = parsed.get(key)
            if isinstance(value, dict):
                value = value.get("title")
            if value:
                return str(value).strip()
    if title:
        return str(title).strip()
    caption = str(row.get("caption") or "").strip()
    return caption.split("\n")[0][:90] if caption else "Untitled video"


def _thumbnail_url(row: dict) -> str | None:
    return row.get("thumbnail_url") or row.get("thumbnailUrl")


def _reel_text(row: dict) -> str:
    hashtags = row.get("summary_hashtags") or []
    if isinstance(hashtags, str):
        hashtags_text = hashtags
    elif isinstance(hashtags, list):
        hashtags_text = " ".join(str(item or "") for item in hashtags)
    else:
        hashtags_text = ""

    parts = [
        _title(row),
        row.get("summary_category"),
        row.get("summary_topic"),
        row.get("content_type"),
        row.get("list_subtype"),
        row.get("caption"),
        row.get("author_name"),
        row.get("summary_text_excerpt"),
        hashtags_text,
    ]
    return " ".join(str(part or "") for part in parts)


def _reel_tokens(row: dict) -> set[str]:
    return _tokens(_reel_text(row))


def _is_unsorted_folder(folder_id: str | None) -> bool:
    return (folder_id or "").strip().lower() in UNSORTED_FOLDER_IDS


def fetch_user_folders(user_id: str) -> list[dict]:
    return _rows_to_dicts(fetch_all(
        """
        SELECT id, name, parent_id
        FROM folders
        WHERE user_id = %s
        ORDER BY name ASC
        """,
        (user_id,),
    ))


def fetch_unsorted_reels(user_id: str, limit: int) -> list[dict]:
    return _rows_to_dicts(fetch_all(
        """
        -- Keep Smart Organize generation lightweight to avoid Neon transfer overuse.
        SELECT id,
               user_id,
               source_url,
               folder_id,
               status,
               summary_title,
               LEFT(COALESCE(summary_text::text, ''), 1000) AS summary_text_excerpt,
               summary_category,
               summary_topic,
               summary_hashtags,
               content_type,
               LEFT(COALESCE(caption, ''), 1000) AS caption,
               author_name,
               list_subtype,
               created_at
        FROM reels
        WHERE user_id = %s
          AND status = 'done'
          AND (folder_id IS NULL OR folder_id IN ('default', 'unsorted', 'all'))
        ORDER BY created_at DESC NULLS LAST
        LIMIT %s
        """,
        (user_id, limit),
    ))


def fetch_folder_reels(user_id: str) -> list[dict]:
    return _rows_to_dicts(fetch_all(
        """
        -- Keep folder profiles lightweight to avoid Neon transfer overuse.
        WITH ranked AS (
            SELECT id,
                   user_id,
                   source_url,
                   folder_id,
                   status,
                   summary_title,
                   LEFT(COALESCE(summary_text::text, ''), 1000) AS summary_text_excerpt,
                   summary_category,
                   summary_topic,
                   summary_hashtags,
                   content_type,
                   LEFT(COALESCE(caption, ''), 1000) AS caption,
                   author_name,
                   list_subtype,
                   created_at,
                   ROW_NUMBER() OVER (PARTITION BY folder_id ORDER BY created_at DESC NULLS LAST) AS folder_rank
            FROM reels
            WHERE user_id = %s
              AND status = 'done'
              AND folder_id IS NOT NULL
              AND folder_id NOT IN ('default', 'unsorted', 'all')
        )
        SELECT id, user_id, source_url, folder_id, status, summary_title,
               summary_text_excerpt, summary_category, summary_topic,
               summary_hashtags, content_type, caption, author_name,
               list_subtype, created_at
        FROM ranked
        WHERE folder_rank <= %s
        """,
        (user_id, FOLDER_PROFILE_REELS_PER_FOLDER),
    ))


def _build_folder_profiles(folders: list[dict], folder_reels: list[dict]) -> dict[str, dict]:
    profiles = {}
    reels_by_folder: dict[str, list[dict]] = {}
    for reel in folder_reels:
        reels_by_folder.setdefault(str(reel.get("folder_id")), []).append(reel)

    for folder in folders:
        folder_id = str(folder.get("id") or "")
        name = str(folder.get("name") or "").strip()
        folder_tokens = _tokens(name)
        folder_content_types = Counter()
        folder_keywords = Counter(folder_tokens)

        for reel in reels_by_folder.get(folder_id, []):
            folder_keywords.update(_reel_tokens(reel))
            content_type = str(reel.get("content_type") or "").strip().lower()
            if content_type:
                folder_content_types[content_type] += 1
            subtype = str(reel.get("list_subtype") or "").strip().lower()
            if subtype:
                folder_keywords[subtype] += 2

        profiles[folder_id] = {
            "id": folder_id,
            "name": name,
            "folder_tokens": folder_tokens,
            "keywords": set(token for token, _ in folder_keywords.most_common(80)),
            "content_types": set(folder_content_types.keys()),
            "reel_count": len(reels_by_folder.get(folder_id, [])),
        }
    return profiles


def _score_reel_for_folder(reel: dict, profile: dict) -> dict | None:
    if not profile:
        return None

    return _score_reel_for_folder_with_tokens(reel, _reel_tokens(reel), profile)


def _score_reel_for_folder_with_tokens(reel: dict, reel_tokens: set[str], profile: dict) -> dict | None:
    if not profile:
        return None

    folder_tokens = profile["folder_tokens"]
    profile_tokens = profile["keywords"]
    score = 0
    signals = {}

    name_overlap = sorted(reel_tokens & folder_tokens)
    if name_overlap:
        points = min(35, 18 + (len(name_overlap) * 6))
        score += points
        signals["folder_name_token_match"] = {"tokens": name_overlap[:8], "points": points}

    keyword_overlap = sorted(reel_tokens & profile_tokens)
    if keyword_overlap:
        points = min(35, 10 + (len(keyword_overlap) * 3))
        score += points
        signals["keyword_overlap"] = {"tokens": keyword_overlap[:12], "points": points}

    content_type = str(reel.get("content_type") or "").strip().lower()
    if content_type and content_type in profile["content_types"]:
        score += 15
        signals["content_type_match"] = {"value": content_type, "points": 15}

    subtype = str(reel.get("list_subtype") or "").strip().lower()
    if subtype and subtype in profile_tokens:
        score += 10
        signals["structured_data_match"] = {"value": subtype, "points": 10}

    if profile["reel_count"] >= 3 and keyword_overlap:
        score += 5
        signals["existing_folder_profile_match"] = {"folder_reel_count": profile["reel_count"], "points": 5}

    confidence = min(100, int(score))
    if confidence < MIN_CONFIDENCE:
        return None

    top_terms = name_overlap[:3] or keyword_overlap[:3]
    reason = (
        f"Matches {profile['name']} from {', '.join(top_terms)}"
        if top_terms else f"Looks related to {profile['name']}"
    )
    return {"confidence": confidence, "reason": reason, "signals": signals}


def _suggestion_rank(scored: dict, folder: dict) -> tuple[int, int, int]:
    signals = scored.get("signals") or {}
    overlap_count = 0
    for key in ("folder_name_token_match", "keyword_overlap"):
        tokens = ((signals.get(key) or {}).get("tokens") or [])
        overlap_count += len(tokens)

    folder_specificity = len(_tokens(str(folder.get("name") or "")))
    return (int(scored.get("confidence") or 0), overlap_count, folder_specificity)


def _bulk_fetch_pending(user_id: str, reel_ids: list[str]) -> list[dict]:
    if not reel_ids:
        return []
    return _rows_to_dicts(fetch_all(
        """
        SELECT id,
               reel_id,
               suggested_folder_id,
               suggested_folder_name,
               confidence,
               reason,
               signals,
               updated_at,
               created_at
        FROM reel_folder_suggestions
        WHERE user_id = %s
          AND status = 'pending'
          AND reel_id = ANY(%s::text[])
        ORDER BY reel_id ASC, updated_at DESC NULLS LAST, created_at DESC NULLS LAST
        """,
        (user_id, reel_ids),
    ))


def _canonical_signals(value: Any) -> str:
    parsed = _json_parse(value)
    if parsed is None:
        parsed = {}
    return json.dumps(parsed, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def _confidence_value(value: Any) -> int:
    try:
        return int(value or 0)
    except Exception:
        return 0


def _materially_same_suggestion(existing: dict, item: dict, signals_json: str) -> bool:
    return (
        str(existing.get("suggested_folder_id") or "") == str(item.get("folder_id") or "")
        and str(existing.get("suggested_folder_name") or "") == str(item.get("folder_name") or "")
        and _confidence_value(existing.get("confidence")) == _confidence_value(item.get("confidence"))
        and str(existing.get("reason") or "") == str(item.get("reason") or "")
        and _canonical_signals(existing.get("signals")) == _canonical_signals(signals_json)
    )


def _write_best_suggestions(user_id: str, reel_ids: list[str], best_suggestions: list[dict]) -> dict:
    existing_rows = _bulk_fetch_pending(user_id, reel_ids)
    best_by_reel = {str(item["reel_id"]): item for item in best_suggestions}

    existing_by_reel: dict[str, list[dict]] = {}
    for row in existing_rows:
        existing_by_reel.setdefault(str(row.get("reel_id") or ""), []).append(row)

    stale_ids = []
    keep_by_reel = {}
    for reel_id, rows in existing_by_reel.items():
        best = best_by_reel.get(reel_id)
        if not best:
            stale_ids.extend(row["id"] for row in rows)
            continue

        matching_rows = [
            row for row in rows
            if str(row.get("suggested_folder_id") or "") == str(best.get("folder_id") or "")
        ]
        keep = matching_rows[0] if matching_rows else rows[0]
        keep_by_reel[reel_id] = keep
        stale_ids.extend(row["id"] for row in rows if row.get("id") != keep.get("id"))

    inserted = 0
    updated = 0
    skipped_unchanged = 0

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            if stale_ids:
                cur.execute(
                    """
                    DELETE FROM reel_folder_suggestions
                    WHERE user_id = %s
                      AND status = 'pending'
                      AND id = ANY(%s::text[])
                    """,
                    (user_id, stale_ids),
                )

            for item in best_suggestions:
                reel_id = str(item["reel_id"])
                existing = keep_by_reel.get(reel_id)
                signals_json = json.dumps(item["signals"], ensure_ascii=False)
                if existing:
                    if _materially_same_suggestion(existing, item, signals_json):
                        skipped_unchanged += 1
                        continue

                    cur.execute(
                        """
                        UPDATE reel_folder_suggestions
                        SET confidence = %s,
                            reason = %s,
                            signals = %s::jsonb,
                            suggested_folder_id = %s,
                            suggested_folder_name = %s,
                            updated_at = now()
                        WHERE id = %s AND user_id = %s AND status = 'pending'
                        """,
                        (
                            item["confidence"],
                            item["reason"],
                            signals_json,
                            item["folder_id"],
                            item["folder_name"],
                            existing["id"],
                            user_id,
                        ),
                    )
                    updated += 1
                else:
                    cur.execute(
                        """
                        INSERT INTO reel_folder_suggestions (
                            id, user_id, reel_id, suggested_folder_id, suggested_folder_name,
                            suggestion_type, confidence, reason, signals, status,
                            created_at, updated_at
                        )
                        VALUES (%s, %s, %s, %s, %s, 'existing_folder', %s, %s, %s::jsonb, 'pending', now(), now())
                        """,
                        (
                            f"sug_{uuid.uuid4().hex}",
                            user_id,
                            item["reel_id"],
                            item["folder_id"],
                            item["folder_name"],
                            item["confidence"],
                            item["reason"],
                            signals_json,
                        ),
                    )
                    inserted += 1
        conn.commit()

    return {
        "suggestions_inserted": inserted,
        "suggestions_updated": updated,
        "skipped_unchanged": skipped_unchanged,
        "stale_pending_removed": len(stale_ids),
    }


def generate_folder_suggestions(user_id: str, limit: int = DEFAULT_GENERATE_LIMIT, include_new_folder_suggestions: bool = False) -> dict:
    total_started = time.perf_counter()
    limit = max(1, min(int(limit or DEFAULT_GENERATE_LIMIT), MAX_GENERATE_LIMIT))
    timings = {}

    started = time.perf_counter()
    unsorted_reels = fetch_unsorted_reels(user_id, limit)
    timings["load_unsorted_ms"] = round((time.perf_counter() - started) * 1000)

    started = time.perf_counter()
    folders = fetch_user_folders(user_id)
    folder_reels = fetch_folder_reels(user_id)
    profiles = _build_folder_profiles(folders, folder_reels)
    timings["load_profiles_ms"] = round((time.perf_counter() - started) * 1000)

    started = time.perf_counter()
    candidates_scored = 0
    best_suggestions = []
    skipped = 0
    for reel in unsorted_reels:
        best = None
        reel_tokens = _reel_tokens(reel)
        for folder in folders:
            folder_id = str(folder.get("id") or "")
            if not folder_id or _is_unsorted_folder(folder_id):
                continue
            profile = profiles.get(folder_id, {})
            if not profile:
                continue
            scored = _score_reel_for_folder_with_tokens(reel, reel_tokens, profile)
            if not scored:
                continue
            candidate = (_suggestion_rank(scored, folder), folder, scored)
            candidates_scored += 1
            if not best or candidate[0] > best[0]:
                best = candidate

        if not best:
            skipped += 1
            continue

        _, folder, scored = best
        best_suggestions.append({
            "reel_id": reel["id"],
            "folder_id": folder["id"],
            "folder_name": folder["name"],
            "confidence": scored["confidence"],
            "reason": scored["reason"],
            "signals": scored["signals"],
        })
    timings["scoring_ms"] = round((time.perf_counter() - started) * 1000)

    started = time.perf_counter()
    write_result = _write_best_suggestions(
        user_id,
        [str(reel.get("id")) for reel in unsorted_reels if reel.get("id")],
        best_suggestions,
    )
    timings["write_ms"] = round((time.perf_counter() - started) * 1000)
    timings["total_ms"] = round((time.perf_counter() - total_started) * 1000)

    if include_new_folder_suggestions:
        logger.info("New folder suggestions requested but not generated in V1; existing folders remain the focus")

    return {
        "ok": True,
        "user_id": user_id,
        "folders_considered": len(folders),
        "unsorted_considered": len(unsorted_reels),
        "candidates_scored": candidates_scored,
        "suggestions_created_or_updated": write_result["suggestions_inserted"] + write_result["suggestions_updated"],
        "suggestions_inserted": write_result["suggestions_inserted"],
        "suggestions_updated": write_result["suggestions_updated"],
        "skipped_unchanged": write_result["skipped_unchanged"],
        "stale_pending_removed": write_result["stale_pending_removed"],
        "skipped": skipped,
        "timings": timings,
    }


def list_folder_suggestions(user_id: str, status: str = "pending") -> dict:
    rows = _rows_to_dicts(fetch_all(
        """
        -- Keep this list response lightweight to avoid Neon transfer overuse.
        SELECT
            s.id AS suggestion_id,
            s.reel_id,
            s.suggested_folder_id,
            s.suggested_folder_name,
            s.suggestion_type,
            s.confidence,
            s.reason,
            s.status,
            r.summary_title,
            r.summary_topic,
            r.summary_category,
            r.source_url,
            r.content_type,
            r.list_subtype,
            r.gcs_urls->>'preview_thumbnail' AS thumbnail_url,
            f.name AS folder_name
        FROM reel_folder_suggestions s
        JOIN reels r ON r.id = s.reel_id AND r.user_id = s.user_id
        LEFT JOIN folders f ON f.id = s.suggested_folder_id AND f.user_id = s.user_id
        WHERE s.user_id = %s AND s.status = %s
        ORDER BY s.suggested_folder_name ASC, s.confidence DESC, s.created_at DESC
        """,
        (user_id, status),
    ))

    groups_map: dict[str, dict] = {}
    suggestions = []
    for row in rows:
        folder_id = row.get("suggested_folder_id") or ""
        folder_name = row.get("folder_name") or row.get("suggested_folder_name") or "New folder"
        thumbnail_url = _thumbnail_url(row)
        suggestion = {
            "suggestion_id": row.get("suggestion_id"),
            "reel_id": row.get("reel_id"),
            "title": _title(row),
            "summary_title": row.get("summary_title"),
            "summary_topic": row.get("summary_topic"),
            "summary_category": row.get("summary_category"),
            "thumbnail_url": thumbnail_url,
            "thumbnailUrl": thumbnail_url,
            "source_url": row.get("source_url"),
            "content_type": row.get("content_type"),
            "list_subtype": row.get("list_subtype"),
            "confidence": int(row.get("confidence") or 0),
            "reason": row.get("reason") or "",
            "suggested_folder_id": row.get("suggested_folder_id"),
            "suggested_folder_name": row.get("suggested_folder_name") or folder_name,
            "suggestion_type": row.get("suggestion_type"),
            "status": row.get("status"),
        }
        suggestions.append(suggestion)

        key = f"{row.get('suggestion_type')}:{folder_id}:{folder_name}"
        group = groups_map.setdefault(key, {
            "suggested_folder_id": row.get("suggested_folder_id"),
            "suggested_folder_name": row.get("suggested_folder_name") or folder_name,
            "suggestion_type": row.get("suggestion_type"),
            "count": 0,
            "avg_confidence": 0,
            "suggestions": [],
        })
        group["suggestions"].append(suggestion)
        group["count"] += 1

    for group in groups_map.values():
        values = [item["confidence"] for item in group["suggestions"]]
        group["avg_confidence"] = round(sum(values) / len(values)) if values else 0

    unsorted_count_row = _row_to_dict(fetch_one(
        """
        SELECT COUNT(*) AS count
        FROM reels
        WHERE user_id = %s
          AND status = 'done'
          AND (folder_id IS NULL OR folder_id IN ('default', 'unsorted', 'all'))
        """,
        (user_id,),
    ))

    return {
        "suggestions": [],
        "groups": list(groups_map.values()),
        "total": len(suggestions),
        "unsorted_count": int(unsorted_count_row.get("count") or 0),
    }
