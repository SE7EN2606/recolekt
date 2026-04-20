from __future__ import annotations

import asyncio
import json
import logging
import re

import httpx

logger = logging.getLogger(__name__)

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) "
        "AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148"
    ),
    "Accept-Language": "en-US,en;q=0.9",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "x-ig-app-id": "936619743392459",
}

_GEOCODE_HEADERS = {"User-Agent": "Recolekt/1.0 greg@recolekt.com"}

_VENUE_KEYWORDS = {
    "hotel", "hôtel", "resort", "lodge", "hostel", "auberge",
    "restaurant", "bistro", "café", "cafe", "brasserie",
    "spa", "retreat", "inn", "guesthouse", "chalet",
}

_ADDRESS_PATTERNS = [
    r"\b(?:Via|Rue|Str(?:aße|asse)?|Avenue|Ave|Road|Rd|Street|St|Corso|Piazza|"
    r"Boulevard|Blvd|Lane|Ln|Drive|Dr|Place|Pl)\s+\w[^\n\r,]{0,60}",
    r"\b\d+\s+(?:Via|Rue|Str(?:aße|asse)?|Avenue|Ave|Road|Rd|Street|St|Corso|Piazza|"
    r"Boulevard|Blvd|Lane|Ln|Drive|Dr|Place|Pl)\b[^\n\r]{0,60}",
    r"\b\d{4,5}\s+[A-ZÄÖÜ][a-zäöüß\-]+(?:\s[A-ZÄÖÜ][a-zäöüß\-]+){0,3}",
]


def _normalize(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())


def _items_look_like_venues(tools_categories: list[dict]) -> bool:
    for cat in tools_categories or []:
        cat_name = (cat.get("name") or "").lower()
        if any(kw in cat_name for kw in _VENUE_KEYWORDS):
            return True
        for item in cat.get("items") or []:
            name = (item.get("name") or "").lower()
            if any(kw in name for kw in _VENUE_KEYWORDS):
                return True
    return False


def _significant_tokens(name: str) -> set[str]:
    stop = {
        "family", "resort", "hotel", "lodge", "spa", "inn",
        "the", "and", "de", "du", "le", "la",
    }
    tokens = set(re.sub(r"[^a-z0-9]", " ", (name or "").lower()).split())
    significant = tokens - stop
    return significant if significant else tokens


def _build_handle_map(tools_categories: list[dict], caption: str) -> dict[str, str]:
    """Map item name → instagram handle using @mentions from caption."""
    mentions = re.findall(r"@([\w.]+)", caption or "")
    all_items = [
        item
        for cat in tools_categories or []
        for item in (cat.get("items") or [])
    ]

    handle_map: dict[str, str] = {}
    used_handles: set[str] = set()

    for item in all_items:
        item_name = item.get("name", "")
        if not item_name:
            continue

        item_norm = _normalize(item_name)
        item_tokens = _significant_tokens(item_name)
        best_handle = None
        best_score = 0

        for handle in mentions:
            if handle in used_handles:
                continue

            h_norm = _normalize(handle)

            if item_norm and h_norm and (item_norm in h_norm or h_norm in item_norm):
                score = min(len(item_norm), len(h_norm))
            else:
                token_hits = sum(1 for t in item_tokens if t and t in h_norm)
                score = token_hits * 10 if token_hits > 0 else 0

            if score > best_score:
                best_score = score
                best_handle = handle

        if best_handle and best_score >= 4:
            handle_map[item_name] = best_handle
            used_handles.add(best_handle)

    return handle_map


def _build_item_description_map(tools_categories: list[dict]) -> dict[str, str]:
    """Extract item descriptions keyed by item name for reuse in location entries."""
    result: dict[str, str] = {}
    for cat in tools_categories or []:
        for item in (cat.get("items") or []):
            name = item.get("name", "")
            desc = item.get("description", "") or ""
            if name and desc:
                result[name] = desc
    return result


