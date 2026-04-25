"""
Geocoding proxy — proxies Nominatim server-side to avoid browser CORS
blocks and client-side rate limiting.

Strategy:
  Tier 1 — Nominatim (OpenStreetMap): free, no key, good for well-known places
  Tier 2 — Google Places Find Place: branded venue fallback
  Tier 3 — Google Places Text Search: broader/branded venue fallback

Public callables:
    geocode_one(...) -> tuple[float, float] | None
    geocode_place_one(...) -> dict | None
    reverse_geocode_one(...) -> dict[str, str] | None

Important:
- geocode_one remains backward-compatible and still returns only (lat, lng)
- geocode_place_one returns richer metadata including optional:
    {
      "lat": ...,
      "lng": ...,
      "provider": "nominatim" | "google_findplace" | "google_textsearch",
      "google_place_id": "...",
      "maps_url": "...",
      "photo_url": "..."
    }

CRITICAL SAFETY:
- Never accept a degraded query like just "Italy" / "Paris" / "Thailand"
  as a successful match for a named venue.
- Placeholder names like "Unnamed Hotel" must not be geocoded unless there
  is a strong locator such as a real address or postal code.
"""
import logging
import os
import re
import time
import threading
from urllib.parse import quote_plus

import httpx
from flask import Blueprint, request, jsonify


geocode_bp = Blueprint("geocode", __name__)
logger = logging.getLogger(__name__)


_nominatim_lock = threading.Lock()
_last_nominatim_call: float = 0.0
_NOMINATIM_MIN_INTERVAL = 1.2
_MAX_RETRIES = 2

_geocode_cache: dict[str, dict | None] = {}
_reverse_cache: dict[str, dict[str, str] | None] = {}

# Continent/macro-region names the AI hallucinates as countries.
_FAKE_COUNTRIES = {
    "europe", "europa",
    "alps", "alpine", "dolomites", "mediterranean",
    "scandinavia", "middle east", "southeast asia", "asia", "africa",
    "north america", "south america", "latin america", "oceania",
    "caribbean", "balkans", "nordics", "benelux", "central europe",
    "eastern europe", "western europe", "northern europe", "southern europe",
}

_COUNTRY_CODE_MAP = {
    "france": "fr",
    "germany": "de",
    "austria": "at",
    "switzerland": "ch",
    "italy": "it",
    "spain": "es",
    "portugal": "pt",
    "netherlands": "nl",
    "belgium": "be",
    "united kingdom": "gb",
    "uk": "gb",
    "usa": "us",
    "united states": "us",
    "canada": "ca",
    "australia": "au",
    "sweden": "se",
    "norway": "no",
    "denmark": "dk",
    "finland": "fi",
    "poland": "pl",
    "czech republic": "cz",
    "hungary": "hu",
    "croatia": "hr",
    "slovenia": "si",
    "slovakia": "sk",
    "greece": "gr",
    "turkey": "tr",
    "japan": "jp",
    "thailand": "th",
    "indonesia": "id",
    "mexico": "mx",
    "brazil": "br",
    "argentina": "ar",
    "new zealand": "nz",
    "south africa": "za",
    "morocco": "ma",
    "maldives": "mv",
}

_ADDRESS_HINTS = (
    "street", "st", "st.", "road", "rd", "rd.", "avenue", "ave", "ave.",
    "boulevard", "blvd", "blvd.", "lane", "ln", "ln.", "drive", "dr", "dr.",
    "rue", "via", "platz", "plaza", "piazza", "straße", "strasse", "route",
)

_MARKETING_HINTS = (
    " seit ",
    " since ",
    " urban",
    " hideaway",
    " retreat",
    " escape",
    " lifestyle",
    " luxury",
    " unkompliziert",
    " großzügig",
    " grosszügig",
)

_GENERIC_VENUE_SUFFIXES = (
    " family resort",
    " family hotel",
    " resort & spa",
    " hotel & spa",
    " all-inclusive family hotel",
    " all inclusive family hotel",
    " aparthotel",
    " resort",
    " hotel",
    " lodge",
    " chalet",
    " spa",
)

_PLACEHOLDER_NAME_PATTERNS = (
    r"^unnamed\b",
    r"^unknown\b",
    r"^not specified\b",
    r"^n/?a\b",
    r"^tbd\b",
)

