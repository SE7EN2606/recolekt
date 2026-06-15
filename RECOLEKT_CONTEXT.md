# Recolekt Project Context

**Context version:** 2026-06-15  
**Repository:** `/Users/greg/Downloads/Apps/recolekt-app`  
**Purpose:** Persistent source of truth for ChatGPT, Codex, and future development sessions.

---

## 0. Instructions for Any New Chat or Coding Agent

Read this file before proposing or changing code.

Use this precedence order when information conflicts:

1. The user's latest message
2. The **Current Working Snapshot** in this file
3. Verified repository state and runtime evidence
4. Stable product and engineering rules in this file
5. Older handoffs, plans, and historical notes

Do not treat a branch, commit, deployment, or bug status as current until it is verified.

### Required behavior

Do not ask:

- “Should I continue?”
- “Do you want me to implement this?”
- “Would you like me to investigate?”

Instead:

1. Analyze the evidence.
2. State the exact diagnosis or best-supported hypothesis.
3. Give the exact Codex prompt when code changes are required.
4. Give exact copy-pasteable ZSH commands for validation.
5. Continue to the next logical step from the returned output.

Never give pseudo-terminal commands.  
Never put explanatory prose inside terminal command blocks.  
Never ask the user to paste a Codex report into Terminal.

### Evidence rules

Prefer:

- browser network evidence;
- Railway logs;
- Flask route inspection;
- exact curl responses;
- database queries;
- Git diffs;
- test and build output.

Do not assume an extraction failure is a frontend failure.  
Do not assume a CORS error is an extraction failure.  
Separate the first failing layer from downstream symptoms.

---

# 1. How We Work

The user works locally on a Mac. ChatGPT coordinates the work, Codex edits the repository, and the user runs commands and returns the results.

## Terminal 1 — Backend, runs continuously

```zsh
cd /Users/greg/Downloads/Apps/recolekt-app/backend/api-flask
source venv/bin/activate
python app.py
```

Local backend:

```text
http://127.0.0.1:5001
```

## Terminal 2 — Frontend, runs continuously

```zsh
cd /Users/greg/Downloads/Apps/recolekt-app/frontend
npm run dev
```

Local frontend:

```text
http://localhost:3000
```

## Terminal 3 — Git, diagnostics, curl, and database commands

```zsh
cd /Users/greg/Downloads/Apps/recolekt-app
```

## Terminal 4 — Codex

Use only for precise implementation prompts and Codex output.

### Important environment rule

`localhost:5001` is Flask, not PostgreSQL.

PostgreSQL is hosted on Neon and must be accessed with:

```zsh
psql "$DATABASE_URL"
```

Never store database URLs, passwords, API tokens, cookies, JWTs, phone numbers, or other secrets in this file.

---

# 2. Product North Star

Recolekt is not merely an AI recipe extractor.

Recolekt is becoming:

> A personal cookbook and memory system built from useful short-form content.

The current primary vertical is recipes. Future verticals may include fitness, travel, DIY, and other useful knowledge.

The core value loop is:

```text
Save Reel
→ Extract Useful Structure
→ Cook or Use It
→ Add Notes and History
→ Return Later
→ Build Personal Memory
```

The moat is not extraction alone. The moat is the user’s accumulated, reusable memory and repeated return behavior.

## Desired consumer feeling

Recolekt should feel:

> “I can easily cook and reuse this.”

It should not feel:

> “AI analyzed this reel.”

The backend may remain complex. The frontend must remain consumer-simple.

---

# 3. Product and UX Principles

## 3.1 Information hierarchy before more components

The principal frontend risk is excessive cognitive load caused by giving equal prominence to recipes, AI output, nutrition, metadata, transcripts, diagnostics, and assumptions.

Do not solve this by adding more cards.

Use:

- progressive disclosure;
- contextual actions;
- clear information hierarchy;
- mode-based screens;
- fewer default-visible sections.

## 3.2 Three product modes

### Library / Cookbook Mode

Purpose:

- browse;
- organize;
- retrieve;
- remember;
- decide what to cook.

It should feel calm, visual, and collection-oriented.

### Cook Mode

Purpose:

- execute the recipe with minimal distraction.

Default surface:

- ingredients;
- current step;
- timers;
- progress;
- wake lock and persistence where applicable.

Do not show hashtags, raw transcript, extraction diagnostics, or metadata overload.

### Detail / Inspect Mode

Purpose:

