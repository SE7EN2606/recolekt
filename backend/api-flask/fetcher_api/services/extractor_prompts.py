"""
All Mistral AI prompts for the Universal Extractor.
Separated from business logic for maintainability.

Phase 1 semantics:
- Public families: recipe, workout, location, products, software, finance, general
- Legacy compatibility: structured non-recipe/non-workout/non-location extraction
  still returns the internal "tools" object so existing parsers continue to work.

Note: build_data_extraction_prompt() receives extraction_content_type (internal),
not public_content_type. So "tools" may still arrive here from universal_extractor.py
for the Phase 2 bridge. _build_type_specific_block() handles this intentionally.
"""

import json
import re
from typing import List, Optional

from fetcher_api.services.extractor_helpers import TITLE_MAX_CHARS


# ── Summary length constants (shared with universal_extractor.py) ──
SUMMARY_MIN_CHARS = 200
SUMMARY_MAX_CHARS_SOFT = 400
SUMMARY_HARD_MAX = 450


_STRUCTURED_COMPAT_FAMILIES = {"tools", "products", "software", "finance"}


# Maps internal extraction_content_type to a clean model-facing label.
# "tools" is a Phase 2 bridge alias — the model should see "products".
_DISPLAY_FAMILY = {
    "tools": "products",
    "software": "software",
    "products": "products",
    "finance": "finance",
    "recipe": "recipe",
    "workout": "workout",
    "location": "location",
    "general": "general",
}


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
- NEVER write meta-summary language such as:
  "The creator explains...", "The author talks about...", "This post talks about...",
  "Key takeaways...", "Easy-to-follow format..."
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
    "fr": "French",
    "es": "Spanish",
    "de": "German",
    "it": "Italian",
    "pt": "Portuguese",
    "ar": "Arabic",
    "ru": "Russian",
    "ja": "Japanese",
    "zh": "Chinese",
    "ko": "Korean",
    "nl": "Dutch",
    "pl": "Polish",
    "sv": "Swedish",
    "da": "Danish",
    "tr": "Turkish",
    "th": "Thai",
    "vi": "Vietnamese",
    "hi": "Hindi",
}


def get_lang_name(lang_code: str) -> str:
    code = (lang_code or "").strip().lower()
    if not code:
        return "Original language"
    return LANG_NAME_MAP.get(code, code.upper())


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
        "collaboration commerciale",
        "sponsored",
        "partenariat",
        "paid partnership",
        "gifted",
        "publicité",
        "annonce",
    ]
    if any(signal in cap_lower for signal in sponsor_signals):
        ctx["is_sponsored"] = True

    return ctx


def build_context_block(caption: str, transcript: str) -> str:
    ctx = extract_caption_context(caption)
    if not ctx:
        return ""

    lines = ["CONTEXT (extracted from caption — use this to interpret the transcript correctly):"]

    if ctx.get("mentions"):
        mention_strs = [f"@{m}" for m in ctx["mentions"]]
        lines.append(f"  Accounts mentioned: {', '.join(mention_strs)}")
        lines.append("  → These are likely the brands, tools, places, products, software, or people featured in the video.")

    if ctx.get("hashtags"):
        lines.append(f"  Creator hashtags: {', '.join('#' + t for t in ctx['hashtags'])}")

    if ctx.get("urls"):
        lines.append(f"  Links: {', '.join(ctx['urls'])}")

    if ctx.get("is_sponsored"):
        lines.append("  ⚠️ This is a SPONSORED post. The creator is promoting a product/service/brand.")
        lines.append("  → The title and summary MUST mention what is being promoted.")

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


INPUT_LANGUAGE_CODE: {lang}
INPUT_LANGUAGE_NOTE: This is metadata about the source material only.
Do NOT change output field names or JSON structure based on this code.
Write values naturally from the source content itself, not from the code.


CAPTION:
{caption}


EXTRACT:
1. **category**: {_CATEGORY_BLOCK}


2. **topic**: 2-3 word topic.
3. **title**: A short, sensible title (max 40 chars).
4. **hashtags**: Up to 5 relevant keywords without '#'.
5. **emojis**: array of 2 relevant emojis. ALL emojis must be unique.


