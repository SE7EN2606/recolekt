
-- 2026-03-08 | Performance: composite index for get_reel fast lookup
-- Run on BOTH staging and production NeonDB
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_reels_user_id_id
ON public.reels (user_id, id);

