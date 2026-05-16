---
name: recolekt-deployment-check
description: Use when preparing Recolekt staging or production deployment involving GitHub branches, Railway backend, Netlify frontend, environment variables, database migrations, or release verification.
---

# Recolekt Deployment Check Skill

## Environments

GitHub:
- main
- staging

Railway backend:
- main
- staging

Netlify frontend:
- main
- staging

## Rules

Never assume production deployment is intended.
Default to staging unless explicitly told otherwise.
Check whether backend and frontend must deploy together.
Check whether migrations are needed before backend deploy.
Check whether frontend requires new env vars.
Check whether API contract changed.

## Pre-deploy checklist

- Branch confirmed.
- TypeScript passes.
- Backend validation completed.
- Migrations identified.
- Env vars identified.
- Rollback risk identified.
- Manual smoke test path listed.

## Smoke test paths

Recipe detail:
- open saved recipe
- verify hero/title
- verify big Cook CTA
- verify ingredients
- verify steps
- verify notes/history if relevant

Cook flow:
- start cooking
- advance step
- leave and return
- complete cooking

Library:
- open library
- search recipe
- collection visible
- cooked/notes badges visible if relevant

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
