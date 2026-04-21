# fetcher_api/utils/geocode.py
"""
Geocoding proxy — proxies Nominatim server-side to avoid browser CORS
blocks and client-side rate limiting.

The threading.Lock ensures strictly sequential requests to Nominatim
regardless of how many concurrent frontend requests arrive simultaneously
(React StrictMode fires effects twice in development).

Simple in-memory cache prevents repeated Nominatim hits for the same place
within a server session.

Strategy:
  Attempt 1 — full "Name, City, Country"
  Attempt 2 — name only, when full query fails and extra location context may be noisy
  Attempt 3 — city only, for branded venue names that Nominatim cannot resolve

Important correctness guard:
  For highly ambiguous generic venue names with NO city/country context
  (for example "Hotel Stern"), prefer returning None rather than pinning
  the first global match from Nominatim.
"""
import logging
import re
import time
import threading

import httpx
from flask import Blueprint, request, jsonify

geocode_bp = Blueprint("geocode", __name__)
logger = logging.getLogger(__name__)

_nominatim_lock = threading.Lock()
_last_nominatim_call: float = 0.0
_NOMINATIM_MIN_INTERVAL = 1.2
_MAX_RETRIES = 2

_geocode_cache: dict[str, dict | None] = {}

_COUNTRY_MAP = {
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
}

_GENERIC_VENUE_PREFIXES = (
    "hotel ",
    "restaurant ",
    "cafe ",
    "café ",
    "hostel ",
    "motel ",
    "auberge ",
    "gasthof ",
    "ristorante ",
    "trattoria ",
)


def _safe_strip(value) -> str:
    return (value or "").strip() if isinstance(value, str) or value is None else str(value).strip()


def _cache_key(q: str, countrycodes: str) -> str:
    return f"{q.lower().strip()}|{countrycodes.lower().strip()}"


def _is_ambiguous_generic_name_only_query(name: str) -> bool:
    """
    Reject clearly ambiguous venue-name-only queries like:
      - Hotel Stern
      - Restaurant Central
      - Cafe Roma

    These often resolve to an arbitrary global first match in Nominatim.
    Better to return None than save a wrong pin.
    """
    n = " ".join(_safe_strip(name).lower().split())
    if not n or "," in n:
        return False

    if not any(n.startswith(prefix) for prefix in _GENERIC_VENUE_PREFIXES):
        return False

    tokens = re.findall(r"[a-zA-ZÀ-ÿ0-9]+", n)
    return len(tokens) <= 3


def _nominatim_query(
    q: str,
    countrycodes: str,
    headers: dict,
) -> dict | None:
    """
    Execute one Nominatim query with 429-retry logic.
    Must be called inside _nominatim_lock.
    Returns {"lat": float, "lng": float} or None (empty result or error).
    """
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


