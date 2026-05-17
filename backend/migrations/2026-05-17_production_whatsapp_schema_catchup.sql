-- Production schema catch-up for WhatsApp linking, inbox ingestion, and reel inserts.
-- This migration is intentionally additive and does not change application runtime behavior.

BEGIN;

-- WhatsApp linking stores the normalized sender number directly on users.
ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS whatsapp_number varchar;

-- PINs are shared by the Instagram and WhatsApp linking flows.
-- auth.py uses ON CONFLICT (pin), so pin must be unique.
CREATE TABLE IF NOT EXISTS public.link_pins (
    id bigserial PRIMARY KEY,
    pin text NOT NULL,
    user_id text NOT NULL,
    platform text NOT NULL,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.link_pins
    ADD COLUMN IF NOT EXISTS id bigserial,
    ADD COLUMN IF NOT EXISTS pin text,
    ADD COLUMN IF NOT EXISTS user_id text,
    ADD COLUMN IF NOT EXISTS platform text,
    ADD COLUMN IF NOT EXISTS expires_at timestamptz,
    ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
    ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS link_pins_pin_uidx
    ON public.link_pins (pin);

CREATE INDEX IF NOT EXISTS link_pins_platform_expires_at_idx
    ON public.link_pins (platform, expires_at);

CREATE INDEX IF NOT EXISTS link_pins_user_id_idx
    ON public.link_pins (user_id);

-- Inbox rows are written by auth.py insert_inbox_item().
CREATE TABLE IF NOT EXISTS public.inbox_items (
    id bigserial PRIMARY KEY,
    user_id text NOT NULL,
    platform text NOT NULL,
    sender_ig_id text,
    raw_url text,
    message_text text,
    status text NOT NULL DEFAULT 'PENDING',
    resolved_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.inbox_items
    ADD COLUMN IF NOT EXISTS id bigserial,
    ADD COLUMN IF NOT EXISTS user_id text,
    ADD COLUMN IF NOT EXISTS platform text,
    ADD COLUMN IF NOT EXISTS sender_ig_id text,
    ADD COLUMN IF NOT EXISTS raw_url text,
    ADD COLUMN IF NOT EXISTS message_text text,
    ADD COLUMN IF NOT EXISTS status text DEFAULT 'PENDING',
    ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
    ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
    ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS inbox_items_user_id_created_at_idx
    ON public.inbox_items (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS inbox_items_platform_sender_idx
    ON public.inbox_items (platform, sender_ig_id);

CREATE INDEX IF NOT EXISTS inbox_items_status_idx
    ON public.inbox_items (status);

-- Columns currently inserted/updated by fetcher_api/services/db_insert.py.
ALTER TABLE public.reels
    ADD COLUMN IF NOT EXISTS user_id text,
    ADD COLUMN IF NOT EXISTS source_url text,
    ADD COLUMN IF NOT EXISTS status text DEFAULT 'processing',
    ADD COLUMN IF NOT EXISTS folder_id text DEFAULT 'default',
    ADD COLUMN IF NOT EXISTS caption text,
    ADD COLUMN IF NOT EXISTS author_name text,
    ADD COLUMN IF NOT EXISTS duration text,
    ADD COLUMN IF NOT EXISTS is_long_video boolean DEFAULT false,
    ADD COLUMN IF NOT EXISTS summary_category text,
    ADD COLUMN IF NOT EXISTS summary_topic text,
    ADD COLUMN IF NOT EXISTS summary_title text,
    ADD COLUMN IF NOT EXISTS summary_text jsonb,
    ADD COLUMN IF NOT EXISTS summary_bullets jsonb,
    ADD COLUMN IF NOT EXISTS summary_hashtags text[],
    ADD COLUMN IF NOT EXISTS summary_emojis text[],
    ADD COLUMN IF NOT EXISTS content_type text,
    ADD COLUMN IF NOT EXISTS recipe jsonb,
    ADD COLUMN IF NOT EXISTS workout jsonb,
    ADD COLUMN IF NOT EXISTS detected_language text,
    ADD COLUMN IF NOT EXISTS gcs_urls jsonb,
    ADD COLUMN IF NOT EXISTS transcription text,
    ADD COLUMN IF NOT EXISTS tools_list jsonb,
    ADD COLUMN IF NOT EXISTS location jsonb,
    ADD COLUMN IF NOT EXISTS prompt jsonb,
    ADD COLUMN IF NOT EXISTS is_list boolean DEFAULT false,
    ADD COLUMN IF NOT EXISTS list_subtype text,
    ADD COLUMN IF NOT EXISTS list_count integer,
    ADD COLUMN IF NOT EXISTS list_type text,
    ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
    ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

COMMIT;
