import logging
import re
from dataclasses import asdict, dataclass
from urllib.parse import parse_qs, urlparse

import requests

logger = logging.getLogger("social_urls")

_BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}
_FACEBOOK_HOSTS = {
    "facebook.com",
    "m.facebook.com",
    "mobile.facebook.com",
    "mbasic.facebook.com",
    "fb.com",
}


@dataclass(frozen=True)
class SocialUrlResult:
    original_url: str
    resolved_url: str
    canonical_url: str
    platform: str | None
    content_type: str | None
    content_id: str | None
    canonical_key: str | None
    resolution_status: str

    def to_dict(self) -> dict:
        return asdict(self)


def _url_with_scheme(raw_url: str | None) -> str:
    raw = (raw_url or "").strip()
    if raw and not re.match(r"^https?://", raw, flags=re.IGNORECASE):
        return "https://" + raw
    return raw


def _host(parsed) -> str:
    host = (parsed.netloc or "").lower()
    return host[4:] if host.startswith("www.") else host


def _facebook_id_from_url(url: str) -> tuple[str | None, str | None, str | None]:
    parsed = urlparse(url)
    path = parsed.path or ""
    query = parse_qs(parsed.query or "")

    reel_match = re.search(r"/reels?/(\d+)(?:/|$)", path, flags=re.IGNORECASE)
    if reel_match:
        content_id = reel_match.group(1)
        return "reel", content_id, f"https://www.facebook.com/reel/{content_id}"

    watch_id = (query.get("v") or [""])[0]
    if path.rstrip("/").lower() in {"/watch", "/watch/"} and watch_id.isdigit():
        return "video", watch_id, f"https://www.facebook.com/watch/?v={watch_id}"

    if path.rstrip("/").lower() == "/video.php" and watch_id.isdigit():
        return "video", watch_id, f"https://www.facebook.com/watch/?v={watch_id}"

    video_match = re.search(r"/(?:[^/]+/)?videos/(?:[^/]+/)?(\d+)(?:/|$)", path, flags=re.IGNORECASE)
    if video_match:
        content_id = video_match.group(1)
        return "video", content_id, f"https://www.facebook.com/videos/{content_id}"

    return None, None, None


def is_facebook_share_url(raw_url: str | None) -> bool:
    try:
        parsed = urlparse(_url_with_scheme(raw_url))
    except Exception:
        return False

    host = _host(parsed)
    path = (parsed.path or "").lower()
    return host in _FACEBOOK_HOSTS and bool(re.match(r"^/share/v/[^/]+/?$", path))


def facebook_share_url_variants(raw_url: str | None) -> tuple[str, ...]:
    """Exact raw share URL variants that differ only by harmless URL spelling."""
    normalized = _url_with_scheme(raw_url)
    if not is_facebook_share_url(normalized):
        return ()

    parsed = urlparse(normalized)
    bare_path = (parsed.path or "").rstrip("/")
    query = f"?{parsed.query}" if parsed.query else ""
    fragment = f"#{parsed.fragment}" if parsed.fragment else ""
    variants = []

    for scheme in ("https", "http"):
        for host in ("www.facebook.com", "facebook.com"):
            for path in (bare_path, f"{bare_path}/"):
                variants.append(f"{scheme}://{host}{path}{query}{fragment}")

    return tuple(dict.fromkeys(variants))


def _is_opaque_facebook_url(url: str) -> bool:
    try:
        parsed = urlparse(url)
    except Exception:
        return False

    return _host(parsed) == "fb.watch" or is_facebook_share_url(url)


