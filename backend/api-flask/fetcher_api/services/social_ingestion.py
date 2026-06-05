import json
import logging
from typing import Any
from urllib.parse import urlparse

from fetcher_api.adapters.db import fetch_one, get_db_connection
from fetcher_api.adapters.gcs_client import gcs_client
from fetcher_api.services.social_urls import SocialUrlResult, has_stable_duplicate_url
from fetcher_api.services.storage import public_gcs_url

logger = logging.getLogger("social_ingestion")


def _row_to_dict(row: Any) -> dict:
    if not row:
        return {}
    if hasattr(row, "keys"):
        return dict(row)
    if hasattr(row, "_asdict"):
        return row._asdict()
    return {}


def _json_value(value: Any) -> str:
    if value is None:
        return "{}"
    if isinstance(value, str):
        return value
    return json.dumps(value, ensure_ascii=False)


def _blob_name_from_gcs_value(value: str | None) -> str | None:
    if not value:
        return None

    text = str(value).strip()
    if text.startswith("media/"):
        return text

    if text.startswith("gs://"):
        parsed = urlparse(text)
        return parsed.path.lstrip("/") or None

    if text.startswith("https://storage.googleapis.com/"):
        parsed = urlparse(text)
        parts = parsed.path.lstrip("/").split("/", 1)
        if len(parts) == 2:
            return parts[1]

    return None


def _copy_reused_gcs_urls(existing_gcs_urls: dict, target_gcs_paths: dict) -> dict:
    if not existing_gcs_urls or not target_gcs_paths:
        return {}

    if not gcs_client.available:
        logger.warning("♻️ Social reuse: GCS unavailable; not reusing original user's GCS URLs")
        return {}

    copied = {}
    bucket = gcs_client.client.bucket(gcs_client.analysis_bucket_name)

    for key in ("preview_thumbnail", "video", "result_json"):
        source_blob_name = _blob_name_from_gcs_value(existing_gcs_urls.get(key))
        target_blob_name = target_gcs_paths.get(key)
        if not source_blob_name or not target_blob_name:
            continue

        try:
            source_blob = bucket.blob(source_blob_name)
            if not source_blob.exists():
                logger.warning("♻️ Social reuse: source GCS blob missing key=%s blob=%s", key, source_blob_name)
                continue
            bucket.copy_blob(source_blob, bucket, new_name=target_blob_name)
            copied[key] = public_gcs_url(target_blob_name, gcs_client.analysis_bucket_name)
        except Exception as exc:
            logger.warning("♻️ Social reuse: failed copying GCS key=%s error=%s", key, exc)

    return copied


def find_reusable_social_reel(
    user_id: str,
    url_result: SocialUrlResult,
    shortcode: str | None = None,
) -> dict | None:
    """Find a processed public social reel from any user for the same stable media identity."""
    if not user_id or url_result.platform not in {"facebook", "instagram"}:
        return None

    if not has_stable_duplicate_url(url_result):
        logger.info(
            "♻️ Social reuse skipped: no stable canonical key platform=%s original=%s",
            url_result.platform,
            url_result.original_url,
        )
        return None

    try:
        if url_result.platform == "facebook" and url_result.content_id:
            content_id = url_result.content_id
            row = fetch_one(
                """
                SELECT *
                FROM reels
                WHERE user_id <> %s
                  AND status = 'done'
                  AND (
                        source_url ~* %s
                     OR source_url ~* %s
                     OR source_url ~* %s
                     OR source_url ~* %s
                  )
                ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
                LIMIT 1
                """,
                (
                    user_id,
                    rf"facebook\.com/reels?/{content_id}([/?#]|$)",
                    rf"facebook\.com/(?:[^/?#]+/)?videos/(?:[^/?#]+/)?{content_id}([/?#]|$)",
                    rf"facebook\.com/watch[^#]*[?&]v={content_id}([&#]|$)",
                    rf"facebook\.com/video\.php[^#]*[?&]v={content_id}([&#]|$)",
                ),
            )
        else:
            row = fetch_one(
                """
                SELECT *
                FROM reels
                WHERE user_id <> %s
                  AND status = 'done'
                  AND (
                        source_url = %s
                     OR id LIKE %s
                  )
                ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
                LIMIT 1
                """,
                (user_id, url_result.canonical_url, f"{(shortcode or url_result.content_id or '').strip()}--%"),
            )

        reusable = _row_to_dict(row)
        if reusable:
            logger.info(
                "♻️ Social reuse candidate found platform=%s canonical_key=%s source_reel=%s",
                url_result.platform,
                url_result.canonical_key,
                reusable.get("id"),
            )
            return reusable

    except Exception as exc:
        logger.warning(
            "♻️ Social reuse lookup failed platform=%s canonical_key=%s error=%s",
            url_result.platform,
            url_result.canonical_key,
            exc,
        )

    return None


