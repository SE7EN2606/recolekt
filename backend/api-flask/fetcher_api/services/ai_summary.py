# fetcher_api/services/recipe_extractor.py

"""
Recipe extraction module:
- Calls Mistral with recipe-specific JSON schema prompt
- Guarantees ingredient emojis via post-processing
"""

import os
import json
import re
import logging
from typing import Dict
from mistralai import Mistral

logger = logging.getLogger(__name__)


class RecipeExtractor:
    def __init__(self):
        api_key = os.getenv("MISTRAL_API_KEY")
        if not api_key:
            raise ValueError("MISTRAL_API_KEY not found in environment")

        self.client = Mistral(api_key=api_key)
        self.model = "mistral-large-latest"

    def extract(self, transcript: str, caption: str, lang: str, classification: Dict) -> Dict:
        logger.info("🍳 Extracting recipe...")

        prompt = self._build_recipe_prompt(transcript, caption, lang)
        result = self._call_ai(prompt)

        if "recipe" not in result:
            logger.error("❌ AI did not return recipe structure")
            return self._fallback_result(caption, classification)

        self._validate_and_fix_quantities(result["recipe"])
        self._ensure_ingredient_emojis(result["recipe"])

        title = self._clean_title(result["recipe"]["english"].get("title", ""))

        return {
            "content_type": "recipe",
            "classification": classification,
            "recipe": result["recipe"],
            "category": result.get("category", "Cooking"),
            "topic": result.get("topic", "Recipe"),
            "title": title,
            "summary": result.get("summary", ""),
            "headlines": result.get("headlines", []),
            "hashtags": result.get("hashtags", []),
            "emojis": result.get("emojis", []),
            "workout": None
        }

    def _build_recipe_prompt(self, transcript: str, caption: str, lang: str) -> str:
        return f"""You are extracting a recipe from an Instagram video. Follow these rules.

===INPUT DATA===
TRANSCRIPT: {transcript[:3000]}
CAPTION: {caption[:3000]}
DETECTED LANGUAGE: {lang}

===MANDATORY RULES===
1. TITLE: 5-6 words, MAX 64 characters, straightforward (no marketing).
2. SUMMARY: Exactly 2 paragraphs, 250-400 characters total.
3. HEADLINES: 4 bullets, 8-15 words each, each starts with an emoji.
4. INGREDIENTS: Each ingredient object MUST include "emoji" (use "🔸" if unknown).

Return ONLY valid JSON:

{{
  "content_type": "recipe",
  "category": "Desserts",
  "topic": "Recipe",
  "summary": "Two paragraphs here...",
  "headlines": ["🍰 ...", "✨ ...", "⏱️ ...", "🍫 ..."],
  "hashtags": ["Baking"],
  "emojis": ["🍰"],
  "recipe": {{
    "language_code": "{lang}",
    "english": {{
      "title": "Six Word Recipe Title Here",
      "prep_time": "15 min",
      "cook_time": "40 min",
      "servings": "8 servings",
      "ingredients": [
        {{"quantity": "3", "item": "eggs", "notes": "", "emoji": "🥚"}}
      ],
      "steps": ["Step 1", "Step 2"],
      "tips": ["Tip 1"]
    }},
    "original": {{
      "title": "Original Title",
      "prep_time": "15 min",
      "cook_time": "40 min",
      "servings": "8 personnes",
      "ingredients": [
        {{"quantity": "3", "item": "œufs", "notes": "", "emoji": "🥚"}}
      ],
      "steps": ["Étape 1", "Étape 2"],
      "tips": ["Astuce 1"]
    }}
  }}
}}

Return ONLY JSON. No explanations."""

    def _call_ai(self, prompt: str, max_retries: int = 2) -> Dict:
        for attempt in range(max_retries + 1):
            try:
                response = self.client.chat.complete(
                    model=self.model,
                    messages=[
                        {"role": "system", "content": "You are a precise data extraction assistant. Output only valid JSON."},
                        {"role": "user", "content": prompt}
                    ],
                    response_format={"type": "json_object"},
                    temperature=0.1
                )
                content = response.choices[0].message.content
                return json.loads(content)
            except Exception as e:
                logger.error(f"❌ AI call failed (attempt {attempt + 1}): {e}")
                if attempt == max_retries:
                    raise
        raise ValueError("AI call failed after retries")

    def _validate_and_fix_quantities(self, recipe_data: Dict):
        eng_ingredients = recipe_data.get("english", {}).get("ingredients", [])
        orig_ingredients = recipe_data.get("original", {}).get("ingredients", [])

        if len(eng_ingredients) != len(orig_ingredients):
            logger.warning(f"⚠️ Ingredient count mismatch: {len(eng_ingredients)} vs {len(orig_ingredients)}")

        for i, (eng, orig) in enumerate(zip(eng_ingredients, orig_ingredients)):
            eng_qty = eng.get("quantity", "")
            orig_qty = orig.get("quantity", "")
            if eng_qty != orig_qty:
                orig["quantity"] = eng_qty

    def _ensure_ingredient_emojis(self, recipe_data: Dict):
        EMOJI_MAP = {
            'egg': '🥚', 'eggs': '🥚', 'egg white': '🥚', 'egg yolk': '🥚',
            'œuf': '🥚', 'œufs': '🥚', 'blanc': '🥚', 'blancs': '🥚', 'jaune': '🥚', 'jaunes': '🥚',
            'flour': '🌾', 'farine': '🌾',
            'sugar': '🍬', 'sucre': '🍬',
            'milk': '🥛', 'lait': '🥛', 'cream': '🥛', 'crème': '🥛', 'yogurt': '🥛', 'yaourt': '🥛',
            'butter': '🧈', 'beurre': '🧈',
            'oil': '🫒', 'huile': '🫒',
            'chocolate': '🍫', 'chocolat': '🍫', 'cocoa': '🍫', 'cacao': '🍫',
            'vanilla': '🌸', 'vanille': '🌸',
            'salt': '🧂', 'sel': '🧂',
            'baking powder': '⚗️', 'baking soda': '⚗️', 'levure': '⚗️', 'bicarbonate': '⚗️',
            'apple': '🍎', 'apples': '🍎', 'pomme': '🍎', 'pommes': '🍎',
            'mango': '🥭', 'mangue': '🥭',
            'coconut': '🥥', 'coco': '🥥', 'noix de coco': '🥥',
            'walnut': '🌰', 'walnuts': '🌰', 'noix': '🌰',
        }

        def get_emoji(item_name: str) -> str:
            if not item_name:
                return "🔸"
            item_lower = item_name.lower().strip()
            if item_lower in EMOJI_MAP:
                return EMOJI_MAP[item_lower]
            for key, emoji in EMOJI_MAP.items():
                if key in item_lower:
                    return emoji
            return "🔸"

        for lang in ["english", "original"]:
            if lang not in recipe_data:
                continue
            ingredients = recipe_data[lang].get("ingredients", [])
            for ing in ingredients:
                if not isinstance(ing, dict):
                    continue
                if "emoji" not in ing or not ing.get("emoji"):
                    ing["emoji"] = get_emoji(ing.get("item", ""))

    def _clean_title(self, title: str) -> str:
        if not title:
            return "Untitled"

        banned_hooks = [
            r"^saviez[- ]vous (qu'|que)?",
            r"^did you know",
            r"^voici comment",
            r"^here is how",
            r"^this (video|recipe|easy)",
            r"^learn (how )?to",
            r"^comment (faire|réaliser)",
        ]

        clean = title.strip()
        clean = re.sub(r'^[\W_]+', '', clean)
        for hook in banned_hooks:
            clean = re.sub(hook, "", clean, flags=re.IGNORECASE).strip()
        clean = re.sub(r'^[\W_]+', '', clean)
        if clean and len(clean) > 3:
            return clean[0].upper() + clean[1:]
        return title

    def _fallback_result(self, caption: str, classification: Dict) -> Dict:
        title = (caption.split('\n')[0][:50] if caption else "Saved Video").strip()
        title = self._clean_title(title)
        return {
            "content_type": "recipe",
            "classification": classification,
            "category": "Cooking",
            "topic": "Recipe",
            "title": title,
            "summary": caption[:200] if caption else "",
            "headlines": [],
            "hashtags": [],
            "emojis": [],
            "recipe": None,
            "workout": None
        }
