"""
Compatibility wrapper around instagram_bio_scraper.

Canonical implementation lives in:
    fetcher_api.services.instagram_bio_scraper
"""

from fetcher_api.services.instagram_bio_scraper import (
    account_to_enrichment_candidate,
    enrich_locations_with_accounts,
    enrich_locations_with_accounts_sync,
    enrich_tools_with_instagram_locations,
    extract_account_location_metadata,
    extract_location_hints_from_text,
    merge_location_enrichment,
    normalize_for_match,
    score_account_match,
    select_best_account_for_location,
)

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