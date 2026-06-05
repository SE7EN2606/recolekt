#!/usr/bin/env python3
"""One-off retry runner for failed Facebook/Instagram reel ingestions."""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from fetcher_api.adapters.db import execute, fetch_all, fetch_one  # noqa: E402
from fetcher_api.services.social_urls import canonicalize_social_url  # noqa: E402
from fetcher_api.utils.timestamps import get_unique_id  # noqa: E402

logger = logging.getLogger("retry_failed_social_reels")

TEMP_DIR_BASE = os.path.join(tempfile.gettempdir(), "recolekt_retry_failed_social")
SOCIAL_BLOCK_MARKERS = {
    "social_cookies_expired",
    "social_login_required",
    "social_rate_limited",
    "checkpoint",
    "login required",
    "too many requests",
    "cookie invalid",
    "cookies expired",
}


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def row_to_dict(row: Any) -> dict:
    if not row:
        return {}
    if hasattr(row, "keys"):
        return dict(row)
    if hasattr(row, "_asdict"):
        return row._asdict()
    return {}


def platform_clause(platform: str) -> tuple[str, list[str]]:
    if platform == "facebook":
        return "(source_url ILIKE %s OR source_url ILIKE %s)", ["%facebook.com%", "%fb.watch%"]
    if platform == "instagram":
        return "source_url ILIKE %s", ["%instagram.com%"]
    return (
        "(source_url ILIKE %s OR source_url ILIKE %s OR source_url ILIKE %s)",
        ["%facebook.com%", "%fb.watch%", "%instagram.com%"],
    )


def platform_guess(source_url: str | None) -> str:
    url = (source_url or "").lower()
    if "facebook.com" in url or "fb.watch" in url or "fb.com" in url:
        return "facebook"
    if "instagram.com" in url:
        return "instagram"
    return "unknown"


def platform_code(source_url: str | None) -> str:
    guess = platform_guess(source_url)
    if guess == "facebook":
        return "FB"
    if guess == "instagram":
        return "IG"
    return "UNKNOWN"


def extract_shortcode(source_url: str, platform: str, fallback_id: str) -> str:
    from fetcher_api.adapters.meta_client import meta_client

    url_result = canonicalize_social_url(source_url, resolve_facebook_redirects=platform == "facebook")
    if platform == "facebook" and url_result.content_id:
        return url_result.content_id.rstrip("-")

    shortcode = meta_client.extract_shortcode(url_result.canonical_url or source_url)
    if shortcode:
        return shortcode.rstrip("-")

    return (fallback_id or get_unique_id(source_url)).split("--")[0].rstrip("-")


def build_query(args: argparse.Namespace) -> tuple[str, list[Any]]:
    platform_sql, platform_params = platform_clause(args.platform)
    clauses = [
        "user_id = %s",
        "status = %s",
        "source_url IS NOT NULL",
        platform_sql,
    ]
    params: list[Any] = [args.user_id, args.status, *platform_params]

    if args.since:
        clauses.append("created_at >= %s::date")
        params.append(args.since)
    if args.until:
        clauses.append("created_at < (%s::date + INTERVAL '1 day')")
        params.append(args.until)

    params.append(args.limit)
    sql = f"""
        SELECT id, user_id, source_url, status, error_message, folder_id, gcs_urls, created_at, updated_at
        FROM reels
        WHERE {' AND '.join(clauses)}
        ORDER BY created_at ASC
        LIMIT %s
    """
    return sql, params


def fetch_retry_rows(args: argparse.Namespace) -> list[dict]:
    sql, params = build_query(args)
    return [row_to_dict(row) for row in fetch_all(sql, params)]


def latest_reel_state(reel_id: str, user_id: str) -> dict:
    return row_to_dict(
        fetch_one(
            "SELECT id, status, error_message, gcs_urls, updated_at FROM reels WHERE id = %s AND user_id = %s",
            (reel_id, user_id),
        )
    )


def looks_like_social_block(value: Any) -> bool:
    text = str(value or "").strip().lower()
    return bool(text and any(marker in text for marker in SOCIAL_BLOCK_MARKERS))


def append_log(log_path: str | None, payload: dict):
    line = json.dumps(payload, ensure_ascii=False, default=str)
    print(line)
    if not log_path:
        return
    with open(log_path, "a", encoding="utf-8") as f:
        f.write(line + "\n")


def mark_processing(row: dict):
    execute(
        """
        UPDATE reels
        SET status = 'processing', error_message = NULL, updated_at = NOW()
        WHERE id = %s AND user_id = %s
        """,
        (row["id"], row["user_id"]),
    )


def retry_with_reuse(row: dict, shortcode: str, code: str) -> dict | None:
    from fetcher_api.services.social_ingestion import (
        find_reusable_social_reel,
        update_existing_reel_from_reusable,
    )
    from fetcher_api.services.storage import generate_gcs_paths

    url_result = canonicalize_social_url(row["source_url"], resolve_facebook_redirects=code == "FB")
    reusable = find_reusable_social_reel(row["user_id"], url_result, shortcode)
    if not reusable:
        return None

    gcs_paths = generate_gcs_paths(shortcode, code, user_id=row["user_id"])
    return update_existing_reel_from_reusable(
        reusable,
        row["id"],
        row["user_id"],
        url_result.canonical_url or row["source_url"],
        gcs_paths,
    )


