"""
All Mistral AI prompts for the Universal Extractor.
Separated from business logic for maintainability.
"""

import json
import re
from typing import List, Optional

from fetcher_api.services.extractor_helpers import TITLE_MAX_CHARS

# ── Summary length constants (shared with universal_extractor.py) ──
SUMMARY_MIN_CHARS = 200
SUMMARY_MAX_CHARS_SOFT = 400
SUMMARY_HARD_MAX = 450

# ── System message (used for every AI call) ──
SYSTEM_MESSAGE = (
    "You are a content analysis expert. Generate ORIGINAL text. "
    "NEVER copy from input. Output only valid JSON. "
    "CRITICAL: Never start summaries with 'This content', 'This video', 'This recipe', "
    "'Ce contenu', 'Cette vidéo', or any similar 'This/That + noun' pattern. "
    "Always start directly with the subject itself."
)

# ── Banned opener instructions (reused in both summary prompts) ──
_BANNED_OPENER_BLOCK = """
ABSOLUTE RULES FOR THE OPENING:
- The very first words MUST name the subject directly.
- NEVER start with any of these patterns (in any language):
  English: "This content...", "This video...", "This recipe...", "Here is...", "The content..."
  French: "Ce contenu...", "Cette vidéo...", "Cette recette...", "Voici..."
  Spanish: "Este contenido...", "Este video...", "Esta receta..."
  German: "Dieses Video...", "Dieser Inhalt...", "Dieses Rezept..."
  Italian: "Questo contenuto...", "Questo video...", "Questa ricetta..."
  (same rule applies for ALL languages — never open with "this/that + generic noun")
- Instead, start DIRECTLY with the subject:
  EN GOOD: "A creamy honey-mustard sauce with a steakhouse twist..."
  FR GOOD: "Une sauce miel-moutarde crémeuse façon steakhouse..."
  EN BAD: "This content presents a low-calorie sauce recipe..."
  FR BAD: "Ce contenu présente une recette de sauce..."
"""

# ── Category instructions (reused in bookmark + data extraction prompts) ──
_CATEGORY_BLOCK = """Pick a precise 1-2 word category that captures the SPECIFIC niche of this content.
   RULES:
   - Be SPECIFIC. Think "what shelf in a bookstore would this go on?"
   - NEVER use vague categories: "General", "Other", "Misc", "Content", "Entertainment", "Tips", "Tutorial", "Lifestyle", "Video", "Guide"
   - NEVER use compound categories with "&" or "and": "Food & Drink", "Health & Wellness", "Beauty & Fashion" — pick the more specific side.
   - GOOD (specific): "Healthy Cooking", "Pastry", "Skincare", "Street Food", "HIIT Training", "Budget Travel", "Gardening", "Cocktails", "Interior Design", "Dog Training", "Crochet", "Meal Prep", "Korean BBQ", "Nail Art", "Rock Climbing"
   - BAD (too vague): "Food", "Health", "Beauty", "Fitness", "Home"
   - The category should help a user instantly understand what TYPE of content this is."""

# ── Language name mapping ──
LANG_NAME_MAP = {
    "fr": "French", "es": "Spanish", "de": "German", "it": "Italian",
    "pt": "Portuguese", "ar": "Arabic", "ru": "Russian", "ja": "Japanese",
    "zh": "Chinese", "ko": "Korean", "nl": "Dutch", "pl": "Polish",
    "sv": "Swedish", "da": "Danish", "tr": "Turkish", "th": "Thai",
    "vi": "Vietnamese", "hi": "Hindi",
}


def get_lang_name(lang_code: str) -> str:
    return LANG_NAME_MAP.get(lang_code, lang_code.upper())


def extract_caption_context(caption: str) -> dict:
    if not caption or not caption.strip():
        return {}

    ctx = {}
    mentions = re.findall(r"@([\w.]+)", caption)
    if mentions:
        ctx["mentions"] = mentions

    tags = re.findall(r"#(\w+)", caption)
    if tags:
        ctx["hashtags"] = tags

    urls = re.findall(r"https?://[^\s]+", caption)
    if urls:
        ctx["urls"] = urls

    cap_lower = caption.lower()
    sponsor_signals = [
        "collaboration commerciale", "sponsored", "partenariat",
        "paid partnership", "gifted", "publicité", "annonce",
    ]
    if any(s in cap_lower for s in sponsor_signals):
        ctx["is_sponsored"] = True

    return ctx


