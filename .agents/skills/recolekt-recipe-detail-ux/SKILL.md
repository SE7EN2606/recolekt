---
name: recolekt-recipe-detail-ux
description: Use when restructuring Recolekt recipe or reel detail pages, especially VideoDetail, RecipeDetailsCard, recipe rails, Cook Mode entry, notes, shopping, nutrition, source details, and mobile recipe hierarchy.
---

# Recolekt Recipe Detail UX Skill

## Core rule

Do not redesign Recolekt from scratch.

This skill is not for creating a new visual identity.
It is for restructuring the existing recipe detail experience so the page feels useful, calm, and cooking focused.

If CleanUI conflicts with Recolekt product direction, Recolekt wins.

## Current product goal

Recolekt is becoming a personal cookbook and action layer for useful short form videos.

The core loop is:

save reel → structured recipe → cook it → notes/history → return later → personal cookbook memory

The recipe detail page must support that loop.

## Existing style boundary

Keep the current Recolekt visual language.

Do not introduce:
- a new design system
- a new color palette
- a new navigation model
- a full dashboard redesign
- decorative SaaS hero sections
- generic AI-looking card grids
- excessive shadows
- excessive badges
- unnecessary gradients
- new dependencies

Use existing Tailwind patterns, spacing, components, icons, and tone unless there is a clear reason to adjust them.

## Main UX problem

The reel detail page has accumulated many features:

- recipe card
- Cook Mode
- continue cooking
- ingredients
- steps
- notes
- cook history
- shopping list
- nutrition
- recipe assistant
- edit and overrides
- source link
- caption
- transcript
- hashtags
- extraction details
- collection and status metadata

The fix is not to remove features.
The fix is to create a clearer hierarchy.

## Default page hierarchy

The page should prioritize:

1. What is this recipe?
2. Can I cook it now?
3. What ingredients do I need?
4. What are the steps?
5. Have I cooked it before?
6. Did I leave notes?
7. Can I add this to my shopping plan?
8. Where did this come from?

## Primary visible elements

These should be easy to see without hunting:

- recipe title
- media or thumbnail
- primary Cook or Resume CTA
- ingredients
- steps
- shopping action
- notes
- cooked count or last cooked state when available

## Secondary visible elements

These can be visible but should not dominate:

- nutrition summary
- serving controls
- metric toggle
- recipe assistant
- collection state
- source link

## Collapsed or lower priority elements

These should not dominate the default page:

- transcript
- hashtags
- raw caption
- category/topic metadata
- extraction confidence
- AI assumptions
- debug style metadata
- source analysis details

## Preferred structure

Use a mode or section hierarchy:

### Cook focus
For active cooking and immediate execution:
- Resume or Start Cooking
- ingredients
- steps
- timers if relevant
- completion state

### Plan and shop
For preparing to cook:
- add to shopping list
- planned badge
- servings
- ingredients grouped clearly

### Notes and memory
For return loop:
- personal notes
- cooked before
- last cooked
- verified or edited state when useful

### Source details
For trust and inspection:
- source link
- caption
- transcript
- hashtags
- extraction metadata

Source details should be accessible, not dominant.

## Desktop guidance

Desktop can use a two or three area layout, but avoid density.

A good direction:
- left or top: media and source preview
- main: recipe content, ingredients, steps
- side rail: cook action, shopping, notes/history, lightweight status

Do not fill every rail with metadata.

## Mobile guidance

Mobile must be cooking first.

Recommended order:
1. title and image
2. Cook or Resume CTA
3. shopping action if recipe
4. ingredients
5. steps
6. notes and history
7. nutrition summary
8. source details collapsed

Avoid tiny CTAs.
Avoid dense rows.
Avoid too many badges.
Avoid horizontal overflow except intentional chips.

## Feature preservation rule

Do not remove existing features unless explicitly asked.

When simplifying, move features to:
- collapsible sections
- secondary panels
- source details
- inspect/edit mode
- lower page sections

Preserve:
- Cook Mode
- active cook session resume
- notes
- cooking history
- shopping list integration
- recipe overrides/editing
- nutrition
- assistant
- source access
- gallery navigation
- cookbook navigation

## Implementation rules

Inspect before editing.

Likely files:
- frontend/src/pages/VideoDetail.tsx
- frontend/src/components/RecipeDetailsCard.tsx
- frontend/src/features/recipe-detail/RecipeCookbookRail.tsx
- frontend/src/components/CookModeModal.tsx
- frontend/src/features/recipe-core/*
- frontend/src/features/recipe-secondary/*
- frontend/src/features/shopping/*
- frontend/src/features/recipe-notes/*
- frontend/src/features/recipe-cook-state/*

Prefer bounded structural changes.
Do not use broad regex patches on JSX.
Do not rewrite the full page unless there is no safer option.
Do not create backend changes unless required by missing data.
Do not create migrations for visual hierarchy work.

## Acceptance criteria

A good recipe detail page should pass these checks:

- The user instantly understands what the recipe is.
- Cook or Resume is the obvious primary action.
- Ingredients and steps are easy to find.
- Shopping action is visible but not louder than Cook.
- Notes and cooked history support returning later.
- Source details are available but not dominant.
- Transcript and metadata do not make the page feel like an AI dashboard.
- Mobile feels clean and thumb friendly.
- Existing features still work.

## Validation

Run:

cd /Users/greg/Downloads/Apps/recolekt-app/frontend
npx tsc --noEmit
VITE_GOOGLE_MAPS_API_KEY=dummy npm run build

If backend files changed, also run:

cd /Users/greg/Downloads/Apps/recolekt-app/backend/api-flask
source venv/bin/activate
python -m py_compile app.py
python -m py_compile fetcher_api/api/routes/auth.py
python -m py_compile fetcher_api/api/routes/reel.py
python -m py_compile fetcher_api/api/routes/video.py
python -m py_compile fetcher_api/api/routes.py
deactivate
