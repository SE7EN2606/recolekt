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