async def _fetch_bio(handle: str, client: httpx.AsyncClient) -> dict:
    """Fetch public Instagram bio via the internal API endpoint."""
    url = f"https://i.instagram.com/api/v1/users/web_profile_info/?username={handle}"
    try:
        r = await client.get(url, timeout=8)
        if r.status_code != 200:
            logger.warning("IG bio API: @%s returned %d", handle, r.status_code)
            return {"handle": handle, "bio": None, "combined": ""}

        data = r.json()
        user = data.get("data", {}).get("user", {})
        bio = user.get("biography", "") or ""
        city = user.get("city_name", "") or ""
        business_address = user.get("business_address_json", "") or ""

        address_str = ""
        if business_address:
            try:
                if isinstance(business_address, str):
                    addr_obj = json.loads(business_address)
                elif isinstance(business_address, dict):
                    addr_obj = business_address
                else:
                    addr_obj = {}

                parts = [
                    addr_obj.get("street_address", ""),
                    addr_obj.get("zip_code", ""),
                    addr_obj.get("city_name", ""),
                    addr_obj.get("region_name", ""),
                    addr_obj.get("country_code", ""),
                ]
                address_str = ", ".join(p for p in parts if p)
            except Exception:
                address_str = str(business_address)

        combined = "\n".join(filter(None, [bio, city, address_str]))
        logger.info(
            "IG bio @%s: bio=%r city=%r address=%r",
            handle,
            bio[:60],
            city,
            address_str[:60],
        )
        return {
            "handle": handle,
            "bio": bio,
            "city": city,
            "address_str": address_str,
            "combined": combined,
        }

    except Exception as exc:
        logger.warning("IG bio fetch failed for @%s: %s", handle, exc)
        return {"handle": handle, "bio": None, "combined": ""}


def _extract_address(text: str) -> str | None:
    for pattern in _ADDRESS_PATTERNS:
        m = re.search(pattern, text or "", re.IGNORECASE)
        if m:
            addr = m.group(0).strip().rstrip(",")
            if len(addr) > 6:
                return addr
    return None


def _parse_nominatim_address(result: dict) -> dict:
    """
    Extract city, region, country, and a human-readable address line
    from a Nominatim result with addressdetails=1.
    """
    addr = result.get("address", {})

    city = (
        addr.get("city")
        or addr.get("town")
        or addr.get("village")
        or addr.get("municipality")
        or addr.get("hamlet")
        or ""
    )
    region = (
        addr.get("state")
        or addr.get("region")
        or addr.get("county")
        or ""
    )
    country = addr.get("country", "")
    postcode = addr.get("postcode", "")
    road = addr.get("road", "")
    house_number = addr.get("house_number", "")

    street = f"{road} {house_number}".strip() if road else ""
    city_line = ", ".join(filter(None, [postcode, city]))
    address_line = ", ".join(filter(None, [street, city_line, country]))

    return {
        "city": city,
        "region": region,
        "country": country,
        "address": address_line or None,
    }


async def _geocode(address: str) -> tuple[float, float, dict] | None:
    """
    Geocode a structured address string via Nominatim.
    Returns (lat, lng, address_meta) or None.
    """
    try:
        async with httpx.AsyncClient() as client:
            r = await client.get(
                "https://nominatim.openstreetmap.org/search",
                params={"q": address, "format": "json", "limit": 1, "addressdetails": 1},
                headers=_GEOCODE_HEADERS,
                timeout=6,
            )
        data = r.json()
        if data:
            meta = _parse_nominatim_address(data[0])
            return float(data[0]["lat"]), float(data[0]["lon"]), meta
    except Exception as exc:
        logger.warning("Geocode failed for '%s': %s", address, exc)
    return None


async def _geocode_by_name(
    name: str,
    bio_text: str = "",
) -> tuple[float, float, dict] | None:
    """
    Fallback geocoder: searches Nominatim by hotel/venue name directly.
    Returns (lat, lng, address_meta) or None.

    Two passes:
      1. Full name + city hint when available
      2. Full name alone

    Prefers tourism/accommodation OSM class results.
    """
    city_hint = ""
    city_match = re.search(
        r"\b([A-ZÄÖÜ][a-zäöüß]+(?:[\s\-][A-ZÄÖÜ][a-zäöüß]+)?)\b",
        bio_text or "",
    )
    if city_match:
        city_hint = city_match.group(1)

    queries_to_try: list[str] = []
    if city_hint and _normalize(city_hint) not in _normalize(name):
        queries_to_try.append(f"{name}, {city_hint}")
    queries_to_try.append(name)

    for q in queries_to_try:
        try:
            async with httpx.AsyncClient() as client:
                r = await client.get(
                    "https://nominatim.openstreetmap.org/search",
                    params={
                        "q": q,
                        "format": "json",
                        "limit": 3,
                        "addressdetails": 1,
                    },
                    headers=_GEOCODE_HEADERS,
                    timeout=6,
                )
            data = r.json()
            if data:
                for result in data:
                    rtype = result.get("type", "")
                    rclass = result.get("class", "")
                    if rclass in {"tourism", "leisure", "amenity"} or rtype in {
                        "hotel", "hostel", "motel", "resort", "chalet", "lodge", "guest_house"
                    }:
                        meta = _parse_nominatim_address(result)
                        lat, lon = float(result["lat"]), float(result["lon"])
                        logger.info(
                            "📍 Geocode by name '%s' → (%.4f, %.4f) [%s/%s]",
                            q, lat, lon, rclass, rtype,
                        )
                        return lat, lon, meta

                meta = _parse_nominatim_address(data[0])
                lat, lon = float(data[0]["lat"]), float(data[0]["lon"])
                logger.info(
                    "📍 Geocode by name '%s' → (%.4f, %.4f) [fallback first result]",
                    q, lat, lon,
                )
                return lat, lon, meta
        except Exception as exc:
            logger.warning("Geocode by name failed for '%s': %s", q, exc)

        await asyncio.sleep(1.1)

    logger.info("📍 Geocode by name exhausted all queries for '%s'", name)
    return None