def _canonicalize_known_url(original_url: str, candidate_url: str, resolution_status: str) -> SocialUrlResult:
    try:
        parsed = urlparse(candidate_url)
    except Exception:
        return SocialUrlResult(original_url, candidate_url, candidate_url, None, None, None, None, resolution_status)

    host = _host(parsed)
    path = parsed.path or ""

    if host in {"instagram.com", "m.instagram.com"}:
        match = re.search(r"/(reel|reels|p|tv)/([^/?#]+)/?", path, flags=re.IGNORECASE)
        if match:
            kind = match.group(1).lower()
            kind = "reel" if kind == "reels" else "post" if kind == "p" else kind
            shortcode = match.group(2).strip()
            canonical_kind = "p" if kind == "post" else kind
            return SocialUrlResult(
                original_url,
                candidate_url,
                f"https://www.instagram.com/{canonical_kind}/{shortcode}/",
                "instagram",
                kind,
                shortcode,
                f"instagram:{kind}:{shortcode}",
                resolution_status,
            )
        return SocialUrlResult(original_url, candidate_url, "", "instagram", None, None, None, resolution_status)

    if host.endswith("tiktok.com"):
        clean_path = path.rstrip("/")
        return SocialUrlResult(
            original_url,
            candidate_url,
            f"https://www.tiktok.com{clean_path}",
            "tiktok",
            None,
            None,
            None,
            resolution_status,
        )

    if host == "youtu.be":
        video_id = path.strip("/").split("/")[0]
        if video_id:
            return SocialUrlResult(
                original_url,
                candidate_url,
                f"https://www.youtube.com/watch?v={video_id}",
                "youtube",
                "video",
                video_id,
                f"youtube:video:{video_id}",
                resolution_status,
            )

    if host in {"youtube.com", "m.youtube.com"}:
        query = parse_qs(parsed.query or "")
        video_id = (query.get("v") or [""])[0]
        if video_id:
            return SocialUrlResult(
                original_url,
                candidate_url,
                f"https://www.youtube.com/watch?v={video_id}",
                "youtube",
                "video",
                video_id,
                f"youtube:video:{video_id}",
                resolution_status,
            )

        shorts_match = re.search(r"/shorts/([^/?#]+)/?", path, flags=re.IGNORECASE)
        if shorts_match:
            content_id = shorts_match.group(1)
            return SocialUrlResult(
                original_url,
                candidate_url,
                f"https://www.youtube.com/shorts/{content_id}",
                "youtube",
                "short",
                content_id,
                f"youtube:short:{content_id}",
                resolution_status,
            )

    if host in _FACEBOOK_HOSTS or host == "fb.watch":
        content_type, content_id, canonical_url = _facebook_id_from_url(candidate_url)
        if content_type and content_id and canonical_url:
            return SocialUrlResult(
                original_url,
                candidate_url,
                canonical_url,
                "facebook",
                content_type,
                content_id,
                f"facebook:{content_type}:{content_id}",
                resolution_status,
            )

        if _is_opaque_facebook_url(candidate_url):
            return SocialUrlResult(original_url, candidate_url, "", "facebook", None, None, None, resolution_status)

        clean_path = path.rstrip("/")
        canonical_url = f"https://www.facebook.com{clean_path}" if clean_path else "https://www.facebook.com"
        return SocialUrlResult(original_url, candidate_url, canonical_url, "facebook", None, None, None, resolution_status)

    clean_path = path.rstrip("/")
    clean_host = f"www.{host}" if host and not host.startswith("www.") else host
    canonical_url = f"https://{clean_host}{clean_path}" if clean_host else candidate_url.rstrip("/")
    return SocialUrlResult(original_url, candidate_url, canonical_url, host or None, None, None, None, resolution_status)


def canonicalize_social_url(raw_url: str | None, resolve_facebook_redirects: bool = False) -> SocialUrlResult:
    original_url = (raw_url or "").strip()
    normalized_url = _url_with_scheme(raw_url)
    if not normalized_url:
        return SocialUrlResult("", "", "", None, None, None, None, "empty")

    initial = _canonicalize_known_url(original_url, normalized_url, "not_required")
    if initial.platform != "facebook" or not _is_opaque_facebook_url(normalized_url):
        return initial

    if not resolve_facebook_redirects:
        return SocialUrlResult(
            initial.original_url,
            initial.resolved_url,
            initial.canonical_url,
            initial.platform,
            initial.content_type,
            initial.content_id,
            initial.canonical_key,
            "resolution_required",
        )

    try:
        with requests.Session() as session:
            session.max_redirects = 5
            response = session.get(
                normalized_url,
                headers=_BROWSER_HEADERS,
                timeout=(2, 4),
                allow_redirects=True,
            )
        resolved_url = response.url or normalized_url
    except Exception as exc:
        logger.info("Facebook URL resolution failed original_url=%s error=%s", original_url, exc)
        return SocialUrlResult(original_url, normalized_url, "", "facebook", None, None, None, "resolution_failed")

    resolved = _canonicalize_known_url(original_url, resolved_url, "resolved")
    if resolved.platform == "facebook" and not resolved.canonical_key:
        return SocialUrlResult(
            resolved.original_url,
            resolved.resolved_url,
            resolved.canonical_url,
            resolved.platform,
            resolved.content_type,
            resolved.content_id,
            resolved.canonical_key,
            "resolved_without_content_id",
        )
    return resolved


def has_stable_duplicate_url(result: SocialUrlResult) -> bool:
    if not result.canonical_url:
        return False
    if result.platform == "facebook":
        return bool(result.content_id and result.canonical_key)
    return True
