def apply_media_aliases(payload: dict) -> dict:
    gcs_urls = payload.get("gcs_urls")
    if not isinstance(gcs_urls, dict):
        gcs_urls = {}

    thumb = (
        gcs_urls.get("preview_thumbnail")
        or gcs_urls.get("thumbnail")
        or gcs_urls.get("thumbnail_url")
        or gcs_urls.get("poster")
        or gcs_urls.get("poster_url")
    )

    result_json = (
        gcs_urls.get("result_json")
        or gcs_urls.get("result_json_url")
    )

    video_url = (
        gcs_urls.get("video")
        or gcs_urls.get("video_url")
    )

    if thumb:
        gcs_urls["preview_thumbnail"] = thumb
        gcs_urls.setdefault("thumbnail", thumb)
        gcs_urls.setdefault("thumbnail_url", thumb)

    if result_json:
        gcs_urls["result_json"] = result_json
        gcs_urls.setdefault("result_json_url", result_json)

    if video_url:
        gcs_urls["video"] = video_url
        gcs_urls.setdefault("video_url", video_url)

    payload["gcs_urls"] = gcs_urls

    payload["thumbnailUrl"] = thumb
    payload["thumbnail_url"] = thumb
    payload["posterUrl"] = thumb
    payload["poster_url"] = thumb
    payload["image_url"] = thumb
    payload["cover_url"] = thumb

    payload["result_json_url"] = result_json
    payload["resultJsonUrl"] = result_json

    payload["video_url"] = video_url
    payload["videoUrl"] = video_url

    return payload