- inspect;
- edit;
- validate;
- review source and AI uncertainty.

This is where transcript, assumptions, confidence, nutrition details, source metadata, and extraction provenance may live.

## 3.3 Recipe page hierarchy

Visible by default:

- hero image;
- recipe title;
- save or collection state;
- ingredients;
- primary cooking action;
- directions preview;
- personal notes;
- useful cooking history.

Collapsed or secondary:

- transcript;
- hashtags;
- AI assumptions;
- nutrition details;
- confidence details;
- metadata;
- extraction diagnostics.

Admin or advanced-only:

- raw extraction payloads;
- debug metadata;
- extraction provenance.

## 3.4 Trust and uncertainty

Recolekt should not fake certainty.

Missing quantities, assumptions, excluded ingredients, and extraction confidence can create trust, but must stay subtle and should not dominate the cooking experience.

## 3.5 Shopping architecture

Shopping must be recipe-derived, reversible, and explainable.

The intended flow is:

```text
Recipes Planned
→ Ingredients Merged
→ Groceries Generated
→ Cooking Completed
```

Recipes remain the source of truth.

Do not build a disconnected generic grocery checklist.  
Do not store only flattened merged grocery rows.  
Removing a recipe must recompute derived quantities and provenance.

---

# 4. Environments

## Staging

Frontend:

```text
https://staging.recolekt.app
```

Backend:

```text
https://recolekt-staging.up.railway.app
```

## Production

Frontend:

```text
https://recolekt.app
```

API:

```text
https://api.recolekt.app
```

## WhatsApp webhook

```text
https://recolekt.app/api/auth/webhook/whatsapp
```

WhatsApp is currently parked while Meta display-name and sender registration issues are unresolved. Do not let WhatsApp dominate the product roadmap unless the user explicitly returns to it.

---

# 5. Technical Overview

## Frontend

- React
- TypeScript
- Vite
- local development on port 3000

## Backend

- Flask
- Python
- local development on port 5001
- background extraction and processing services

## Infrastructure

- Railway for backend deployments
- Neon PostgreSQL
- production and staging environments
- frontend domains under `recolekt.app`

## Common validation

Backend:

```zsh
cd /Users/greg/Downloads/Apps/recolekt-app/backend/api-flask
source venv/bin/activate
python -m py_compile app.py
```

Frontend typecheck:

```zsh
cd /Users/greg/Downloads/Apps/recolekt-app/frontend
npx tsc --noEmit
```

Frontend production build:

```zsh
cd /Users/greg/Downloads/Apps/recolekt-app/frontend
VITE_GOOGLE_MAPS_API_KEY=dummy npm run build
```

Repository whitespace validation:

```zsh
cd /Users/greg/Downloads/Apps/recolekt-app
git diff --check
```

---

# 6. Stable Feature History

Completed or substantially implemented:

- recipe detail hierarchy;
- Cook Mode V1;
- personal notes;
- cooking history and return-to-recipe loop;
- Gallery and Cookbook split;
- Cookbook decision-page foundation;
- WhatsApp account linking V1;
- WhatsApp inbound reel ingestion V1;
- background processing;
- reel refresh lifecycle and retry-safety work;
- error UX for missing or unavailable reels.

Before creating any supposedly missing feature, inspect the repository. Older handoffs may describe planned work that has since been partly or fully implemented.

---

# 7. Current Working Snapshot

**Snapshot date:** 2026-06-15  
**Status:** Must be verified against Git and deployed routes at the beginning of the next session.

## 7.1 Git snapshot reported in the latest handoff

Reported branch:

```text
staging
```

Reported latest commit:

```text
8e7a33d Repair reel refresh lifecycle and retry safety
```

Reported refs at that time:

```text
staging
origin/staging
repair-video-detail-refresh
```

These reportedly pointed to the same commit.

Always verify with:

```zsh
cd /Users/greg/Downloads/Apps/recolekt-app
git status --short
git branch --show-current
git log --oneline --decorate -8
```

## 7.2 Recently shipped refresh work

Commit `8e7a33d` reportedly included changes around:

Backend:

```text
meta_client.py
processing.py
reel.py
video.py
background_process.py
extractor_assembly.py
extractor_call2.py
db_insert.py
```

Frontend:

```text
VideoDetail.tsx
VideoDetailViewModel.ts
DataContext.tsx
tests
```

## 7.3 Error UX reportedly added after that commit

Missing reel behavior:

When:

```text
GET /api/reel/:id
```

returns `404`, display a clear missing-reel message and a route back to Gallery.

Extraction failure behavior:

When a Facebook or download failure ends with `status=error`, display a clear message explaining that the source may be deleted, private, expired, or blocked.

Reported validation:

```text
npx tsc --noEmit
VITE_GOOGLE_MAPS_API_KEY=dummy npm run build
git diff --check
```

The latest handoff said this specific UI work had not yet been committed. Verify rather than assuming it remains uncommitted.

---

# 8. Immediate Critical Bug

## Refresh request blocked by failed preflight

Observed Railway request:

```text
404 OPTIONS /api/reels/:id/refresh
```

Example shape:

```text
OPTIONS /api/reels/<reel-id>/refresh
```

Frontend intends to call:

```text
POST /api/reels/:id/refresh
```

The browser sends an `OPTIONS` CORS preflight before the POST. The backend returns `404`, so the browser blocks the POST completely and reports a CORS or `Failed to fetch` error.

## Supported diagnosis

This is currently a backend routing, route-registration, deployment, or OPTIONS-handling problem.

It is not evidence of a Facebook extraction failure because the POST never reaches refresh processing.

Possible causes:

1. The route is absent from the staging deployment.
2. The frontend and backend disagree on singular versus plural route paths.
3. The route exists under a different blueprint or prefix.
4. The blueprint is not registered.
5. Flask-CORS or explicit OPTIONS handling does not cover the route.
6. Frontend deployment reached staging before the backend deployment.

## First files to inspect

```text
backend/api-flask/fetcher_api/api/routes/reel.py
backend/api-flask/fetcher_api/api/routes/video.py
backend/api-flask/fetcher_api/api/__init__.py
backend/api-flask/fetcher_api/api/routes/__init__.py
backend/api-flask/app.py
frontend/src/pages/VideoDetail.tsx
frontend/src/context/DataContext.tsx
```

## Required investigation sequence

1. Find every refresh route and every frontend refresh URL.
2. Print or inspect Flask’s URL map.
3. Verify the blueprint prefix and registration.
4. Test OPTIONS directly against local and staging.
5. Test POST only after OPTIONS succeeds.
6. Compare local route behavior with the deployed staging backend.
7. Fix the smallest failing layer without changing the UI.

## Codex prompt for the immediate task

```text
Investigate the Recolekt reel refresh endpoint failure.

Observed behavior:

Frontend intends to send:
POST /api/reels/:id/refresh

The browser first sends:
OPTIONS /api/reels/:id/refresh

Railway staging logs show:
404 OPTIONS /api/reels/:id/refresh

The POST is therefore blocked by CORS and refresh processing never starts.

Tasks:

1. Find all backend refresh endpoint implementations.
2. Find the exact frontend URL construction.
3. Verify singular/plural route consistency.
4. Verify Flask blueprint prefixes and blueprint registration.
5. Verify the route is present in Flask's URL map.
6. Verify whether Flask-CORS or the route handles OPTIONS.
7. Determine whether the staging backend can be missing the latest route.
8. Fix the smallest root cause without changing the UI or app shell.
9. Add or update focused tests where practical.
10. Validate backend syntax and frontend TypeScript.

Return:

- exact root cause;
- files changed;
- route before and after;
- validation results;
- exact local curl command for OPTIONS;
- exact staging curl command for OPTIONS;
- exact authenticated POST curl shape, using placeholders rather than secrets.
```

## Direct diagnostic commands

Search route definitions and frontend calls:

```zsh
cd /Users/greg/Downloads/Apps/recolekt-app
rg -n "refresh|/api/reels|/api/reel" backend/api-flask frontend/src
```

Inspect current Git state:

```zsh
cd /Users/greg/Downloads/Apps/recolekt-app
git status --short
git branch --show-current
git log --oneline --decorate -8
```

Test staging preflight shape:

```zsh
curl -i -X OPTIONS "https://recolekt-staging.up.railway.app/api/reels/REEL_ID/refresh" \
  -H "Origin: https://staging.recolekt.app" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: authorization,content-type"
```

A successful preflight should not return `404`. It should return a successful status and appropriate CORS headers.

---

# 9. Facebook Extraction Finding

A tested Facebook reel failed because the source itself appeared dead or unavailable and `yt-dlp` could not parse or access it.

That specific failure was not proof of:

- a refresh regression;
- a database bug;
- a frontend bug;
- the current CORS preflight bug.

