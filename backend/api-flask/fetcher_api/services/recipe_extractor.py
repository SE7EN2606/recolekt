import os
import json
import re
import logging
import unicodedata
from typing import Dict, List, Any, Optional, Tuple

from mistralai import Mistral

from fetcher_api.services.emoji_mapper import infer_ingredient_emoji

logger = logging.getLogger(__name__)

RECIPE_EXTRACTOR_VERSION = "recipe-v13-analytical-summary-unit-fix"


def _is_english(lang: str) -> bool:
    l = (lang or "").strip().lower()
    return l in {"en", "eng", "english"}


def _safe_list(v) -> List:
    return v if isinstance(v, list) else []


def _safe_str(v) -> str:
    return v if isinstance(v, str) else ("" if v is None else str(v))


def _unique_keep_order(items: List[str]) -> List[str]:
    seen = set()
    out = []
    for x in items:
        if x not in seen:
            seen.add(x)
            out.append(x)
    return out


def _trim_emojis(emojis: List[str], max_n: int = 4) -> List[str]:
    cleaned = [e for e in emojis if isinstance(e, str) and e.strip()]
    cleaned = _unique_keep_order(cleaned)
    return cleaned[:max_n]


def _clean_title(title: str) -> str:
    title = (title or "").strip()
    title = re.sub(r"\s+", " ", title)
    if not title:
        return ""
    if len(title) > 90:
        title = title[:90].rsplit(" ", 1)[0]
    return title.strip()


def _strip_emoji_from_text(text: str) -> str:
    """Remove all emoji characters from text"""
    emoji_pattern = re.compile(
        "["
        "\U0001F1E0-\U0001F1FF"
        "\U0001F300-\U0001F5FF"
        "\U0001F600-\U0001F64F"
        "\U0001F680-\U0001F6FF"
        "\U0001F700-\U0001F77F"
        "\U0001F780-\U0001F7FF"
        "\U0001F800-\U0001F8FF"
        "\U0001F900-\U0001F9FF"
        "\U0001FA00-\U0001FA6F"
        "\U0001FA70-\U0001FAFF"
        "\U00002702-\U000027B0"
        "\U000024C2-\U0001F251"
        "]+",
        flags=re.UNICODE
    )
    return emoji_pattern.sub('', text).strip()


def _extract_ingredients_lines(caption: str) -> List[str]:
    lines = [ln.strip() for ln in (caption or "").splitlines()]
    if not lines:
        return []

    start = None
    for i, ln in enumerate(lines):
        if re.search(r"\b(ingr|준비|재료)", ln.lower()):
            start = i
            break
    if start is None:
        return []

    out: List[str] = []
    for ln in lines[start + 1 :]:
        if not ln:
            continue
        low = ln.lower()
        if ln.startswith("#"):
            break
        if low.startswith(("partenariat", "partnership", "bon app", "bon appetit", "bon appétit", "팔로우", "저장")):
            break
        if ln.startswith(("👉", "🔗", "@")):
            break
        if ln.endswith(":"):
            continue

        if re.match(r"^\s*(\d+(?:[.,]\d+)?|\d+\s*/\s*\d+)\b", ln):
            out.append(ln)

    return out


def _parse_qty_unit_name(line: str) -> Optional[Dict[str, str]]:
    raw = (line or "").strip()
    if not raw:
        return None

    m = re.match(r"^\s*(\d+(?:[.,]\d+)?|\d+\s*/\s*\d+)\s+(.*)$", raw)
    if not m:
        return None

    qty = m.group(1).replace(" ", "")
    rest = m.group(2).strip()

    unit_candidates = [
        "c. à soupe", "c. a soupe", "c.à.s", "c a s", "큰술", "큰", "tbsp",
        "c. à café", "c. a cafe", "c.à.c", "c a c", "작은술", "tsp",
        "cuillère à soupe", "cuillere a soupe",
        "cuillère à café", "cuillere a cafe",
        "tablespoon", "teaspoon",
        "pincée", "pincee", "pinch",
    ]

    unit = ""
    name = rest
    rest_low = rest.lower()

    for u in unit_candidates:
        if rest_low.startswith(u):
            unit = rest[: len(u)]
            name = rest[len(u) :].strip()
            break

    if not unit:
        tokens = rest.split()
        if tokens:
            t0 = tokens[0]
            if re.match(r"^(g|kg|mg|ml|cl|l|gr|개|캔|cup|cups|oz|lb|lbs)$", t0.lower()):
                unit = t0
                name = " ".join(tokens[1:]).strip()
            else:
                unit = ""
                name = rest

    name = re.sub(r"^(de|d'|d'|du|des|of|the)\s+", "", name, flags=re.IGNORECASE).strip()
    name = re.sub(r"^(d'|d')\s*", "", name, flags=re.IGNORECASE).strip()

    if not name:
        return None

    return {"quantity": qty, "unit": unit, "name": name}


