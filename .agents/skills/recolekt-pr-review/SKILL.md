---
name: recolekt-pr-review
description: Use when reviewing a Recolekt pull request or diff for serious issues, regressions, missing tests, risky data changes, UI hierarchy regressions, security mistakes, or deployment risk.
---

# Recolekt PR Review Skill

## Review priorities

Flag only meaningful issues.

P0:
- data loss
- auth/privacy leak
- production deploy breaker
- secret exposure

P1:
- TypeScript/build failure
- broken recipe page
- broken Cook Mode
- broken saved recipe flow
- migration mismatch
- API contract break
- severe mobile UX regression

P2:
- minor styling issue
- copy improvement
- non-blocking refactor suggestion

## Recolekt-specific checks

- Does this preserve personal cookbook direction?
- Does Cook CTA remain prominent?
- Are transcript/hashtags/metadata still secondary?
- Does user state persist correctly?
- Are notes/cook sessions user-scoped?
- Are migrations safe?
- Does frontend handle missing backend fields?

## Output format

### Verdict
Approve / request changes / needs manual check.

### Blocking issues
Only P0/P1.

### Non-blocking notes
P2.

### Tests expected
List.