Maintain clear user-facing distinctions among:

- deleted or unavailable source;
- private or blocked content;
- rate limiting or login requirement;
- extraction service error;
- refresh route failure;
- missing saved reel.

Do not collapse these into one generic “refresh failed” state.

---

# 10. Files Frequently Involved

Recent refresh and extraction work has concentrated around:

```text
backend/api-flask/fetcher_api/api/routes/reel.py
backend/api-flask/fetcher_api/api/routes/video.py
backend/api-flask/fetcher_api/api/helpers/processing.py
backend/api-flask/fetcher_api/adapters/meta_client.py
backend/api-flask/fetcher_api/services/background_process.py
backend/api-flask/fetcher_api/services/extractor_assembly.py
frontend/src/pages/VideoDetail.tsx
frontend/src/pages/VideoDetailViewModel.ts
frontend/src/context/DataContext.tsx
```

Do not redesign:

- the app shell;
- navigation;
- PWA behavior;

unless the task explicitly requires it.

---

# 11. Roadmap Order

## First

Stabilize reel refresh end to end:

```text
Click Refresh
→ OPTIONS succeeds
→ POST executes
→ background refresh starts
→ status updates correctly
→ success or meaningful error appears
```

## Then

Shopping and Meal Planning Foundation, after verifying what already exists in the repository.

Target architecture:

### Tables

```text
shopping_lists
shopping_recipe_entries
shopping_item_overrides
```

### API shape

```text
GET    /shopping-list
POST   /shopping-list/recipes
DELETE /shopping-list/recipes/:reelId
PATCH  /shopping-list/items/:ingredientKey
```

### Product flow

```text
Recipe
→ Plan
→ Derived Grocery List
→ Cook
```

### Constraints

Do not build yet:

- delivery integrations;
- barcode scanning;
- detailed pantry inventory;
- collaboration;
- AI nutrition planning;
- a generic standalone checklist.

Before implementing this sprint, search the repository for existing shopping migrations, pages, hooks, routes, and merge logic to avoid duplicate architecture.

---

# 12. WhatsApp Status

WhatsApp Drop Box linking and inbound ingestion were implemented and tested with Meta’s test setup.

The real business sender remained blocked by Meta display-name or sender-registration approval.

Current decision:

> Park WhatsApp and continue the core product roadmap.

Only resume WhatsApp work when:

- Meta approval changes;
- the user explicitly asks;
- a regression affects existing working ingestion.

Do not include access tokens, phone numbers, account IDs, database hosts, or other credentials in prompts, handoffs, logs, or commits.

---

# 13. Session Start Protocol

At the beginning of a new coding session, run:

```zsh
cd /Users/greg/Downloads/Apps/recolekt-app

git status --short
git branch --show-current
git log --oneline --decorate -8
```

Then search the current task before designing anything:

```zsh
cd /Users/greg/Downloads/Apps/recolekt-app
rg -n "TASK_KEYWORD" backend frontend
```

For the current refresh task:

```zsh
cd /Users/greg/Downloads/Apps/recolekt-app
rg -n "refresh|/api/reels|/api/reel" backend/api-flask frontend/src
```

Use the returned evidence to give the next exact Codex prompt or command block.

---

# 14. Session Close and Context Maintenance Protocol

This file replaces repeated full handoffs.

At the end of each completed sprint or major debugging session, update only these sections:

1. `Context version`
2. `Current Working Snapshot`
3. `Immediate Critical Bug`
4. `Roadmap Order`
5. `Stable Feature History`, only when a feature is genuinely complete
6. `Change Log`

Do not append another complete handoff.

## Required closeout information

Record:

- final branch;
- final commit;
- deployed environment;
- root cause;
- files changed;
- validations passed;
- remaining blocker;
- exact next task.

Remove outdated temporary details rather than keeping contradictory states.

## Security rule

Never add:

- access tokens;
- passwords;
- JWTs;
- cookies;
- private database URLs;
- personal email addresses;
- private phone numbers;
- account identifiers not required for architecture.

---

# 15. Change Log

## 2026-06-15

- Consolidated the May 18 handoff, investor UX principles, and June 15 refresh-debugging handoff.
- Separated stable product context from mutable working status.
- Marked WhatsApp as parked.
- Made the failed `OPTIONS /api/reels/:id/refresh` preflight the immediate engineering task.
- Added a protocol for updating this file instead of rebuilding full handoffs.