CRITICAL:
- Do not invent detailed facts or hallucinate a summary.
- Output JSON only.
"""


def _build_highlights_instruction(content_type: str, caption_promised_count: int = 0) -> str:
    """
    Build the highlights count rule injected into Call 1.
    For structured product/software/finance content, highlights are secondary.
    """
    if content_type in _STRUCTURED_COMPAT_FAMILIES:
        if 3 <= caption_promised_count <= 6:
            return (
                f"Return up to {caption_promised_count} highlights, but ONLY if they add real value. "
                "For structured ranking/tier/verdict/grouped product, software, or finance posts, the structured list is PRIMARY "
                "and highlights may be omitted or left minimal."
            )
        return (
            "Return up to 4 highlights ONLY if they add real value. "
            "For structured ranking/tier/verdict/grouped product, software, or finance posts, the structured list is PRIMARY "
            "and highlights may be omitted."
        )

    if 3 <= caption_promised_count <= 6:
        return (
            f"Return up to {caption_promised_count} highlights — only when each highlight adds real informational value. "
            "Do NOT force one highlight per item if the content is primarily a structured list."
        )

    return (
        "Return up to 4 highlights, and only when they add real informational value. "
        "Do NOT force one highlight per named item. "
        "If the content is mainly a structured list, ranking, verdict board, or grouped selection, "
        "the structured fields are primary and highlights may be sparse."
    )


def build_data_extraction_prompt(
    transcript: str,
    caption: str,
    lang: str,
    content_type: str,
    caption_promised_count: int = 0,
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
    highlights_count_rule = _build_highlights_instruction(content_type, caption_promised_count)

    # Use a clean model-facing label so the model does not see internal
    # bridge aliases like "tools" in the prompt preamble.
    display_type = _DISPLAY_FAMILY.get(content_type, content_type)

    return f"""Extract structured data from this {display_type} content. Output ONLY valid JSON.


INPUT_LANGUAGE_CODE: {lang}
INPUT_LANGUAGE_NOTE: This is metadata about the source material only.
Do NOT change output field names or JSON structure based on this code.
Write values naturally from the source content itself, not from the code.


{input_block}


CRITICAL RULES:
- Use BOTH the transcript and caption together. The transcript has the spoken details; the caption has structured info and correct entity names.
- TRANSCRIPT IS RAW ASR — speech recognition frequently garbles brand and product names. The transcript is UNRELIABLE for proper nouns.
- If IMAGES (frames) are provided, on-screen text is the CANONICAL source for ALL product, software, tool, place, and brand names. Always prefer the name visible on screen over the transcript spelling.
- Use frame-corrected names in EVERY field: title, highlights, brief_description, AND structured items. NEVER use a garbled ASR name if a frame shows the correct spelling.
- When no frames are available, cross-reference garbled transcript names with @mentions and #hashtags from the caption.
- Common ASR garbling patterns to fix regardless of frames:
    "Chargebee T" or "Charge B T" or "chargeb t" → ChatGPT
    "Clon" or "Clone" (in AI assistant context) → Claude
    "CAMBA" or "Camba" → Canva
    "n eight n" or "n 8 n" → n8n
    "Higgs Field" or "higgs field" → Higgsfield
    "chat gpt" or "tchat ji pi ti" → ChatGPT
    "granola" (note-taking app) → Granola
    "no Bovela" or "Bovela" → cross-check frames; if unreadable, flag as [?]
    "Nano Banana" → cross-check frames; if unreadable, flag as [?]
- If the text is sparse, leave fields empty ("") rather than fabricating.
- Emojis must NEVER repeat inside the same output array.


EXTRACT:


1. **category**: {_CATEGORY_BLOCK}


2. **topic**: 1-2 word topic that is MORE SPECIFIC than the category. It names the exact subject.


3. **title**: A clear, descriptive title that tells a user at a glance what this content is about. Max {TITLE_MAX_CHARS} chars, NO emojis.


4. **brief_description**: ONE sentence (max 80 chars) describing what this is.


5. **highlights**: {highlights_count_rule}
   Each highlight is an object with:
   - "emoji": ONE relevant emoji
   - "headline": 3-5 word title (NO emojis in text)
   - "description": One sentence (NO emojis in text). Capture SPECIFIC details from the content.
   IMPORTANT: Use frame-corrected or canonical names in descriptions — NEVER the raw garbled ASR spelling.


   BANNED headline and description patterns — your highlights must NEVER:
   - Invite viewer action: "Share your favorite", "Comment below", "Tag a friend",
     "Like and follow", "Follow for more", "Subscribe", "Save this video",
     "Join my workshop / class / webinar", "Comment to invest", "Comment yes",
     "Chance to be featured"
   - Be a generic wrap-up: "Final thoughts", "Conclusion", "In conclusion",
     "Key takeaway", "Key insight", "Important detail", "Notable point",
     "Main point", "Wrap up", "Summary"
   - Push to another video: "Next video", "See you next", "Check it out",
     "Learn more", "Watch next", "Coming up", "Stay tuned"
   - Be vague filler: "Key detail", "Concrete detail", "A detail shown in the clip",
     "Something interesting", "Get started today"
   INSTEAD: every headline must name a SPECIFIC fact, technique, ingredient,
   place, person, or product that is actually present in the content.