_GOOGLE_MAX_QUERIES = 6


def _sanitize_country(country: str | None) -> str:
    c = (country or "").strip().lower()
    if c in _FAKE_COUNTRIES:
        return ""
    return (country or "").strip()


def _cache_key(q: str, countrycodes: str) -> str:
    return f"{q.lower().strip()}|{countrycodes.lower().strip()}"


def _cache_key_from_fields(fields: dict[str, str], countrycodes: str) -> str:
    serialized = "|".join(
        f"{key}={fields.get(key, '').strip().lower()}"
        for key in ("name", "address", "neighborhood", "city", "region", "postal_code", "country")
    )
    return f"{serialized}|cc={countrycodes.lower().strip()}"


def _reverse_cache_key(lat: float, lng: float) -> str:
    return f"{float(lat):.6f},{float(lng):.6f}"


def _google_api_key() -> str:
    return (
        os.getenv("GOOGLE_PLACES_API_KEY")
        or os.getenv("GOOGLE_MAPS_API_KEY")
        or ""
    ).strip()


def _google_maps_url_for_place(place_id: str | None, query: str | None = None) -> str | None:
    if place_id:
        return f"https://www.google.com/maps/place/?q=place_id:{place_id}"
    if query:
        return f"https://www.google.com/maps/search/?api=1&query={quote_plus(query)}"
    return None


def _google_photo_url(photo_reference: str | None) -> str | None:
    api_key = _google_api_key()
    if not api_key or not photo_reference:
        return None
    return (
        "https://maps.googleapis.com/maps/api/place/photo"
        f"?maxwidth=800&photo_reference={quote_plus(photo_reference)}&key={quote_plus(api_key)}"
    )


def _nominatim_query(
    q: str,
    countrycodes: str,
    headers: dict,
) -> dict | None:
    global _last_nominatim_call

    params: dict = {"q": q, "format": "json", "limit": 1}
    if countrycodes:
        params["countrycodes"] = countrycodes

    for attempt in range(1, _MAX_RETRIES + 1):
        elapsed = time.time() - _last_nominatim_call
        if elapsed < _NOMINATIM_MIN_INTERVAL:
            time.sleep(_NOMINATIM_MIN_INTERVAL - elapsed)

        try:
            _last_nominatim_call = time.time()
            resp = httpx.get(
                "https://nominatim.openstreetmap.org/search",
                params=params,
                headers=headers,
                timeout=10,
            )

            if resp.status_code == 429:
                retry_after = int(resp.headers.get("Retry-After", "2"))
                logger.warning(
                    "geocode proxy: 429 for %r — waiting %ds (attempt %d/%d)",
                    q, retry_after, attempt, _MAX_RETRIES,
                )
                time.sleep(retry_after + 1)
                _last_nominatim_call = time.time()
                continue

            resp.raise_for_status()
            data = resp.json()

            if data:
                item = data[0]
                return {
                    "lat": float(item["lat"]),
                    "lng": float(item["lon"]),
                    "provider": "nominatim",
                    "display_name": item.get("display_name"),
                    "google_place_id": None,
                    "maps_url": None,
                    "photo_url": None,
                }
            return None

        except httpx.HTTPStatusError as exc:
            logger.warning("geocode proxy HTTP error for %r: %s", q, exc)
            return None
        except Exception as exc:
            logger.warning("geocode proxy error for %r: %s", q, exc)
            return None

    logger.warning("geocode proxy: all retries exhausted for %r", q)
    return None


def _build_google_result_from_candidate(candidate: dict, *, provider: str, query: str) -> dict | None:
    try:
        geometry = candidate.get("geometry") or {}
        location = geometry.get("location") or {}
        lat = location.get("lat")
        lng = location.get("lng")
        if lat is None or lng is None:
            return None

        place_id = candidate.get("place_id")
        photo_ref = None

        photos = candidate.get("photos") or []
        if photos and isinstance(photos, list):
            photo_ref = photos[0].get("photo_reference")

        return {
            "lat": float(lat),
            "lng": float(lng),
            "provider": provider,
            "display_name": candidate.get("formatted_address") or candidate.get("name") or query,
            "google_place_id": place_id,
            "maps_url": _google_maps_url_for_place(place_id, query),
            "photo_url": _google_photo_url(photo_ref),
        }
    except Exception:
        return None


