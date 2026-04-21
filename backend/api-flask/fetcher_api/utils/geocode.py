# fetcher_api/utils/geocode.py
"""
Geocoding proxy — proxies Nominatim server-side to avoid browser CORS
blocks and client-side rate limiting.

Two-tier strategy:
  Tier 1 — Nominatim (OpenStreetMap): free, no key, good for well-known places
  Tier 2 — Google Places Text Search: paid (~$0.017/call), fires only when
            Nominatim returns None. Handles branded/boutique venues not in OSM.

The threading.Lock ensures strictly sequential Nominatim requests.
Simple in-memory cache prevents repeated hits for the same place.

geocode_one(name, city, country) — direct callable for server-side use (reel.py)
/geocode HTTP route — proxy for any remaining client-side needs
"""
import logging
import os
import time
import threading
import httpx
from flask import Blueprint, request, jsonify


geocode_bp = Blueprint("geocode", __name__)
logger = logging.getLogger(__name__)


_nominatim_lock             = threading.Lock()
_last_nominatim_call: float = 0.0
_NOMINATIM_MIN_INTERVAL     = 1.2
_MAX_RETRIES                = 2


_geocode_cache: dict[str, dict | None] = {}


# Continent/macro-region names the AI hallucinates as countries.
# These are useless for Nominatim and must be stripped before querying.
_FAKE_COUNTRIES = {
    "europe", "europa", "alps", "alpine", "dolomites", "mediterranean",
    "scandinavia", "middle east", "southeast asia", "asia", "africa",
    "north america", "south america", "latin america", "oceania",
    "caribbean", "balkans", "nordics", "benelux", "central europe",
    "eastern europe", "western europe", "northern europe", "southern europe",
}

_COUNTRY_CODE_MAP = {
    "france": "fr", "germany": "de", "austria": "at", "switzerland": "ch",
    "italy": "it", "spain": "es", "portugal": "pt", "netherlands": "nl",
    "belgium": "be", "united kingdom": "gb", "uk": "gb", "usa": "us",
    "united states": "us", "canada": "ca", "australia": "au",
    "sweden": "se", "norway": "no", "denmark": "dk", "finland": "fi",
    "poland": "pl", "czech republic": "cz", "hungary": "hu",
    "croatia": "hr", "slovenia": "si", "slovakia": "sk",
    "greece": "gr", "turkey": "tr", "japan": "jp", "thailand": "th",
    "indonesia": "id", "mexico": "mx", "brazil": "br", "argentina": "ar",
    "new zealand": "nz", "south africa": "za", "morocco": "ma",
}


def _sanitize_country(country: str) -> str:
    """Strip continent names and macro-regions the AI hallucinates as countries."""
    c = (country or "").strip().lower()
    if c in _FAKE_COUNTRIES:
        return ""
    return country.strip()