def create_reused_social_reel(
    source_reel: dict,
    new_reel_id: str,
    user_id: str,
    source_url: str,
    target_gcs_paths: dict,
) -> dict:
    """Create a new user-owned reel row from a processed source reel."""
    existing_gcs_urls = source_reel.get("gcs_urls") or {}
    if isinstance(existing_gcs_urls, str):
        try:
            existing_gcs_urls = json.loads(existing_gcs_urls)
        except Exception:
            existing_gcs_urls = {}
    if not isinstance(existing_gcs_urls, dict):
        existing_gcs_urls = {}

    new_gcs_urls = _copy_reused_gcs_urls(existing_gcs_urls, target_gcs_paths)

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO reels (
                    id, user_id, source_url, status, folder_id,
                    caption, author_name, duration, is_long_video,
                    summary_category, summary_topic, summary_title, summary_text,
                    summary_bullets, summary_hashtags, summary_emojis,
                    content_type, recipe, workout, detected_language,
                    gcs_urls, transcription, tools_list, location, prompt,
                    is_list, list_subtype, list_count, list_type,
                    created_at, updated_at
                )
                SELECT
                    %s, %s, %s, 'done', 'default',
                    caption, author_name, duration, is_long_video,
                    summary_category, summary_topic, summary_title, summary_text,
                    summary_bullets, summary_hashtags, summary_emojis,
                    content_type, recipe, workout, detected_language,
                    %s::jsonb, transcription, tools_list, location, prompt,
                    is_list, list_subtype, list_count, list_type,
                    NOW(), NOW()
                FROM reels
                WHERE id = %s
                ON CONFLICT (id) DO NOTHING
                """,
                (
                    new_reel_id,
                    user_id,
                    source_url,
                    _json_value(new_gcs_urls),
                    source_reel.get("id"),
                ),
            )

            cur.execute("SAVEPOINT social_reuse_locations")
            try:
                cur.execute(
                    """
                    INSERT INTO reel_locations (
                        reel_id, user_id, position, name, place_type, description, address,
                        neighborhood, city, region, country, postal_code,
                        instagram_username, instagram_account_name,
                        lat, lng, google_place_id, maps_url, created_at, updated_at
                    )
                    SELECT
                        %s, %s, position, name, place_type, description, address,
                        neighborhood, city, region, country, postal_code,
                        instagram_username, instagram_account_name,
                        lat, lng, google_place_id, maps_url, NOW(), NOW()
                    FROM reel_locations
                    WHERE reel_id = %s
                    ON CONFLICT (reel_id, user_id, position) DO NOTHING
                    """,
                    (new_reel_id, user_id, source_reel.get("id")),
                )
            except Exception as exc:
                cur.execute("ROLLBACK TO SAVEPOINT social_reuse_locations")
                logger.warning("♻️ Social reuse: reel_locations copy skipped error=%s", exc)
            finally:
                try:
                    cur.execute("RELEASE SAVEPOINT social_reuse_locations")
                except Exception:
                    pass

        conn.commit()

    logger.info(
        "♻️ Social reuse created user reel=%s from source_reel=%s copied_gcs_keys=%s",
        new_reel_id,
        source_reel.get("id"),
        sorted(new_gcs_urls.keys()),
    )
    return {
        "reel_id": new_reel_id,
        "source_reel_id": source_reel.get("id"),
        "gcs_urls": new_gcs_urls,
    }
