import json
import logging
import time
from flask import Blueprint, jsonify, request

from fetcher_api.adapters.db import get_db_connection
from fetcher_api.api.helpers.auth import get_user_id_from_request
from fetcher_api.services.folder_suggestions import (
    generate_folder_suggestions,
    list_folder_suggestions,
)

logger = logging.getLogger(__name__)
folder_suggestions_bp = Blueprint("folder_suggestions", __name__, url_prefix="/api/folder-suggestions")
PAYLOAD_WARNING_KB = 250


def _get_user_or_401():
    try:
        user_id = get_user_id_from_request()
        if not user_id:
            return None, (jsonify({"error": "Unauthorized"}), 401)
        return user_id, None
    except ValueError:
        return None, (jsonify({"error": "Unauthorized"}), 401)


def _suggestion_ids(data: dict) -> list[str]:
    values = data.get("suggestion_ids") or []
    if not isinstance(values, list):
        return []
    return [str(value).strip() for value in values if str(value or "").strip()]


def _payload_size_kb(payload: dict) -> float:
    try:
        return len(json.dumps(payload, ensure_ascii=False, default=str).encode("utf-8")) / 1024
    except Exception:
        return 0.0


def _log_payload(endpoint: str, user_id: str, payload: dict, duration_ms: float):
    groups = len(payload.get("groups") or [])
    suggestions = int(payload.get("total") or len(payload.get("suggestions") or []))
    size_kb = _payload_size_kb(payload)
    logger.info(
        "folder_suggestions_%s user=%s groups=%s suggestions=%s size_kb=%.1f duration_ms=%.0f",
        endpoint,
        user_id,
        groups,
        suggestions,
        size_kb,
        duration_ms,
    )
    if size_kb > PAYLOAD_WARNING_KB:
        logger.warning(
            "Smart Organize payload too large endpoint=%s user=%s size_kb=%.1f groups=%s suggestions=%s duration_ms=%.0f",
            endpoint,
            user_id,
            size_kb,
            groups,
            suggestions,
            duration_ms,
        )


@folder_suggestions_bp.route("/generate", methods=["POST"])
def generate_suggestions():
    user_id, err = _get_user_or_401()
    if err:
        return err

    data = request.get_json(silent=True) or {}
    try:
        limit = int(data.get("limit") or 100)
    except Exception:
        limit = 100
    include_new = bool(data.get("include_new_folder_suggestions", False))

    try:
        started = time.perf_counter()
        result = generate_folder_suggestions(user_id, limit=limit, include_new_folder_suggestions=include_new)
        list_started = time.perf_counter()
        result.update(list_folder_suggestions(user_id, "pending"))
        list_ms = round((time.perf_counter() - list_started) * 1000)
        result.setdefault("timings", {})["list_ms"] = list_ms
        duration_ms = (time.perf_counter() - started) * 1000
        logger.info(
            "folder_suggestions_generate user=%s limit=%s scanned=%s candidates_scored=%s suggestions_inserted=%s suggestions_updated=%s skipped_unchanged=%s stale_pending_removed=%s pending_returned_total=%s duration_ms=%.0f",
            user_id,
            limit,
            result.get("unsorted_considered", 0),
            result.get("candidates_scored", 0),
            result.get("suggestions_inserted", 0),
            result.get("suggestions_updated", 0),
            result.get("skipped_unchanged", 0),
            result.get("stale_pending_removed", 0),
            result.get("total", 0),
            duration_ms,
        )
        timings = result.get("timings") or {}
        logger.info(
            "folder_suggestions_generate_timing user=%s load_unsorted_ms=%s load_profiles_ms=%s scoring_ms=%s write_ms=%s list_ms=%s total_ms=%.0f",
            user_id,
            timings.get("load_unsorted_ms", 0),
            timings.get("load_profiles_ms", 0),
            timings.get("scoring_ms", 0),
            timings.get("write_ms", 0),
            timings.get("list_ms", 0),
            duration_ms,
        )
        _log_payload("generate", user_id, result, duration_ms)
        return jsonify(result), 200
    except Exception as exc:
        logger.error("Failed generating folder suggestions: %s", exc, exc_info=True)
        return jsonify({"error": "folder_suggestions_generate_failed"}), 500


