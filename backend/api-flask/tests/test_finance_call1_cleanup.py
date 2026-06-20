import unittest
from unittest.mock import patch

from fetcher_api.services.universal_extractor import UniversalExtractor


class FinanceCall1CleanupTest(unittest.TestCase):
    def test_finance_tools_cleanup_runs_before_call2_and_junk_recovery_is_dropped(self):
        extractor = UniversalExtractor()
        events = []
        captured_call2 = {}

        call1_response = {
            "title": "Finance tools",
            "category": "Finance",
            "topic": "Accounting tools",
            "brief_description": "A ranked list of finance tools.",
            "tools": {
                "categories": [
                    {
                        "name": "Finance tools",
                        "items": [
                            {"rank": 1, "name": "Pennylane", "description": "Accounting platform"},
                            {"rank": 2, "name": "QuickBooks", "description": "Bookkeeping software"},
                            {"rank": 3, "name": "Xero", "description": "Accounting software"},
                        ],
                    }
                ]
            },
        }

        def fake_call_ai(*args, **kwargs):
            events.append("call1")
            return call1_response

        def fake_cleanup(**kwargs):
            events.append("cleanup")
            self.assertIn("tools", kwargs["result_data"])

        def fake_call2(parsed, caption):
            events.append("call2")
            captured_call2["names"] = [
                item.get("name")
                for category in parsed.get("tools_categories") or []
                for item in category.get("items") or []
            ]
            return {
                "summary": {"english": {"title": "Finance tools", "summary": "Compact finance stack."}},
                "hashtags": [],
                "highlights": [],
            }

        transcript = (
            "Pennylane 1. QuickBooks 2. Xero 3. "
            "Il en prend 4. pour 5. Ça fait 6."
        )
        caption = "Top finance and accounting tools for small businesses."

        with patch.object(extractor, "_call_ai", side_effect=fake_call_ai):
            with patch.object(extractor, "_cleanup_after_call1_before_call2", side_effect=fake_cleanup):
                with patch.object(extractor, "_call2_english", side_effect=fake_call2):
                    result = extractor.extract(
                        transcript=transcript,
                        caption=caption,
                        lang="en",
                        classification={"label": "finance", "score": 0.95, "signals": {"tool_kw": 3}},
                        video_path=None,
                        duration_seconds=30,
                        is_silent=False,
                        source_platform="FB",
                    )

        self.assertEqual(events[:3], ["call1", "cleanup", "call2"])
        self.assertEqual(result["content_type"], "finance")
        self.assertIn("Pennylane", captured_call2["names"])
        self.assertIn("QuickBooks", captured_call2["names"])
        self.assertIn("Xero", captured_call2["names"])
        self.assertNotIn("Il en prend", captured_call2["names"])
        self.assertNotIn("pour", captured_call2["names"])
        self.assertNotIn("Ça fait", captured_call2["names"])


if __name__ == "__main__":
    unittest.main()