def build_context_block(caption: str, transcript: str) -> str:
    ctx = extract_caption_context(caption)
    if not ctx:
        return ""

    lines = ["CONTEXT (extracted from caption — use this to interpret the transcript correctly):"]

    if ctx.get("mentions"):
        mention_strs = []
        for m in ctx["mentions"]:
            mention_strs.append(f"@{m}")
        lines.append(f"  Accounts mentioned: {', '.join(mention_strs)}")
        lines.append(f"  → These are likely the brands, tools, or people featured in the video.")

    if ctx.get("hashtags"):
        lines.append(f"  Creator hashtags: {', '.join('#' + t for t in ctx['hashtags'])}")

    if ctx.get("urls"):
        lines.append(f"  Links: {', '.join(ctx['urls'])}")

    if ctx.get("is_sponsored"):
        lines.append(f"  ⚠️ This is a SPONSORED post. The creator is promoting a product/service/brand.")
        lines.append(f"  → The title and summary MUST mention what is being promoted.")

    lines.append("")
    lines.append("IMPORTANT: The transcript is auto-generated speech-to-text and often MISSPELLS")
    lines.append("brand names, websites, and proper nouns. Use the accounts/hashtags above to")
    lines.append("CORRECT mangled names in the transcript. Examples of common transcript errors:")
    lines.append('  "hébergeant sh" or "émergent point s h" → likely "Emergent.sh" (from @emergentlabs)')
    lines.append('  "chat gpt" or "tchat ji pi ti" → "ChatGPT"')
    lines.append('  "tik tok" → "TikTok"')
    lines.append("")

    return "\n".join(lines)


def build_bookmark_prompt(caption: str, lang: str) -> str:
    return f"""The following text is extremely short. Generate basic metadata to categorize it as a bookmark. Output ONLY valid JSON.

LANGUAGE: {lang}
CAPTION: {caption}

EXTRACT:
1. **category**: {_CATEGORY_BLOCK}

2. **topic**: 2-3 word topic.
3. **title**: A short, sensible title (max 40 chars).
4. **hashtags**: Up to 5 relevant keywords without '#'.
5. **emojis**: array of 2 relevant emojis.

CRITICAL: Do not invent detailed facts or hallucinate a summary. Output JSON only.
"""


def build_data_extraction_prompt(
    transcript: str, caption: str, lang: str, content_type: str
) -> str:
    context_block = build_context_block(caption, transcript)

    input_sections = []
    if context_block:
        input_sections.append(context_block)
    if transcript.strip():
        input_sections.append(f"TRANSCRIPT (what was said in the video):\n{transcript[:3500]}")
    if caption.strip():
        input_sections.append(f"CAPTION (written by the creator):\n{caption[:6000]}")

    input_block = "\n\n".join(input_sections) if input_sections else "NO CONTENT AVAILABLE"

    type_specific = _build_type_specific_block(content_type)

    return f"""Extract structured data from this {content_type} content. Output ONLY valid JSON.

LANGUAGE: {lang}

{input_block}

CRITICAL RULES:
- Use BOTH the transcript and caption together. The transcript has the spoken details; the caption has structured info and correct entity names.
- If IMAGES are provided, they are frames from the video. READ ALL ON-SCREEN TEXT carefully.
- When the transcript contains garbled brand/product names, cross-reference with @mentions and #hashtags.
- If the text is sparse, leave fields empty ("") rather than fabricating.

EXTRACT:

1. **category**: {_CATEGORY_BLOCK}

2. **topic**: 1-2 word English topic that is MORE SPECIFIC than the category. It names the exact subject.

3. **title**: A clear, descriptive English title that tells a user at a glance what this content is about. Max {TITLE_MAX_CHARS} chars, NO emojis. 

4. **brief_description**: ONE sentence (max 80 chars) describing what this is.

5. **highlights**: array of EXACTLY 4 objects:
   - "emoji": ONE relevant emoji
   - "headline": 3-5 word title (NO emojis in text)
   - "description": One sentence (NO emojis in text). Capture SPECIFIC details from the content.

6. **hashtags**: Generate up to 5 highly relevant keywords WITHOUT '#'. DO NOT repeat any hashtags that are already used in the CAPTION.

7. **emojis**: array of 4 relevant emojis for this content type.

8. **prompt**: If the content contains an AI PROMPT, TEMPLATE, or SCRIPT that the creator shares, extract it here as a clean, ready-to-copy string. Otherwise, set to null.

{type_specific}

Return JSON with these exact keys. Do NOT include a summary field yet.
"""