def _build_ingredients_from_caption(caption: str) -> List[Dict[str, str]]:
    lines = _extract_ingredients_lines(caption)
    out: List[Dict[str, str]] = []

    for ln in lines:
        parsed = _parse_qty_unit_name(ln)
        if not parsed:
            continue
        
        item_name = _strip_emoji_from_text(parsed["name"])
        emoji = infer_ingredient_emoji(item_name)
        
        out.append(
            {
                "item": item_name,
                "name": item_name,
                "quantity": parsed["quantity"],
                "unit": parsed["unit"],
                "emoji": emoji,
            }
        )

    return out


def _normalize_ingredients_list(ings: Any) -> List[Dict[str, str]]:
    if not isinstance(ings, list):
        return []

    out: List[Dict[str, str]] = []
    for ing in ings:
        if isinstance(ing, str):
            body = _strip_emoji_from_text(ing)
            emoji = infer_ingredient_emoji(body)
            
            out.append(
                {
                    "item": body,
                    "name": body,
                    "quantity": "",
                    "unit": "",
                    "emoji": emoji,
                }
            )
            continue

        if isinstance(ing, dict):
            item = _safe_str(ing.get("item") or ing.get("name") or ing.get("ingredient") or "")
            qty = _safe_str(ing.get("quantity") or "")
            unit = _safe_str(ing.get("unit") or "")
            emoji_from_model = _safe_str(ing.get("emoji") or "")

            item_clean = _strip_emoji_from_text(item)
            qty_clean = _strip_emoji_from_text(qty)
            unit_clean = _strip_emoji_from_text(unit)

            emoji = emoji_from_model or infer_ingredient_emoji(item_clean)

            out.append({
                "item": item_clean,
                "name": item_clean,
                "quantity": qty_clean,
                "unit": unit_clean,
                "emoji": emoji
            })
            continue

    return out


def _ingredients_look_empty(ings: List[Dict[str, str]]) -> bool:
    if not isinstance(ings, list) or not ings:
        return True

    non_empty = 0
    for ing in ings:
        if not isinstance(ing, dict):
            continue
        item = (ing.get("item") or "").strip()
        qty = (ing.get("quantity") or "").strip()
        if item:
            non_empty += 1
        elif qty:
            non_empty += 1

    return non_empty < 3