def _google_places_findplace_query(query: str) -> dict | None:
    api_key = _google_api_key()
    if not api_key or not query:
        return None

    try:
        resp = httpx.get(
            "https://maps.googleapis.com/maps/api/place/findplacefromtext/json",
            params={
                "input": query,
                "inputtype": "textquery",
                "fields": "geometry,formatted_address,name,place_id,photos",
                "key": api_key,
            },
            timeout=8,
        )
        resp.raise_for_status()
        data = resp.json()

        candidates = data.get("candidates") or []
        if not candidates:
            return None

        result = _build_google_result_from_candidate(
            candidates[0],
            provider="google_findplace",
            query=query,
        )
        if result:
            logger.info(
                "Google Find Place: ✅ '%s' → %.4f, %.4f",
                query, result["lat"], result["lng"],
            )
        return result

    except Exception as exc:
        logger.warning("Google Find Place error for '%s': %s", query, exc)
        return None


def _google_places_text_search_query(query: str) -> dict | None:
    api_key = _google_api_key()
    if not api_key or not query:
        return None

    try:
        resp = httpx.get(
            "https://maps.googleapis.com/maps/api/place/textsearch/json",
            params={
                "query": query,
                "key": api_key,
            },
            timeout=8,
        )
        resp.raise_for_status()
        data = resp.json()

        results = data.get("results") or []
        if not results:
            return None

        result = _build_google_result_from_candidate(
            results[0],
            provider="google_textsearch",
            query=query,
        )
        if result:
            logger.info(
                "Google Text Search: ✅ '%s' → %.4f, %.4f",
                query, result["lat"], result["lng"],
            )
        return result

    except Exception as exc:
        logger.warning("Google Text Search error for '%s': %s", query, exc)
        return None


def _strip_leading_markers(value: str) -> str:
    i = 0
    while i < len(value) and not value[i].isalnum():
        i += 1
    return value[i:]


def _normalize_spaces_and_punct(value: str) -> str:
    value = value.replace("\u200b", " ").replace("\xa0", " ")
    value = re.sub(r"\s+", " ", value)
    value = re.sub(r"(?:\s*\.\s*){2,}", ". ", value)
    return value.strip(" ,.-|•·")


def _looks_like_symbol_only(value: str) -> bool:
    return not any(ch.isalnum() for ch in value)


def _looks_address_like(value: str) -> bool:
    lower = f" {value.lower()} "
    return (
        any(ch.isdigit() for ch in value)
        or "," in value
        or any(f" {hint} " in lower for hint in _ADDRESS_HINTS)
    )


def _looks_like_marketing_text(value: str) -> bool:
    lower = f" {value.lower()} "

    if any(hint in lower for hint in _MARKETING_HINTS):
        return True

    if (" - " in value or " – " in value) and not _looks_address_like(value):
        parts = [p.strip() for p in re.split(r"\s+[–-]\s+", value) if p.strip()]
        if len(parts) >= 2 and not any(ch.isdigit() for ch in value):
            return True

    if len(value.split()) >= 5 and not any(ch.isdigit() for ch in value) and "," not in value:
        return True

    return False


def _clean_query_part(value: str | None, *, field: str) -> str:
    if value is None:
        return ""

    cleaned = str(value).strip()
    if not cleaned:
        return ""

    cleaned = _strip_leading_markers(cleaned)
    cleaned = _normalize_spaces_and_punct(cleaned)

    if not cleaned or _looks_like_symbol_only(cleaned):
        return ""

    lower = cleaned.lower()

    if field in {"city", "region", "country", "neighborhood"} and lower in _FAKE_COUNTRIES:
        return ""

    if field == "country":
        cleaned = _sanitize_country(cleaned)
        if not cleaned:
            return ""

    if field == "postal_code":
        cleaned = cleaned.replace(" ", "")
        if not re.fullmatch(r"[A-Za-z0-9\-]{3,10}", cleaned):
            return ""
        if re.fullmatch(r"(1[5-9]\d{2}|20\d{2})", cleaned):
            return ""
        return cleaned

    if field == "address":
        if _looks_like_marketing_text(cleaned) and not _looks_address_like(cleaned):
            return ""
        return cleaned

    if field in {"city", "region", "neighborhood"}:
        if _looks_like_marketing_text(cleaned):
            return ""
        return cleaned

    return cleaned


