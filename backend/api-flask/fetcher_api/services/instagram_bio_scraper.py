# fetcher_api/services/instagram_bio_scraper.py
from __future__ import annotations

import asyncio
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

_VENUE_KEYWORDS = {
    "hotel", "hôtel", "resort", "lodge", "hostel", "auberge",
    "restaurant", "bistro", "café", "cafe", "brasserie",
    "spa", "retreat", "inn", "guesthouse", "chalet",
}

_ADDRESS_PATTERNS = [
    r'\b(?:Via|Rue|Str(?:aße|asse)?|Avenue|Ave|Road|Rd|Street|St|Corso|Piazza|'
    r'Boulevard|Blvd|Lane|Ln|Drive|Dr|Place|Pl)\s+\w[^\n\r,]{0,60}',
    r'\b\d+\s+(?:Via|Rue|Str(?:aße|asse)?|Avenue|Ave|Road|Rd|Street|St|Corso|Piazza|'
    r'Boulevard|Blvd|Lane|Ln|Drive|Dr|Place|Pl)\b[^\n\r]{0,60}',
    r'\b\d{4,5}\s+[A-ZÄÖÜ][a-zäöüß\-]+(?:\s[A-ZÄÖÜ][a-zäöüß\-]+){0,3}',
]


def _normalize(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", s.lower())


def _items_look_like_venues(tools_categories: list[dict]) -> bool:
    for cat in tools_categories:
        cat_name = (cat.get("name") or "").lower()
        if any(kw in cat_name for kw in _VENUE_KEYWORDS):
            return True
        for item in cat.get("items") or []:
            name = (item.get("name") or "").lower()
            if any(kw in name for kw in _VENUE_KEYWORDS):
                return True
    return False


def _significant_tokens(name: str) -> set[str]:
    """Extract meaningful tokens from a name — strips common suffixes shared by all items."""
    stop = {"family", "resort", "hotel", "lodge", "spa", "inn", "the", "and", "de", "du", "le", "la"}
    tokens = set(re.sub(r"[^a-z0-9]", " ", name.lower()).split())
    significant = tokens - stop
    return significant if significant else tokens


def _build_handle_map(tools_categories: list[dict], caption: str) -> dict[str, str]:
    """Map item name → instagram handle using @mentions from caption."""
    mentions = re.findall(r"@([\w.]+)", caption)
    all_items = [
        item
        for cat in tools_categories
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

            # Exact substring match scores highest
            if item_norm in h_norm or h_norm in item_norm:
                score = len(min(item_norm, h_norm, key=len))
            else:
                # Score by how many significant tokens appear in the handle
                token_hits = sum(1 for t in item_tokens if t in h_norm)
                score = token_hits * 10 if token_hits > 0 else 0

            if score > best_score:
                best_score = score
                best_handle = handle

        # Only accept if score is meaningful — avoids false matches
        if best_handle and best_score >= 4:
            handle_map[item_name] = best_handle
            used_handles.add(best_handle)

    return handle_map


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

        # business_address_json is sometimes a JSON string
        address_str = ""
        if business_address:
            try:
                import json
                addr_obj = json.loads(business_address)
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
        logger.info("IG bio @%s: bio=%r city=%r address=%r", handle, bio[:60], city, address_str[:60])
        return {"handle": handle, "bio": bio, "city": city, "address_str": address_str, "combined": combined}

    except Exception as exc:
        logger.warning("IG bio fetch failed for @%s: %s", handle, exc)
        return {"handle": handle, "bio": None, "combined": ""}


def _extract_address(text: str) -> str | None:
    for pattern in _ADDRESS_PATTERNS:
        m = re.search(pattern, text, re.IGNORECASE)
        if m:
            addr = m.group(0).strip().rstrip(",")
            if len(addr) > 6:
                return addr
    return None


async def _geocode(address: str) -> tuple[float, float] | None:
    """Nominatim (OpenStreetMap) — free, no API key needed."""
    try:
        async with httpx.AsyncClient() as client:
            r = await client.get(
                "https://nominatim.openstreetmap.org/search",
                params={"q": address, "format": "json", "limit": 1},
                headers={"User-Agent": "Recolekt/1.0 greg@recolekt.com"},
                timeout=6,
            )
        data = r.json()
        if data:
            return float(data[0]["lat"]), float(data[0]["lon"])
    except Exception as exc:
        logger.warning("Geocode failed for '%s': %s", address, exc)
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

    Returns a location array ready to store in result.json, or None if nothing resolved.
    """
    if not _items_look_like_venues(tools_categories):
        logger.info("📍 IG scraper: items don't look like venues — skipping")
        return None

    handle_map = _build_handle_map(tools_categories, caption)
    if not handle_map:
        logger.info("📍 IG scraper: no @handles matched to items — skipping")
        return None

    logger.info("📍 IG scraper: resolving %d handles: %s", len(handle_map), list(handle_map.values()))

    locations: list[dict] = []

    async with httpx.AsyncClient(headers=_HEADERS, follow_redirects=True) as client:
        for idx, (item_name, handle) in enumerate(handle_map.items()):
            if idx > 0:
                await asyncio.sleep(delay_between)

            bio_data = await _fetch_bio(handle, client)
            combined = bio_data.get("combined") or ""

            # Prefer structured address_str from API, then regex on bio
            address = bio_data.get("address_str") or _extract_address(combined)

            lat, lng = None, None
            if address:
                coords = await _geocode(address)
                if coords:
                    lat, lng = coords
                    logger.info("📍 %s → %s → (%.4f, %.4f)", item_name, address, lat, lng)
                else:
                    logger.info("📍 %s → address found but geocode failed: %s", item_name, address)
            else:
                logger.info("📍 %s → no address in bio", item_name)

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
                "address": address,
                "lat": lat,
                "lng": lng,
                "type": venue_type,
                "source": "instagram_bio",
            })

    # Return all entries if at least one has an instagram link (always true)
    # but only promote to location if at least one has real address/coords
    resolved = [loc for loc in locations if loc.get("address") or loc.get("lat")]
    if not resolved:
        logger.info("📍 IG scraper: no addresses resolved — not promoting to location")
        return None

    logger.info(
        "📍 IG scraper: resolved %d/%d venues with location data",
        len(resolved), len(locations),
    )
    return locations