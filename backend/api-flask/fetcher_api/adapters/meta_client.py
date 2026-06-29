"""
Meta client — handles both Instagram and Facebook public posts.

Instagram:
  - Metadata via public unauthenticated oEmbed (no token)
  - Best-effort public profile lookup via instaloader, with HTML fallback
  - Video download: yt-dlp when IG_USE_YTDLP_ONLY=true (Railway/prod)
                    instaloader otherwise (local dev, works without cookies)
  - Set IG_COOKIES_CONTENT (Netscape format) env var for yt-dlp reliability

Facebook:
  - Metadata + video download via yt-dlp
  - Set FB_COOKIES_CONTENT (Netscape format) env var for reliability
    with share links and login-gated content
"""

import json
import os
import re
import logging
import tempfile
import threading
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Dict, Optional

import instaloader
import requests
import yt_dlp

logger = logging.getLogger("meta_client")

INSTAGRAM_OEMBED_URL = "https://www.instagram.com/api/v1/oembed/"

_FACEBOOK_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)
_GRAPH_VERSION = os.getenv("META_GRAPH_VERSION", "v25.0")
_GRAPH_BASE_URL = f"https://graph.facebook.com/{_GRAPH_VERSION}"
_FACEBOOK_DOWNLOAD_LOCK = threading.Lock()
_INSTAGRAM_DOWNLOAD_LOCK = threading.Lock()
MAX_EXTERNAL_ATTEMPTS = 3
_SOCIAL_REQUIRED_COOKIES = {
    "FB_COOKIES_CONTENT": {"c_user", "xs"},
    "IG_COOKIES_CONTENT": {"sessionid"},
}

# Matches /reel/, /reels/, /p/, /tv/ with optional trailing slash and optional query string
_IG_SHORTCODE_RE = re.compile(
    r"/(?:reel|reels|p|tv)/([A-Za-z0-9_-]+)/?(?:\?|$)",
    re.IGNORECASE,
)
_INSTAGRAM_BLOCKED_MESSAGE = "Save accepted. Extraction failed because Instagram blocked server access. Retry possible."


