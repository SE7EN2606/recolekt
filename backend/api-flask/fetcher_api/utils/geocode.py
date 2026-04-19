# fetcher_api/utils/geocode.py
"""
Geocoding proxy — proxies Nominatim server-side to avoid browser CORS
blocks and client-side rate limiting.

The threading.Lock ensures strictly sequential requests to Nominatim
regardless of how many concurrent frontend requests arrive simultaneously
(React StrictMode fires effects twice in development).

Simple in-memory cache prevents repeated Nominatim hits for the same place
within a server session.

Two-attempt strategy inside the proxy:
  Attempt 1 — full q as received (e.g. "Cervino Natural Ski Paradise, Cervinia")
  Attempt 2 — city-rescue: when q contains a comma and attempt 1 returns empty,
               extract the part after the last comma ("Cervinia") and retry.
               Handles branded/marketing names that Nominatim has no OSM node for.
               The pin lands at city level; the display label stays as the original name.
"""
import logging
import time
import threading
import httpx
from flask import Blueprint, request, jsonify

geocode_bp = Blueprint("geocode", __name__)
logger = logging.getLogger(__name__)

_nominatim_lock           = threading.Lock()
_last_nominatim_call: float = 0.0
_NOMINATIM_MIN_INTERVAL   = 1.2
_MAX_RETRIES              = 2

_geocode_cache: dict[str, dict | None] = {}


def _cache_key(q: str, countrycodes: str) -> str:
    return f"{q.lower().strip()}|{countrycodes.lower().strip()}"


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

            # Empty result — Nominatim has no OSM node for this query string.
            # No point retrying the same query; return None so the caller can
            # attempt city-rescue.
            return None

        except httpx.HTTPStatusError as exc:
            logger.warning("geocode proxy HTTP error for %r: %s", q, exc)
            return None

        except Exception as exc:
            logger.warning("geocode proxy error for %r: %s", q, exc)
            return None

    logger.warning("geocode proxy: all retries exhausted for %r", q)
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
        # Attempt 1 — full query as provided by the caller
        result = _nominatim_query(q, countrycodes, headers)

        # Attempt 2 — city-rescue
        # When q is "Brand Name, City" and Nominatim returns nothing for the full
        # string AND for just the brand name (the PATCH handler already tried both),
        # this fires for the "Brand Name, City" form and extracts the city portion.
        #
        # Example: q = "Cervino Natural Ski Paradise, Cervinia"
        #   → attempt 1 fails (no OSM node named "Cervino Natural Ski Paradise, Cervinia")
        #   → city_part = "Cervinia"
        #   → attempt 2 succeeds (Cervinia is a proper OSM-indexed town)
        #
        # The pin lands at city level which is accurate enough for a ski resort,
        # restaurant, hotel, or any other place named after a brand rather than its
        # formal geographic name.
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
        logger.info(
            "geocode proxy: ✅ %r → %.4f, %.4f", q, result["lat"], result["lng"]
        )
        return jsonify(result)

    logger.warning("geocode proxy: ❌ all attempts failed for %r", q)
    _geocode_cache[key] = None
    return jsonify({"lat": None, "lng": None}), 200