def _cache_key(q: str, countrycodes: str) -> str:
    return f"{q.lower().strip()}|{countrycodes.lower().strip()}"


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
                return {
                    "lat": float(data[0]["lat"]),
                    "lng": float(data[0]["lon"]),
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


def _google_places_query(name: str, city: str, country: str) -> dict | None:
    """
    Google Places Text Search — fires only when Nominatim returns None.
    Costs ~$0.017 per call. Only called for boutique/branded venues not in OSM.
    """
    api_key = os.getenv("GOOGLE_PLACES_API_KEY")
    if not api_key:
        logger.debug("Google Places API key not set — skipping Places fallback")
        return None

    parts = [p for p in [name, city, country] if p and p.strip()]
    query = ", ".join(parts)

    try:
        resp = httpx.get(
            "https://maps.googleapis.com/maps/api/place/findplacefromtext/json",
            params={
                "input": query,
                "inputtype": "textquery",
                "fields": "geometry,formatted_address,name",
                "key": api_key,
            },
            timeout=8,
        )
        resp.raise_for_status()
        data = resp.json()

        candidates = data.get("candidates") or []
        if candidates:
            loc = candidates[0]["geometry"]["location"]
            result = {"lat": float(loc["lat"]), "lng": float(loc["lng"])}
            logger.info(
                "Google Places: ✅ '%s' → %.4f, %.4f (formatted: %s)",
                query, result["lat"], result["lng"],
                candidates[0].get("formatted_address", ""),
            )
            return result

        logger.warning("Google Places: ❌ no candidates for '%s'", query)
        return None

    except Exception as exc:
        logger.warning("Google Places error for '%s': %s", query, exc)
        return None


def geocode_one(name: str, city: str = "", country: str = "") -> tuple[float, float] | None:
    """
    Server-side geocode a single place.
    Tier 1: Nominatim (free, OSM)
    Tier 2: Google Places (paid fallback, only when Nominatim fails)

    Returns (lat, lng) tuple or None if both tiers fail.
    """
    # Strip continent/macro-region hallucinations before doing anything
    country = _sanitize_country(country)
    city_clean = city.strip().lower()
    if city_clean in _FAKE_COUNTRIES:
        city = ""

    parts = [p for p in [name, city, country] if p and p.strip()]
    q = ", ".join(parts)
    if not q:
        return None

    countrycodes = _COUNTRY_CODE_MAP.get(country.lower().strip(), "")

    key = _cache_key(q, countrycodes)
    if key in _geocode_cache:
        cached = _geocode_cache[key]
        if cached:
            return (cached["lat"], cached["lng"])
        return None

    headers = {
        "User-Agent": "Recolekt/1.0 (contact@recolekt.com)",
        "Accept-Language": "en",
    }

    result: dict | None = None

    with _nominatim_lock:
        # Attempt 1 — full "Name, City, Country"
        result = _nominatim_query(q, countrycodes, headers)

        # Attempt 2 — name only (strips noisy city/country that confuses Nominatim)
        if result is None and len(parts) > 1:
            logger.info("geocode_one: name-only retry for '%s'", name)
            result = _nominatim_query(name, countrycodes, headers)

        # Attempt 3 — city only (last Nominatim resort for heavily branded names)
        if result is None and city:
            logger.info("geocode_one: city-only fallback for '%s'", city)
            result = _nominatim_query(city, countrycodes, headers)

    # Tier 2 — Google Places (only when all Nominatim attempts fail)
    if result is None:
        logger.info("geocode_one: Nominatim exhausted — trying Google Places for '%s'", name)
        result = _google_places_query(name, city, country)

    if result:
        _geocode_cache[key] = result
        logger.info("geocode_one: ✅ '%s' → %.4f, %.4f", q, result["lat"], result["lng"])
        return (result["lat"], result["lng"])

    _geocode_cache[key] = None
    logger.warning("geocode_one: ❌ all tiers failed for '%s'", q)
    return None


@geocode_bp.route("/geocode", methods=["GET"])
def geocode_proxy():
    q            = request.args.get("q", "").strip()
    countrycodes = request.args.get("countrycodes", "").strip()

    if not q:
        return jsonify({"error": "q is required"}), 400

    key = _cache_key(q, countrycodes)
    if key in _geocode_cache:
        cached = _geocode_cache[key]
        logger.debug("geocode proxy: cache hit for %r", q)
        if cached:
            return jsonify(cached)
        return jsonify({"lat": None, "lng": None})

    headers = {
        "User-Agent":      "Recolekt/1.0 (contact@recolekt.com)",
        "Accept-Language": "en",
    }

    result: dict | None = None

    with _nominatim_lock:
        result = _nominatim_query(q, countrycodes, headers)

        if result is None and "," in q:
            city_part = q.split(",", 1)[1].strip()
            if city_part and city_part.lower() != q.lower():
                logger.info(
                    "geocode proxy: city-rescue — '%s' not found, retrying with '%s'",
                    q, city_part,
                )
                result = _nominatim_query(city_part, countrycodes, headers)
                if result:
                    logger.info(
                        "geocode proxy: ✅ city-rescue '%s' → '%s' → %.4f, %.4f",
                        q, city_part, result["lat"], result["lng"],
                    )

    if result:
        _geocode_cache[key] = result
        logger.info("geocode proxy: ✅ %r → %.4f, %.4f", q, result["lat"], result["lng"])
        return jsonify(result)

    logger.warning("geocode proxy: ❌ all attempts failed for %r", q)
    _geocode_cache[key] = None
    return jsonify({"lat": None, "lng": None}), 200