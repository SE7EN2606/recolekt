# Recolekt Codex Instructions

## Project

Recolekt turns Instagram, YouTube, TikTok, and other useful short-form videos into structured, reusable personal knowledge. Recipes are the first vertical. The current product focus is transforming extracted recipe reels into a personal cookbook users return to.

Do not treat Recolekt as a generic bookmark app. Do not optimize for social features, gamification, public profiles, or AI gimmicks before retention loops.

## Current strategic priority

The current goal is retention validation:

1. Users save recipes.
2. Users organize recipes.
3. Users search/reopen recipes.
4. Users cook recipes.
5. Users add notes.
6. Users return and cook again.

## Current roadmap priority

Build in this order:

1. Repair recipe page hierarchy and Cook CTA.
2. Personal notes.
3. Cooking history.
4. Return-to-recipe states.
5. Cook Mode persistence.
6. Library redesign.
7. Collections/folders V2.
8. Search V1.
9. Editing and verified state.
10. Shopping list V2.

## Product principle

The app must move from:

"AI extracted this recipe"

to:

"I can easily cook and reuse this."

The frontend must become calmer, not denser. Hide or collapse transcript, hashtags, confidence details, metadata, and debug-style AI information unless the user is in Inspect/Edit mode.

## UX modes

Library Mode:
- Browse, organize, retrieve, remember.
- Calm, collection-oriented, cookbook-like.

Cook Mode:
- Execute recipe.
- Show ingredients, current step, progress, timers, completion.
- Hide transcript, hashtags, metadata, AI assumptions, nutrition debug.

Inspect/Edit Mode:
- Edit extraction.
- Show confidence, assumptions, source provenance, transcript, raw metadata.

## Local paths

Project root:
`/Users/greg/Downloads/Apps/recolekt-app`

Frontend:
`/Users/greg/Downloads/Apps/recolekt-app/frontend`

Backend:
`/Users/greg/Downloads/Apps/recolekt-app/backend`

## Environments

GitHub has main and staging environments.

Railway deploys backend with main and staging.

Netlify deploys frontend with main and staging.

Never assume production deployment is safe without checking branch, environment variables, migrations, and build status.

## Local terminal workflow

The user normally keeps three terminals open:

Backend:
`cd /Users/greg/Downloads/Apps/recolekt-app/backend`
`export FLASK_APP=api-flask/app.py`
`export FLASK_ENV=development`
`flask run --host=0.0.0.0 --port=5001`

Frontend:
`cd /Users/greg/Downloads/Apps/recolekt-app/frontend`
`VITE_GOOGLE_MAPS_API_KEY=dummy npm run dev`

TypeScript check:
`cd /Users/greg/Downloads/Apps/recolekt-app/frontend`
`npx tsc --noEmit`

## Mandatory validation

After frontend changes:
- Run `cd frontend && npx tsc --noEmit`.
- Do not finish until TypeScript passes or the failure is clearly reported.

After backend changes:
- Run the available backend tests if present.
- At minimum run Python syntax/import checks against changed files.
- Check whether migrations are required.

Before a PR:
- Explain changed files.
- Explain test commands run.
- Explain risks.
- Mention any migrations or env vars.

## Safety rules

Do not commit secrets.
Do not modify `.env` files unless explicitly asked.
Do not deploy to production unless explicitly asked.
Do not rewrite large JSX files using multiline sed/perl.
Prefer small patches.
Use `rg` for search.
Use exact file inspection before editing.
Do not create new dependencies without justification.

## Mac/Zsh command rules

Never include shell comments inside commands intended for the user's terminal.
Never include shebangs in snippets the user will paste directly into Zsh.
Avoid multiline sed/perl regex patches for JSX.
Prefer Python scripts or direct file edits for complex changes.

## Local backend environment rule

The backend is already configured locally with an existing virtual environment.

Local backend path:
`/Users/greg/Downloads/Apps/recolekt-app/backend/api-flask`

Normal local backend command:
`cd /Users/greg/Downloads/Apps/recolekt-app/backend/api-flask`
`source venv/bin/activate`
`python app.py`

Do not run `pip install`, `pip install -r`, dependency upgrades, dependency cleanup, or Python package installs locally unless the user explicitly asks.

For local backend validation, prefer:
`cd /Users/greg/Downloads/Apps/recolekt-app/backend/api-flask`
`source venv/bin/activate`
`python -m py_compile app.py`

If port 5001 is already in use, assume the backend may already be running in another terminal. Do not kill processes unless the user explicitly asks.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, invoke the `skill` tool with `skill: "graphify"` before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