async def enrich_tools_with_instagram_locations(
    tools_categories: list[dict],
    caption: str,
    delay_between: float = 1.1,
) -> list[dict] | None:
    """
    Main entry point. Called from extractor_assembly when:
      - tools_list exists
      - has_location is False
      - items look like physical venues (hotels, restaurants, etc.)

    Returns a location array ready to store in result.json, or None if
    no venue could be matched at all.
    """
    if not _items_look_like_venues(tools_categories):
        logger.info("📍 IG scraper: items don't look like venues — skipping")
        return None

    handle_map = _build_handle_map(tools_categories, caption)
    if not handle_map:
        logger.info("📍 IG scraper: no @handles matched to items — skipping")
        return None

    item_descriptions = _build_item_description_map(tools_categories)

    logger.info(
        "📍 IG scraper: resolving %d handles: %s",
        len(handle_map),
        list(handle_map.values()),
    )

    locations: list[dict] = []

    async with httpx.AsyncClient(headers=_HEADERS, follow_redirects=True) as client:
        for idx, (item_name, handle) in enumerate(handle_map.items()):
            if idx > 0:
                await asyncio.sleep(delay_between)

            bio_data = await _fetch_bio(handle, client)
            combined = bio_data.get("combined") or ""
            bio_text = bio_data.get("bio") or ""

            address = bio_data.get("address_str") or _extract_address(combined)

            lat, lng = None, None
            addr_meta: dict = {}

            if address:
                result = await _geocode(address)
                if result:
                    lat, lng, addr_meta = result
                    logger.info("📍 %s → %s → (%.4f, %.4f)", item_name, address, lat, lng)
                else:
                    logger.info("📍 %s → address found but geocode failed, trying by name", item_name)
                    await asyncio.sleep(1.1)
                    result = await _geocode_by_name(item_name, bio_text)
                    if result:
                        lat, lng, addr_meta = result
            else:
                logger.info("📍 %s → no address in bio, trying geocode by name", item_name)
                await asyncio.sleep(1.1)
                result = await _geocode_by_name(item_name, bio_text)
                if result:
                    lat, lng, addr_meta = result
                    logger.info("📍 %s → geocoded by name (%.4f, %.4f)", item_name, lat, lng)
                else:
                    logger.info("📍 %s → geocode by name also failed", item_name)

            final_address = address or addr_meta.get("address") or None

            name_lower = item_name.lower()
            venue_type = (
                "Hotel" if any(kw in name_lower for kw in {"hotel", "hôtel"})
                else "Resort" if "resort" in name_lower
                else "Lodge" if "lodge" in name_lower
                else "Venue"
            )

            locations.append({
                "name": item_name,
                "instagram": f"https://www.instagram.com/{handle}",
                "address": final_address,
                "city": addr_meta.get("city") or bio_data.get("city") or None,
                "region": addr_meta.get("region") or None,
                "country": addr_meta.get("country") or None,
                "description": item_descriptions.get(item_name) or None,
                "lat": lat,
                "lng": lng,
                "type": venue_type,
                "source": "instagram_bio",
            })

    resolved = [loc for loc in locations if loc.get("lat") is not None]
    if not locations:
        logger.info("📍 IG scraper: no venue rows built — not promoting to location")
        return None

    if not resolved:
        logger.info(
            "📍 IG scraper: built %d venue rows but resolved 0 coordinates — returning rows without coords",
            len(locations),
        )
        return locations

    logger.info(
        "📍 IG scraper: resolved %d/%d venues with coordinates",
        len(resolved),
        len(locations),
    )
    return locations