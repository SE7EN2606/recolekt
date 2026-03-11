# fetcher_api/services/extractor_prompts.py
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


# ══════════════════════════════════════════════════════════════
# CAPTION ENTITY EXTRACTION + CONTEXT BUILDING
# ══════════════════════════════════════════════════════════════

def extract_caption_context(caption: str) -> dict:
    """
    Extract structured context from the caption:
    - @mentions (brands, people)
    - hashtags (topics)
    - URLs
    - sponsored/promo signals
    Returns a dict with all extracted info.
    """
    if not caption or not caption.strip():
        return {}

    ctx = {}

    # @mentions
    mentions = re.findall(r"@([\w.]+)", caption)
    if mentions:
        ctx["mentions"] = mentions

    # hashtags (beyond what the AI generates — these are the creator's own)
    tags = re.findall(r"#(\w+)", caption)
    if tags:
        ctx["hashtags"] = tags

    # URLs
    urls = re.findall(r"https?://[^\s]+", caption)
    if urls:
        ctx["urls"] = urls

    # Sponsored signals
    cap_lower = caption.lower()
    sponsor_signals = [
        "collaboration commerciale", "sponsored", "partenariat",
        "paid partnership", "gifted", "publicité", "annonce",
    ]
    if any(s in cap_lower for s in sponsor_signals):
        ctx["is_sponsored"] = True

    return ctx


def build_context_block(caption: str, transcript: str) -> str:
    """
    Build a CONTEXT section that goes at the top of the prompt,
    giving the AI key entities and signals before it reads the raw text.
    """
    ctx = extract_caption_context(caption)
    if not ctx:
        return ""

    lines = ["CONTEXT (extracted from caption — use this to interpret the transcript correctly):"]

    if ctx.get("mentions"):
        # Format mentions with hint about what they likely are
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


# ══════════════════════════════════════════════════════════════
# PROMPT BUILDERS
# ══════════════════════════════════════════════════════════════

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
    # Build context block from caption entities
    context_block = build_context_block(caption, transcript)

    # Build input sections
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
- If IMAGES are provided, they are frames from the video. READ ALL ON-SCREEN TEXT carefully — ingredient quantities, recipe steps, product names, prices, and any other text overlaid on the video. This on-screen text is often the primary source for specific details like measurements and quantities.
- When the transcript contains garbled brand/product names, cross-reference with @mentions and #hashtags from the caption to determine the correct name.
- If the post is SPONSORED or PROMOTIONAL, the title and summary MUST name the product/service being promoted — that is why the user saved it.
- Do NOT hallucinate facts that are not in the transcript, caption, or video frames.
- If the text is sparse, leave fields empty ("") rather than fabricating.

EXTRACT:

1. **category**: {_CATEGORY_BLOCK}

2. **topic**: 2-3 word English topic (e.g., "Pumpkin Bars", "HIIT Workout", "Stain Removal")

3. **title**: A clear, descriptive English title that tells a user at a glance what this content is about. Max {TITLE_MAX_CHARS} chars, NO emojis. It must describe the SUBJECT, not the creator or the series.
   - If a specific product/tool/brand is featured, INCLUDE IT in the title.
   GOOD: "Emergent.sh — AI That Codes Your Ideas"
   GOOD: "15-Minute Morning Yoga Stretch"
   BAD: "AI Turns Ideas into Code" (too generic when a specific tool is featured)
   BAD: "Amazing Recipe You Must Try" (clickbait, not descriptive)

4. **brief_description**: ONE sentence (max 80 chars) describing what this is.

5. **highlights**: array of EXACTLY 4 objects:
   - "emoji": ONE relevant emoji
   - "headline": 3-5 word title (NO emojis in text)
   - "description": One sentence (NO emojis in text). Capture SPECIFIC details from the content, not generic statements.

6. **hashtags**: Generate up to 5 highly relevant keywords WITHOUT '#'. DO NOT repeat any hashtags that are already used in the CAPTION.

7. **emojis**: array of 4 relevant emojis for this content type.

8. **prompt**: If the content contains an AI PROMPT, TEMPLATE, or SCRIPT that the creator shares (e.g., a ChatGPT prompt, a Midjourney prompt, an email template), extract it here as a clean, ready-to-copy string.
   - Look for phrases like "copy this prompt", "use this prompt", "paste this into ChatGPT/GPT/Claude/Midjourney", "DM me for the prompt" (but the prompt itself is often spoken aloud in the video).
   - The prompt is usually spoken in the transcript — extract it, clean it up, and format it so someone can directly paste it into an AI tool.
   - If the creator says "DM me for the prompt" but ALSO reads the prompt aloud in the video, extract the spoken prompt.
   - Write the prompt in the ORIGINAL LANGUAGE it was spoken/written in (do not translate it).
   - If there is no prompt/template in the content, set this to null.

{type_specific}

