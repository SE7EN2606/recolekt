import os
import unittest
from unittest.mock import patch

os.environ.setdefault("MISTRAL_API_KEY", "test-key")

from fetcher_api.services.universal_extractor import UniversalExtractor


class FinanceCall1CleanupTest(unittest.TestCase):
    def test_finance_like_content_stays_general_and_skips_tools_assembly(self):
        extractor = UniversalExtractor()
        events = []

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

        def fake_call2(parsed, caption):
            events.append("call2")
            return {
                "summary_en": "General summary.",
                "summary_original": "General summary.",
                "title_original": "Finance tools",
                "headlines_en": [],
                "headlines_og": [],
            }

        with patch.object(extractor, "_call_ai", side_effect=fake_call_ai):
            with patch.object(extractor, "_call2_english", side_effect=fake_call2):
                with patch.object(extractor, "_call2_bilingual", side_effect=AssertionError("Call 2 bilingual must not run")):
                    with patch("fetcher_api.services.extractor_assembly.build_tools_list", side_effect=AssertionError("tools_list assembly must not run")):
                        result = extractor.extract(
                            transcript=(
                                "Pennylane 1. QuickBooks 2. Xero 3. "
                                "This finance stack is for comparing accounting tools and bookkeeping apps."
                            ),
                            caption="Top finance and accounting tools for small businesses.",
                            lang="en",
                            classification={"label": "general", "score": 0.95, "signals": {"tool_kw": 3}},
                            video_path=None,
                            duration_seconds=30,
                            is_silent=False,
                            source_platform="FB",
                        )

        self.assertEqual(events, ["call1", "call2"])
        self.assertEqual(result["content_type"], "general")
        self.assertIsNone(result["tools_list"])
        self.assertEqual(result["summary"]["english"]["summary"], "General summary.")

    def test_recipe_path_still_uses_call2(self):
        extractor = UniversalExtractor()
        events = []

        call1_response = {
            "title": "Simple pasta",
            "category": "Recipe",
            "topic": "Dinner",
            "brief_description": "A quick pasta recipe.",
            "recipe": {
                "english": {
                    "title": "Simple pasta",
                    "ingredients": [],
                    "instructions": [],
                }
            },
        }

        def fake_call_ai(*args, **kwargs):
            events.append("call1")
            return call1_response

        def fake_call2(parsed, caption):
            events.append("call2")
            return {
                "summary_en": "Recipe summary.",
                "summary_original": "Recipe summary.",
                "title_original": "Simple pasta",
                "headlines_en": [],
                "headlines_og": [],
            }

        with patch.object(extractor, "_call_ai", side_effect=fake_call_ai):
            with patch.object(extractor, "_call2_english", side_effect=fake_call2):
                with patch.object(extractor, "_call2_bilingual", side_effect=fake_call2):
                    result = extractor.extract(
                        transcript=(
                            "Boil pasta until tender, then add sauce, cheese, herbs, and a final drizzle. "
                            "Finish in the pan and serve warm."
                        ),
                        caption="Quick pasta dinner with tomato sauce, basil, and parmesan for a fast weeknight meal.",
                        lang="en",
                        classification={"label": "recipe", "score": 0.98},
                        video_path=None,
                        duration_seconds=30,
                        is_silent=False,
                        source_platform="FB",
                    )

        self.assertEqual(events, ["call1", "call2"])
        self.assertEqual(result["content_type"], "recipe")
        self.assertIsNone(result["tools_list"])
        self.assertTrue(result["summary"]["english"]["summary"])


if __name__ == "__main__":
    unittest.main()
