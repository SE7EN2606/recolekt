---
name: recolekt-backend-api-db
description: Use when implementing Recolekt backend APIs, database models, migrations, persistence, user state, cooking sessions, notes, collections, search indexes, recipe edits, and shopping lists.
---

# Recolekt Backend API + Database Skill

## Goal

Support recipe reuse and retention.

## Priority entities

Personal notes:
- user_id
- recipe_id or video_id
- note_text
- created_at
- updated_at

Cooking sessions:
- user_id
- recipe_id or video_id
- status
- started_at
- completed_at
- last_active_at
- current_step_index
- checked_ingredient_ids
- completed_step_ids

Cook summary:
- cook_count
- last_cooked_at
- has_active_session
- active_session_id
- verified_by_user

Collections:
- user_id
- name
- pinned
- created_at
- updated_at

Collection items:
- collection_id
- recipe_id or video_id
- added_at

Search:
- title
- ingredients
- tags
- category
- topic
- notes
- collection

## API design rules

Keep endpoints predictable.
Return frontend-ready summaries when useful.
Do not expose private data across users.
Do not destroy original AI extraction when applying user edits.

## Migration rules

Check current migration system before creating migration files.
Make migrations reversible where the project convention supports it.
Mention migration command in final response.

## Validation

Run available backend tests.
Run Python syntax/import checks.
Document what could not be validated.