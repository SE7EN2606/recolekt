import asyncio
import unittest
from unittest.mock import patch

from fetcher_api.services import extractor_assembly
from fetcher_api.services.instagram_bio_scraper import enrich_locations_with_accounts
from fetcher_api.services.universal_extractor import UniversalExtractor


class InstagramEnrichmentPlatformGateTest(unittest.TestCase):
    def test_universal_extractor_skips_account_enrichment_for_facebook(self):
        extractor = UniversalExtractor()
        parsed = {
            "location": [
                {
                    "name": "Cafe Example",
                    "instagram_username": "cafeexample",
                }
            ]
        }

        with patch(
            "fetcher_api.services.universal_extractor.enrich_locations_with_accounts"
        ) as enrich_mock:
            extractor._maybe_enrich_locations_from_accounts(
                parsed=parsed,
                result_data={"creator": {"username": "cafeexample"}},
                classification={"label": "location"},
                caption="@cafeexample",
                source_platform="FB",
            )

        enrich_mock.assert_not_called()
        self.assertEqual(parsed["location"][0]["name"], "Cafe Example")

    def test_platform_gate_only_allows_instagram_sources(self):
        self.assertTrue(extractor_assembly._is_instagram_source_platform("instagram"))
        self.assertTrue(extractor_assembly._is_instagram_source_platform("IG"))
        self.assertFalse(extractor_assembly._is_instagram_source_platform("facebook"))
        self.assertFalse(extractor_assembly._is_instagram_source_platform("FB"))
        self.assertFalse(extractor_assembly._is_instagram_source_platform(None))

    def test_account_enrichment_stops_after_three_failures_and_returns_locations(self):
        calls = []

        def fetch_account(username):
            calls.append(username)
            raise RuntimeError("429 Too Many Requests")

        locations = [{"name": "Cafe Example"}]
        accounts = ["acct1", "acct2", "acct3", "acct4", "acct5"]

        enriched = asyncio.run(
            enrich_locations_with_accounts(
                locations=locations,
                mentioned_accounts=accounts,
                fetch_account=fetch_account,
                fetch_timeout_seconds=0.1,
                max_fetch_attempts=3,
            )
        )

        self.assertEqual(calls, ["acct1", "acct2", "acct3"])
        self.assertEqual(enriched, locations)


if __name__ == "__main__":
    unittest.main()
