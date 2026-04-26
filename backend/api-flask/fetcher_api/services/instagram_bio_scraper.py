import inspect
import logging
import re
import unicodedata
from copy import deepcopy
from typing import Any, Callable, Dict, Iterable, List, Optional, Tuple


logger = logging.getLogger(__name__)


COUNTRY_ALIASES: Dict[str, str] = {
    "austria": "Austria",
    "österreich": "Austria",
    "autriche": "Austria",
    "germany": "Germany",
    "deutschland": "Germany",
    "switzerland": "Switzerland",
    "schweiz": "Switzerland",
    "suisse": "Switzerland",
    "italy": "Italy",
    "italia": "Italy",
    "italie": "Italy",
    "france": "France",
    "spain": "Spain",
    "españa": "Spain",
    "portugal": "Portugal",
    "croatia": "Croatia",
    "slovenia": "Slovenia",
    "belgium": "Belgium",
    "netherlands": "Netherlands",
    "holland": "Netherlands",
    "luxembourg": "Luxembourg",
    "united kingdom": "United Kingdom",
    "uk": "United Kingdom",
    "england": "United Kingdom",
    "scotland": "United Kingdom",
    "wales": "United Kingdom",
    "ireland": "Ireland",
    "usa": "United States",
    "u.s.a.": "United States",
    "united states": "United States",
    "united states of america": "United States",
    "canada": "Canada",
    "mexico": "Mexico",
    "australia": "Australia",
    "new zealand": "New Zealand",
    "japan": "Japan",
    "japon": "Japan",
    "thailand": "Thailand",
    "thaïlande": "Thailand",
    "thailande": "Thailand",
    "indonesia": "Indonesia",
    "indonésie": "Indonesia",
    "indonesie": "Indonesia",
    "bali": "Indonesia",
    "greece": "Greece",
    "turkey": "Turkey",
    "turquie": "Turkey",
    "maldives": "Maldives",
    "uae": "United Arab Emirates",
    "united arab emirates": "United Arab Emirates",
    "dubai": "United Arab Emirates",
    "estonia": "Estonia",
    "latvia": "Latvia",
    "lithuania": "Lithuania",
    "norway": "Norway",
    "sweden": "Sweden",
    "finland": "Finland",
    "denmark": "Denmark",
    "poland": "Poland",
    "czech republic": "Czech Republic",
    "czechia": "Czech Republic",
    "hungary": "Hungary",
    "romania": "Romania",
    "bulgaria": "Bulgaria",
    "serbia": "Serbia",
    "montenegro": "Montenegro",
    "albania": "Albania",
    "bosnia": "Bosnia and Herzegovina",
    "bosnia and herzegovina": "Bosnia and Herzegovina",
}

_FAKE_REGION_TERMS = {
    "europe",
    "europa",
    "alps",
    "alpine",
    "dolomites",
    "mediterranean",
    "scandinavia",
    "middle east",
    "southeast asia",
    "asia",
    "africa",
    "north america",
    "south america",
    "latin america",
    "oceania",
    "caribbean",
    "balkans",
    "nordics",
    "benelux",
    "central europe",
    "eastern europe",
    "western europe",
    "northern europe",
    "southern europe",
}

NOISE_PHRASES = {
    "book now",
    "book direct",
    "link in bio",
    "dm for",
    "follow us",
    "family hotel",
    "family resort",
    "luxury hotel",
    "official account",
    "official page",
    "travel",
    "vacation",
    "holiday",
    "open daily",
    "restaurant",
    "spa",
    "pool",
    "wellness",
}

_MARKETING_HINTS = {
    "seit",
    "since",
    "urban",
    "lifestyle",
    "retreat",
    "escape",
    "hideaway",
    "grosszügig",
    "großzügig",
    "unkompliziert",
    "family time",
    "experience",
}

_COMMON_VENUE_SUFFIXES = (
    "familyresort",
    "family resort",
    "resort",
    "hotel",
    "lodge",
    "chalet",
    "villa",
    "spa",
)

ADDRESS_KEYWORDS = {
    "street",
    "st",
    "st.",
    "road",
    "rd",
    "rd.",
    "avenue",
    "ave",
    "ave.",
    "lane",
    "ln",
    "ln.",
    "boulevard",
    "blvd",
    "blvd.",
    "drive",
    "dr",
    "dr.",
    "place",
    "pl",
    "pl.",
    "square",
    "sq",
    "sq.",
    "way",
    "route",
    "rue",
    "via",
    "viale",
    "calle",
    "camino",
    "paseo",
    "rua",
    "strasse",
    "straße",
    "gasse",
    "platz",
    "weg",
    "allee",
    "quai",
    "cours",
    "promenade",
}