6. **hashtags**: Generate up to 5 highly relevant keywords WITHOUT '#'. DO NOT repeat any hashtags that are already used in the CAPTION.


7. **emojis**: array of 4 relevant emojis for this content type. ALL emojis must be unique.


8. **prompt**: If the content contains an AI PROMPT, TEMPLATE, or SCRIPT that the creator shares, extract it here as a clean, ready-to-copy string. Otherwise, set to null.


{type_specific}


Return JSON with these exact keys. Do NOT include a summary field yet.
"""


def build_summary_prompt_english(title: str, brief_desc: str, content_type: str) -> str:
    display_type = _DISPLAY_FAMILY.get(content_type, content_type)
    return f"""Write a factual summary paragraph for this content.


TITLE: {title}
BRIEF DESCRIPTION: {brief_desc}
CONTENT TYPE: {display_type}


REQUIREMENTS:
- Length: STRICTLY between {SUMMARY_MIN_CHARS} and {SUMMARY_MAX_CHARS_SOFT} characters. Count carefully. Do NOT exceed {SUMMARY_MAX_CHARS_SOFT} characters.
- Format: EXACTLY 2 short paragraphs. Use a newline (\\n\\n) to separate them.
- Style: Simple, factual, informative.
{_BANNED_OPENER_BLOCK}
- Write about: WHAT it is, KEY specifics, WHY it is useful to save, and WHO it helps.
- Focus on practical value, not on describing the content format.
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
    ideas: Optional[List] = None,
) -> str:
    lang_name = get_lang_name(original_lang)
    display_type = _DISPLAY_FAMILY.get(content_type, content_type)

    translation_input = ""
    translation_output_fields = []

    if highlights:
        hl_text = [
            {
                "headline": h.get("headline", ""),
                "description": h.get("description", ""),
            }
            for h in highlights
        ]
        translation_input += f'\n"headlines_en": {json.dumps(hl_text, ensure_ascii=False)}'
        translation_output_fields.append(
            '"headlines": [{"headline": "translated headline", "description": "translated description"}]'
        )

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
        translation_output_fields.append(
            '"translated_workout": {"duration": "...", "format": "...", "level": "...", "equipment": ["..."], "groups": [{"title": "...", "items": [{"info": "...", "name": "..."}]}], "tips": ["..."]}'
        )

    if ideas:
        translation_input += f'\n"ideas_en": {json.dumps(ideas, ensure_ascii=False)}'
        translation_output_fields.append(
            '"translated_ideas": [{"headline": "translated headline", "text": "translated text (keep EXACT quantities and metric units)", "emoji": "emoji"}]'
        )

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
CONTENT TYPE: {display_type}
{translation_section}
REQUIREMENTS FOR BOTH SUMMARIES:
- Length: STRICTLY between {SUMMARY_MIN_CHARS} and {SUMMARY_MAX_CHARS_SOFT} characters EACH.
- Format: Write EXACTLY 2 short paragraphs per language.
- Style: Simple, factual, informative.
{_BANNED_OPENER_BLOCK}
- Focus on practical value and why the saved content is useful to revisit.
- Do NOT describe the content as "this video" or "the creator explains".


TRANSLATION QUALITY RULES:
- The {lang_name} title must sound NATURAL.
- Keep metric units and exact quantities unchanged.
- Preserve internal values and enums exactly when present. Do NOT translate machine values, identifiers, or controlled labels unless they are clearly user-facing prose.
- If any internal enum or machine value appears in the payload, keep it unchanged.


Output ONLY valid JSON:
{{
  "summary_en": "English summary here\\n\\nSecond paragraph here",
  "summary_original": "{lang_name} summary here\\n\\nSecond paragraph here",
  "title_original": "{lang_name} title here"{extra_json_fields}
}}
"""


def _build_structured_software_block() -> str:
    return """