def build_summary_prompt_english(
    title: str, brief_desc: str, content_type: str
) -> str:
    return f"""Write a factual summary paragraph for this content.

TITLE: {title}
BRIEF DESCRIPTION: {brief_desc}
CONTENT TYPE: {content_type}

REQUIREMENTS:
- Length: STRICTLY between {SUMMARY_MIN_CHARS} and {SUMMARY_MAX_CHARS_SOFT} characters. Count carefully. Do NOT exceed {SUMMARY_MAX_CHARS_SOFT} characters.
- Format: Write EXACTLY 2 short paragraphs. Use a newline (\\n\\n) to separate them.
- Style: Simple, factual, informative.
{_BANNED_OPENER_BLOCK}
- Write about: WHAT it is, KEY specifics, WHO it's useful for.
- NO emojis, NO marketing language.

Output ONLY valid JSON with one field:
{{"summary": "your summary text here"}}
"""


def build_summary_prompt_bilingual(
    title: str,
    brief_desc: str,
    content_type: str,
    original_lang: str,
    highlights: Optional[List] = None,
    ingredients: Optional[List] = None,
    instructions: Optional[List] = None,
    tips: Optional[List] = None,
    notes: Optional[List] = None,
    workout: Optional[dict] = None,
    ideas: Optional[List] = None,  # ✅ ADDED: Compilation ideas translation
) -> str:
    lang_name = get_lang_name(original_lang)

    translation_input = ""
    translation_output_fields = []

    if highlights:
        hl_text = [{"headline": h.get("headline", ""), "description": h.get("description", "")} for h in highlights]
        translation_input += f'\n"headlines_en": {json.dumps(hl_text, ensure_ascii=False)}'
        translation_output_fields.append('"headlines": [{"headline": "translated headline", "description": "translated description"}]')

    if ingredients:
        names = [i["item"] for i in ingredients]
        units = [i["unit"] for i in ingredients]
        translation_input += f'\n"ingredient_names_en": {json.dumps(names, ensure_ascii=False)}'
        translation_input += f'\n"ingredient_units_en": {json.dumps(units, ensure_ascii=False)}'
        translation_output_fields.append('"ingredient_names": ["translated name 1", ...]')
        translation_output_fields.append('"ingredient_units": ["translated unit 1", ...]')

    if instructions:
        translation_input += f'\n"instructions_en": {json.dumps(instructions, ensure_ascii=False)}'
        translation_output_fields.append('"instructions": ["translated step 1", ...]')

    if tips:
        translation_input += f'\n"tips_en": {json.dumps(tips, ensure_ascii=False)}'
        translation_output_fields.append('"tips": ["translated tip 1", ...]')

    if notes:
        translation_input += f'\n"notes_en": {json.dumps(notes, ensure_ascii=False)}'
        translation_output_fields.append('"notes": ["translated note 1", ...]')
        
    if workout:
        translation_input += f'\n"workout_en": {json.dumps(workout, ensure_ascii=False)}'
        translation_output_fields.append('"translated_workout": {"duration": "...", "format": "...", "level": "...", "equipment": ["..."], "groups": [{"title": "...", "items": [{"info": "...", "name": "..."}]}], "tips": ["..."]}')

    # ✅ ADDED: Pass ideas to be translated if it's a compilation
    if ideas:
        translation_input += f'\n"ideas_en": {json.dumps(ideas, ensure_ascii=False)}'
        translation_output_fields.append('"translated_ideas": [{"headline": "translated headline", "text": "translated text", "emoji": "emoji"}]')

    has_translation = bool(translation_input)

    translation_section = ""
    if has_translation:
        extra_fields = ",\n  ".join(translation_output_fields)
        translation_section = f"""
CONTENT TO TRANSLATE TO {lang_name.upper()}:
{translation_input}

Also include these translated fields in your JSON output exactly matching the structure of the input arrays (or objects):
  {extra_fields}
"""

    extra_json_fields = ""
    if has_translation:
        extra_json_fields = ",\n  " + ",\n  ".join(translation_output_fields)

    return f"""Write TWO summaries for this content: one in English, one in {lang_name}. Also translate the title.

TITLE (English): {title}
BRIEF DESCRIPTION: {brief_desc}
CONTENT TYPE: {content_type}
{translation_section}
REQUIREMENTS FOR BOTH SUMMARIES:
- Length: STRICTLY between {SUMMARY_MIN_CHARS} and {SUMMARY_MAX_CHARS_SOFT} characters EACH.
- Format: Write EXACTLY 2 short paragraphs per language.
- Style: Simple, factual, informative.
{_BANNED_OPENER_BLOCK}
TRANSLATION QUALITY RULES:
- The {lang_name} title must sound NATURAL.
- Keep metric units unchanged.

Output ONLY valid JSON:
{{
  "summary_en": "English summary here\\n\\nSecond paragraph here",
  "summary_original": "{lang_name} summary here\\n\\nSecond paragraph here",
  "title_original": "{lang_name} title here"{extra_json_fields}
}}
"""


