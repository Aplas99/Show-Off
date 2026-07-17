-- Reverses 20260715090000_add_multigame_tcg_cards.sql and
-- 20260716090000_add_tcg_card_name_search.sql. The generic multi-game
-- (TCGTracking) integration was undone in favor of a dedicated
-- magicthegathering.io-based Magic integration -- see api/pokemon/ for
-- the equivalent pattern this replaces. Migrations are forward-only, so
-- this is a new migration that drops the earlier objects rather than
-- editing/removing those files.

DROP FUNCTION IF EXISTS public.search_tcg_cards(TEXT, INTEGER, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS public.create_tcg_card_batch(UUID, TEXT[], NUMERIC[]);

ALTER TABLE public.items DROP COLUMN IF EXISTS tcg_card_id;

DROP TABLE IF EXISTS public.tcg_cards CASCADE;

NOTIFY pgrst, 'reload schema';