9. **tools** object: This internal compatibility field is used for SOFTWARE / APPS / DIGITAL TOOLS content.
   Extract every software product, app, platform, AI tool, website, or creator-evaluated digital solution explicitly mentioned.


   Fix common ASR garbling in names before writing any final value:
   - "Chargebee T" or "Charge B T" or "chargeb t" → "ChatGPT"
   - "Clon" or "Clone" (in AI assistant context) → "Claude"
   - "CAMBA" or "Camba" → "Canva"
   - "n eight n" or "n 8 n" → "n8n"
   - "Higgs Field" or "higgs field" → "Higgsfield"
   - "point ai" or "point i a" → ".ai"
   - "Subagique" or "sub agique" → "SubMagic"
   - "get transcribe point ai" → "GetTranscribe.ai"
   - "melichat" or "meli chat" → "ManyChat"
   - "capcut" → "CapCut"
   - "granola" (note-taking app) → "Granola"


   Return this exact JSON structure:
   "tools": {
     "categories": [
       {
         "name": "Category name — preserve the creator's label when meaningful",
         "emoji": "single relevant emoji",
         "items": [
           {
             "rank": 1,
             "name": "Software / App Name",
             "description": "One sentence: what it does or why it matters in this creator context",
             "free": null,
             "url": null,
             "source": "transcript",
             "tier": null,
             "creator_rating": null
           }
         ]
       }
     ]
   }


   STRICT RULES:
   1. REAL NAMES ONLY — exact names the creator mentions. Fix ASR errors, never invent.
   2. GROUP by the creator's actual structure: use cases, verdict buckets, tiers, workflows.
   3. PRESERVE CREATOR LABELS exactly when they are meaningful.
   4. RANK rules:
      - Add a "rank" field only for explicit ordering or stable local order inside a category.
      - Do NOT invent a fake global ranking across multiple grouped categories.
      - On-screen numbers visible in frames are the CANONICAL source for rank.
      - For tier lists, tier labels are more important than numeric rank.
   5. SOURCE: "transcript" | "caption" | "frames".
   6. Never duplicate the same item across categories.
   7. Never add items not mentioned by the creator.
   8. free=true only when the creator clearly implies free. Otherwise use null.
   9. CREATOR RATING:
      - only when explicit and unambiguous
      - allowed values: "best" | "good" | "bad" | null
   10. TIER:
      - use only for clear tier-list content
      - allowed values: "S" | "A" | "B" | "C" | "D" | "F" | null
   11. The structured list is PRIMARY. Do not force extra highlight filler if the list already captures the structure.


10. **recipe** object: null
11. **workout** object: null
12. **location** object: null


CRITICAL:
- This is software/app/digital-tool content, not travel content.
- location MUST be null.
- Do NOT reinterpret software, companies, websites, apps, or brands as towns, countries, or destinations.
"""


def _build_structured_products_block() -> str:
    return """
9. **tools** object: This internal compatibility field is used for PRODUCT RANKING / PRODUCT SELECTION content.
   Extract every product, brand, retailer, or creator-evaluated named item explicitly mentioned.


   Examples of product content:
   - sunscreens
   - watches
   - clothing / fashion brands
   - perfumes / fragrances
   - shoes
   - baby products
   - consumer products
   - skincare / beauty products
   - gear / physical goods


   Return this exact JSON structure:
   "tools": {
     "categories": [
       {
         "name": "Category name — preserve the creator's label when meaningful",
         "emoji": "single relevant emoji",
         "items": [
           {
             "rank": 1,
             "name": "Corrected brand or product name",
             "description": "One sentence: key result, value judgment, test result, or why it is placed here",
             "free": null,
             "url": null,
             "source": "transcript",
             "tier": null,
             "creator_rating": null
           }
         ]
       }
     ]
   }


   STRICT RULES:
   1. REAL NAMES ONLY — exact names the creator mentions. Fix ASR errors, never invent.
   2. GROUP by the creator's actual structure:
      - verdict buckets
      - tiers
      - ranked categories
      - grouped product selections
      - other meaningful creator labels
   3. PRESERVE CREATOR LABELS exactly when they are meaningful:
      - examples: "S Tier", "A Tier", "Best Value", "Avoid", "Buy", "Overpriced"
      - do NOT flatten grouped structures into one fake ranking
   4. RANK rules:
      - Add a "rank" field only for explicit ordering or stable local order inside a category.
      - Do NOT invent a fake global ranking across multiple grouped categories.
      - On-screen numbers visible in frames are the CANONICAL source for rank.
      - For tier lists, tier labels are more important than numeric rank.
   5. SOURCE: "transcript" | "caption" | "frames".
   6. Never duplicate the same item across categories.
   7. Never add items not mentioned by the creator.
   8. free MUST be null for all product content. Products are not free/paid software.
   9. CREATOR RATING — only when explicit and unambiguous:
      - allowed values: "best" | "good" | "bad" | null
   10. TIER:
      - use only for clear tier-list content
      - allowed values: "S" | "A" | "B" | "C" | "D" | "F" | null
   11. For structured product posts, the structured list is PRIMARY.


