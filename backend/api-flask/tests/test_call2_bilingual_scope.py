import json
import unittest

from fetcher_api.services.extractor_call2 import Call2Mixin
from fetcher_api.services.extractor_assembly import AssemblyMixin


class DummyCall2(Call2Mixin):
    def __init__(self, response):
        self.response = response
        self.prompts = []

    def _call_ai(self, prompt: str, call_type: str = "summary"):
        self.prompts.append(prompt)
        return dict(self.response)

    def fallback_summary(self, title: str, content_type: str) -> str:
        return f"{title} fallback"


class DummyAssembly(AssemblyMixin):
    EXTRACTOR_VERSION = "test"


def output_json_template(prompt: str) -> dict:
    marker = "Output ONLY valid JSON:\n"
    template = prompt.split(marker, 1)[1]
    return json.loads(template)


class Call2BilingualScopeTest(unittest.TestCase):
    def test_italian_recipe_prompt_requests_english_translation(self):
        call2 = DummyCall2({
            "summary_original": "Pasta veloce.\n\nPronta in pochi minuti.",
            "summary_en": "Fast pasta.\n\nReady in minutes.",
            "title_original": "Pasta al pomodoro",
            "headlines": [{"headline": "Veloce", "description": "Cena semplice"}],
            "translated_recipe_en": {
                "title": "Tomato pasta",
                "ingredients": [{"item": "pasta"}],
                "instructions": ["Cook the pasta."],
            },
        })

        out = call2._call2_bilingual(
            {
                "title": "Pasta al pomodoro",
                "category": "recipe",
                "content_type": "recipe",
                "highlights": [{"headline": "Veloce", "description": "Cena semplice"}],
                "recipe": {
                    "title": "Pasta al pomodoro",
                    "ingredients": [{"item": "pasta"}],
                    "instructions": ["Cuoci la pasta."],
                },
            },
            "",
            "it",
        )

        self.assertIn("recipe_original", call2.prompts[0])
        self.assertIn("Translate this recipe from it into natural English", call2.prompts[0])
        self.assertIn("translated_recipe_en", call2.prompts[0])
        self.assertIn("recipe_en", out)
        self.assertNotIn("recipe_og", out)
        self.assertEqual(out["recipe_en"]["title"], "Tomato pasta")
        self.assertIn("translated_recipe_en", output_json_template(call2.prompts[0]))

    def test_non_english_workout_includes_translated_workout_en(self):
        call2 = DummyCall2({
            "summary_original": "Allenamento breve.\n\nServe un manubrio.",
            "summary_en": "Short workout.\n\nUses a dumbbell.",
            "title_original": "Circuito breve",
            "headlines": [{"headline": "Circuito", "description": "Tre movimenti"}],
            "translated_workout_en": {
                "title": "Short circuit",
                "exercises": [{"name": "squat"}],
            },
        })

        out = call2._call2_bilingual(
            {
                "title": "Short circuit",
                "category": "workout",
                "content_type": "workout",
                "highlights": [{"headline": "Circuit", "description": "Three moves"}],
                "workout": {"title": "Short circuit", "exercises": [{"name": "squat"}]},
            },
            "",
            "it",
        )

        self.assertIn("workout_original", call2.prompts[0])
        self.assertIn("translated_workout_en", call2.prompts[0])
        self.assertIn("workout_en", out)
        self.assertNotIn("workout_og", out)
        self.assertIn("translated_workout_en", output_json_template(call2.prompts[0]))

    def test_non_english_without_recipe_or_workout_has_valid_prompt_json_shape(self):
        call2 = DummyCall2({
            "summary_original": "Consiglio pratico.\n\nFacile da riusare.",
            "summary_en": "Practical tip.\n\nEasy to reuse.",
            "title_original": "Consiglio",
            "headlines": [{"headline": "Idea", "description": "Sintesi"}],
        })

        out = call2._call2_bilingual(
            {
                "title": "Tip",
                "category": "general",
                "content_type": "general",
                "highlights": [{"headline": "Idea", "description": "Summary"}],
            },
            "",
            "it",
        )

        template = output_json_template(call2.prompts[0])
        self.assertNotIn("translated_recipe_en", template)
        self.assertNotIn("translated_workout_en", template)
        self.assertNotIn("recipe_og", out)
        self.assertNotIn("workout_og", out)

    def test_assembly_places_english_translation_and_original_recipe_correctly(self):
        final = DummyAssembly()._assemble_output(
            parsed={
                "title": "Pasta al pomodoro",
                "category": "recipe",
                "topic": "",
                "hashtags": [],
                "emojis": [],
                "recipe": {
                    "title": "Pasta al pomodoro",
                    "ingredients": [{"item": "pomodori"}],
                    "instructions": ["Cuoci la pasta."],
                },
            },
            summary_result={
                "summary_en": "Tomato pasta.\n\nReady quickly.",
                "summary_original": "Pasta al pomodoro.\n\nPronta velocemente.",
                "title_original": "Pasta al pomodoro",
                "headlines_en": [],
                "headlines_og": [],
                "recipe_en": {
                    "title": "Tomato pasta",
                    "ingredients": [{"item": "tomatoes"}],
                    "instructions": ["Cook the pasta."],
                },
            },
            content_type="recipe",
            lang="it",
            is_english_content=False,
        )

        self.assertEqual(final["recipe"]["english"]["title"], "Tomato pasta")
        self.assertEqual(final["recipe"]["english"]["ingredients"][0]["item"], "tomatoes")
        self.assertEqual(final["recipe"]["original"]["title"], "Pasta al pomodoro")
        self.assertEqual(final["recipe"]["original"]["ingredients"][0]["item"], "pomodori")

    def test_assembly_missing_english_translation_does_not_copy_original(self):
        final = DummyAssembly()._assemble_output(
            parsed={
                "title": "Pasta al pomodoro",
                "category": "recipe",
                "topic": "",
                "hashtags": [],
                "emojis": [],
                "recipe": {
                    "title": "Pasta al pomodoro",
                    "ingredients": [{"item": "pomodori"}],
                    "instructions": ["Cuoci la pasta."],
                },
            },
            summary_result={
                "summary_en": "Tomato pasta.\n\nReady quickly.",
                "summary_original": "Pasta al pomodoro.\n\nPronta velocemente.",
                "title_original": "Pasta al pomodoro",
                "headlines_en": [],
                "headlines_og": [],
            },
            content_type="recipe",
            lang="it",
            is_english_content=False,
        )

        self.assertNotIn("english", final["recipe"])
        self.assertEqual(final["recipe"]["original"]["ingredients"][0]["item"], "pomodori")


if __name__ == "__main__":
    unittest.main()