@folder_suggestions_bp.route("", methods=["GET"])
def get_suggestions():
    user_id, err = _get_user_or_401()
    if err:
        return err

    status = (request.args.get("status") or "pending").strip().lower()
    if status not in {"pending", "applied", "dismissed"}:
        return jsonify({"error": "Invalid status"}), 400

    try:
        started = time.perf_counter()
        payload = list_folder_suggestions(user_id, status)
        _log_payload("list", user_id, payload, (time.perf_counter() - started) * 1000)
        return jsonify(payload), 200
    except Exception as exc:
        logger.error("Failed listing folder suggestions: %s", exc, exc_info=True)
        return jsonify({"error": "folder_suggestions_list_failed"}), 500


@folder_suggestions_bp.route("/apply", methods=["POST"])
def apply_suggestions():
    user_id, err = _get_user_or_401()
    if err:
        return err

    ids = _suggestion_ids(request.get_json(silent=True) or {})
    if not ids:
        return jsonify({"error": "suggestion_ids required"}), 400

    applied = []
    skipped = []
    try:
        started = time.perf_counter()
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                for suggestion_id in ids:
                    cur.execute(
                        """
                        SELECT s.id, s.reel_id, s.suggested_folder_id, s.suggestion_type, f.id AS folder_exists
                        FROM reel_folder_suggestions s
                        LEFT JOIN folders f
                          ON f.id = s.suggested_folder_id
                         AND f.user_id = s.user_id
                        WHERE s.id = %s
                          AND s.user_id = %s
                          AND s.status = 'pending'
                        FOR UPDATE
                        """,
                        (suggestion_id, user_id),
                    )
                    row = cur.fetchone()
                    if not row:
                        skipped.append({"suggestion_id": suggestion_id, "reason": "not_pending_or_not_found"})
                        continue

                    suggestion_type = row[3]
                    folder_id = row[2]
                    folder_exists = row[4]
                    if suggestion_type != "existing_folder" or not folder_id or not folder_exists:
                        skipped.append({"suggestion_id": suggestion_id, "reason": "invalid_target_folder"})
                        continue

                    cur.execute(
                        "UPDATE reels SET folder_id = %s, updated_at = NOW() WHERE id = %s AND user_id = %s",
                        (folder_id, row[1], user_id),
                    )
                    if cur.rowcount != 1:
                        skipped.append({"suggestion_id": suggestion_id, "reason": "reel_not_found"})
                        continue

                    cur.execute(
                        """
                        UPDATE reel_folder_suggestions
                        SET status = 'applied', applied_at = NOW(), updated_at = NOW()
                        WHERE id = %s AND user_id = %s AND status = 'pending'
                        """,
                        (suggestion_id, user_id),
                    )
                    applied.append(suggestion_id)
            conn.commit()

        payload = {"ok": True, "applied": applied, "skipped": skipped}
        _log_payload("apply", user_id, payload, (time.perf_counter() - started) * 1000)
        return jsonify(payload), 200
    except Exception as exc:
        logger.error("Failed applying folder suggestions: %s", exc, exc_info=True)
        return jsonify({"error": "folder_suggestions_apply_failed"}), 500


@folder_suggestions_bp.route("/dismiss", methods=["POST"])
def dismiss_suggestions():
    user_id, err = _get_user_or_401()
    if err:
        return err

    ids = _suggestion_ids(request.get_json(silent=True) or {})
    if not ids:
        return jsonify({"error": "suggestion_ids required"}), 400

    try:
        started = time.perf_counter()
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE reel_folder_suggestions
                    SET status = 'dismissed', dismissed_at = NOW(), updated_at = NOW()
                    WHERE user_id = %s
                      AND status = 'pending'
                      AND id = ANY(%s::text[])
                    RETURNING id
                    """,
                    (user_id, ids),
                )
                dismissed = [row[0] for row in cur.fetchall()]
            conn.commit()
        payload = {"ok": True, "dismissed": dismissed}
        _log_payload("dismiss", user_id, payload, (time.perf_counter() - started) * 1000)
        return jsonify(payload), 200
    except Exception as exc:
        logger.error("Failed dismissing folder suggestions: %s", exc, exc_info=True)
        return jsonify({"error": "folder_suggestions_dismiss_failed"}), 500
