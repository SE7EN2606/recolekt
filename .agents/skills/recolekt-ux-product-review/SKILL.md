---
name: recolekt-ux-product-review
description: Use when reviewing Recolekt UI/UX, especially whether a page feels like a personal cookbook instead of an AI analysis dashboard. Trigger for design review, hierarchy review, recipe page review, library review, cook mode review, or mobile UX critique.
---

# Recolekt UX/Product Review Skill

## Core principle

The UI must help users cook and reuse saved content. It must not show every extracted AI detail at once.

## Review lens

Ask:

1. Can the user instantly understand what this is?
2. Is the Cook CTA obvious?
3. Are ingredients and steps prominent?
4. Can the user see whether they cooked it before?
5. Can the user add or see personal notes?
6. Are metadata/transcript/hashtags collapsed?
7. Does this feel calm and personal?

## Default hierarchy

Visible:
- hero image/video
- title
- collection/save state
- big Cook CTA
- ingredients
- steps
- personal notes
- cooked count / last cooked / continue cooking

Secondary:
- nutrition summary
- caption
- source link

Collapsed:
- transcript
- hashtags
- category/topic metadata
- AI assumptions
- confidence details

Inspect/Edit only:
- raw transcript analysis
- extraction provenance
- debug metadata
- advanced nutrition assumptions

## Output format

### Verdict
Good / risky / broken.

### Biggest issue
One sentence.

### What to remove or collapse
List.

### What should dominate
List.

### Exact UI changes
Small implementation-ready recommendations.

### Acceptance criteria
What must be true after the change.