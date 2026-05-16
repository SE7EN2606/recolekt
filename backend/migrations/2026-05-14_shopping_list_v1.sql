-- Shopping List Foundation V1
-- Source of truth is planned recipe entries plus per-ingredient item overrides.
-- Merged grocery rows are derived by the client for V1.

CREATE TABLE IF NOT EXISTS shopping_lists (
    id BIGSERIAL PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id)
);

CREATE TABLE IF NOT EXISTS shopping_recipe_entries (
    id BIGSERIAL PRIMARY KEY,
    shopping_list_id BIGINT NOT NULL REFERENCES shopping_lists(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    reel_id TEXT NOT NULL,
    servings NUMERIC,
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (shopping_list_id, reel_id)
);

CREATE TABLE IF NOT EXISTS shopping_item_overrides (
    id BIGSERIAL PRIMARY KEY,
    shopping_list_id BIGINT NOT NULL REFERENCES shopping_lists(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    ingredient_key TEXT NOT NULL,
    checked BOOLEAN NOT NULL DEFAULT FALSE,
    excluded BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (shopping_list_id, ingredient_key)
);

CREATE INDEX IF NOT EXISTS idx_shopping_recipe_entries_user_reel
ON shopping_recipe_entries (user_id, reel_id);

CREATE INDEX IF NOT EXISTS idx_shopping_item_overrides_user_key
ON shopping_item_overrides (user_id, ingredient_key);

CREATE INDEX IF NOT EXISTS idx_shopping_item_overrides_list_excluded
ON shopping_item_overrides (shopping_list_id, excluded);

CREATE INDEX IF NOT EXISTS idx_shopping_item_overrides_list_checked
ON shopping_item_overrides (shopping_list_id, checked);