def _prepare_fields(
    *,
    name: str | None,
    address: str | None,
    neighborhood: str | None,
    city: str | None,
    region: str | None,
    country: str | None,
    postal_code: str | None,
) -> dict[str, str]:
    country = _sanitize_country(country)

    return {
        "name": _clean_query_part(name, field="name"),
        "address": _clean_query_part(address, field="address"),
        "neighborhood": _clean_query_part(neighborhood, field="neighborhood"),
        "city": _clean_query_part(city, field="city"),
        "region": _clean_query_part(region, field="region"),
        "country": _clean_query_part(country, field="country"),
        "postal_code": _clean_query_part(postal_code, field="postal_code"),
    }


def _dedupe_join(parts: list[str]) -> str:
    out: list[str] = []
    seen: set[str] = set()

    for part in parts:
        p = (part or "").strip()
        if not p:
            continue
        key = p.casefold()
        if key in seen:
            continue
        seen.add(key)
        out.append(p)

    return ", ".join(out)


def _strip_generic_venue_suffix(name: str) -> str:
    cleaned = (name or "").strip()
    lowered = cleaned.casefold()

    for suffix in _GENERIC_VENUE_SUFFIXES:
        if lowered.endswith(suffix):
            stripped = cleaned[: len(cleaned) - len(suffix)].strip(" ,-/")
            if stripped and len(stripped) >= 3:
                return stripped

    return cleaned


def _looks_placeholder_place_name(name: str) -> bool:
    value = (name or "").strip().lower()
    if not value:
        return True

    for pattern in _PLACEHOLDER_NAME_PATTERNS:
        if re.search(pattern, value):
            return True

    return False


def _has_strong_non_name_locator(fields: dict[str, str]) -> bool:
    return any(
        fields.get(k)
        for k in ("address", "postal_code", "neighborhood")
    )


def _build_place_query_candidates(fields: dict[str, str]) -> list[str]:
    """
    Strict candidates for venue/place matching.

    Important:
    - If a place NAME exists, every candidate must keep the name.
    - Never degrade to country-only / city-only / country-centroid lookups.
    """
    n = fields["name"]
    a = fields["address"]
    nb = fields["neighborhood"]
    c = fields["city"]
    r = fields["region"]
    p = fields["postal_code"]
    co = fields["country"]

    stripped_name = _strip_generic_venue_suffix(n) if n else ""

    if n:
        candidates = [
            _dedupe_join([n, a, c, r, p, co]),
            _dedupe_join([n, a, c, co]),
            _dedupe_join([n, nb, c, r, co]),
            _dedupe_join([n, c, r, co]),
            _dedupe_join([n, c, co]),
            _dedupe_join([n, a, p, co]),
            _dedupe_join([n, r, co]),
            _dedupe_join([n, co]),
            _dedupe_join([n]),
            _dedupe_join([stripped_name, c, co]),
            _dedupe_join([stripped_name, co]),
            _dedupe_join([stripped_name]),
        ]
    else:
        candidates = [
            _dedupe_join([a, nb, c, r, p, co]),
            _dedupe_join([a, c, r, p, co]),
            _dedupe_join([a, c, co]),
            _dedupe_join([a, co]),
            _dedupe_join([a]),
        ]

    out: list[str] = []
    seen: set[str] = set()

    for query in candidates:
        if not query:
            continue
        key = query.casefold()
        if key in seen:
            continue
        seen.add(key)
        out.append(query)

    return out


