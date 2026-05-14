-- Recipe user overrides preserve the original extracted recipe JSON separately.
-- Apply manually to the target Neon database when ready.

CREATE TABLE IF NOT EXISTS recipe_user_overrides (
    id BIGSERIAL PRIMARY KEY,
    user_id TEXT NOT NULL,
    reel_id TEXT NOT NULL,
    override_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    verified_by_user BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, reel_id)
);

CREATE INDEX IF NOT EXISTS idx_recipe_user_overrides_user_reel
ON recipe_user_overrides (user_id, reel_id);

CREATE INDEX IF NOT EXISTS idx_recipe_user_overrides_user_updated
ON recipe_user_overrides (user_id, updated_at DESC);
