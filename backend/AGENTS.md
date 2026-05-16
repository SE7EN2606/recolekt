# Recolekt Backend Rules

## Stack assumptions

This is the Recolekt backend. It includes a Flask API under api-flask.

Always inspect backend files before assuming framework, database layer, migration tool, or test command.

## Backend priorities

Current backend work should support retention loops:

1. Personal notes.
2. Cooking sessions.
3. Cooking history.
4. Return-to-recipe summaries.
5. Collections/folders.
6. Search indexes.
7. User edits/overrides.
8. Shopping list persistence.

## Data principles

Do not destroy original AI extraction.
Store user edits/overrides separately where practical.
Support user-specific state:
- notes
- cook sessions
- checked ingredients
- current step
- completed_at
- verified_by_user
- collections
- search metadata

## API principles

APIs should be simple and demo-safe.
Prefer stable JSON contracts.
Return derived summary fields for frontend use where helpful:
- cook_count
- last_cooked_at
- has_active_session
- active_session_id
- user_note_count
- verified_by_user

## Validation

After backend changes:
- Run existing backend tests if available.
- Run syntax/import checks on changed files.
- Check whether database migrations are required.
- Document any required Railway environment variables.

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
