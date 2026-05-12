---
name: recolekt-sprint-planner
description: Use when planning or breaking down Recolekt roadmap work into small implementation tasks, especially recipe page hierarchy, notes, cooking history, cook mode, library, collections, search, editing, shopping list, staging, and investor-demo readiness.
---

# Recolekt Sprint Planner Skill

## Goal

Turn product roadmap items into small safe engineering tasks.

## Product priority order

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

## Planning rules

Do not create broad vague tasks.
Do not combine frontend, backend, database, and deployment into one oversized task unless explicitly requested.
Each task must include:

- user outcome
- files likely touched
- backend/API impact
- frontend impact
- database/migration impact
- validation command
- acceptance criteria
- rollback risk

## Output format

Use this format:

### Task
Short name.

### User outcome
What the user can do after this.

### Scope
What is included.

### Not included
What must not be added yet.

### Files to inspect first
List likely files.

### Implementation steps
Small ordered steps.

### Validation
Commands and browser checks.

### Acceptance criteria
Concrete pass/fail criteria.