def _clean_headline(text: str) -> str:
    text = (text or "").strip()
    text = re.sub(r"^[•·●○◦▪▫]\s*", "", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


class RecipeExtractor:
    def __init__(self):
        api_key = os.getenv("MISTRAL_API_KEY")
        if not api_key:
            raise ValueError("MISTRAL_API_KEY not found in environment")
        self.client = Mistral(api_key=api_key)
        self.model = "mistral-large-latest"

    def extract(self, transcript: str, caption: str, lang: str, classification: Dict) -> Dict:
        transcript = transcript or ""
        caption = caption or ""
        lang = lang or "en"

        prompt = self._build_recipe_prompt(transcript, caption, lang)
        result = self._call_ai(prompt)

        emojis = _trim_emojis(_safe_list(result.get("emojis", [])), 4)
        if len(emojis) < 4:
            emojis = (emojis + ["🍰", "🔥", "🥄", "🍫"])[:4]

        hashtags = _safe_list(result.get("hashtags", []))
        hashtags = [str(t).lstrip("#").strip() for t in hashtags if str(t).strip()]

        headlines_en = _safe_list(result.get("headlines", []))
        headlines_en = [_clean_headline(h) for h in headlines_en if isinstance(h, str) and h.strip()]
        while len(headlines_en) < 4:
            headlines_en.append("✨ Clear, step-by-step recipe")
        headlines_en = headlines_en[:4]

        title_en = _clean_title(_safe_str(result.get("title", "")))
        caption_first_line = (caption.split("\n")[0] if caption else "").strip()
        if not title_en or title_en.lower() == "untitled":
            title_en = _clean_title(caption_first_line) or "Saved Recipe"

        summary_en = _safe_str(result.get("summary", "")).strip()
        if not summary_en or len(summary_en) < 50:
            summary_en = f"{title_en} featuring simple ingredients and straightforward preparation."
        
        if len(summary_en) > 400:
            summary_en = summary_en[:397] + "..."
        elif len(summary_en) < 250:
            summary_en = summary_en + " Traditional technique with accessible ingredients for home cooks."

        if _is_english(lang):
            title_og = title_en
            summary_og = summary_en
            headlines_og = headlines_en
        else:
            title_og = self._translate_text(title_en, lang, keep_length=True)
            summary_og = self._translate_text(summary_en, lang, keep_length=True)
            headlines_og = self._translate_list(headlines_en, lang)
            headlines_og = [_clean_headline(h) for h in headlines_og if isinstance(h, str) and h.strip()]
            while len(headlines_og) < 4:
                headlines_og.append("✨ 명확하고 쉬운 레시피")
            headlines_og = headlines_og[:4]

        recipe_obj = result.get("recipe", {})
        if not isinstance(recipe_obj, dict):
            recipe_obj = {}

        model_ingredients = _normalize_ingredients_list(recipe_obj.get("ingredients", []))
        model_instructions = recipe_obj.get("instructions", [])
        if not isinstance(model_instructions, list):
            model_instructions = []

        caption_ingredients = _build_ingredients_from_caption(caption)
        if _ingredients_look_empty(model_ingredients) and caption_ingredients:
            ingredients_original = caption_ingredients
        else:
            ingredients_original = model_ingredients

        if _is_english(lang):
            ingredients_english = ingredients_original
        else:
            names = [ing.get("item", "") for ing in ingredients_original]
            translated = self._translate_list(names, "en")
            ingredients_english = []
            for i, ing in enumerate(ingredients_original):
                item_en = translated[i] if i < len(translated) else _safe_str(ing.get("item", ""))
                emoji = infer_ingredient_emoji(item_en)
                ingredients_english.append(
                    {
                        "item": item_en,
                        "name": item_en,
                        "quantity": _safe_str(ing.get("quantity", "")),
                        "unit": _safe_str(ing.get("unit", "")),
                        "emoji": emoji,
                    }
                )

        recipe = {
            "english": {
                "title": title_en,
                "ingredients": ingredients_english,
                "instructions": model_instructions,
                "tips": _safe_list(recipe_obj.get("tips", [])),
                "notes": _safe_list(recipe_obj.get("notes", [])),
            },
            "original": {
                "title": title_og,
                "ingredients": ingredients_original,
                "instructions": model_instructions if _is_english(lang) else self._translate_list(model_instructions, lang),
                "tips": _safe_list(recipe_obj.get("tips", [])),
                "notes": _safe_list(recipe_obj.get("notes", [])),
            },
        }

        bilingual_summary = {
            "english": {
                "title": title_en,
                "summary": summary_en,
                "headlines": headlines_en,
                "hashtags": hashtags,
                "emojis": emojis
            },
            "original": {
                "title": title_og,
                "summary": summary_og,
                "headlines": headlines_og,
                "hashtags": hashtags,
                "emojis": emojis
            },
        }

        recipe_json = json.dumps(recipe, ensure_ascii=False)

        return {
            "content_type": "recipe",
            "extractor_version": RECIPE_EXTRACTOR_VERSION,
            "category": _safe_str(result.get("category", "Food")).strip() or "Food",
            "topic": _safe_str(result.get("topic", "Cooking")).strip() or "Cooking",
            "title": title_en,
            "summary_title": title_en,
            "summary_text": bilingual_summary,
            "summary_bullets": json.dumps(headlines_en, ensure_ascii=False),
            "summary_hashtags": hashtags,
            "summary_emojis": emojis,
            "recipe": recipe_json,
            "headlines": headlines_en,
            "hashtags": hashtags,
            "emojis": emojis,
            "workout": None,
        }

    def _build_recipe_prompt(self, transcript: str, caption: str, lang: str) -> str:
        return f"""Analyze this recipe content and extract structured data. Output ONLY valid JSON.

ORIGINAL_LANGUAGE: {lang}

TRANSCRIPT:
{transcript[:3500]}

CAPTION:
{caption[:6000]}

EXTRACTION RULES:

1. **category**: English category (e.g., "Appetizer", "Main Course", "Dessert", "Side Dish")

2. **topic**: English topic (e.g., "Korean Egg Kimbap", "Curry-Spiced Roll")

3. **title**: English, descriptive, <= 90 characters, NEVER "Untitled"

4. **summary**: Direct analytical description for quick recall
   - 250-400 characters (1-2 sentences max)
   - State facts directly - NO introductory phrases
   - NEVER start with: "This recipe", "This post", "This demonstrates", "Learn how"
   - NO emojis, NO promotional language
   - Format: [Technique/dish] + [key ingredients] + [method/result]
   
   CORRECT FORMAT:
   "Korean egg roll with curry-spiced eggs and butter-seasoned rice wrapped in seaweed. The curry powder adds aromatic depth while soy sauce and sesame oil provide umami richness."
   
   "Braised potatoes with spam in soy-based sauce, finished with oligosaccharide for glossy coating. Traditional Korean side dish technique."
   
   "Grated potatoes piped into hot oil and fried until crispy-chewy texture achieved. Vienna sausage filling provides savory contrast."
   
   WRONG (DO NOT USE):
   "This recipe demonstrates a Korean-style egg roll technique using curry powder."
   "This post shows you how to make delicious braised potatoes."

5. **headlines**: array of EXACTLY 4 strings
   - Format: "EMOJI SPACE Description"
   - NO bullet points (•, -, *)
   - Example: "🍳 Curry-spiced eggs for aromatic flavor"

6. **hashtags**: 5-10 keywords WITHOUT '#'

7. **emojis**: 4 emojis

8. **recipe** object:
   - **ingredients**: array of objects with:
     - "item": ingredient name (NO emojis, clean text)
     - "quantity": amount (e.g., "6", "1.5", "10")
     - "unit": measurement unit (e.g., "g", "tbsp", "cups", "pinch")
   - **instructions**: 6-12 clear steps
   - **tips**: optional
   - **notes**: optional

INGREDIENT FORMAT EXAMPLES:
{{"item": "eggs", "quantity": "6", "unit": ""}}
{{"item": "butter", "quantity": "10", "unit": "g"}}
{{"item": "curry powder", "quantity": "1", "unit": "tbsp"}}
{{"item": "salt", "quantity": "1", "unit": "pinch"}}

Return JSON: category, topic, title, summary, headlines, hashtags, emojis, recipe
"""

    def _call_ai(self, prompt: str, max_retries: int = 2) -> Dict:
        last_err: Optional[Exception] = None
        for attempt in range(max_retries + 1):
            try:
                response = self.client.chat.complete(
                    model=self.model,
                    messages=[
                        {"role": "system", "content": "You are a recipe analysis expert. Output only valid JSON. Write analytical summaries without emojis or promotional language. Be precise with ingredient quantities and units."},
                        {"role": "user", "content": prompt},
                    ],
                    response_format={"type": "json_object"},
                    temperature=0.1,
                )
                content = response.choices[0].message.content
                return json.loads(content)
            except Exception as e:
                last_err = e
                logger.error("❌ JSON parse failed (attempt %s): %s", attempt + 1, e)
                if attempt == max_retries:
                    raise
        raise ValueError(f"AI call failed after retries: {last_err}")

    def _translate_text(self, text: str, target_lang: str, keep_length: bool = False) -> str:
        if not text.strip():
            return ""

        extra = "Keep roughly similar length.\n" if keep_length else ""
        prompt = f"""Translate into {target_lang}. {extra}Output ONLY valid JSON.

Return JSON: {{ "text": "..." }}

TEXT:
{text}
"""

        response = self.client.chat.complete(
            model=self.model,
            messages=[
                {"role": "system", "content": "You output only valid JSON."},
                {"role": "user", "content": prompt},
            ],
            response_format={"type": "json_object"},
            temperature=0.1,
        )

        data = json.loads(response.choices[0].message.content)
        return _safe_str(data.get("text", "")).strip()

    def _translate_list(self, items: List[str], target_lang: str) -> List[str]:
        if not items:
            return []

        prompt = f"""Translate each item into {target_lang}. Keep emoji at start if present. NO bullet points. Output ONLY valid JSON.

Return JSON: {{ "items": ["...", "..."] }}

ITEMS:
{json.dumps(items, ensure_ascii=False)}
"""

        response = self.client.chat.complete(
            model=self.model,
            messages=[
                {"role": "system", "content": "You output only valid JSON. Never add bullets."},
                {"role": "user", "content": prompt},
            ],
            response_format={"type": "json_object"},
            temperature=0.1,
        )

        data = json.loads(response.choices[0].message.content)
        out = _safe_list(data.get("items", []))
        return [_clean_headline(x) for x in out if isinstance(x, str) and x.strip()]