def retry_row(row: dict) -> dict:
    from fetcher_api.api.helpers.processing import background_process

    started = time.monotonic()
    source_url = row["source_url"]
    guess = platform_guess(source_url)
    code = platform_code(source_url)
    shortcode = extract_shortcode(source_url, guess, row["id"])

    result = {
        "process_id": row["id"],
        "summary": {},
        "caption": "",
        "user_id": row["user_id"],
        "source_url": source_url,
        "folder_id": row.get("folder_id") or "default",
        "gcs_urls": row.get("gcs_urls") or {},
    }

    reuse_result = retry_with_reuse(row, shortcode, code)
    if reuse_result:
        latest = latest_reel_state(row["id"], row["user_id"])
        return {
            "id": row["id"],
            "source_url": source_url,
            "old_status": row.get("status"),
            "new_status": latest.get("status"),
            "error_message": latest.get("error_message"),
            "elapsed_seconds": round(time.monotonic() - started, 2),
            "method": "canonical_reuse",
            "reused_from": reuse_result.get("source_reel_id"),
        }

    temp_dir = tempfile.mkdtemp(dir=TEMP_DIR_BASE)
    video_path = os.path.join(temp_dir, f"{row['id']}.mp4")

    mark_processing(row)
    background_process(
        result,
        video_path,
        temp_dir,
        shortcode,
        "",
        source_url,
        True,
        "",
        None,
        row["user_id"],
        force=True,
    )

    latest = latest_reel_state(row["id"], row["user_id"])
    return {
        "id": row["id"],
        "source_url": source_url,
        "old_status": row.get("status"),
        "new_status": latest.get("status"),
        "error_message": latest.get("error_message"),
        "elapsed_seconds": round(time.monotonic() - started, 2),
        "method": "background_process",
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Retry failed Recolekt social reel ingestions one at a time.")
    parser.add_argument("--user-id", required=True)
    parser.add_argument("--platform", choices=["facebook", "instagram", "all"], default="facebook")
    parser.add_argument("--status", default="error")
    parser.add_argument("--limit", type=int, default=5)
    parser.add_argument("--delay-seconds", type=int, default=180)
    parser.add_argument("--since")
    parser.add_argument("--until")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--execute", action="store_true")
    parser.add_argument("--output-log")
    parser.add_argument("--stop-on-social-block", dest="stop_on_social_block", action="store_true", default=True)
    parser.add_argument("--no-stop-on-social-block", dest="stop_on_social_block", action="store_false")
    args = parser.parse_args()

    if args.limit < 1:
        parser.error("--limit must be >= 1")
    if args.delay_seconds < 0:
        parser.error("--delay-seconds must be >= 0")
    if args.execute and args.dry_run:
        parser.error("Use either --execute or --dry-run, not both")

    args.dry_run = not args.execute
    return args


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
    os.makedirs(TEMP_DIR_BASE, exist_ok=True)

    args = parse_args()
    rows = fetch_retry_rows(args)
    started_at = utc_now_iso()
    summary = {
        "event": "retry_failed_social_reels_started",
        "started_at": started_at,
        "user_id": args.user_id,
        "platform": args.platform,
        "status": args.status,
        "limit": args.limit,
        "delay_seconds": args.delay_seconds,
        "dry_run": args.dry_run,
        "total_found": len(rows),
    }
    append_log(args.output_log, summary)

    if args.dry_run:
        for row in rows:
            append_log(args.output_log, {
                "event": "dry_run_reel",
                "id": row.get("id"),
                "created_at": row.get("created_at"),
                "source_url": row.get("source_url"),
                "current_status": row.get("status"),
                "error_message": row.get("error_message"),
                "platform_guess": platform_guess(row.get("source_url")),
            })
        append_log(args.output_log, {
            "event": "retry_failed_social_reels_finished",
            "started_at": started_at,
            "finished_at": utc_now_iso(),
            "user_id": args.user_id,
            "total_found": len(rows),
            "attempted": 0,
            "succeeded": 0,
            "failed": 0,
            "stopped_reason": "dry_run",
        })
        return 0

    attempted = succeeded = failed = 0
    stopped_reason = ""
    for index, row in enumerate(rows):
        attempted += 1
        try:
            per_reel = retry_row(row)
            if per_reel.get("new_status") == "done":
                succeeded += 1
            else:
                failed += 1
            append_log(args.output_log, {"event": "retry_reel_result", **per_reel})

            if args.stop_on_social_block and (
                looks_like_social_block(per_reel.get("error_message"))
                or looks_like_social_block(per_reel.get("new_status"))
            ):
                stopped_reason = f"social_block:{per_reel.get('error_message') or per_reel.get('new_status')}"
                append_log(args.output_log, {
                    "event": "retry_stopped",
                    "reason": stopped_reason,
                    "id": row.get("id"),
                })
                break
        except Exception as exc:
            failed += 1
            elapsed = 0
            append_log(args.output_log, {
                "event": "retry_reel_result",
                "id": row.get("id"),
                "source_url": row.get("source_url"),
                "old_status": row.get("status"),
                "new_status": "exception",
                "error_message": str(exc),
                "elapsed_seconds": elapsed,
            })
            if args.stop_on_social_block and looks_like_social_block(exc):
                stopped_reason = f"social_block:{exc}"
                break

        is_last = index == len(rows) - 1
        if not is_last and args.delay_seconds:
            time.sleep(args.delay_seconds)

    append_log(args.output_log, {
        "event": "retry_failed_social_reels_finished",
        "started_at": started_at,
        "finished_at": utc_now_iso(),
        "user_id": args.user_id,
        "total_found": len(rows),
        "attempted": attempted,
        "succeeded": succeeded,
        "failed": failed,
        "stopped_reason": stopped_reason,
    })
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
