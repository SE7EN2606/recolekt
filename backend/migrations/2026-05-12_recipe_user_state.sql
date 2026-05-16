-- =============================================================================
-- Recolekt recipe user-state persistence
-- Target first: Neon Dev only
--
-- Dev host:  ep-little-bonus-ag0pqh91-pooler.c-2.eu-central-1.aws.neon.tech
-- Prod host: ep-spring-shadow-ag1tupu6-pooler.c-2.eu-central-1.aws.neon.tech
--
-- This migration is append-only. It does not modify existing tables.
-- Recipe extraction remains in reels.recipe JSONB; user state lives separately.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Personal notes: one mutable note per user/reel.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS recipe_personal_notes (
    id          BIGSERIAL PRIMARY KEY,
    user_id     TEXT NOT NULL,
    reel_id     TEXT NOT NULL,
    note_text   TEXT NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, reel_id)
);

CREATE INDEX IF NOT EXISTS idx_recipe_personal_notes_user_reel
ON recipe_personal_notes (user_id, reel_id);

CREATE INDEX IF NOT EXISTS idx_recipe_personal_notes_user_updated
ON recipe_personal_notes (user_id, updated_at DESC);


-- -----------------------------------------------------------------------------
-- Cook sessions: active/completed local cooking progress per user/reel.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS recipe_cook_sessions (
    id                     BIGSERIAL PRIMARY KEY,
    user_id                TEXT NOT NULL,
    reel_id                TEXT NOT NULL,
    status                 TEXT NOT NULL DEFAULT 'active',
    started_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at           TIMESTAMPTZ,
    last_active_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    current_step_index     INTEGER NOT NULL DEFAULT 0,
    checked_ingredient_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    completed_step_ids     JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (status IN ('active', 'completed', 'abandoned')),
    CHECK (current_step_index >= 0)
);

CREATE INDEX IF NOT EXISTS idx_recipe_cook_sessions_user_reel
ON recipe_cook_sessions (user_id, reel_id);

CREATE INDEX IF NOT EXISTS idx_recipe_cook_sessions_user_reel_recent
ON recipe_cook_sessions (user_id, reel_id, last_active_at DESC);

CREATE INDEX IF NOT EXISTS idx_recipe_cook_sessions_user_status
ON recipe_cook_sessions (user_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_recipe_cook_sessions_one_active
ON recipe_cook_sessions (user_id, reel_id)
WHERE status = 'active';


-- -----------------------------------------------------------------------------
-- Cook summaries: denormalized return-to-recipe state per user/reel.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS recipe_cook_summaries (
    id                  BIGSERIAL PRIMARY KEY,
    user_id             TEXT NOT NULL,
    reel_id             TEXT NOT NULL,
    cook_count          INTEGER NOT NULL DEFAULT 0,
    last_cooked_at      TIMESTAMPTZ,
    has_active_session  BOOLEAN NOT NULL DEFAULT FALSE,
    active_session_id   BIGINT REFERENCES recipe_cook_sessions(id) ON DELETE SET NULL,
    verified_by_user    BOOLEAN NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, reel_id),
    CHECK (cook_count >= 0)
);

CREATE INDEX IF NOT EXISTS idx_recipe_cook_summaries_user_reel
ON recipe_cook_summaries (user_id, reel_id);

CREATE INDEX IF NOT EXISTS idx_recipe_cook_summaries_user_last_cooked
ON recipe_cook_summaries (user_id, last_cooked_at DESC);

CREATE INDEX IF NOT EXISTS idx_recipe_cook_summaries_active_session
ON recipe_cook_summaries (active_session_id)
WHERE active_session_id IS NOT NULL;
