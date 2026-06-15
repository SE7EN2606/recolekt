# Recolekt Project Context

**Context version:** 2026-06-15.2
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
- reel refresh lifecycle and retry-safety work.

Before creating any supposedly missing feature, inspect the repository. Older handoffs may describe planned work that has since been partly or fully implemented.

---

# 7. Current Working Snapshot

**Snapshot date:** 2026-06-15  
**Status:** Verified locally at session close.

## 7.1 Verified Git Snapshot

Final branch:

```text
staging
```

Final commit:

```text
6afb04f Add persistent Recolekt project context
```

Recent log at close:

```text
6afb04f (HEAD -> staging, origin/staging) Add persistent Recolekt project context
8e7a33d (repair-video-detail-refresh) Repair reel refresh lifecycle and retry safety
df7056e (restore-stable-ui-shell) Restore stable pre-PWA application shell
6922a6f Avoid iOS PWA fixed-layer compositor bug
835b931 Reload broken iOS PWA viewport on first launch
1689323 Stabilize iOS PWA header and bottom navigation
4b78b8d Add Recolekt product design context
c13ca7b Add Recolekt product design context
```

Working tree at close:

```text
 M frontend/src/pages/VideoDetail.tsx
```

Deployed environment:

```text
Not deployed from this working tree. The final change is local only.
```

Always verify with:

```zsh
cd /Users/greg/Downloads/Apps/recolekt-app
git status --short
git branch --show-current
git log --oneline --decorate -8
```

## 7.2 Completed Local Work Since Last Commit

Missing reel behavior:

When:

```text
GET /api/reel/:id
```

returns `404`, `VideoDetail.tsx` now displays:

```text
This saved reel no longer exists. It may have been deleted or replaced during refresh. Go back to Gallery.
```

Extraction failure behavior:

When a Facebook or download failure ends with `status=error`, `VideoDetail.tsx` now displays:

```text
This Facebook reel could not be accessed. It may be deleted, private, expired, or blocked by Facebook.
```

Confirmed root cause:

```text
VideoDetail's detail fetch threw a generic HTTP error without preserving response status. A 404 could therefore leave the page in a skeleton/null view-model path. Separately, processing error rows could leave stale refresh banners instead of a clear source-access message.
```

Files changed:

```text
frontend/src/pages/VideoDetail.tsx
```

Validations passed:

```text
npx tsc --noEmit
VITE_GOOGLE_MAPS_API_KEY=dummy npm run build
git diff --check
```

Remaining blocker:

```text
The VideoDetail error UX change is validated locally but uncommitted and undeployed.
```

Exact next task:

```text
Review the single-file VideoDetail.tsx diff, commit it intentionally, deploy staging, and verify:
1. an authenticated /api/reel/:id 404 renders the missing-reel message;
2. a status=error Facebook/download failure renders the Facebook access message;
3. no stale refresh banner remains on either error page.
```

---

# 8. Immediate Critical Bug

## Uncommitted VideoDetail Error UX

Current critical task is release hygiene, not a new diagnosis:

```text
frontend/src/pages/VideoDetail.tsx contains a validated local fix for missing-reel and Facebook/download-error UX, but the change is not committed or deployed.
```

Do not start another broad refresh or extraction refactor before landing this single-file UX fix.

## Exact next Codex task

```text
Review the current VideoDetail.tsx diff only.
Confirm it does not touch shell, PWA, Header, MobileMenu, MobileBottomNav, App shell CSS, Home, or Gallery design.
Run:
git diff --check
cd frontend
npx tsc --noEmit
VITE_GOOGLE_MAPS_API_KEY=dummy npm run build

If validation still passes, commit the VideoDetail error UX fix with a concise message, push staging, and verify the staging UI for:
- /api/reel/:id returning 404;
- status=error with facebook_extraction_failed or download failure.
```

---

# 9. Facebook Extraction Finding

A tested Facebook reel failed because the source itself appeared dead or unavailable and `yt-dlp` could not parse or access it.

That specific failure was not proof of:

- a refresh regression;
- a database bug;
- a frontend bug.

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

Land and deploy the validated VideoDetail error UX:

```text
review single-file diff
→ commit intentionally
→ deploy staging
→ verify missing-reel message
→ verify Facebook/download access-failure message
→ confirm stale refresh banners do not appear
```

## Then

Resume refresh lifecycle verification only if staging evidence shows a current refresh failure.

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

For the current VideoDetail error UX task:

```zsh
cd /Users/greg/Downloads/Apps/recolekt-app
git diff -- frontend/src/pages/VideoDetail.tsx
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
- Added a protocol for updating this file instead of rebuilding full handoffs.
- Replaced obsolete refresh-preflight temporary status with the verified local state: branch `staging`, final commit `6afb04f`, and one uncommitted `VideoDetail.tsx` error-UX change.
- Recorded the confirmed error-UX root cause, files changed, local validation passed, remaining blocker, and exact next task.
