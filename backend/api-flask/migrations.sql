-- =============================================================================
-- RECOLEKT DATABASE MIGRATIONS
-- Apply in order. Always run on BOTH prod and staging after any change.
-- Connect to prod:    psql "postgresql://...ep-spring-shadow...neondb"
-- Connect to staging: psql "postgresql://...ep-little-bonus...neondb"
-- =============================================================================


-- -----------------------------------------------------------------------------
-- MIGRATION 001 — Initial reels table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reels (
    id                  TEXT PRIMARY KEY,
    user_id             TEXT NOT NULL,
    source_url          TEXT,
    caption             TEXT,
    author_name         TEXT,
    status              TEXT DEFAULT 'processing',
    summary_title       TEXT,
    summary_topic       TEXT,
    summary_hashtags    TEXT,
    summary_bullets     TEXT,
    transcription       TEXT,
    folder_id           TEXT DEFAULT 'default',
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    search_vector       TSVECTOR,
    summary_category    TEXT,
    summary_emojis      TEXT,
    duration            TEXT,
    detected_language   TEXT,
    content_type        TEXT,
    recipe              JSONB,
    is_favorite         BOOLEAN DEFAULT FALSE,
    is_long_video       BOOLEAN DEFAULT FALSE,
    gcs_urls            JSONB,
    summary_text        TEXT,
    workout             JSONB,
    error_message       TEXT,
    embedding           VECTOR(1536),
    duration_seconds    NUMERIC,
    processing_strategy TEXT
);


-- -----------------------------------------------------------------------------
-- MIGRATION 002 — Users table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id          TEXT PRIMARY KEY,
    email       TEXT UNIQUE NOT NULL,
    name        TEXT,
    picture     TEXT,
    language    TEXT DEFAULT 'en',
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);


-- -----------------------------------------------------------------------------
-- MIGRATION 003 — Folders table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS folders (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL,
    name        TEXT NOT NULL,
    parent_id   TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);


-- -----------------------------------------------------------------------------
-- MIGRATION 004 — Linked accounts (Instagram DM integration)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS linked_accounts (
    id                  SERIAL PRIMARY KEY,
    user_id             TEXT NOT NULL,
    platform            TEXT NOT NULL,
    platform_user_id    TEXT NOT NULL,
    platform_username   TEXT,
    linked_at           TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (platform, platform_user_id)
);


-- -----------------------------------------------------------------------------
-- MIGRATION 005 — Linking tokens (Instagram DM onboarding)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS linking_tokens (
    token               TEXT PRIMARY KEY,
    platform            TEXT NOT NULL,
    platform_user_id    TEXT NOT NULL,
    expires_at          TIMESTAMPTZ NOT NULL,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);


-- -----------------------------------------------------------------------------
-- MIGRATION 006 — API tokens
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS api_tokens (
    id          SERIAL PRIMARY KEY,
    user_id     TEXT NOT NULL,
    token       TEXT UNIQUE NOT NULL,
    is_revoked  BOOLEAN DEFAULT FALSE,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    last_used_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS user_api_tokens (
    id          SERIAL PRIMARY KEY,
    user_id     TEXT NOT NULL,
    token_hash  TEXT UNIQUE NOT NULL,
    is_active   BOOLEAN DEFAULT TRUE,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    last_used_at TIMESTAMPTZ
);


-- -----------------------------------------------------------------------------
-- MIGRATION 007 — Billing
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS billing_customers (
    user_id     TEXT PRIMARY KEY,
    stripe_id   TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_entitlements (
    user_id     TEXT PRIMARY KEY,
    plan        TEXT DEFAULT 'free',
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);


-- -----------------------------------------------------------------------------
-- MIGRATION 008 — Search vector trigger (current version)
-- Run this any time the trigger logic changes.
-- Last updated: 2026-03-30 — fixed jsonb_typeof(text) error + author → author_name
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_reels_search_vector()
RETURNS TRIGGER AS $$
DECLARE
  summary_title_text TEXT;
BEGIN
  summary_title_text := CASE
    WHEN NEW.summary_title IS NULL THEN ''
    WHEN NEW.summary_title::text LIKE '{%' THEN
      COALESCE(NEW.summary_title::jsonb->>'english', '') || ' ' ||
      COALESCE(NEW.summary_title::jsonb->>'original', '') || ' ' ||
      COALESCE(NEW.summary_title::jsonb->>'title', '')
    ELSE NEW.summary_title::text
  END;

  NEW.search_vector := to_tsvector('english',
    COALESCE(summary_title_text, '') || ' ' ||
    COALESCE(NEW.author_name, '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS reels_search_vector_update ON reels;

CREATE TRIGGER reels_search_vector_update
BEFORE INSERT OR UPDATE ON reels
FOR EACH ROW EXECUTE FUNCTION update_reels_search_vector();


-- -----------------------------------------------------------------------------
-- FUTURE MIGRATIONS — Add below with incrementing numbers
-- Example:
-- MIGRATION 009 — Add xyz column to reels
-- ALTER TABLE reels ADD COLUMN IF NOT EXISTS xyz TEXT;
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- MIGRATION 010 — User preferences for UI and measurements
-- -----------------------------------------------------------------------------
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS dark_mode BOOLEAN DEFAULT FALSE;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS measurement_system TEXT DEFAULT 'metric';

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS temperature_unit TEXT DEFAULT 'celsius';

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS volume_preference TEXT DEFAULT 'metric';

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS recipe_conversion TEXT DEFAULT 'do_not_convert';

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS rounding TEXT DEFAULT 'rounded';


-- -----------------------------------------------------------------------------
-- MIGRATION 011 — Private per-user recipe notes
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS recipe_personal_notes (
    id          SERIAL PRIMARY KEY,
    user_id     TEXT NOT NULL,
    reel_id     TEXT NOT NULL,
    note_text   TEXT NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (user_id, reel_id)
);

CREATE INDEX IF NOT EXISTS idx_recipe_personal_notes_user_reel
    ON recipe_personal_notes (user_id, reel_id);