Return JSON with these fields only. Do NOT include summary field.
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
- Write about: WHAT it is, KEY specifics (numbers, ingredients, techniques), WHO it's useful for.
- NO emojis, NO marketing language, NO flowery adjectives.
- Do NOT write out step-by-step instructions (keep it high level).
- Write in your own words — do NOT copy phrases from the input.

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
) -> str:
    lang_name = get_lang_name(original_lang)

    # ── Build translation block ──
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

    has_translation = bool(translation_input)

    translation_section = ""
    if has_translation:
        extra_fields = ",\n  ".join(translation_output_fields)
        translation_section = f"""
CONTENT TO TRANSLATE TO {lang_name.upper()}:
{translation_input}

Also include these translated fields in your JSON output exactly matching the structure of the input arrays:
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
- Length: STRICTLY between {SUMMARY_MIN_CHARS} and {SUMMARY_MAX_CHARS_SOFT} characters EACH. Count carefully. Do NOT exceed {SUMMARY_MAX_CHARS_SOFT} characters.
- Format: Write EXACTLY 2 short paragraphs per language. Use a newline (\\n\\n) to separate them.
- Style: Simple, factual, informative.
{_BANNED_OPENER_BLOCK}
TRANSLATION QUALITY RULES:
- The {lang_name} title must sound NATURAL in {lang_name}, as if a native speaker wrote it.
- Do NOT translate word-by-word. Write it the way a {lang_name} native would naturally say it.
  EN: "Creamy Diet Steakhouse Sauce"
  FR GOOD: "Sauce miel-moutarde crémeuse façon steakhouse"
  FR BAD: "Sauce crémeuse pour steakhouse à régime"
- Keep metric units unchanged (g, kg, ml, etc.)
- Write about: WHAT it is, KEY specifics, WHO it's useful for.
- NO emojis, NO marketing language.
- Write ORIGINAL text — do NOT copy from input.

Output ONLY valid JSON:
{{
  "summary_en": "English summary here\\n\\nSecond paragraph here",
  "summary_original": "{lang_name} summary here\\n\\nSecond paragraph here",
  "title_original": "{lang_name} title here"{extra_json_fields}
}}
"""


# ══════════════════════════════════════════════════════════════
# INTERNAL HELPERS
# ══════════════════════════════════════════════════════════════

def _build_type_specific_block(content_type: str) -> str:
    """Build the recipe/location extraction instructions based on content type."""
    if content_type == "recipe":
        return """
8. **recipe** object: Extract the recipe details.
   - **servings**: Number of PORTIONS this recipe makes (a simple number like "4" or "6").
     This is NOT the total weight or volume. If the caption says "pour ~400 ml" that means the total yield is 400ml — estimate how many portions that is (e.g., "4" for a sauce). If unsure, use "1".
   - **prep_time**: Time to prepare/assemble ingredients. ESTIMATE if not explicitly stated — e.g., a simple blended sauce takes "5 minutes", a multi-step dish with chopping takes "15 minutes". Only leave empty "" if you truly cannot estimate.
   - **cook_time**: Active cooking/heating time. If NO cooking or heating is involved (e.g., a blended raw sauce, a salad, a no-bake dessert), write "No cooking" — do NOT write "0 minutes".
   - **total_time**: Total duration from start to finish. ESTIMATE if not stated — sum of prep + cook time. Only leave empty "" if you truly cannot estimate.
   - **ingredients**: ARRAY OF OBJECTS. Each must have: "item", "quantity", "unit", "emoji". Never return strings.
     Extract quantities and units exactly as stated in the source.
   - **instructions**: Detailed, actionable steps. Expand brief creator instructions into clear cooking steps (minimum 6). It is OK to elaborate on what the creator described briefly.
   - **tips**: Extract specific chef secrets or nuances.
   - **notes**: Important context (nutritional info, storage, etc.).

9. **location** object: null (not applicable for recipes unless a restaurant is mentioned).
"""

    return """
8. **recipe** object: CREATE if the content is a RECIPE or contains an ingredient list.
   Look for these signals: ingredient names (even without quantities), cooking instructions,
   food preparation steps, or a list of items like "-scallops -garlic -lime -butter".
   DO NOT create a recipe if the video is just a restaurant review or food tasting.
   If it IS a recipe, include:
   - **servings**: Number of portions (estimate if not stated, use "2" as default for most dishes). 
   - **prep_time**: ESTIMATE based on complexity (e.g., "10 minutes" for simple dishes). Only leave empty if truly unknowable.
   - **cook_time**: ESTIMATE based on the dish type (e.g., "5 minutes" for pan-fried scallops). Write "No cooking" only for raw/no-heat dishes.
   - **total_time**: ESTIMATE as prep + cook.
   - **ingredients**: ARRAY OF OBJECTS with "item", "quantity", "unit", "emoji". If no quantities are given in the source, leave quantity and unit as empty strings but STILL include all ingredient names.
   - **instructions**: Detailed, actionable steps. Expand from any cooking hints in the caption/transcript (minimum 4 steps). If the caption only lists ingredients, generate reasonable cooking steps based on the dish type.
   - **tips**: Extract any cooking tips mentioned.
   - **notes**: Any relevant context.

9. **location** object: ONLY CREATE if the video is about visiting a specific place.
   - **name**: Name of the place (e.g. "L'Antico Vinaio")
   - **city**: City or region mentioned (e.g. "Paris")
   - **type**: Type of place (e.g. "Sandwich Shop", "Restaurant", "Hotel")
"""