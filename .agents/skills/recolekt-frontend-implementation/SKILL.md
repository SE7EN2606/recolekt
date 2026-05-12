---
name: recolekt-frontend-implementation
description: Use when implementing Recolekt frontend features or fixes in React/TypeScript, especially VideoDetail, RecipeDetailsCard, CookModeModal, recipe panels, library cards, search UI, notes UI, and mobile-first UX.
---

# Recolekt Frontend Implementation Skill

## Working rules

Inspect files before editing.
Use `rg` to find relevant symbols.
Prefer small patches.
Do not rewrite whole components unless necessary.
Do not use multiline sed/perl regex to patch JSX.
After changes, run `npx tsc --noEmit`.

## Current core frontend direction

Move from AI dashboard to personal cookbook.

## Recipe page rules

The primary recipe page should emphasize:

- big Cook CTA
- ingredients
- steps
- notes
- return-to-recipe state

Do not make Ask, transcript, hashtags, category, topic, or confidence the default dominant experience.

## Component rules

Before passing props, confirm the target component interface and actual usage.
Remove unused props only if safe.
Preserve existing extraction/nutrition functionality unless deliberately moving it behind collapse/Inspect mode.

## Mobile-first rules

Check mobile layout first.
Avoid dense side-by-side controls on narrow screens.
Avoid tiny primary CTAs.
Primary action buttons should be thumb-friendly.

## Validation

Run:

```bash
npx tsc --noEmit