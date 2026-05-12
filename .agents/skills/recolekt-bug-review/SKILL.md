---
name: recolekt-bug-review
description: Use when diagnosing compile errors, broken JSX, runtime bugs, regressions, unexpected UI changes, failed builds, broken recipe rendering, or backend API failures in Recolekt.
---

# Recolekt Bug Review Skill

## First rule

Do not guess. Inspect the exact file and exact error.

## Debug workflow

1. Reproduce or read the exact error.
2. Locate the smallest relevant code area.
3. Identify whether this is syntax, type, runtime, data-shape, API, or styling.
4. Patch the smallest safe fix.
5. Run validation.
6. Explain root cause.

## Known historical issues

Avoid JSX corruption from broad regex replacements.
Avoid wrapping unrelated self-closing tags.
Avoid adjacent JSX elements without a parent.
Avoid passing stale props into RecipeDetailsCard.
Avoid making Ask tab default.
Avoid regressing Cook CTA visibility.

## Output format

### Root cause
One clear explanation.

### Fix
What changed.

### Validation
Command run and result.

### Risk
What still might be wrong.