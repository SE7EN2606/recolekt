CREATE TABLE IF NOT EXISTS reel_folder_suggestions (
    id text PRIMARY KEY,
    user_id text NOT NULL,
    reel_id text NOT NULL,
    suggested_folder_id text,
    suggested_folder_name text,
    suggestion_type text NOT NULL,
    confidence numeric,
    reason text,
    signals jsonb,
    status text NOT NULL DEFAULT 'pending',
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    applied_at timestamptz,
    dismissed_at timestamptz,
    CHECK (suggestion_type IN ('existing_folder', 'new_folder')),
    CHECK (status IN ('pending', 'applied', 'dismissed'))
);

CREATE INDEX IF NOT EXISTS reel_folder_suggestions_user_status_idx
    ON reel_folder_suggestions (user_id, status);

CREATE INDEX IF NOT EXISTS reel_folder_suggestions_user_folder_idx
    ON reel_folder_suggestions (user_id, suggested_folder_id);

CREATE INDEX IF NOT EXISTS reel_folder_suggestions_reel_idx
    ON reel_folder_suggestions (reel_id);

CREATE INDEX IF NOT EXISTS reel_folder_suggestions_created_at_idx
    ON reel_folder_suggestions (created_at);

CREATE UNIQUE INDEX IF NOT EXISTS reel_folder_suggestions_pending_unique_idx
    ON reel_folder_suggestions (
        user_id,
        reel_id,
        suggestion_type,
        COALESCE(suggested_folder_id, ''),
        COALESCE(suggested_folder_name, '')
    )
    WHERE status = 'pending';