def geocode_one(
    name: str,
    city: str = "",
    country: str = "",
    address: str = "",
    neighborhood: str = "",
) -> tuple[float, float] | None:
    """
    Server-side geocode a single place.

    Query strategy:
      1. strongest exact queries first (name + address + city/country)
      2. address-based fallbacks
      3. name + geography
      4. guarded name-only
      5. city-only

    Safety rule:
    - ambiguous generic name-only queries like "Hotel Stern" are skipped
      unless supported by address/city/country context.
    """
    name = _safe_strip(name)
    city = _safe_strip(city)
    country = _safe_strip(country)
    address = _safe_strip(address)
    neighborhood = _safe_strip(neighborhood)

    countrycodes = _COUNTRY_MAP.get(country.lower(), "") if country else ""

    queries: list[str] = []

    # Strongest: exact venue + address
    if name and address and city and country:
        queries.append(f"{name}, {address}, {city}, {country}")
    if name and address and city:
        queries.append(f"{name}, {address}, {city}")
    if name and address and country:
        queries.append(f"{name}, {address}, {country}")
    if name and address:
        queries.append(f"{name}, {address}")

    # Address-first fallbacks
    if address and city and country:
        queries.append(f"{address}, {city}, {country}")
    if address and city:
        queries.append(f"{address}, {city}")
    if address and country:
        queries.append(f"{address}, {country}")
    if address:
        queries.append(address)

    # Neighborhood-assisted fallbacks
    if name and neighborhood and city and country:
        queries.append(f"{name}, {neighborhood}, {city}, {country}")
    if name and neighborhood and city:
        queries.append(f"{name}, {neighborhood}, {city}")
    if name and neighborhood and country:
        queries.append(f"{name}, {neighborhood}, {country}")
    if name and neighborhood:
        queries.append(f"{name}, {neighborhood}")

    # Standard name + geography
    if name and city and country:
        queries.append(f"{name}, {city}, {country}")
    if name and city:
        queries.append(f"{name}, {city}")
    if name and country:
        queries.append(f"{name}, {country}")

    # Name-only only if not dangerously ambiguous
    if name and not _is_ambiguous_generic_name_only_query(name):
        queries.append(name)
    elif name and not (address or city or country or neighborhood):
        logger.warning(
            "geocode_one: ⏭️ skipped ambiguous generic name-only query %r",
            name,
        )

    # Weakest fallback
    if city and country:
        queries.append(f"{city}, {country}")
    if city:
        queries.append(city)

    queries = _dedupe_keep_order(queries)
    if not queries:
        return None

    primary_key = _cache_key(queries[0], countrycodes)
    if primary_key in _geocode_cache:
        cached = _geocode_cache[primary_key]
        if cached:
            return (cached["lat"], cached["lng"])
        return None

    headers = {
        "User-Agent": "Recolekt/1.0 (contact@recolekt.com)",
        "Accept-Language": "en",
    }

    result: dict | None = None
    tried_queries: list[str] = []

    with _nominatim_lock:
        for q in queries:
            tried_queries.append(q)
            logger.info("geocode_one: trying %r", q)
            result = _nominatim_query(q, countrycodes, headers)
            if result:
                break

    if result:
        for attempted in dict.fromkeys(tried_queries):
            _geocode_cache[_cache_key(attempted, countrycodes)] = result

        logger.info(
            "geocode_one: ✅ %r → %.4f, %.4f",
            tried_queries[0],
            result["lat"],
            result["lng"],
        )
        return (result["lat"], result["lng"])

    _geocode_cache[primary_key] = None
    logger.warning("geocode_one: ❌ all attempts failed for %r", queries[0])
    return None

@geocode_bp.route("/geocode", methods=["GET"])
def geocode_proxy():
    q = request.args.get("q", "").strip()
    countrycodes = request.args.get("countrycodes", "").strip()

    if not q:
        return jsonify({"error": "q is required"}), 400

    if _is_ambiguous_generic_name_only_query(q):
        logger.warning("geocode proxy: ⏭️ skipped ambiguous generic name-only query %r", q)
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
    tried_queries: list[str] = [q]

    with _nominatim_lock:
        # Attempt 1 — full query as provided by the caller
        result = _nominatim_query(q, countrycodes, headers)

        # Attempt 2 — city-rescue
        if result is None and "," in q:
            city_part = q.split(",", 1)[1].strip()
            if city_part and city_part.lower() != q.lower():
                logger.info(
                    "geocode proxy: city-rescue — '%s' not found, retrying with '%s'",
                    q, city_part,
                )
                tried_queries.append(city_part)
                result = _nominatim_query(city_part, countrycodes, headers)
                if result:
                    logger.info(
                        "geocode proxy: ✅ city-rescue '%s' → '%s' → %.4f, %.4f",
                        q, city_part, result["lat"], result["lng"],
                    )

    if result:
        for attempted in dict.fromkeys(tried_queries):
            _geocode_cache[_cache_key(attempted, countrycodes)] = result
        logger.info("geocode proxy: ✅ %r → %.4f, %.4f", q, result["lat"], result["lng"])
        return jsonify(result)

    logger.warning("geocode proxy: ❌ all attempts failed for %r", q)
    _geocode_cache[key] = None
    return jsonify({"lat": None, "lng": None}), 200