10. **recipe** object: null
11. **workout** object: null
12. **location** object: null


CRITICAL:
- For product/brand/tier/ranking content, location MUST be null.
- Do NOT convert brand names, products, retailers, or sunscreens into places.
- Context matters. Even if a name also exists as a real-world town or beach, treat it as a PRODUCT/BRAND here when the content is clearly about product testing, skincare, shopping, ranking, value, or consumer comparison.
- Examples:
  - "La Roche-Posay" is a skincare brand here, NOT a town
  - "Nivea" is a skincare brand, NOT a place
  - "Bondi Sands" is a brand, NOT a beach/location in this context
  - "MECCA" is a retailer/brand, NOT a place
- Only the dedicated location/travel prompt may populate the location field.
"""


def _build_structured_finance_block() -> str:
    return """
9. **tools** object: This internal compatibility field is used for FINANCE / ACCOUNTING / MONEY / TAX / BUSINESS TOOLING content.
   Extract every named platform, financial product, framework, option set, account type, software, or explicitly compared solution the creator discusses.


   Use this field only for NAMED structured entities.
   If the content is purely educational advice with no named structured entities, keep "tools" null or empty and rely on highlights + summary.


   Return this exact JSON structure:
   "tools": {
     "categories": [
       {
         "name": "Category name — preserve the creator's label when meaningful",
         "emoji": "single relevant emoji",
         "items": [
           {
             "rank": 1,
             "name": "Named option / product / platform / framework",
             "description": "One sentence: what it is or why it is compared here",
             "free": null,
             "url": null,
             "source": "transcript",
             "tier": null,
             "creator_rating": null
           }
         ]
       }
     ]
   }


   STRICT RULES:
   1. REAL NAMES ONLY — exact names the creator mentions.
   2. Do NOT invent products, institutions, or accounts that were not explicitly named.
   3. GROUP by the creator's actual structure where applicable.
   4. If the content is mainly finance tips/hacks/help and not a named comparison, keep the structured field sparse rather than forcing fake entities.
   5. SOURCE: "transcript" | "caption" | "frames".
   6. CREATOR RATING:
      - only when explicit and unambiguous
      - allowed values: "best" | "good" | "bad" | null
   7. TIER:
      - use only for clear tier-list content
      - allowed values: "S" | "A" | "B" | "C" | "D" | "F" | null


10. **recipe** object: null
11. **workout** object: null
12. **location** object: null


CRITICAL:
- This is finance/accounting/business content, not travel content.
- location MUST be null.
- Do NOT reinterpret banks, brokerages, tax products, accounting tools, or financial brands as places.
"""


def _build_location_block() -> str:
    return """
9. **recipe** object: null
10. **workout** object: null


11. **location** object: This is LOCATION / TRAVEL / VENUE content.
   Return a SINGLE object for one place, or an ARRAY for multiple places.


   For EACH place extract this exact shape:
   {
     "name": "Exact place / venue / destination name",
     "type": "Hotel | Resort | Restaurant | Café | Lake | Trail | Viewpoint | City | Village | Museum | etc.",
     "city": "City or nearest region ONLY if explicitly stated in caption, transcript, or visible text; otherwise null",
     "country": "Country name in English ONLY if explicitly stated; otherwise null",
     "address": "Exact street address if explicitly written; otherwise null",
     "neighborhood": "District / arrondissement / neighborhood if explicitly written; otherwise null",
     "description": "One factual sentence based on the source content",
     "lat": null,
     "lng": null
   }


   STRICT RULES:
   1. REAL NAMES ONLY — use the exact place names from caption, transcript, or visible on-screen text.
   2. READ THE CAPTION FIRST — the caption is authoritative when it lists multiple places.
   3. NEVER STOP EARLY — extract every place the creator mentions.
   4. NEVER GEOCODE — lat and lng must always be null at extraction time.
   5. NEVER GUESS GEOGRAPHY:
      - if city is unknown, set "city": null
      - if country is unknown, set "country": null
      - if address is unknown, set "address": null
      - if neighborhood is unknown, set "neighborhood": null
   6. NEVER use continents, macro-regions, or vague scopes as country values.
      BAD country values: "Europe", "Alps", "Dolomites", "Mediterranean", "Scandinavia"
   7. If a hotel/restaurant/place is only identified by name or @mention, still extract the place,
      but leave unknown geography fields as null.
   8. The description must be grounded in the source. Do not invent amenities, rankings, or location facts.
   9. If the caption contains exact 📍 address lines, copy them into "address" exactly.