class MetaClient:

    def __init__(self):
        self.loader = instaloader.Instaloader(
            download_video_thumbnails=False,
            save_metadata=False,
            dirname_pattern="",
        )
        logger.info("ℹ️ MetaClient: instaloader ready (public mode, no login)")
        self._log_extraction_provider_config()
        self._log_cookie_health("FB_COOKIES_CONTENT")
        self._log_cookie_health("IG_COOKIES_CONTENT")

    def _log_extraction_provider_config(self):
        provider = (os.getenv("VIDEO_EXTRACTION_PROVIDER") or "yt-dlp").strip().lower()
        api_url_configured = bool((os.getenv("VIDEO_EXTRACTION_API_URL") or "").strip())
        api_key_configured = bool((os.getenv("VIDEO_EXTRACTION_API_KEY") or "").strip())

        if provider in {"", "yt-dlp", "ytdlp"}:
            logger.info("🎞️ Video extraction provider: yt-dlp fallback")
            return

        logger.warning(
            "🎞️ Video extraction provider configured but not implemented provider=%s api_url=%s api_key=%s; using yt-dlp fallback",
            provider,
            api_url_configured,
            api_key_configured,
        )

    @contextmanager
    def _social_download_slot(self, platform: str):
        platform_key = (platform or "").strip().lower()
        lock = _FACEBOOK_DOWNLOAD_LOCK if platform_key == "facebook" else _INSTAGRAM_DOWNLOAD_LOCK
        logger.info("🚦 Waiting for %s social download slot", platform_key)
        with lock:
            logger.info("🚦 Acquired %s social download slot", platform_key)
            try:
                yield
            finally:
                logger.info("🚦 Released %s social download slot", platform_key)

    def _classified_failure(self, error: Exception | str, default: str = "extraction_failed") -> str:
        text = str(error or "").lower()
        if not text:
            return default

        login_markers = (
            "login required",
            "sign in",
            "sign-in",
            "cookies",
            "cookie",
            "checkpoint",
            "not logged in",
            "private",
            "authentication",
            "unauthorized",
        )
        rate_markers = (
            "rate limit",
            "ratelimit",
            "too many requests",
            "http error 429",
            "429",
            "temporarily blocked",
        )
        provider_markers = (
            "provider unavailable",
            "api unavailable",
            "upstream unavailable",
        )
        unavailable_markers = (
            "not available",
            "unavailable",
            "removed",
            "does not exist",
            "copyright",
            "private video",
        )

        if any(marker in text for marker in rate_markers):
            return "social_rate_limited"
        if "expired" in text and ("cookie" in text or "session" in text):
            return "social_cookies_expired"
        if any(marker in text for marker in login_markers):
            return "social_login_required"
        if any(marker in text for marker in provider_markers):
            return "extraction_provider_unavailable"
        if default.startswith("facebook") and any(marker in text for marker in unavailable_markers):
            return "facebook_media_unavailable"
        return default

    def _normalize_instagram_failure(self, extractor: str, error: Exception | str, default: str) -> dict:
        raw_error = str(error or "").strip()
        text = raw_error.lower()
        error_code = self._classified_failure(error, default=default)
        user_message = raw_error or "Instagram extraction failed."

        if "empty media response" in text:
            error_code = "instagram_empty_media_response"
            user_message = _INSTAGRAM_BLOCKED_MESSAGE
        elif (
            "403" in text or
            "forbidden" in text or
            "graphql/query" in text or
            "nonetype" in text
        ):
            error_code = "instagram_server_access_blocked"
            user_message = _INSTAGRAM_BLOCKED_MESSAGE

        return {
            "success": False,
            "error": user_message,
            "error_code": error_code,
            "raw_error": raw_error,
            "extractor": extractor,
            "metadata": {},
            "post": None,
            "thumbnail_path": None,
        }

    def _should_try_instagram_fallback(self, extractor: str, failure: dict) -> bool:
        error_code = str(failure.get("error_code") or "").strip().lower()
        if extractor == "yt-dlp":
            return error_code == "instagram_empty_media_response"
        if extractor == "instaloader":
            return error_code == "instagram_server_access_blocked"
        return False

    def _facebook_url_candidates(self, url: str) -> list[str]:
        content_id = self.extract_shortcode(url)
        candidates = [url]

        if content_id and str(content_id).isdigit():
            candidates.extend([
                f"https://www.facebook.com/reel/{content_id}",
                f"https://www.facebook.com/watch/?v={content_id}",
            ])

        return list(dict.fromkeys(candidate for candidate in candidates if candidate))

    # ----------------------------------------------------------------
    # URL detection
    # ----------------------------------------------------------------
    def is_instagram_url(self, url: str) -> bool:
        return "instagram.com" in url.lower()

    def is_facebook_url(self, url: str) -> bool:
        url_lower = url.lower()
        return any(d in url_lower for d in ("facebook.com", "fb.watch", "fb.com"))

    def is_supported_url(self, url: str) -> bool:
        return self.is_instagram_url(url) or self.is_facebook_url(url)

    # ----------------------------------------------------------------
    # Shortcode / ID extraction
    # ----------------------------------------------------------------
    def extract_shortcode(self, url: str) -> Optional[str]:
        if self.is_instagram_url(url):
            m = _IG_SHORTCODE_RE.search(url)
            if m:
                return m.group(1)

        elif self.is_facebook_url(url):
            m = re.search(r'/(?:reel|reels|video|v|posts|videos|watch)/(?:[A-Za-z0-9_-]+/)?([0-9]+)', url)
            if m:
                return m.group(1)
            m = re.search(r'v=([0-9]+)', url)
            if m:
                return m.group(1)
            m = re.search(r'/share/[a-z]/([A-Za-z0-9_-]+)', url)
            if m:
                return m.group(1)

        return None

    def _extract_username_from_url(self, url: str) -> Optional[str]:
        match = re.search(r'instagram\.com/([a-zA-Z0-9._]+)(?:/reel|/p|/tv|/reels)?/?', url)
        if match:
            candidate = match.group(1)
            if candidate not in ('reel', 'reels', 'p', 'tv', 'stories', 'explore'):
                return candidate
        return None

    def _normalize_instagram_username(self, username: str) -> Optional[str]:
        if not username:
            return None
        match = re.search(r'@?([A-Za-z0-9._]{2,})', str(username).strip())
        if not match:
            return None
        return match.group(1).lstrip("@").strip().lower()

    def _instagram_profile_url(self, username: str) -> str:
        return f"https://www.instagram.com/{username}/"

    def _browser_headers(self) -> Dict[str, str]:
        return {
            "User-Agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            ),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Referer": "https://www.instagram.com/",
        }

    def _first_non_empty(self, *values: Any) -> Optional[str]:
        for value in values:
            if value is None:
                continue
            text = str(value).strip()
            if text:
                return text
        return None

    def _decode_json_string(self, raw_value: str) -> str:
        if raw_value is None:
            return ""
        try:
            return json.loads(f'"{raw_value}"')
        except Exception:
            return raw_value

    def _extract_json_string_field(self, html_text: str, field_name: str) -> str:
        if not html_text:
            return ""
        pattern = rf'"{re.escape(field_name)}":"((?:\\.|[^"\\])*)"'
        match = re.search(pattern, html_text)
        if not match:
            return ""
        return self._decode_json_string(match.group(1))

    def _extract_bool_field(self, html_text: str, field_name: str) -> Optional[bool]:
        if not html_text:
            return None
        match = re.search(rf'"{re.escape(field_name)}":(true|false)', html_text)
        if not match:
            return None
        return match.group(1) == "true"

    # ----------------------------------------------------------------
    # Meta Graph API helpers
    # ----------------------------------------------------------------
    def _graph_token(self) -> Optional[str]:
        return self._first_non_empty(
            os.getenv("META_PAGE_ACCESS_TOKEN"),
            os.getenv("FACEBOOK_PAGE_ACCESS_TOKEN"),
            os.getenv("INSTAGRAM_PAGE_ACCESS_TOKEN"),
            os.getenv("META_ACCESS_TOKEN"),
        )

    def _instagram_business_id(self) -> Optional[str]:
        return self._first_non_empty(
            os.getenv("INSTAGRAM_BUSINESS_ACCOUNT_ID"),
            os.getenv("META_INSTAGRAM_BUSINESS_ACCOUNT_ID"),
        )

    def _graph_get(self, path: str, token: str, params: Optional[Dict[str, Any]] = None) -> Optional[dict]:
        if not token:
            return None

        raw_path = str(path or "").strip()
        clean_path = raw_path.lstrip("/")
        is_full_url = raw_path.startswith("http://") or raw_path.startswith("https://")
        url = raw_path if is_full_url else f"{_GRAPH_BASE_URL}/{clean_path}"
        log_path = clean_path.split("?", 1)[0] if not is_full_url else raw_path.split("?", 1)[0]
        request_params = dict(params or {})
        if "access_token=" not in raw_path:
            request_params["access_token"] = token

        try:
            resp = requests.get(
                url,
                params=request_params,
                timeout=12,
            )
            data = resp.json()
        except Exception as e:
            logger.warning("⚠️ Meta Graph request failed path=%s error=%s", log_path, e)
            return None

        if not isinstance(data, dict):
            logger.warning("⚠️ Meta Graph returned non-object response path=%s status=%s", log_path, resp.status_code)
            return None

        if resp.status_code >= 400 or data.get("error"):
            error = data.get("error") if isinstance(data.get("error"), dict) else {}
            logger.info(
                "ℹ️ Meta Graph inaccessible path=%s status=%s code=%s type=%s",
                log_path,
                resp.status_code,
                error.get("code"),
                error.get("type"),
            )
            return None

        return data

    def _get_instagram_graph_info(self, url: str) -> Optional[dict]:
        token = self._graph_token()
        ig_id = self._instagram_business_id()
        shortcode = self.extract_shortcode(url)

        if not token or not ig_id or not shortcode:
            logger.info(
                "ℹ️ Instagram Graph lookup skipped: token=%s ig_id=%s shortcode=%s",
                bool(token),
                bool(ig_id),
                bool(shortcode),
            )
            return None

        fields = "id,caption,media_type,media_url,permalink,thumbnail_url,timestamp,username,shortcode"
        limit = str(os.getenv("META_GRAPH_MEDIA_SEARCH_LIMIT", "100"))
        path = f"{ig_id}/media"
        params: Dict[str, Any] = {"fields": fields, "limit": limit}

        for page_index in range(3):
            payload = self._graph_get(path, token, params)
            if not payload:
                logger.info("ℹ️ Instagram Graph lookup fallback: media list unavailable")
                return None

            for item in payload.get("data") or []:
                if not isinstance(item, dict):
                    continue
                item_shortcode = str(item.get("shortcode") or "").strip()
                permalink = str(item.get("permalink") or "").strip()
                if item_shortcode == shortcode or f"/{shortcode}/" in permalink:
                    logger.info("✅ Instagram Graph matched media: shortcode=%s page=%s", shortcode, page_index + 1)
                    return {
                        "shortcode": shortcode,
                        "caption": item.get("caption") or "",
                        "username": item.get("username") or "",
                        "video_url": item.get("media_url") or "",
                        "thumbnail_url": item.get("thumbnail_url") or item.get("media_url") or "",
                        "media_id": item.get("id") or "",
                        "timestamp": item.get("timestamp"),
                        "source": "instagram_graph",
                    }

            paging = payload.get("paging") if isinstance(payload.get("paging"), dict) else {}
            next_url = paging.get("next")
            if not next_url:
                break
            path = next_url
            params = {}

        logger.info("ℹ️ Instagram Graph lookup fallback: shortcode not found in authorized media shortcode=%s", shortcode)
        return None

    def _get_facebook_graph_info(self, url: str) -> Optional[dict]:
        token = self._graph_token()
        content_id = self.extract_shortcode(url)

        if not token or not content_id or not str(content_id).isdigit():
            logger.info(
                "ℹ️ Facebook Graph lookup skipped: token=%s numeric_id=%s",
                bool(token),
                bool(content_id and str(content_id).isdigit()),
            )
            return None

        fields = "id,description,created_time,source,permalink_url,picture,from,length"
        payload = self._graph_get(str(content_id), token, {"fields": fields})
        if not payload:
            logger.info("ℹ️ Facebook Graph lookup fallback: media inaccessible id=%s", content_id)
            return None

        video_url = payload.get("source") or ""
        from_obj = payload.get("from") if isinstance(payload.get("from"), dict) else {}
        logger.info(
            "✅ Facebook Graph matched media: id=%s has_source=%s",
            content_id,
            bool(video_url),
        )
        return {
            "shortcode": payload.get("id") or content_id,
            "caption": payload.get("description") or "",
            "username": from_obj.get("name") or "Facebook Page",
            "video_url": video_url,
            "thumbnail_url": payload.get("picture") or "",
            "permalink": payload.get("permalink_url") or "",
            "timestamp": payload.get("created_time"),
            "source": "facebook_graph",
        }

    def _download_direct_video_url(self, video_url: str, output_path: str, referer: str) -> bool:
        if not video_url:
            return False
        try:
            os.makedirs(os.path.dirname(output_path), exist_ok=True)
            with requests.get(
                video_url,
                stream=True,
                timeout=(5, 15),
                headers={
                    "User-Agent": _FACEBOOK_USER_AGENT,
                    "Referer": referer,
                },
            ) as resp:
                if resp.status_code != 200:
                    logger.info("ℹ️ Graph media URL download failed status=%s", resp.status_code)
                    return False
                with open(output_path, "wb") as f:
                    for chunk in resp.iter_content(chunk_size=1024 * 256):
                        if chunk:
                            f.write(chunk)

            ok = os.path.exists(output_path) and os.path.getsize(output_path) > 1000
            logger.info("✅ Graph media URL download %s path=%s", "succeeded" if ok else "failed", output_path)
            if not ok and os.path.exists(output_path):
                try:
                    os.unlink(output_path)
                except Exception:
                    pass
            return ok
        except Exception as e:
            if os.path.exists(output_path):
                try:
                    os.unlink(output_path)
                except Exception:
                    pass
            logger.warning("⚠️ Graph media URL download error: %s", e)
            return False

    def _extract_business_address_from_html(self, html_text: str) -> Dict[str, str]:
        if not html_text:
            return {}
        raw = self._extract_json_string_field(html_text, "business_address_json")
        if not raw:
            return {}
        try:
            data = json.loads(raw)
        except Exception:
            return {}
        if not isinstance(data, dict):
            return {}
        address = self._first_non_empty(
            data.get("street_address"),
            data.get("address_street"),
            data.get("street1"),
            data.get("line1"),
        )
        city = self._first_non_empty(
            data.get("city_name"),
            data.get("city"),
            data.get("locality"),
        )
        region = self._first_non_empty(
            data.get("region_name"),
            data.get("state"),
            data.get("province"),
            data.get("region"),
        )
        country = self._first_non_empty(
            data.get("country_name"),
            data.get("country"),
            data.get("country_code"),
        )
        postal_code = self._first_non_empty(
            data.get("zip_code"),
            data.get("postal_code"),
        )
        return {
            "address": address or "",
            "city": city or "",
            "region": region or "",
            "country": country or "",
            "postal_code": postal_code or "",
        }

    def _scrape_instagram_profile_html(self, username: str) -> Optional[dict]:
        url = self._instagram_profile_url(username)
        try:
            resp = requests.get(
                url,
                headers=self._browser_headers(),
                timeout=15,
                allow_redirects=True,
            )
        except Exception as e:
            logger.warning("⚠️ Instagram profile HTML request failed for @%s: %s", username, e)
            return None

        if resp.status_code != 200:
            logger.warning("⚠️ Instagram profile HTML %s for @%s", resp.status_code, username)
            return None

        html_text = resp.text or ""
        if not html_text:
            return None

        full_name = self._extract_json_string_field(html_text, "full_name")
        bio = self._extract_json_string_field(html_text, "biography")
        external_url = self._extract_json_string_field(html_text, "external_url")
        is_private = self._extract_bool_field(html_text, "is_private")
        business_address = self._extract_business_address_from_html(html_text)

        data = {
            "username": username,
            "full_name": full_name,
            "bio": bio,
            "biography": bio,
            "external_url": external_url,
            "is_private": is_private,
            "source": "instagram_profile_html",
            "address": business_address.get("address", ""),
            "city": business_address.get("city", ""),
            "region": business_address.get("region", ""),
            "country": business_address.get("country", ""),
            "postal_code": business_address.get("postal_code", ""),
        }

        has_any_useful_data = any(
            data.get(key)
            for key in ("full_name", "bio", "address", "city", "region", "country", "postal_code")
        )
        return data if has_any_useful_data else None

    # ----------------------------------------------------------------
    # Instagram — oEmbed (public, no token)
    # ----------------------------------------------------------------
    def _get_instagram_oembed(self, url: str) -> Optional[dict]:
        try:
            resp = requests.get(INSTAGRAM_OEMBED_URL, params={"url": url}, timeout=10)
            if resp.status_code != 200:
                logger.warning("⚠️ Instagram oEmbed %s: %s", resp.status_code, resp.text[:200])
                return None
            data = resp.json()
            logger.info("✅ Instagram oEmbed success: author=%s", data.get("author_name"))
            return data
        except Exception as e:
            logger.error("❌ Instagram oEmbed error: %s", e)
            return None

    # ----------------------------------------------------------------
    # Instagram — best-effort public profile metadata
    # ----------------------------------------------------------------
    def get_instagram_profile(self, username: str) -> Optional[dict]:
        username = self._normalize_instagram_username(username)
        if not username:
            return None

        profile_data: Dict[str, Any] = {
            "username": username,
            "full_name": "",
            "bio": "",
            "biography": "",
            "address": "",
            "city": "",
            "region": "",
            "country": "",
            "postal_code": "",
            "external_url": "",
            "source": "instagram_profile_lookup",
        }

        try:
            profile = instaloader.Profile.from_username(self.loader.context, username)
            profile_data.update({
                "username": getattr(profile, "username", username) or username,
                "full_name": getattr(profile, "full_name", "") or "",
                "bio": getattr(profile, "biography", "") or "",
                "biography": getattr(profile, "biography", "") or "",
                "external_url": getattr(profile, "external_url", "") or "",
                "source": "instagram_profile_instaloader",
            })
            logger.info("✅ Instagram profile fetched via instaloader: @%s", username)
        except Exception as e:
            logger.warning("⚠️ Instagram profile lookup via instaloader failed for @%s: %s", username, e)

        needs_html_fallback = not any(
            profile_data.get(key)
            for key in ("full_name", "bio", "address", "city", "region", "country", "postal_code")
        )

        if needs_html_fallback or not profile_data.get("bio"):
            html_data = self._scrape_instagram_profile_html(username)
            if html_data:
                for key, value in html_data.items():
                    if value and not profile_data.get(key):
                        profile_data[key] = value
                if profile_data.get("source") == "instagram_profile_lookup":
                    profile_data["source"] = html_data.get("source") or "instagram_profile_html"
                logger.info("✅ Instagram profile enriched from HTML fallback: @%s", username)

        has_any_useful_data = any(
            profile_data.get(key)
            for key in ("full_name", "bio", "address", "city", "region", "country", "postal_code")
        )
        return profile_data if has_any_useful_data else None

    # ----------------------------------------------------------------
    # Cookies helper (for yt-dlp)
    # ----------------------------------------------------------------
    def _looks_like_netscape_cookies(self, content: str) -> bool:
        if not content:
            return False
        if content.lstrip().startswith("# Netscape HTTP Cookie File"):
            return True

        for line in content.splitlines():
            stripped = line.strip()
            if not stripped or stripped.startswith("#"):
                continue
            if len(stripped.split("\t")) >= 7:
                return True
        return False

    def _coerce_cookie_bool(self, value: Any, default: bool = False) -> bool:
        if value is None:
            return default
        if isinstance(value, bool):
            return value
        if isinstance(value, (int, float)):
            return bool(value)
        return str(value).strip().lower() in {"true", "1", "yes", "y", "on"}

    def _cookie_expiry(self, cookie: Dict[str, Any]) -> int:
        value = (
            cookie.get("expirationDate")
            or cookie.get("expiration_date")
            or cookie.get("expires")
            or cookie.get("expiry")
            or cookie.get("expiration")
            or 0
        )
        try:
            return max(0, int(float(value)))
        except Exception:
            return 0

    def _cookies_json_to_netscape(self, content: str, env_var: str) -> Optional[str]:
        try:
            parsed = json.loads(content)
        except Exception as e:
            logger.warning("⚠️ %s cookies source detected as invalid JSON: %s", env_var, e)
            return None

        cookies = parsed
        if isinstance(parsed, dict):
            cookies = parsed.get("cookies") or parsed.get("Cookie") or parsed.get("data")

        if not isinstance(cookies, list):
            logger.warning("⚠️ %s cookies JSON is unusable: expected cookie array", env_var)
            return None

        lines = [
            "# Netscape HTTP Cookie File",
            "# Generated by Recolekt from JSON cookie export. Do not log cookie values.",
        ]
        converted = 0

        for cookie in cookies:
            if not isinstance(cookie, dict):
                continue

            name = str(cookie.get("name") or "").strip()
            value = cookie.get("value")
            domain = str(cookie.get("domain") or cookie.get("host") or "").strip()

            if not name or value is None or not domain:
                continue

            if domain.startswith("http://") or domain.startswith("https://"):
                domain = re.sub(r"^https?://", "", domain).split("/")[0]

            domain = domain.strip()
            if not domain:
                continue

            include_subdomains = "TRUE" if domain.startswith(".") or not self._coerce_cookie_bool(cookie.get("hostOnly"), False) else "FALSE"
            path = str(cookie.get("path") or "/").strip() or "/"
            secure = "TRUE" if self._coerce_cookie_bool(cookie.get("secure"), False) else "FALSE"
            expires = self._cookie_expiry(cookie)
            cookie_name = name

            if self._coerce_cookie_bool(cookie.get("httpOnly"), False) and not domain.startswith("#HttpOnly_"):
                domain = f"#HttpOnly_{domain}"

            lines.append(
                "\t".join([
                    domain,
                    include_subdomains,
                    path,
                    secure,
                    str(expires),
                    cookie_name,
                    str(value),
                ])
            )
            converted += 1

        if converted == 0:
            logger.warning("⚠️ %s cookies JSON contained no usable cookies", env_var)
            return None

        logger.info("🍪 %s cookies source detected as json; converted %d cookies to Netscape format", env_var, converted)
        return "\n".join(lines) + "\n"

    def _normalize_cookie_content(self, content: str, env_var: str) -> Optional[str]:
        content = (content or "").strip()
        if not content:
            return None

        if "\\n" in content and "\n" not in content and not content.lstrip().startswith(("{", "[")):
            content = content.replace("\\n", "\n")

        if self._looks_like_netscape_cookies(content):
            logger.info("🍪 %s cookies source detected as netscape", env_var)
            return content if content.endswith("\n") else content + "\n"

        if content.lstrip().startswith(("{", "[")):
            return self._cookies_json_to_netscape(content, env_var)

        logger.warning("⚠️ %s cookies source detected as invalid; skipping cookies", env_var)
        return None

    def _parse_netscape_cookie_health(self, content: str) -> tuple[set[str], Optional[int], int]:
        names = set()
        expiries = []
        count = 0

        for line in (content or "").splitlines():
            stripped = line.strip()
            if not stripped or stripped.startswith("# Netscape HTTP Cookie File"):
                continue

            if stripped.startswith("#HttpOnly_"):
                stripped = stripped[len("#HttpOnly_"):]
            elif stripped.startswith("#"):
                continue

            parts = stripped.split("\t")
            if len(parts) < 7:
                continue

            count += 1
            names.add(parts[5])
            try:
                expiry = int(float(parts[4]))
                if expiry > 0:
                    expiries.append(expiry)
            except Exception:
                pass

        return names, min(expiries) if expiries else None, count

    def _log_cookie_health(self, env_var: str):
        raw_content = os.environ.get(env_var, "").strip()
        if not raw_content:
            logger.warning("🍪 %s not configured; social fallback may require login", env_var)
            return

        normalized = self._normalize_cookie_content(raw_content, env_var)
        if not normalized:
            logger.critical("🍪 %s unusable; social fallback may fail with login_required", env_var)
            return

        names, earliest_expiry, count = self._parse_netscape_cookie_health(normalized)
        required = _SOCIAL_REQUIRED_COOKIES.get(env_var, set())
        missing = sorted(required - names)
        if missing:
            logger.warning("🍪 %s missing expected cookie names: %s", env_var, ",".join(missing))

        if earliest_expiry:
            seconds_remaining = earliest_expiry - int(datetime.now(timezone.utc).timestamp())
            days_remaining = seconds_remaining // 86400
            if days_remaining < 14:
                logger.critical("🍪 %s earliest cookie expiry in %sd; refresh before production traffic", env_var, days_remaining)
            elif days_remaining < 30:
                logger.warning("🍪 %s earliest cookie expiry in %sd; schedule refresh", env_var, days_remaining)
            else:
                logger.info("🍪 %s health ok: %d cookies, earliest expiry in %sd", env_var, count, days_remaining)
        else:
            logger.warning("🍪 %s has %d cookies but no expiry timestamps; monitor manually", env_var, count)

    def cookie_health_report(self, env_var: str) -> dict:
        raw_content = os.environ.get(env_var, "").strip()
        report = {
            "configured": bool(raw_content),
            "valid_format": False,
            "required_present": False,
            "missing_required": sorted(_SOCIAL_REQUIRED_COOKIES.get(env_var, set())),
            "expiry": "unknown",
            "cookie_count": 0,
        }
        if not raw_content:
            return report

        normalized = self._normalize_cookie_content(raw_content, env_var)
        if not normalized:
            return report

        names, earliest_expiry, count = self._parse_netscape_cookie_health(normalized)
        required = _SOCIAL_REQUIRED_COOKIES.get(env_var, set())
        missing = sorted(required - names)
        report.update({
            "valid_format": True,
            "required_present": not missing,
            "missing_required": missing,
            "cookie_count": count,
        })
        if earliest_expiry:
            seconds_remaining = earliest_expiry - int(datetime.now(timezone.utc).timestamp())
            report["expiry"] = "expired" if seconds_remaining <= 0 else "valid"
        return report

    def _write_cookies(self, env_var: str, suffix: str) -> Optional[str]:
        content = os.environ.get(env_var, "").strip()
        if not content:
            return None
        normalized = self._normalize_cookie_content(content, env_var)
        if not normalized:
            logger.warning("⚠️ %s cookies not written because content is unusable", env_var)
            return None
        try:
            tmp = tempfile.NamedTemporaryFile(
                mode="w", suffix=f"_{suffix}", delete=False, encoding="utf-8"
            )
            tmp.write(normalized)
            tmp.close()
            logger.info("🍪 Wrote %s cookies → %s", env_var, tmp.name)
            return tmp.name
        except Exception as e:
            logger.warning("⚠️ Could not write cookies file: %s", e)
            return None

    # ----------------------------------------------------------------
    # Facebook — yt-dlp metadata
    # ----------------------------------------------------------------
    def _get_facebook_info(self, url: str) -> Optional[dict]:
        cookies_path = None
        last_error = None
        try:
            ydl_opts = {
                "quiet": True,
                "no_warnings": False,
                "retries": 0,
                "fragment_retries": 0,
                "extractor_retries": 0,
                "socket_timeout": 10,
                "http_headers": {
                    "User-Agent": _FACEBOOK_USER_AGENT,
                },
            }

            cookies_path = self._write_cookies("FB_COOKIES_CONTENT", "fb_cookies.txt")
            if cookies_path:
                ydl_opts["cookiefile"] = cookies_path
            else:
                logger.debug("ℹ️ FB_COOKIES_CONTENT not set — proceeding without cookies")

            for attempt_index, candidate_url in enumerate(self._facebook_url_candidates(url), start=1):
                if attempt_index > MAX_EXTERNAL_ATTEMPTS:
                    logger.warning("⚠️ Facebook metadata enrichment stopped after %d attempts", MAX_EXTERNAL_ATTEMPTS)
                    break
                try:
                    logger.info("ℹ️ Facebook yt-dlp metadata attempt url=%s", candidate_url)
                    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                        info = ydl.extract_info(candidate_url, download=False)
                except Exception as exc:
                    last_error = exc
                    logger.info(
                        "ℹ️ Facebook yt-dlp metadata attempt failed code=%s url=%s",
                        self._classified_failure(exc, default="facebook_extraction_failed"),
                        candidate_url,
                    )
                    continue

                if not info:
                    continue

                shortcode = info.get("id") or self.extract_shortcode(candidate_url) or "unknown"
                username = info.get("uploader") or info.get("channel") or "Facebook User"
                caption = info.get("description") or info.get("title") or ""

                video_url = info.get("url")
                if not video_url and info.get("formats"):
                    formats = [f for f in info["formats"] if f.get("ext") == "mp4" and f.get("vcodec") != "none"]
                    if formats:
                        video_url = formats[-1].get("url")

                logger.info("✅ Facebook yt-dlp metadata: author=%s, shortcode=%s url=%s", username, shortcode, candidate_url)
                return {
                    "shortcode": shortcode,
                    "caption": caption,
                    "username": username,
                    "video_url": video_url,
                    "likes": info.get("like_count", 0),
                    "comments": info.get("comment_count", 0),
                    "timestamp": info.get("upload_date"),
                }

            if last_error:
                logger.info(
                    "ℹ️ Facebook yt-dlp metadata exhausted code=%s",
                    self._classified_failure(last_error, default="facebook_extraction_failed"),
                )
            return None

        except Exception as e:
            logger.error(
                "❌ Facebook yt-dlp metadata error code=%s error=%s",
                self._classified_failure(e, default="facebook_extraction_failed"),
                e,
            )
            return None

        finally:
            if cookies_path and os.path.exists(cookies_path):
                try:
                    os.unlink(cookies_path)
                except Exception:
                    pass

    # ----------------------------------------------------------------
    # get_post_info — unified interface
    # ----------------------------------------------------------------
    def get_post_info(self, url: str) -> Optional[dict]:
        shortcode = self.extract_shortcode(url)

        if self.is_instagram_url(url):
            graph_info = self._get_instagram_graph_info(url)
            if graph_info:
                return {
                    "shortcode": graph_info.get("shortcode") or shortcode,
                    "caption": graph_info.get("caption", ""),
                    "is_video": True,
                    "video_url": graph_info.get("video_url"),
                    "username": graph_info.get("username", ""),
                    "full_name": "",
                    "thumbnail_url": graph_info.get("thumbnail_url", ""),
                    "media_id": graph_info.get("media_id", ""),
                    "author_url": "",
                    "likes": 0,
                    "comments": 0,
                    "timestamp": graph_info.get("timestamp"),
                    "source": "instagram_graph",
                }
            logger.info("ℹ️ Instagram Graph lookup unavailable; falling back to oEmbed")

            oembed = self._get_instagram_oembed(url)
            if not oembed:
                return None
            return {
                "shortcode": shortcode,
                "caption": oembed.get("title", ""),
                "is_video": True,
                "video_url": None,
                "username": oembed.get("author_name", ""),
                "full_name": "",
                "thumbnail_url": oembed.get("thumbnail_url", ""),
                "media_id": oembed.get("media_id", ""),
                "author_url": oembed.get("author_url", ""),
                "likes": 0,
                "comments": 0,
                "timestamp": None,
                "source": "instagram_oembed",
            }

        elif self.is_facebook_url(url):
            graph_info = self._get_facebook_graph_info(url)
            if graph_info:
                return {
                    "shortcode": graph_info.get("shortcode") or shortcode,
                    "caption": graph_info.get("caption", ""),
                    "is_video": True,
                    "video_url": graph_info.get("video_url"),
                    "username": graph_info.get("username", ""),
                    "full_name": "",
                    "thumbnail_url": graph_info.get("thumbnail_url", ""),
                    "media_id": graph_info.get("shortcode", ""),
                    "author_url": graph_info.get("permalink", ""),
                    "likes": 0,
                    "comments": 0,
                    "timestamp": graph_info.get("timestamp"),
                    "source": "facebook_graph",
                }
            logger.info("ℹ️ Facebook Graph lookup unavailable; falling back to yt-dlp metadata")

            info = self._get_facebook_info(url)
            if not info:
                return None
            return {
                "shortcode": info["shortcode"],
                "caption": info["caption"],
                "is_video": True,
                "video_url": info.get("video_url"),
                "username": info["username"],
                "full_name": "",
                "thumbnail_url": "",
                "media_id": "",
                "author_url": "",
                "likes": info.get("likes", 0),
                "comments": info.get("comments", 0),
                "timestamp": info.get("timestamp"),
                "source": "facebook_ytdlp",
            }

        logger.warning("❌ Unsupported URL: %s", url)
        return None

    # ----------------------------------------------------------------
    # Instagram — yt-dlp download
    # Used when IG_USE_YTDLP_ONLY=true (Railway/prod)
    # ----------------------------------------------------------------
    def _download_instagram_video_ytdlp(self, url: str, output_path: str) -> dict:
        cookies_path = None
        try:
            os.makedirs(os.path.dirname(output_path), exist_ok=True)

            graph_info = self._get_instagram_graph_info(url)
            if graph_info and graph_info.get("video_url"):
                if self._download_direct_video_url(graph_info["video_url"], output_path, "https://www.instagram.com/"):
                    logger.info("✅ Instagram video downloaded via Meta Graph")
                    return {
                        "success": True,
                        "video_path": output_path,
                        "thumbnail_path": None,
                        "metadata": {
                            "username": graph_info.get("username", ""),
                            "caption": graph_info.get("caption", ""),
                            "likes": 0,
                            "comments": 0,
                            "thumbnail_url": graph_info.get("thumbnail_url", ""),
                            "source": "instagram_graph",
                        },
                        "post": None,
                    }
                logger.info("ℹ️ Instagram Graph media download failed; falling back to yt-dlp")
            elif graph_info:
                logger.info("ℹ️ Instagram Graph matched media without direct URL; falling back to yt-dlp")
            else:
                logger.info("ℹ️ Instagram Graph unavailable for this media; falling back to yt-dlp")

            ydl_opts = {
                "outtmpl": output_path,
                "format": "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
                "merge_output_format": "mp4",
                "quiet": True,
                "no_warnings": True,
                "retries": 0,
                "fragment_retries": 0,
                "extractor_retries": 0,
                "socket_timeout": 10,
                "http_headers": {
                    "User-Agent": (
                        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) "
                        "AppleWebKit/605.1.15 (KHTML, like Gecko) "
                        "Version/17.0 Mobile/15E148 Safari/604.1"
                    ),
                    "Referer": "https://www.instagram.com/",
                },
            }

            cookies_path = self._write_cookies("IG_COOKIES_CONTENT", "ig_cookies.txt")
            if cookies_path:
                ydl_opts["cookiefile"] = cookies_path

            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=True)

            actual_path = output_path
            if not os.path.exists(actual_path):
                for ext in ["mp4", "webm", "mkv"]:
                    candidate = f"{output_path}.{ext}"
                    if os.path.exists(candidate):
                        actual_path = candidate
                        break

            if not os.path.exists(actual_path):
                raise ValueError(f"yt-dlp finished but file missing at {output_path}")

            logger.info("✅ Instagram video downloaded via yt-dlp: %s", actual_path)

            thumbnail_path = None
            thumb_url = (
                info.get("thumbnail") or
                ((info.get("thumbnails") or [{}])[-1].get("url", ""))
            )
            if thumb_url:
                thumb_out = os.path.join(os.path.dirname(output_path), "thumbnail.jpg")
                try:
                    r = requests.get(thumb_url, timeout=15)
                    if r.status_code == 200 and len(r.content) > 1000:
                        with open(thumb_out, "wb") as f:
                            f.write(r.content)
                        thumbnail_path = thumb_out
                        logger.info("✅ Instagram yt-dlp thumbnail saved → %s", thumb_out)
                except Exception as e:
                    logger.warning("⚠️ Instagram thumbnail download failed: %s", e)

            meta = {
                "username": info.get("uploader") or info.get("channel") or "",
                "caption": info.get("description") or info.get("title") or "",
                "likes": info.get("like_count", 0) or 0,
                "comments": info.get("comment_count", 0) or 0,
                "thumbnail_url": thumb_url or "",
            }

            if not meta["username"] or not meta["caption"]:
                oembed = self._get_instagram_oembed(url)
                if oembed:
                    meta["username"] = meta["username"] or oembed.get("author_name", "")
                    meta["caption"] = meta["caption"] or oembed.get("title", "")
                    logger.info("✅ Instagram metadata enriched from oEmbed")

            return {
                "success": True,
                "video_path": actual_path,
                "thumbnail_path": thumbnail_path,
                "metadata": meta,
                "post": None,
            }

        except Exception as e:
            failure = self._normalize_instagram_failure("yt-dlp", e, "instagram_extraction_failed")
            logger.error(
                "❌ Instagram yt-dlp download error code=%s raw_error=%s",
                failure["error_code"],
                failure.get("raw_error"),
            )
            return failure
        finally:
            if cookies_path and os.path.exists(cookies_path):
                try:
                    os.unlink(cookies_path)
                except Exception:
                    pass

    # ----------------------------------------------------------------
    # Instagram — instaloader download (local dev only)
    # ----------------------------------------------------------------
    def _download_instagram_video_instaloader(self, url: str, output_path: str) -> dict:
        try:
            os.makedirs(os.path.dirname(output_path), exist_ok=True)

            shortcode = self.extract_shortcode(url)
            if not shortcode:
                raise ValueError(f"Could not extract shortcode from URL: {url}")

            logger.info("📎 Extracted Instagram shortcode: %s", shortcode)

            post = instaloader.Post.from_shortcode(self.loader.context, shortcode)

            username = None
            if hasattr(post, "owner_username") and post.owner_username:
                username = post.owner_username
            if not username and hasattr(post, "owner_profile"):
                try:
                    username = post.owner_profile.username
                except Exception:
                    pass
            if not username:
                username = self._extract_username_from_url(url) or ""

            if not post.is_video or not post.video_url:
                raise ValueError("Post is not a video or has no video URL.")

            headers = {
                "User-Agent": (
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/124.0.0.0 Safari/537.36"
                ),
                "Accept": "*/*",
                "Referer": "https://www.instagram.com/",
            }

            resp = requests.get(post.video_url, stream=True, headers=headers, timeout=15)
            if resp.status_code != 200:
                raise ValueError(f"Video download failed: {resp.status_code}")

            with open(output_path, "wb") as f:
                for chunk in resp.iter_content(chunk_size=8192):
                    if chunk:
                        f.write(chunk)

            logger.info("✅ Instagram video saved via instaloader → %s", output_path)

            thumbnail_path = None
            thumb_url = getattr(post, "url", None)
            if thumb_url:
                thumb_out = os.path.join(os.path.dirname(output_path), f"{shortcode}_thumb.jpg")
                try:
                    r = requests.get(thumb_url, headers=headers, timeout=15)
                    if r.status_code == 200 and len(r.content) > 1000:
                        with open(thumb_out, "wb") as f:
                            f.write(r.content)
                        thumbnail_path = thumb_out
                        logger.info("✅ Instagram thumbnail saved → %s", thumb_out)
                except Exception as e:
                    logger.warning("⚠️ Instagram thumbnail download failed: %s", e)

            meta = {
                "username": username,
                "caption": post.caption or "",
                "likes": getattr(post, "likes", 0) or 0,
                "comments": getattr(post, "comments", 0) or 0,
                "thumbnail_url": thumb_url or "",
            }

            return {
                "success": True,
                "video_path": output_path,
                "thumbnail_path": thumbnail_path,
                "metadata": meta,
                "post": post,
            }

        except Exception as e:
            failure = self._normalize_instagram_failure("instaloader", e, "instagram_extraction_failed")
            logger.error(
                "❌ Instagram instaloader download error code=%s raw_error=%s",
                failure["error_code"],
                failure.get("raw_error"),
            )
            return failure

    # ----------------------------------------------------------------
    # download_video — routes by platform
    #
    #   IG_USE_YTDLP_ONLY=true  → yt-dlp (Railway / prod / staging)
    #   not set                 → instaloader (local dev)
    #
    # Facebook always uses yt-dlp.
    # ----------------------------------------------------------------
    def download_video(self, url: str, output_path: str, post_info=None) -> dict:
        if self.is_instagram_url(url):
            with self._social_download_slot("instagram"):
                use_ytdlp = os.environ.get("IG_USE_YTDLP_ONLY", "").lower() in ("true", "1", "yes")
                extractor_order = ["yt-dlp", "instaloader"] if use_ytdlp else ["instaloader", "yt-dlp"]
                last_failure = None

                for index, extractor in enumerate(extractor_order):
                    if extractor == "yt-dlp":
                        logger.info("⬇️ Instagram download via yt-dlp%s: %s", " [IG_USE_YTDLP_ONLY]" if use_ytdlp else " [fallback]", url)
                        attempt = self._download_instagram_video_ytdlp(url, output_path)
                    else:
                        logger.info(
                            "⬇️ Instagram download via instaloader [public/no-login mode%s]: %s",
                            ", IG cookies are yt-dlp only" if os.getenv("IG_COOKIES_CONTENT") else "",
                            url,
                        )
                        attempt = self._download_instagram_video_instaloader(url, output_path)

                    if attempt.get("success"):
                        return attempt

                    last_failure = attempt
                    logger.warning(
                        "⚠️ Instagram extractor failed extractor=%s code=%s raw_error=%s",
                        extractor,
                        attempt.get("error_code"),
                        attempt.get("raw_error") or attempt.get("error"),
                    )

                    if index >= len(extractor_order) - 1:
                        break

                    if not self._should_try_instagram_fallback(extractor, attempt):
                        break

                    logger.info(
                        "↪️ Instagram fallback switching extractor from %s to %s after code=%s",
                        extractor,
                        extractor_order[index + 1],
                        attempt.get("error_code"),
                    )

                return last_failure or self._normalize_instagram_failure(
                    "instagram",
                    "Instagram extraction failed.",
                    "instagram_extraction_failed",
                )

        elif self.is_facebook_url(url):
            with self._social_download_slot("facebook"):
                cookies_path = None
                last_error = None
                attempt_count = 0
                try:
                    graph_info = self._get_facebook_graph_info(url)
                    if graph_info and graph_info.get("video_url"):
                        attempt_count += 1
                        if self._download_direct_video_url(graph_info["video_url"], output_path, "https://www.facebook.com/"):
                            logger.info("✅ Facebook video downloaded via Meta Graph")
                            return {
                                "success": True,
                                "video_path": output_path,
                                "metadata": graph_info,
                                "thumbnail_path": None,
                            }
                        logger.info("ℹ️ Facebook Graph media download failed; falling back to yt-dlp")
                    elif graph_info:
                        logger.info("ℹ️ Facebook Graph matched media without source URL; falling back to yt-dlp")
                    else:
                        logger.info("ℹ️ Facebook Graph unavailable for this media; falling back to yt-dlp")

                    if not post_info:
                        try:
                            post_info = self.get_post_info(url)
                        except Exception as exc:
                            post_info = None
                            logger.warning("⚠️ Facebook metadata enrichment failed; continuing download: %s", exc)
                    if not post_info:
                        logger.info("ℹ️ Facebook metadata unavailable; attempting yt-dlp download candidates directly")

                    os.makedirs(os.path.dirname(output_path), exist_ok=True)

                    ydl_opts = {
                        "outtmpl": output_path,
                        "format": "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
                        "quiet": True,
                        "no_warnings": True,
                        "retries": 0,
                        "fragment_retries": 0,
                        "extractor_retries": 0,
                        "socket_timeout": 10,
                        "http_headers": {
                            "User-Agent": _FACEBOOK_USER_AGENT,
                        },
                    }

                    cookies_path = self._write_cookies("FB_COOKIES_CONTENT", "fb_cookies.txt")
                    if cookies_path:
                        ydl_opts["cookiefile"] = cookies_path
                    else:
                        logger.debug("ℹ️ FB_COOKIES_CONTENT not set — downloading without cookies")

                    for candidate_url in self._facebook_url_candidates(url):
                        if attempt_count >= MAX_EXTERNAL_ATTEMPTS:
                            logger.warning("⚠️ Facebook download stopped after %d attempts", MAX_EXTERNAL_ATTEMPTS)
                            break
                        attempt_count += 1
                        try:
                            logger.info(
                                "⬇️ Facebook yt-dlp download attempt %d/%d url=%s",
                                attempt_count,
                                MAX_EXTERNAL_ATTEMPTS,
                                candidate_url,
                            )
                            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                                info = ydl.extract_info(candidate_url, download=True)

                            actual_path = output_path
                            if not os.path.exists(actual_path):
                                for ext in ("mp4", "webm", "mkv", "mov"):
                                    candidate_path = f"{output_path}.{ext}"
                                    if os.path.exists(candidate_path):
                                        actual_path = candidate_path
                                        break

                            if not os.path.exists(actual_path):
                                raise ValueError("Download finished but file missing")

                            metadata = post_info or {
                                "shortcode": (info or {}).get("id") or self.extract_shortcode(candidate_url) or "unknown",
                                "caption": (info or {}).get("description") or (info or {}).get("title") or "",
                                "username": (info or {}).get("uploader") or (info or {}).get("channel") or "Facebook User",
                                "likes": (info or {}).get("like_count", 0) or 0,
                                "comments": (info or {}).get("comment_count", 0) or 0,
                            }
                            logger.info("✅ Facebook video saved to %s via %s", actual_path, candidate_url)
                            return {
                                "success": True,
                                "video_path": actual_path,
                                "metadata": metadata,
                                "thumbnail_path": None,
                            }
                        except Exception as exc:
                            last_error = exc
                            logger.info(
                                "ℹ️ Facebook yt-dlp download attempt failed code=%s url=%s",
                                self._classified_failure(exc, default="facebook_extraction_failed"),
                                candidate_url,
                            )

                    if last_error:
                        raise last_error
                    raise ValueError("Facebook download failed")

                except Exception as e:
                    classified = self._classified_failure(e, default="facebook_extraction_failed")
                    error_code = (
                        "facebook_download_failed_after_3_attempts"
                        if attempt_count >= MAX_EXTERNAL_ATTEMPTS
                        else classified
                    )
                    error_message = (
                        "Facebook video download failed after 3 attempts."
                        if error_code == "facebook_download_failed_after_3_attempts"
                        else str(e)
                    )
                    logger.error(
                        "❌ Facebook download error code=%s attempts=%s error=%s",
                        error_code,
                        attempt_count,
                        e,
                    )
                    return {
                        "success": False,
                        "error": error_message,
                        "error_code": error_code,
                        "attempts": attempt_count,
                    }

                finally:
                    if cookies_path and os.path.exists(cookies_path):
                        try:
                            os.unlink(cookies_path)
                        except Exception:
                            pass

        return {"success": False, "reason": "unsupported_platform", "error_code": "extraction_failed"}


# Singleton
meta_client = MetaClient()