def _build_google_query_candidates(fields: dict[str, str]) -> list[str]:
    """
    Strict Google candidates.
    Same rule: never degrade to country-only / city-only.
    """
    n = fields["name"]
    a = fields["address"]
    c = fields["city"]
    r = fields["region"]
    co = fields["country"]

    stripped_name = _strip_generic_venue_suffix(n) if n else ""

    if n:
        candidates = [
            _dedupe_join([n, c, r, co]),
            _dedupe_join([n, c, co]),
            _dedupe_join([n, r, co]),
            _dedupe_join([n, co]),
            _dedupe_join([n]),
            _dedupe_join([stripped_name, c, co]),
            _dedupe_join([stripped_name, co]),
            _dedupe_join([stripped_name]),
        ]
    else:
        candidates = [
            _dedupe_join([a, c, r, co]),
            _dedupe_join([a, c, co]),
            _dedupe_join([a, co]),
            _dedupe_join([a]),
        ]

    out: list[str] = []
    seen: set[str] = set()

    for query in candidates:
        if not query:
            continue
        key = query.casefold()
        if key in seen:
            continue
        seen.add(key)
        out.append(query)

    return out[:_GOOGLE_MAX_QUERIES]


def geocode_place_one(
    name: str = "",
    city: str = "",
    country: str = "",
    *,
    address: str = "",
    neighborhood: str = "",
    region: str = "",
    postal_code: str = "",
) -> dict | None:
    """
    Rich geocode result with optional Google metadata.
    """
    fields = _prepare_fields(
        name=name,
        address=address,
        neighborhood=neighborhood,
        city=city,
        region=region,
        country=country,
        postal_code=postal_code,
    )

    if not any(fields.values()):
        return None

    # Hard stop for placeholder names unless we have a real locator.
    # Prevents fake "success" like:
    #   "Unnamed Hotel, Italy" -> Italy centroid
    if fields["name"] and _looks_placeholder_place_name(fields["name"]):
        if not _has_strong_non_name_locator(fields):
            logger.warning(
                "geocode_place_one: placeholder place name rejected: %r",
                fields["name"],
            )
            return None

    queries = _build_place_query_candidates(fields)
    if not queries:
        return None

    countrycodes = _COUNTRY_CODE_MAP.get(fields["country"].lower().strip(), "") if fields["country"] else ""
    key = _cache_key_from_fields(fields, countrycodes)

    if key in _geocode_cache:
        return _geocode_cache[key]

    headers = {
        "User-Agent": "Recolekt/1.0 (contact@recolekt.com)",
        "Accept-Language": "en",
    }

    result: dict | None = None

    with _nominatim_lock:
        for idx, query in enumerate(queries, start=1):
            logger.info(
                "geocode_place_one: Nominatim attempt %d/%d — %s",
                idx, len(queries), query,
            )
            result = _nominatim_query(query, countrycodes, headers)
            if result:
                break

    if result is None:
        google_queries = _build_google_query_candidates(fields)

        for idx, query in enumerate(google_queries, start=1):
            logger.info(
                "geocode_place_one: Google Find Place attempt %d/%d — %s",
                idx, len(google_queries), query,
            )
            result = _google_places_findplace_query(query)
            if result:
                break

        if result is None:
            for idx, query in enumerate(google_queries, start=1):
                logger.info(
                    "geocode_place_one: Google Text Search attempt %d/%d — %s",
                    idx, len(google_queries), query,
                )
                result = _google_places_text_search_query(query)
                if result:
                    break

    _geocode_cache[key] = result

    if result:
        logger.info(
            "geocode_place_one: ✅ '%s' via %s → %.4f, %.4f",
            queries[0],
            result.get("provider"),
            result["lat"],
            result["lng"],
        )
    else:
        logger.warning("geocode_place_one: ❌ all tiers failed for '%s'", queries[0])

    return result


def geocode_one(
    name: str = "",
    city: str = "",
    country: str = "",
    *,
    address: str = "",
    neighborhood: str = "",
    region: str = "",
    postal_code: str = "",
) -> tuple[float, float] | None:
    """
    Backward-compatible geocoder.

    Returns:
      (lat, lng) or None
    """
    result = geocode_place_one(
        name=name,
        city=city,
        country=country,
        address=address,
        neighborhood=neighborhood,
        region=region,
        postal_code=postal_code,
    )
    if not result:
        return None
    return (result["lat"], result["lng"])