_CAPTION_MENTION_RE = re.compile(r"(?<![\w.])@([A-Za-z0-9._]{2,})")
_ITEM_ACCOUNT_KEYS = (
    "instagram",
    "instagram_handle",
    "instagram_username",
    "ig_username",
    "username",
    "handle",
    "mention",
    "account",
    "account_username",
)

_BAD_BIO_ADDRESS_FRAGMENT_RE = re.compile(
    r"\b("
    r"\d+\s*[-–]?\s*(?:sterne|star)s?|"
    r"hotel\s+auf\s+\d+|"
    r"resort\s+at\s+\d+|"
    r"auf\s+\d+|"
    r"above\s+\d+|"
    r"altitude|"
    r"elevation"
    r")\b",
    re.IGNORECASE,
)

_ALTITUDE_POSTAL_RE = re.compile(
    r"^\d{1,4}(?:[.,]\d{1,3})?m$",
    re.IGNORECASE,
)


def _fold_accents(value: str) -> str:
    text = unicodedata.normalize("NFKD", value or "")
    return "".join(ch for ch in text if not unicodedata.combining(ch))


def normalize_for_match(value: Any) -> str:
    if value is None:
        return ""

    text = _fold_accents(str(value).strip().lower())
    text = text.replace("&", " and ")
    text = text.replace("@", "")
    text = text.replace("_", " ")
    text = text.replace("-", " ")
    text = re.sub(r"[^a-z0-9]+", " ", text)
    text = re.sub(r"\s+", " ", text).strip()

    for suffix in sorted(_COMMON_VENUE_SUFFIXES, key=len, reverse=True):
        if text.endswith(f" {suffix}"):
            text = text[: -len(suffix)].strip()
            break

    return re.sub(r"[^a-z0-9]+", "", text)


def _clean_text(value: Any) -> str:
    if value is None:
        return ""
    text = str(value)
    text = text.replace("\u00a0", " ")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip(" ,;\n\t")


def _first_non_empty(*values: Any) -> Optional[str]:
    for value in values:
        cleaned = _clean_text(value)
        if cleaned:
            return cleaned
    return None


def _strip_leading_markers(text: str) -> str:
    if not text:
        return ""

    i = 0
    while i < len(text) and not text[i].isalnum():
        i += 1
    return text[i:]


def _strip_flag_emoji(text: str) -> str:
    if not text:
        return ""
    text = re.sub(r"[\U0001F1E6-\U0001F1FF]{2}", " ", text)
    text = re.sub(r"[\U0001F1E6-\U0001F1FF]", " ", text)
    return text