def _build_type_specific_block(content_type: str) -> str:
    """Build the specific extraction instructions based on content type."""
    if content_type == "recipe":
        return """
9. **recipe** object: Extract the recipe details.
   - **is_compilation**: Boolean. Set to true ONLY if the video shows 3 or more DIFFERENT recipes/dishes (e.g., "7 waffle recipes", "3 healthy breakfasts").
   - **ideas**: If 'is_compilation' is true, extract an ARRAY of objects for each dish/idea shown:
     - "headline": Name of the specific dish.
     - "text": A 1-2 sentence summary of the main ingredients or the specific twist.
     - "emoji": One emoji representing that specific dish.
   - **servings**: (For single recipes) Number of portions.
   - **prep_time**: Time to prepare/assemble ingredients. 
   - **cook_time**: Active cooking/heating time.
   - **total_time**: Total duration from start to finish.
   - **ingredients**: (For single recipes) ARRAY OF OBJECTS. Each must have: "item", "quantity", "unit", "emoji".
   - **instructions**: (For single recipes) Detailed, actionable steps.
   - **tips**: Extract specific chef secrets or nuances.
   - **notes**: Important context.

   CRITICAL: If 'is_compilation' is true, the 'ideas' array is mandatory and ingredients/instructions can be left empty.

10. **workout** object: null
11. **location** object: null
"""

    elif content_type == "workout":
        return """
9. **workout** object: Extract the exercise routine details.
   - **duration**: Estimated time to complete (e.g., "30 Min").
   - **format**: The style of workout (e.g., "EMOM", "AMRAP", "Circuit").
   - **level**: Difficulty level (e.g., "All Levels").
   - **equipment**: ARRAY of strings. List all equipment needed (e.g., ["Kettlebell"]). If none, output ["Bodyweight"].
   - **groups**: ARRAY OF OBJECTS representing the circuits or phases.
     - Each group must have a "title" (e.g., "Warm Up", "Circuit").
     - Each group must have an "items" array. Each item is an object with:
       - "info": Reps, time, or timing info (e.g., "40s work / 20s rest", "12 reps", "Minute 1"). Leave empty string if none.
       - "name": Name of the exercise (e.g., "Goblet Squat").
   - **tips**: ARRAY of strings. Extract any trainer tips mentioned.

10. **recipe** object: null
11. **location** object: null
"""

    # Fallback for general content
    return """
9. **recipe** object: CREATE if the content is a RECIPE.
   - **is_compilation**: Boolean. Set to true ONLY if the video shows 3 or more DIFFERENT recipes/dishes.
   - **ideas**: If 'is_compilation' is true, extract an ARRAY of objects: {"headline": "...", "text": "...", "emoji": "..."}.
   - **servings**: Number of portions.
   - **prep_time**: ESTIMATE based on complexity.
   - **cook_time**: ESTIMATE based on the dish type.
   - **total_time**: ESTIMATE as prep + cook.
   - **ingredients**: ARRAY OF OBJECTS with "item", "quantity", "unit", "emoji". 
   - **instructions**: Detailed, actionable steps.
   - **tips**: Extract any cooking tips mentioned.
   - **notes**: Any relevant context.

10. **workout** object: CREATE if the content is a WORKOUT or fitness routine. Use the structure: duration, format, level, equipment (array), groups (array of objects with 'title' and 'items' [info, name]), and tips (array).

11. **location** object: ONLY CREATE if the video is about visiting a specific place.
   - **name**: Name of the place (e.g. "L'Antico Vinaio")
   - **city**: City or region mentioned (e.g. "Paris")
   - **type**: Type of place (e.g. "Sandwich Shop", "Restaurant", "Hotel")
"""