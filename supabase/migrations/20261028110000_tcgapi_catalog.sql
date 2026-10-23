-- The shared card pipeline (tcg_cards / items.tcg_card_id) moves from
-- PokéWallet to TCG API (https://tcgapi.dev). TCG API ids are numeric and
-- its images are public TCGplayer CDN URLs, so nothing PokéWallet wrote is
-- kept: its cached cards, set rosters, prices and product mappings, and the
-- items linked to its cards, are deleted. Dragon Ball Super splits into
-- Fusion World ('dbs') and Masters ('dbm'), as TCG API lists them.
--
-- The tcg-card-images bucket held PokéWallet image copies and is no longer
-- written. Storage objects can't be deleted from SQL: empty the bucket in the
-- dashboard (Storage → tcg-card-images) after applying this.

-- 1. Remove everything PokéWallet added. Deleting items cascades to their
--    showcase links, likes, comments, bookmarks and shares.
DELETE FROM public.items WHERE tcg_card_id IS NOT NULL;
DELETE FROM public.price_history
  WHERE game IN ('ygo', 'op', 'lor', 'fab', 'dgm', 'swu', 'dbs', 'cfv', 'cpk');
DELETE FROM public.card_tcgplayer_products
  WHERE game IN ('ygo', 'op', 'lor', 'fab', 'dgm', 'swu', 'dbs', 'cfv', 'cpk');
DELETE FROM public.tcg_set_rosters;
DELETE FROM public.tcg_cards;
DELETE FROM public.catalog_proxy_usage WHERE provider = 'pokewallet';

-- 2. TCG API ids and game codes. Keep in sync with lib/tcgApiCatalog.ts and
--    constants/tcgGames.ts.
ALTER TABLE public.tcg_cards DROP CONSTRAINT IF EXISTS tcg_cards_id_check;
ALTER TABLE public.tcg_cards ADD CONSTRAINT tcg_cards_id_check
  CHECK (id ~ '^[0-9]{1,12}$');
ALTER TABLE public.tcg_cards DROP CONSTRAINT IF EXISTS tcg_cards_game_check;
ALTER TABLE public.tcg_cards ADD CONSTRAINT tcg_cards_game_check
  CHECK (game IN ('ygo', 'op', 'lor', 'fab', 'dgm', 'swu', 'dbs', 'dbm', 'cfv', 'cpk'));

ALTER TABLE public.tcg_set_rosters DROP CONSTRAINT IF EXISTS tcg_set_rosters_set_id_check;
ALTER TABLE public.tcg_set_rosters ADD CONSTRAINT tcg_set_rosters_set_id_check
  CHECK (set_id ~ '^[0-9]{1,12}$');
ALTER TABLE public.tcg_set_rosters DROP CONSTRAINT IF EXISTS tcg_set_rosters_game_check;
ALTER TABLE public.tcg_set_rosters ADD CONSTRAINT tcg_set_rosters_game_check
  CHECK (game IN ('ygo', 'op', 'lor', 'fab', 'dgm', 'swu', 'dbs', 'dbm', 'cfv', 'cpk'));

ALTER TABLE public.price_history DROP CONSTRAINT IF EXISTS price_history_game_check;
ALTER TABLE public.price_history ADD CONSTRAINT price_history_game_check
  CHECK (game IN (
    'pokemon', 'magic', 'riftbound',
    -- Shared-pipeline games; keep in sync with constants/tcgGames.ts.
    'ygo', 'op', 'lor', 'fab', 'dgm', 'swu', 'dbs', 'dbm', 'cfv', 'cpk'
  ));

-- 3. Each game's TCG API set list. Search results name a card's set but
--    don't carry its id, so catalog-proxy maps names to ids here (refreshed
--    from TCG API's public set list). Written only by catalog-proxy.
CREATE TABLE IF NOT EXISTS public.tcg_sets (
  game TEXT NOT NULL CHECK (game IN ('ygo', 'op', 'lor', 'fab', 'dgm', 'swu', 'dbs', 'dbm', 'cfv', 'cpk')),
  id TEXT NOT NULL CHECK (id ~ '^[0-9]{1,12}$'),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 300),
  abbreviation TEXT,
  card_count INTEGER CHECK (card_count IS NULL OR card_count >= 0),
  release_date DATE,
  cached_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (game, id)
);

CREATE INDEX IF NOT EXISTS tcg_sets_game_name_idx ON public.tcg_sets (game, name);

ALTER TABLE public.tcg_sets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read TCG sets" ON public.tcg_sets;
CREATE POLICY "Authenticated users can read TCG sets"
  ON public.tcg_sets
  FOR SELECT
  TO authenticated
  USING (TRUE);

REVOKE ALL ON public.tcg_sets FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.tcg_sets TO authenticated;
GRANT ALL ON public.tcg_sets TO service_role;

-- 4. The per-user proxy bucket 'pokewallet' becomes 'tcgapi'; the body is
--    otherwise unchanged from 20261026100000_tcgtracking_price_history.sql.
ALTER TABLE public.catalog_proxy_usage DROP CONSTRAINT catalog_proxy_usage_provider_check;
ALTER TABLE public.catalog_proxy_usage ADD CONSTRAINT catalog_proxy_usage_provider_check
  CHECK (provider IN ('pokemon', 'barcode', 'magic', 'upc', 'riftbound', 'tcgapi', 'price'));

CREATE OR REPLACE FUNCTION public.consume_catalog_proxy_request(
  p_user_id UUID,
  p_provider TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_day DATE := (v_now AT TIME ZONE 'UTC')::DATE;
  v_minute TIMESTAMPTZ := date_trunc('minute', v_now);
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Service authorization required';
  END IF;
  IF p_user_id IS NULL OR p_provider NOT IN ('pokemon', 'barcode', 'magic', 'upc', 'riftbound', 'tcgapi', 'price') OR p_provider IS NULL THEN
    RAISE EXCEPTION 'Invalid catalog usage request';
  END IF;

  -- Bound retention without depending on a separately configured cron job.
  DELETE FROM public.catalog_proxy_usage
  WHERE user_id = p_user_id AND provider = p_provider AND usage_date < v_day - 7;

  INSERT INTO public.catalog_proxy_usage AS usage (
    user_id, provider, usage_date, request_count, minute_started_at, minute_count
  ) VALUES (p_user_id, p_provider, v_day, 1, v_minute, 1)
  ON CONFLICT (user_id, provider, usage_date) DO UPDATE
  SET request_count = usage.request_count + 1,
      minute_started_at = v_minute,
      minute_count = CASE WHEN usage.minute_started_at = v_minute
        THEN usage.minute_count + 1 ELSE 1 END
  WHERE usage.request_count < 1000
    AND (usage.minute_started_at < v_minute OR usage.minute_count < 60);

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_catalog_proxy_request(UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_catalog_proxy_request(UUID, TEXT)
  TO service_role;

NOTIFY pgrst, 'reload schema';