def _normalize_geo_text(value: Any) -> str:
    text = _clean_text(value)
    if not text:
        return ""

    text = _strip_flag_emoji(text)
    text = _strip_leading_markers(text)
    text = text.replace("\u200b", " ").replace("\xa0", " ")
    text = re.sub(r"[|•·]+", ", ", text)
    text = re.sub(r"(?:\s*\.\s*){2,}", ". ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip(" ,;.\n\t-")


def _contains_letters(value: str) -> bool:
    return any(ch.isalpha() for ch in value or "")


def _looks_like_symbol_only(value: str) -> bool:
    return bool(value) and not any(ch.isalnum() for ch in value)


def _looks_like_altitude_or_rating_fragment(value: Any) -> bool:
    text = _normalize_geo_text(value)
    if not text:
        return False

    folded = _fold_accents(text).lower()
    compact = re.sub(r"\s+", "", folded)

    if _ALTITUDE_POSTAL_RE.fullmatch(compact):
        return True

    if _BAD_BIO_ADDRESS_FRAGMENT_RE.search(folded):
        return True

    if re.fullmatch(r"\d+(?:[.,]\d+)?\s*m", folded):
        return True

    if re.fullmatch(r"\d+\s*[-–]?\s*(?:sterne|stars?)", folded):
        return True

    return False


def _has_location_marker(text: str) -> bool:
    lowered = (text or "").lower()
    return any(marker in lowered for marker in (
        "📍",
        "location:",
        "based in",
        "located in",
        "find us in",
    ))


def _looks_like_marketing_tagline(text: str) -> bool:
    if not text:
        return False

    lowered = f" {_fold_accents(text).lower()} "

    if any(f" {phrase} " in lowered for phrase in NOISE_PHRASES):
        return True

    if any(f" {phrase} " in lowered for phrase in _MARKETING_HINTS):
        return True

    if (" - " in text or " – " in text) and not _looks_like_address(text):
        parts = [p.strip() for p in re.split(r"\s+[–-]\s+", text) if p.strip()]
        if len(parts) >= 2 and not any(ch.isdigit() for ch in text):
            return True

    if len(text.split()) >= 5 and not any(ch.isdigit() for ch in text) and "," not in text:
        return True

    return False


def _looks_like_place_name(text: str) -> bool:
    text = _normalize_geo_text(text)
    if not text:
        return False
    if _looks_like_symbol_only(text):
        return False
    if _looks_like_altitude_or_rating_fragment(text):
        return False
    if _looks_like_marketing_tagline(text):
        return False

    folded = _fold_accents(text)
    if not _contains_letters(folded):
        return False
    if any(ch.isdigit() for ch in folded):
        return False

    words = [w for w in re.split(r"\s+", folded) if w]
    if not words or len(words) > 4:
        return False

    return True


def _username_from_any(value: Any) -> Optional[str]:
    if not value:
        return None

    text = _clean_text(value)

    if isinstance(value, dict):
        text = _first_non_empty(
            value.get("username"),
            value.get("handle"),
            value.get("mention"),
            value.get("ig_username"),
            value.get("instagram_username"),
            value.get("instagram"),
        ) or ""

    text = text.strip()
    if not text:
        return None

    match = re.search(r"@?([A-Za-z0-9._]{2,})", text)
    if not match:
        return None

    return match.group(1).lstrip("@").strip().lower()


def _display_name_from_account(account: Dict[str, Any]) -> str:
    return _first_non_empty(
        account.get("name"),
        account.get("full_name"),
        account.get("display_name"),
        account.get("title"),
        account.get("business_name"),
        account.get("username"),
        account.get("handle"),
    ) or ""


def _bio_from_account(account: Dict[str, Any]) -> str:
    return _first_non_empty(
        account.get("bio"),
        account.get("biography"),
        account.get("about"),
        account.get("description"),
    ) or ""


def _looks_like_postal_code(token: str, context: str = "") -> bool:
    token = _normalize_geo_text(token).replace(" ", "")
    if not token:
        return False

    token_lower = token.lower()
    context_lower = _fold_accents(context).lower()

    if _ALTITUDE_POSTAL_RE.fullmatch(token_lower):
        return False

    if re.search(r"(?:sterne|star|hotel|resort)", token_lower):
        return False

    if token_lower.endswith("m") and re.search(
        r"\b(?:auf|at|above|altitude|elevation)\s*\d",
        context_lower,
    ):
        return False

    if not re.fullmatch(r"[A-Z0-9\-]{3,10}", token.upper()):
        return False

    if not any(ch.isdigit() for ch in token):
        return False

    if re.fullmatch(r"(1[5-9]\d{2}|20\d{2})", token):
        if not any(keyword in context_lower for keyword in ADDRESS_KEYWORDS) and "," not in context:
            return False

    return True


def _extract_postal_code(text: str) -> Optional[str]:
    if not text:
        return None

    cleaned_text = _normalize_geo_text(text)
    candidates = re.findall(
        r"\b[A-Z]?\d[A-Z0-9\- ]{2,8}\b|\b\d{4,6}\b",
        cleaned_text,
        flags=re.IGNORECASE,
    )
    cleaned: List[str] = []

    for candidate in candidates:
        candidate = candidate.strip(" ,;.")
        if _looks_like_postal_code(candidate, context=cleaned_text):
            cleaned.append(candidate.replace("  ", " ").strip())

    if not cleaned:
        return None

    cleaned.sort(key=len)
    return cleaned[0]


def _extract_country(text: str) -> Optional[str]:
    if not text:
        return None

    lowered = _fold_accents(_normalize_geo_text(text)).lower()

    for alias in sorted(COUNTRY_ALIASES.keys(), key=len, reverse=True):
        alias_folded = _fold_accents(alias).lower()
        if re.search(rf"\b{re.escape(alias_folded)}\b", lowered):
            return COUNTRY_ALIASES[alias]

    return None


def _is_locationish_fragment(fragment: str) -> bool:
    fragment = _normalize_geo_text(fragment)
    if not fragment:
        return False

    lowered = _fold_accents(fragment).lower()

    if any(phrase in lowered for phrase in NOISE_PHRASES):
        return False

    if _looks_like_marketing_tagline(fragment):
        return False

    if _extract_country(fragment):
        return True

    if _extract_postal_code(fragment):
        return True

    if any(keyword in lowered for keyword in ADDRESS_KEYWORDS):
        return True

    if re.search(r"\d", fragment):
        return True

    if fragment.count(",") >= 1:
        return True

    if _has_location_marker(fragment) and _looks_like_place_name(fragment):
        return True

    return False


def _split_locationish_fragments(text: str) -> List[str]:
    if not text:
        return []

    text = _clean_text(text)
    raw_lines = [
        line.strip(" ,;")
        for line in re.split(r"[\n|]+", text)
        if line.strip(" ,;")
    ]

    fragments: List[str] = []
    seen: set[str] = set()

    for line in raw_lines:
        line = _normalize_geo_text(line)
        if not line:
            continue

        if _is_locationish_fragment(line):
            key = line.casefold()
            if key not in seen:
                seen.add(key)
                fragments.append(line)
            continue

        comma_parts = [part.strip(" ,;") for part in line.split(",") if part.strip(" ,;")]
        if len(comma_parts) >= 2 and any(_is_locationish_fragment(part) for part in comma_parts):
            candidate = ", ".join(
                _normalize_geo_text(part)
                for part in comma_parts
                if _normalize_geo_text(part)
            )
            key = candidate.casefold()
            if candidate and key not in seen:
                seen.add(key)
                fragments.append(candidate)
            continue

        dot_parts = [
            part.strip(" ,;.")
            for part in re.split(r"\.+", line)
            if part.strip(" ,;.")
        ]
        if len(dot_parts) >= 2 and sum(1 for part in dot_parts if _looks_like_place_name(part)) >= 2:
            candidate = ", ".join(dot_parts[:3])
            key = candidate.casefold()
            if candidate and key not in seen:
                seen.add(key)
                fragments.append(candidate)

    return fragments


def _looks_like_address(text: str) -> bool:
    normalized = _normalize_geo_text(text)
    lowered = _fold_accents(normalized).lower()

    if _looks_like_altitude_or_rating_fragment(normalized):
        return False

    if any(keyword in lowered for keyword in ADDRESS_KEYWORDS):
        return True

    if re.search(r"\d", normalized) and re.search(r"[A-Za-zÄÖÜäöüß]", normalized):
        return True

    return False


def _tokenize_location_fragment(text: str) -> List[str]:
    if not text:
        return []

    normalized = _normalize_geo_text(text)
    if not normalized:
        return []

    if "," in normalized:
        return [token.strip(" ,;") for token in normalized.split(",") if token.strip(" ,;")]

    dot_parts = [
        part.strip(" ,;.")
        for part in re.split(r"\.+", normalized)
        if part.strip(" ,;.")
    ]
    if len(dot_parts) >= 2:
        return dot_parts

    return [normalized]


def _clean_city_value(value: Any) -> Optional[str]:
    text = _normalize_geo_text(value)
    if not text:
        return None
    if _looks_like_symbol_only(text):
        return None
    if _looks_like_altitude_or_rating_fragment(text):
        return None
    if _looks_like_marketing_tagline(text):
        return None
    lowered = _fold_accents(text).lower()
    if lowered in _FAKE_REGION_TERMS:
        return None
    if not _looks_like_place_name(text):
        return None
    return text


def _clean_region_value(value: Any) -> Optional[str]:
    text = _normalize_geo_text(value)
    if not text:
        return None

    if _looks_like_symbol_only(text):
        return None

    if _looks_like_altitude_or_rating_fragment(text):
        logger.info("📍 Dropping altitude/rating fragment parsed as region: %r", text)
        return None

    lowered = _fold_accents(text).lower()
    compact = re.sub(r"\s+", "", lowered)

    if _ALTITUDE_POSTAL_RE.fullmatch(compact):
        logger.info("📍 Dropping altitude parsed as region: %r", text)
        return None

    if re.search(r"\d", text):
        logger.info("📍 Dropping digit-bearing weak region fragment: %r", text)
        return None

    if _looks_like_marketing_tagline(text):
        return None

    if lowered in _FAKE_REGION_TERMS:
        return None

    if not _contains_letters(text):
        return None

    return text


def _clean_address_value(value: Any) -> Optional[str]:
    text = _normalize_geo_text(value)
    if not text:
        return None

    if _looks_like_symbol_only(text):
        return None

    folded = _fold_accents(text).lower()
    if _BAD_BIO_ADDRESS_FRAGMENT_RE.search(folded):
        logger.info("📍 Dropping weak IG-bio address fragment: %r", text)
        return None

    if _looks_like_marketing_tagline(text) and not _looks_like_address(text):
        return None

    if not _looks_like_address(text):
        return None

    return text


def _clean_country_value(value: Any) -> Optional[str]:
    text = _normalize_geo_text(value)
    if not text:
        return None
    if _looks_like_symbol_only(text):
        return None
    if _looks_like_altitude_or_rating_fragment(text):
        return None

    lowered = _fold_accents(text).lower()
    if lowered in _FAKE_REGION_TERMS:
        return None

    canonical = _extract_country(text)
    if canonical:
        return canonical

    if re.fullmatch(r"[A-Za-z]{2,3}", text):
        return text.upper()

    if _contains_letters(text) and not _looks_like_marketing_tagline(text):
        return text

    return None


def _clean_postal_code_value(value: Any, *, context: str = "") -> Optional[str]:
    text = _normalize_geo_text(value).replace(" ", "")
    if not text:
        return None

    if _ALTITUDE_POSTAL_RE.fullmatch(text.lower()):
        logger.info("📍 Dropping altitude parsed as postal_code: %r", text)
        return None

    if not _looks_like_postal_code(text, context=context):
        return None

    return text


def _sanitize_location_dict(data: Dict[str, Any]) -> Dict[str, Optional[str]]:
    raw_location_text = _clean_text(data.get("raw_location_text")) or None
    context = raw_location_text or ""

    city = _clean_city_value(data.get("city"))
    region = _clean_region_value(data.get("region"))
    state = _clean_region_value(data.get("state"))
    country = _clean_country_value(data.get("country"))
    address = _clean_address_value(data.get("address"))
    postal_code = _clean_postal_code_value(data.get("postal_code"), context=context)

    if state and region and normalize_for_match(state) == normalize_for_match(region):
        state = region

    if country and region and normalize_for_match(country) == normalize_for_match(region):
        region = None
        state = None

    if country and city and normalize_for_match(country) == normalize_for_match(city):
        city = None

    return {
        "address": address,
        "city": city,
        "region": region,
        "state": state,
        "country": country,
        "postal_code": postal_code,
        "raw_location_text": raw_location_text,
    }


def _parse_location_fragment(fragment: str) -> Dict[str, Optional[str]]:
    result: Dict[str, Optional[str]] = {
        "address": None,
        "city": None,
        "region": None,
        "state": None,
        "country": None,
        "postal_code": None,
        "raw_location_text": _normalize_geo_text(fragment) or None,
    }

    if not fragment:
        return result

    fragment = _normalize_geo_text(fragment)
    result["postal_code"] = _extract_postal_code(fragment)
    result["country"] = _extract_country(fragment)

    tokens = _tokenize_location_fragment(fragment)
    if not tokens:
        return _sanitize_location_dict(result)

    cleaned_tokens: List[str] = []
    for token in tokens:
        token = _normalize_geo_text(token)
        if not token:
            continue

        if result["country"]:
            alias_patterns = sorted(
                {
                    _fold_accents(k).lower()
                    for k, v in COUNTRY_ALIASES.items()
                    if v == result["country"]
                },
                key=len,
                reverse=True,
            )
            for alias_pattern in alias_patterns:
                token = re.sub(
                    rf"\b{re.escape(alias_pattern)}\b",
                    "",
                    _fold_accents(token),
                    flags=re.IGNORECASE,
                )
                token = _normalize_geo_text(token)

        if result["postal_code"]:
            token = re.sub(
                rf"\b{re.escape(result['postal_code'])}\b",
                "",
                token,
                flags=re.IGNORECASE,
            )
            token = _normalize_geo_text(token)

        if token:
            cleaned_tokens.append(token)

    if not cleaned_tokens:
        return _sanitize_location_dict(result)

    if len(cleaned_tokens) == 1:
        only = cleaned_tokens[0]
        if _looks_like_address(only):
            result["address"] = only
        elif _looks_like_place_name(only):
            result["city"] = only
        return _sanitize_location_dict(result)

    first = cleaned_tokens[0]
    remaining = cleaned_tokens[:]

    if _looks_like_address(first):
        result["address"] = first
        remaining = cleaned_tokens[1:]

    if remaining and _looks_like_place_name(remaining[0]):
        result["city"] = remaining[0]

    if len(remaining) >= 2:
        region_candidate = remaining[1]
        if _contains_letters(region_candidate) and not _extract_country(region_candidate):
            result["region"] = region_candidate
            result["state"] = region_candidate

    if len(remaining) >= 3 and not result["country"]:
        maybe_country = _extract_country(remaining[2])
        if maybe_country:
            result["country"] = maybe_country

    return _sanitize_location_dict(result)


def extract_location_hints_from_text(text: str) -> Dict[str, Optional[str]]:
    result: Dict[str, Optional[str]] = {
        "address": None,
        "city": None,
        "region": None,
        "state": None,
        "country": None,
        "postal_code": None,
        "raw_location_text": None,
    }

    if not text:
        return result

    fragments = _split_locationish_fragments(text)
    if not fragments:
        return result

    scored: List[Tuple[int, str]] = []
    for fragment in fragments:
        score = 0
        if _extract_country(fragment):
            score += 4
        if _extract_postal_code(fragment):
            score += 3
        if _looks_like_address(fragment):
            score += 3
        if fragment.count(",") >= 2:
            score += 2
        if _has_location_marker(fragment):
            score += 1
        if _looks_like_place_name(fragment):
            score += 1
        scored.append((score, fragment))

    scored.sort(key=lambda item: item[0], reverse=True)
    best_fragment = scored[0][1]

    parsed = _parse_location_fragment(best_fragment)
    result.update(parsed)
    return result


def account_to_enrichment_candidate(account: Any) -> Dict[str, Any]:
    if isinstance(account, str):
        username = _username_from_any(account)
        return {
            "username": username,
            "handle": f"@{username}" if username else None,
            "name": username,
            "full_name": username,
            "bio": None,
            "biography": None,
        }

    if not isinstance(account, dict):
        return {}

    username = _username_from_any(account)
    normalized = dict(account)
    normalized["username"] = username or normalized.get("username")
    normalized["handle"] = normalized.get("handle") or (f"@{username}" if username else None)
    normalized["full_name"] = _display_name_from_account(normalized) or normalized.get("full_name")
    normalized["bio"] = _bio_from_account(normalized) or normalized.get("bio")
    return normalized


def extract_account_location_metadata(account: Dict[str, Any]) -> Dict[str, Optional[str]]:
    account = account or {}

    direct_address = _first_non_empty(account.get("address"), account.get("street_address"))
    direct_city = _first_non_empty(account.get("city"), account.get("town"))
    direct_region = _first_non_empty(account.get("region"), account.get("state"), account.get("province"))
    direct_country = _first_non_empty(account.get("country"))
    direct_postal = _first_non_empty(account.get("postal_code"), account.get("zip"), account.get("zipcode"))

    bio = _bio_from_account(account)
    from_bio = extract_location_hints_from_text(bio)

    merged = {
        "address": direct_address or from_bio.get("address"),
        "city": direct_city or from_bio.get("city"),
        "region": direct_region or from_bio.get("region"),
        "state": direct_region or from_bio.get("state"),
        "country": direct_country or from_bio.get("country"),
        "postal_code": direct_postal or from_bio.get("postal_code"),
        "raw_location_text": from_bio.get("raw_location_text"),
    }

    return _sanitize_location_dict(merged)


def _location_names_for_match(location: Dict[str, Any]) -> List[str]:
    names = [
        location.get("name"),
        location.get("title"),
        location.get("place_name"),
        location.get("venue"),
        location.get("business_name"),
        location.get("location_name"),
    ]
    return [name for name in names if _clean_text(name)]


def score_account_match(location: Dict[str, Any], account: Dict[str, Any]) -> float:
    location_names = _location_names_for_match(location)
    if not location_names:
        return 0.0

    account_username = account.get("username") or ""
    account_display = _display_name_from_account(account)
    account_candidates = [
        value
        for value in [account_username, account_display]
        if _clean_text(value)
    ]

    if not account_candidates:
        return 0.0

    best = 0.0

    for location_name in location_names:
        loc_norm = normalize_for_match(location_name)
        if not loc_norm:
            continue

        for candidate in account_candidates:
            cand_norm = normalize_for_match(candidate)
            if not cand_norm:
                continue

            score = 0.0

            if loc_norm == cand_norm:
                score = 1.0
            elif loc_norm in cand_norm or cand_norm in loc_norm:
                score = 0.92
            else:
                loc_tokens = set(re.findall(r"[a-z0-9]+", _fold_accents(str(location_name)).lower()))
                cand_tokens = set(re.findall(r"[a-z0-9]+", _fold_accents(str(candidate)).lower()))
                overlap = loc_tokens.intersection(cand_tokens)
                if overlap:
                    ratio = len(overlap) / max(len(loc_tokens), len(cand_tokens), 1)
                    if ratio >= 0.75:
                        score = 0.88
                    elif ratio >= 0.5:
                        score = 0.8

            best = max(best, score)

    return best


def select_best_account_for_location(
    location: Dict[str, Any],
    accounts: Iterable[Dict[str, Any]],
    min_match_score: float = 0.88,
) -> Optional[Dict[str, Any]]:
    scored: List[Tuple[float, Dict[str, Any]]] = []

    for account in accounts:
        score = score_account_match(location, account)
        if score >= min_match_score:
            scored.append((score, account))

    if not scored:
        return None

    scored.sort(key=lambda item: item[0], reverse=True)
    return scored[0][1]


def merge_location_enrichment(
    location: Dict[str, Any],
    enrichment: Dict[str, Optional[str]],
    matched_account: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    merged = deepcopy(location)
    enrichment = _sanitize_location_dict(enrichment or {})

    for key in ("address", "city", "region", "state", "country", "postal_code"):
        if not _clean_text(merged.get(key)) and _clean_text(enrichment.get(key)):
            merged[key] = enrichment[key]

    if matched_account:
        username = matched_account.get("username")
        if username and not merged.get("instagram_username"):
            merged["instagram_username"] = username

        full_name = _display_name_from_account(matched_account)
        if full_name and not merged.get("instagram_account_name"):
            merged["instagram_account_name"] = full_name

    return merged


def _has_any_location_signal(data: Dict[str, Any]) -> bool:
    if not isinstance(data, dict):
        return False

    for key in ("address", "city", "region", "state", "country", "postal_code", "lat", "lng"):
        value = data.get(key)
        if isinstance(value, str) and _clean_text(value):
            return True
        if key in {"lat", "lng"} and value is not None:
            return True

    return False


def _dedupe_locations(locations: Iterable[Dict[str, Any]]) -> List[Dict[str, Any]]:
    deduped: List[Dict[str, Any]] = []
    seen = set()

    for loc in locations:
        if not isinstance(loc, dict):
            continue

        identity = (
            normalize_for_match(loc.get("name")),
            _clean_text(loc.get("address")).lower(),
            normalize_for_match(loc.get("city")),
            normalize_for_match(loc.get("country")),
            _clean_text(loc.get("instagram_username") or loc.get("instagram")).lower(),
        )
        if identity in seen:
            continue

        seen.add(identity)
        deduped.append(loc)

    return deduped


async def _maybe_await(value: Any) -> Any:
    if inspect.isawaitable(value):
        return await value
    return value


async def _fetch_account_if_needed(
    base_account: Dict[str, Any],
    fetch_account: Optional[Callable[[str], Any]],
    log: Optional[logging.Logger] = None,
) -> Dict[str, Any]:
    base_account = base_account or {}
    username = base_account.get("username")

    already_rich = any([
        _bio_from_account(base_account),
        _clean_text(base_account.get("address")),
        _clean_text(base_account.get("city")),
        _clean_text(base_account.get("country")),
    ])
    if already_rich or not username or not fetch_account:
        return base_account

    try:
        fetched = await _maybe_await(fetch_account(username))
        if isinstance(fetched, dict):
            merged = dict(base_account)
            merged.update({k: v for k, v in fetched.items() if v is not None})
            merged["username"] = _username_from_any(merged) or username
            return merged
    except Exception as exc:
        if log:
            log.warning("Failed to fetch IG account metadata for @%s: %s", username, exc)

    return base_account


async def _build_account_candidates_async(
    mentioned_accounts: Iterable[Any],
    fetch_account: Optional[Callable[[str], Any]],
    log: Optional[logging.Logger] = None,
) -> List[Dict[str, Any]]:
    candidates: List[Dict[str, Any]] = []

    for raw_account in mentioned_accounts:
        candidate = account_to_enrichment_candidate(raw_account)
        if not candidate:
            continue
        candidate = await _fetch_account_if_needed(candidate, fetch_account, log=log)
        candidates.append(candidate)

    return candidates


def _build_account_candidates_sync(
    mentioned_accounts: Iterable[Any],
) -> List[Dict[str, Any]]:
    candidates = [
        account_to_enrichment_candidate(raw_account)
        for raw_account in mentioned_accounts
    ]
    return [candidate for candidate in candidates if candidate]


def _enrich_locations_core(
    locations: List[Dict[str, Any]],
    account_candidates: List[Dict[str, Any]],
    min_match_score: float = 0.88,
) -> List[Dict[str, Any]]:
    if not locations or not account_candidates:
        return locations

    enriched_locations: List[Dict[str, Any]] = []

    for location in locations:
        if not isinstance(location, dict):
            enriched_locations.append(location)
            continue

        best_account = select_best_account_for_location(
            location=location,
            accounts=account_candidates,
            min_match_score=min_match_score,
        )
        if not best_account:
            enriched_locations.append(location)
            continue

        enrichment = extract_account_location_metadata(best_account)
        if not _has_any_location_signal(enrichment):
            enriched_locations.append(location)
            continue

        merged = merge_location_enrichment(
            location=location,
            enrichment=enrichment,
            matched_account=best_account,
        )
        enriched_locations.append(merged)

    return enriched_locations


async def enrich_locations_with_accounts(
    locations: Optional[List[Dict[str, Any]]],
    mentioned_accounts: Optional[Iterable[Any]] = None,
    fetch_account: Optional[Callable[[str], Any]] = None,
    min_match_score: float = 0.88,
    log: Optional[logging.Logger] = None,
) -> List[Dict[str, Any]]:
    log = log or logger
    locations = deepcopy(locations or [])
    mentioned_accounts = list(mentioned_accounts or [])

    if not locations or not mentioned_accounts:
        return locations

    account_candidates = await _build_account_candidates_async(
        mentioned_accounts=mentioned_accounts,
        fetch_account=fetch_account,
        log=log,
    )
    if not account_candidates:
        return locations

    return _enrich_locations_core(
        locations=locations,
        account_candidates=account_candidates,
        min_match_score=min_match_score,
    )


def enrich_locations_with_accounts_sync(
    locations: Optional[List[Dict[str, Any]]],
    mentioned_accounts: Optional[Iterable[Any]] = None,
    min_match_score: float = 0.88,
) -> List[Dict[str, Any]]:
    locations = deepcopy(locations or [])
    mentioned_accounts = list(mentioned_accounts or [])

    if not locations or not mentioned_accounts:
        return locations

    account_candidates = _build_account_candidates_sync(mentioned_accounts)
    if not account_candidates:
        return locations

    return _enrich_locations_core(
        locations=locations,
        account_candidates=account_candidates,
        min_match_score=min_match_score,
    )


def _extract_caption_mentions(caption: str) -> List[str]:
    if not caption:
        return []

    seen = set()
    mentions: List[str] = []

    for match in _CAPTION_MENTION_RE.findall(caption):
        username = _username_from_any(match)
        if not username or username in seen:
            continue
        seen.add(username)
        mentions.append(username)

    return mentions


def _tool_item_to_location_candidate(item: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    if not isinstance(item, dict):
        return None

    name = _first_non_empty(
        item.get("name"),
        item.get("title"),
        item.get("place_name"),
        item.get("venue"),
        item.get("business_name"),
    )
    if not name:
        return None

    return {
        "name": name,
        "description": _first_non_empty(item.get("description"), item.get("brief_description")),
        "address": _clean_address_value(_first_non_empty(item.get("address"))),
        "city": _clean_city_value(_first_non_empty(item.get("city"))),
        "region": _clean_region_value(_first_non_empty(item.get("region"), item.get("state"), item.get("province"))),
        "state": _clean_region_value(_first_non_empty(item.get("state"), item.get("region"), item.get("province"))),
        "country": _clean_country_value(_first_non_empty(item.get("country"))),
        "postal_code": _clean_postal_code_value(
            _first_non_empty(item.get("postal_code"), item.get("zip"), item.get("zipcode")),
            context=_first_non_empty(item.get("address"), item.get("description")) or "",
        ),
        "instagram_username": _username_from_any(
            _first_non_empty(
                item.get("instagram_username"),
                item.get("ig_username"),
                item.get("instagram"),
                item.get("handle"),
                item.get("username"),
                item.get("mention"),
            )
        ),
        "source": item.get("source") or "instagram_bio",
    }


def _collect_tool_item_accounts(tools_categories: Iterable[Dict[str, Any]]) -> List[Any]:
    raw_accounts: List[Any] = []

    for category in tools_categories or []:
        for item in category.get("items", []) or []:
            if not isinstance(item, dict):
                continue

            for key in _ITEM_ACCOUNT_KEYS:
                value = item.get(key)
                if value:
                    raw_accounts.append(value)

            maybe_account = item.get("account_profile")
            if isinstance(maybe_account, dict):
                raw_accounts.append(maybe_account)

    return raw_accounts


async def enrich_tools_with_instagram_locations(
    tools_categories: Optional[List[Dict[str, Any]]],
    caption: str = "",
    mentioned_accounts: Optional[Iterable[Any]] = None,
    fetch_account: Optional[Callable[[str], Any]] = None,
    min_match_score: float = 0.88,
    log: Optional[logging.Logger] = None,
) -> List[Dict[str, Any]]:
    log = log or logger
    tools_categories = tools_categories or []

    if not tools_categories:
        return []

    location_candidates: List[Dict[str, Any]] = []
    for category in tools_categories:
        for item in category.get("items", []) or []:
            candidate = _tool_item_to_location_candidate(item)
            if candidate:
                location_candidates.append(candidate)

    if not location_candidates:
        return []

    raw_accounts: List[Any] = []
    raw_accounts.extend(list(mentioned_accounts or []))
    raw_accounts.extend(_collect_tool_item_accounts(tools_categories))
    raw_accounts.extend(_extract_caption_mentions(caption))

    if not raw_accounts:
        return []

    enriched = await enrich_locations_with_accounts(
        locations=location_candidates,
        mentioned_accounts=raw_accounts,
        fetch_account=fetch_account,
        min_match_score=min_match_score,
        log=log,
    )

    output_rows: List[Dict[str, Any]] = []
    for row in enriched:
        if not isinstance(row, dict):
            continue

        normalized = deepcopy(row)
        normalized["source"] = normalized.get("source") or "instagram_bio"

        instagram_username = _username_from_any(
            normalized.get("instagram_username") or normalized.get("instagram")
        )
        if instagram_username:
            normalized["instagram_username"] = instagram_username
            normalized["instagram"] = instagram_username

        normalized.update(_sanitize_location_dict(normalized))

        if not _has_any_location_signal(normalized):
            continue

        output_rows.append(normalized)

    return _dedupe_locations(output_rows)


__all__ = [
    "normalize_for_match",
    "extract_location_hints_from_text",
    "account_to_enrichment_candidate",
    "extract_account_location_metadata",
    "score_account_match",
    "select_best_account_for_location",
    "merge_location_enrichment",
    "enrich_locations_with_accounts",
    "enrich_locations_with_accounts_sync",
    "enrich_tools_with_instagram_locations",
]