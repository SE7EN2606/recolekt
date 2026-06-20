import unittest
from unittest.mock import patch

from fetcher_api.services.universal_extractor import UniversalExtractor


class FinanceCall1CleanupTest(unittest.TestCase):
    def test_finance_structured_list_skips_call2_and_recipes_still_use_call2(self):
        finance_extractor = UniversalExtractor()
        finance_events = []

        finance_call1_response = {
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

        def fake_finance_call_ai(*args, **kwargs):
            finance_events.append("call1")
            return finance_call1_response

        def fail_finance_call2(*args, **kwargs):
            finance_events.append("call2")
            raise AssertionError("Call 2 must not run for structured finance reels")

        with patch.object(finance_extractor, "_call_ai", side_effect=fake_finance_call_ai):
            with patch.object(finance_extractor, "_call2_english", side_effect=fail_finance_call2):
                with patch.object(finance_extractor, "_call2_bilingual", side_effect=fail_finance_call2):
                    finance_result = finance_extractor.extract(
                        transcript="Pennylane 1. QuickBooks 2. Xero 3.",
                        caption="Top finance and accounting tools for small businesses.",
                        lang="en",
                        classification={"label": "finance", "score": 0.95, "signals": {"tool_kw": 3}},
                        video_path=None,
                        duration_seconds=30,
                        is_silent=False,
                        source_platform="FB",
                    )

        self.assertEqual(finance_events, ["call1"])
        self.assertEqual(finance_result["content_type"], "finance")
        self.assertEqual(finance_result["detected_language"], "en")
        self.assertTrue(finance_result["summary"]["english"]["summary"])
        self.assertTrue(finance_result["tools_list"])
        self.assertEqual(finance_result["tools_list"]["en"]["categories"][0]["items"][0]["name"], "Pennylane")

        recipe_extractor = UniversalExtractor()
        recipe_events = []

        recipe_call1_response = {
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

        def fake_recipe_call_ai(*args, **kwargs):
            recipe_events.append("call1")
            return recipe_call1_response

        def fake_recipe_call2(parsed, caption):
            recipe_events.append("call2")
            return {
                "summary_en": "Recipe summary.",
                "summary_original": "Recipe summary.",
                "title_original": "Simple pasta",
                "headlines_en": [],
                "headlines_og": [],
            }

        with patch.object(recipe_extractor, "_call_ai", side_effect=fake_recipe_call_ai):
            with patch.object(recipe_extractor, "_call2_english", side_effect=fake_recipe_call2):
                with patch.object(recipe_extractor, "_call2_bilingual", side_effect=fake_recipe_call2):
                    recipe_result = recipe_extractor.extract(
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

        self.assertEqual(recipe_events, ["call1", "call2"])
        self.assertEqual(recipe_result["content_type"], "recipe")
        self.assertTrue(recipe_result["summary"]["english"]["summary"])


if __name__ == "__main__":
    unittest.main()
