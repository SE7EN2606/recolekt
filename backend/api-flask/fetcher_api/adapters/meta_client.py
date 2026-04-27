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


class MetaClient:


    def __init__(self):
        self.loader = instaloader.Instaloader(
            download_video_thumbnails=False,
            save_metadata=False,
            dirname_pattern="",
        )
        logger.info("ℹ️ MetaClient: instaloader ready (public mode, no login)")


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
            for pattern in [r"/reel/([^/]+)/", r"/reels/([^/]+)/", r"/p/([^/]+)/", r"/tv/([^/]+)/"]:
                m = re.search(pattern, url)
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
        match = re.search(r'instagram\.com/([a-zA-Z0-9._]+)(?:/reel|/p|/tv|/reels)?/', url)
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


    def _extract_business_address_from_html(self, html_text: str) -> Dict[str, str]:
        """
        Best-effort extraction for business address payloads when Instagram embeds them.
        This is optional and may often be empty.
        """
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
                logger.warning(f"⚠️ Instagram oEmbed {resp.status_code}: {resp.text[:200]}")
                return None
            data = resp.json()
            logger.info(f"✅ Instagram oEmbed success: author={data.get('author_name')}")
            return data
        except Exception as e:
            logger.error(f"❌ Instagram oEmbed error: {e}")
            return None


    # ----------------------------------------------------------------
    # Instagram — best-effort public profile metadata
    # ----------------------------------------------------------------
    def get_instagram_profile(self, username: str) -> Optional[dict]:
        """
        Best-effort public profile lookup.

        Tries:
          1. instaloader public profile lookup
          2. raw profile HTML parsing fallback

        Returns a dict shaped for instagram_bio_scraper.fetch_account(...):
            {
                "username": "...",
                "full_name": "...",
                "bio": "...",
                "address": "...",
                "city": "...",
                "region": "...",
                "country": "...",
                "postal_code": "...",
                "external_url": "...",
                "source": "instagram_profile_*",
            }
        """
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
    def _write_cookies(self, env_var: str, suffix: str) -> Optional[str]:
        content = os.environ.get(env_var, "").strip()
        if not content:
            return None
        try:
            tmp = tempfile.NamedTemporaryFile(
                mode="w", suffix=f"_{suffix}", delete=False, encoding="utf-8"
            )
            tmp.write(content)
            tmp.close()
            logger.info(f"🍪 Wrote {env_var} cookies → {tmp.name}")
            return tmp.name
        except Exception as e:
            logger.warning(f"⚠️ Could not write cookies file: {e}")
            return None


    # ----------------------------------------------------------------
    # Facebook — yt-dlp metadata
    # ----------------------------------------------------------------
    def _get_facebook_info(self, url: str) -> Optional[dict]:
        cookies_path = None
        try:
            ydl_opts = {
                "quiet": True,
                "no_warnings": False,
                "http_headers": {
                    "User-Agent": _FACEBOOK_USER_AGENT,
                },
            }

            cookies_path = self._write_cookies("FB_COOKIES_CONTENT", "fb_cookies.txt")
            if cookies_path:
                ydl_opts["cookiefile"] = cookies_path
            else:
                logger.debug("ℹ️ FB_COOKIES_CONTENT not set — proceeding without cookies")

            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=False)

            if not info:
                return None

            shortcode = info.get("id") or self.extract_shortcode(url) or "unknown"
            username = info.get("uploader") or info.get("channel") or "Facebook User"
            caption = info.get("description") or info.get("title") or ""

            video_url = info.get("url")
            if not video_url and info.get("formats"):
                formats = [f for f in info["formats"] if f.get("ext") == "mp4" and f.get("vcodec") != "none"]
                if formats:
                    video_url = formats[-1].get("url")

            logger.info(f"✅ Facebook yt-dlp metadata: author={username}, shortcode={shortcode}")
            return {
                "shortcode": shortcode,
                "caption": caption,
                "username": username,
                "video_url": video_url,
                "likes": info.get("like_count", 0),
                "comments": info.get("comment_count", 0),
                "timestamp": info.get("upload_date"),
            }

        except Exception as e:
            logger.error(f"❌ Facebook yt-dlp error: {e}", exc_info=True)
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

        logger.warning(f"❌ Unsupported URL: {url}")
        return None


    # ----------------------------------------------------------------
    # Instagram — yt-dlp download
    # Used when IG_USE_YTDLP_ONLY=true (Railway/prod)
    # ----------------------------------------------------------------
    def _download_instagram_video_ytdlp(self, url: str, output_path: str) -> dict:
        cookies_path = None
        try:
            os.makedirs(os.path.dirname(output_path), exist_ok=True)

            ydl_opts = {
                "outtmpl": output_path,
                "format": "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
                "merge_output_format": "mp4",
                "quiet": True,
                "no_warnings": True,
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

            logger.info(f"✅ Instagram video downloaded via yt-dlp: {actual_path}")

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
                        logger.info(f"✅ Instagram yt-dlp thumbnail saved → {thumb_out}")
                except Exception as e:
                    logger.warning(f"⚠️ Instagram thumbnail download failed: {e}")

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
            logger.error(f"❌ Instagram yt-dlp download error: {e}")
            return {"success": False, "error": str(e), "metadata": {}, "post": None, "thumbnail_path": None}
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

            resp = requests.get(post.video_url, stream=True, headers=headers, timeout=30)
            if resp.status_code != 200:
                raise ValueError(f"Video download failed: {resp.status_code}")

            with open(output_path, "wb") as f:
                for chunk in resp.iter_content(chunk_size=8192):
                    if chunk:
                        f.write(chunk)

            logger.info(f"✅ Instagram video saved via instaloader → {output_path}")

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
                        logger.info(f"✅ Instagram thumbnail saved → {thumb_out}")
                except Exception as e:
                    logger.warning(f"⚠️ Instagram thumbnail download failed: {e}")

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
            logger.error(f"❌ Instagram instaloader download error: {e}")
            return {"success": False, "error": str(e), "metadata": {}, "post": None, "thumbnail_path": None}


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
            use_ytdlp = os.environ.get("IG_USE_YTDLP_ONLY", "").lower() in ("true", "1", "yes")
            if use_ytdlp:
                logger.info(f"⬇️ Instagram download via yt-dlp [IG_USE_YTDLP_ONLY]: {url}")
                return self._download_instagram_video_ytdlp(url, output_path)
            else:
                logger.info(f"⬇️ Instagram download via instaloader [local]: {url}")
                return self._download_instagram_video_instaloader(url, output_path)

        elif self.is_facebook_url(url):
            cookies_path = None
            try:
                if not post_info:
                    post_info = self.get_post_info(url)
                if not post_info:
                    raise ValueError("No metadata available")

                os.makedirs(os.path.dirname(output_path), exist_ok=True)

                ydl_opts = {
                    "outtmpl": output_path,
                    "format": "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
                    "quiet": True,
                    "no_warnings": True,
                    "http_headers": {
                        "User-Agent": _FACEBOOK_USER_AGENT,
                    },
                }

                cookies_path = self._write_cookies("FB_COOKIES_CONTENT", "fb_cookies.txt")
                if cookies_path:
                    ydl_opts["cookiefile"] = cookies_path
                else:
                    logger.debug("ℹ️ FB_COOKIES_CONTENT not set — downloading without cookies")

                with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                    ydl.download([url])

                if os.path.exists(output_path):
                    logger.info(f"✅ Facebook video saved to {output_path}")
                    return {"success": True, "metadata": post_info, "thumbnail_path": None}
                raise ValueError("Download finished but file missing")

            except Exception as e:
                logger.error(f"❌ Facebook download error: {e}")
                return {"success": False, "error": str(e)}

            finally:
                if cookies_path and os.path.exists(cookies_path):
                    try:
                        os.unlink(cookies_path)
                    except Exception:
                        pass

        return {"success": False, "reason": "unsupported_platform"}


# Singleton
meta_client = MetaClient()