CRITICAL:
- This is travel/place content.
- Do NOT create a tools object for this family.
- Do NOT turn weak guesses into city/country values.
"""


def _build_recipe_block() -> str:
    return """
9. **recipe** object: Extract the recipe details.
   - **is_compilation**: Boolean. Set to true ONLY if the video shows 3 or more DIFFERENT recipes/dishes (e.g., "7 waffle recipes", "3 healthy breakfasts").
   - **ideas**: If 'is_compilation' is true, extract an ARRAY of objects for each dish/idea shown:
     - "headline": Name of the specific dish.
     - "text": ACTIONABLE mini-recipe. You MUST include EXACT quantities, measurements, and ingredients if provided (e.g., 'Mix 40g flour, 2 eggs, and 10ml milk'). DO NOT write vague, generic descriptions like 'A delicious waffle with cheese'. Make it a mini-tutorial.
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


def _build_workout_block() -> str:
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


def _build_general_block() -> str:
    return """
9. **recipe** object: CREATE if the content is a RECIPE.
   - **is_compilation**: Boolean. Set to true ONLY if the video shows 3 or more DIFFERENT recipes/dishes.
   - **ideas**: If 'is_compilation' is true, extract an ARRAY of objects: {"headline": "...", "text": "ACTIONABLE mini-recipe with EXACT quantities and steps", "emoji": "..."}.
   - **servings**: Number of portions.
   - **prep_time**: ESTIMATE based on complexity.
   - **cook_time**: ESTIMATE based on the dish type.
   - **total_time**: ESTIMATE as prep + cook.
   - **ingredients**: ARRAY OF OBJECTS with "item", "quantity", "unit", "emoji".
   - **instructions**: Detailed, actionable steps.
   - **tips**: Extract any cooking tips mentioned.
   - **notes**: Any relevant context.


10. **workout** object: CREATE if the content is a WORKOUT or fitness routine. Use the structure: duration, format, level, equipment (array), groups (array of objects with 'title' and 'items' [info, name]), and tips (array).


11. **location** object: ONLY CREATE if the content is CLEARLY about visiting, evaluating, or listing specific real-world places.
   Return a SINGLE object for one place, or an ARRAY for multiple places.


   For EACH place extract:
   - **name**: Exact place name
   - **type**: Type of place (e.g. "Hotel", "Restaurant", "Lake", "Trail", "Museum")
   - **city**: City or nearest region ONLY if explicitly stated; otherwise null
   - **country**: Country name in English ONLY if explicitly stated; otherwise null
   - **address**: Exact street address ONLY if explicitly written; otherwise null
   - **neighborhood**: District / arrondissement / neighborhood ONLY if explicitly written; otherwise null
   - **description**: One factual sentence grounded in the source content
   - **lat**: null
   - **lng**: null


   CRITICAL:
   - Never geocode or guess coordinates.
   - Never guess city/country from vibes, language, or brand names.
   - Never use continents or macro-regions as country values.
     BAD: "Europe", "Alps", "Dolomites", "Mediterranean", "Scandinavia"
   - If geography is unknown, use null.
"""


def _build_type_specific_block(content_type: str) -> str:
    """
    Build the specific extraction instructions based on content type.

    Receives extraction_content_type (internal), not public_content_type.
    During Phase 2, "tools" may still arrive here from universal_extractor.py
    for the bridge path — handled by the products block for backward compatibility.
    """
    if content_type == "software":
        return _build_structured_software_block()

    if content_type in {"products", "tools"}:
        return _build_structured_products_block()

    if content_type == "finance":
        return _build_structured_finance_block()

    if content_type == "location":
        return _build_location_block()

    if content_type == "recipe":
        return _build_recipe_block()

    if content_type == "workout":
        return _build_workout_block()

    return _build_general_block()