def reverse_geocode_one(lat: float, lng: float) -> dict[str, str] | None:
    """
    Reverse geocode coords into locality fields.
    """
    global _last_nominatim_call

    try:
        lat_f = float(lat)
        lng_f = float(lng)
    except (TypeError, ValueError):
        return None

    key = _reverse_cache_key(lat_f, lng_f)
    if key in _reverse_cache:
        return _reverse_cache[key]

    headers = {
        "User-Agent": "Recolekt/1.0 (contact@recolekt.com)",
        "Accept-Language": "en",
    }

    params = {
        "lat": lat_f,
        "lon": lng_f,
        "format": "jsonv2",
        "addressdetails": 1,
        "zoom": 18,
    }

    try:
        with _nominatim_lock:
            elapsed = time.time() - _last_nominatim_call
            if elapsed < _NOMINATIM_MIN_INTERVAL:
                time.sleep(_NOMINATIM_MIN_INTERVAL - elapsed)

            _last_nominatim_call = time.time()

            resp = httpx.get(
                "https://nominatim.openstreetmap.org/reverse",
                params=params,
                headers=headers,
                timeout=10,
            )

            if resp.status_code == 429:
                retry_after = int(resp.headers.get("Retry-After", "2"))
                logger.warning(
                    "reverse_geocode_one: 429 for %.6f, %.6f — waiting %ds",
                    lat_f, lng_f, retry_after,
                )
                time.sleep(retry_after + 1)
                _last_nominatim_call = time.time()

                resp = httpx.get(
                    "https://nominatim.openstreetmap.org/reverse",
                    params=params,
                    headers=headers,
                    timeout=10,
                )

            resp.raise_for_status()
            data = resp.json()

        address = data.get("address") or {}

        result = {
            "neighborhood": (
                address.get("neighbourhood")
                or address.get("suburb")
                or address.get("quarter")
                or address.get("hamlet")
            ),
            "city": (
                address.get("city")
                or address.get("town")
                or address.get("village")
                or address.get("municipality")
            ),
            "region": (
                address.get("state")
                or address.get("region")
                or address.get("state_district")
                or address.get("county")
            ),
            "country": address.get("country"),
            "postal_code": address.get("postcode"),
        }

        result = {k: v for k, v in result.items() if v}
        _reverse_cache[key] = result or None

        if result:
            logger.info(
                "reverse_geocode_one: ✅ %.6f, %.6f -> city=%r region=%r country=%r",
                lat_f,
                lng_f,
                result.get("city"),
                result.get("region"),
                result.get("country"),
            )
        else:
            logger.info(
                "reverse_geocode_one: no locality fields for %.6f, %.6f",
                lat_f,
                lng_f,
            )

        return result or None

    except Exception as exc:
        logger.warning(
            "reverse_geocode_one error for %.6f, %.6f: %s",
            lat_f,
            lng_f,
            exc,
        )
        _reverse_cache[key] = None
        return None


@geocode_bp.route("/geocode", methods=["GET"])
def geocode_proxy():
    q = request.args.get("q", "").strip()
    countrycodes = request.args.get("countrycodes", "").strip()

    if not q:
        return jsonify({"error": "q is required"}), 400

    first_part = q.split(",", 1)[0].strip()
    if _looks_placeholder_place_name(first_part):
        logger.warning("geocode proxy: placeholder query rejected: %r", q)
        return jsonify({"lat": None, "lng": None}), 200

    weak_query = q.strip().lower()
    if weak_query in _FAKE_COUNTRIES:
        logger.warning("geocode proxy: weak macro/country-only query rejected: %r", q)
        return jsonify({"lat": None, "lng": None}), 200

    key = _cache_key(q, countrycodes)
    if key in _geocode_cache:
        cached = _geocode_cache[key]
        logger.debug("geocode proxy: cache hit for %r", q)
        if cached:
            return jsonify(cached)
        return jsonify({"lat": None, "lng": None})

    headers = {
        "User-Agent": "Recolekt/1.0 (contact@recolekt.com)",
        "Accept-Language": "en",
    }

    result: dict | None = None

    with _nominatim_lock:
        result = _nominatim_query(q, countrycodes, headers)

    if result is None:
        result = _google_places_findplace_query(q)

    if result is None:
        result = _google_places_text_search_query(q)

    if result:
        _geocode_cache[key] = result
        logger.info(
            "geocode proxy: ✅ %r via %s → %.4f, %.4f",
            q, result.get("provider"), result["lat"], result["lng"],
        )
        return jsonify(result)

    logger.warning("geocode proxy: ❌ all attempts failed for %r", q)
    _geocode_cache[key] = None
    return jsonify({"lat": None, "lng": None}), 200