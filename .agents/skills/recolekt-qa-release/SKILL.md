---
name: recolekt-qa-release
description: Use before merging, deploying, or declaring a Recolekt sprint done. Checks frontend, backend, migrations, environment variables, staging safety, and demo readiness.
---

# Recolekt QA + Release Skill

## Goal

Make sure changes are safe for staging and demo.

## Checklist

Frontend:
- TypeScript passes.
- Main recipe page works.
- Mobile layout works.
- Cook CTA visible.
- No console-breaking obvious issue.

Backend:
- API starts or tests pass.
- Changed endpoints return expected JSON.
- Migrations identified.
- User-specific data is protected.

Product:
- Change supports retention loop.
- Does not add unnecessary dashboard density.
- Does not prioritize delayed features.

Deployment:
- Identify target branch.
- Identify whether Netlify frontend deploy is affected.
- Identify whether Railway backend deploy is affected.
- Mention env vars if needed.
- Mention migrations if needed.

## Final response format

### Ready / Not ready
Clear verdict.

### Passed checks
List.

### Failed or unverified checks
List.

### Deployment notes
Main/staging impact.

### Recommended next action
One action.