-- Price history for every card game from TCGTracking
-- (https://openapi.tcgtracking.com, TCGplayer prices, refreshed daily, no key).
-- TCGTracking serves only today's prices, so history is built here: the
-- first time anyone views a card's price on a given day, catalog-proxy
-- fetches it once and stores that day's snapshot in price_history. Every
-- later view that day (any user) reads the cached row.
--
-- The existing Pokémon/Magic cache triggers keep writing snapshots too; both
-- are TCGplayer market prices, one row per card per day.

ALTER TABLE public.price_history DROP CONSTRAINT IF EXISTS price_history_game_check;
ALTER TABLE public.price_history ADD CONSTRAINT price_history_game_check
  CHECK (game IN (
    'pokemon', 'magic', 'riftbound',
    -- Shared-pipeline games; keep in sync with constants/tcgGames.ts.
    'ygo', 'op', 'lor', 'fab', 'dgm', 'swu', 'dbs', 'cfv', 'cpk'
  ));

-- Which TCGplayer product a cached card is, so the proxy resolves it once.
-- product_id NULL records "no TCGplayer product" and is retried after 30 days.
CREATE TABLE IF NOT EXISTS public.card_tcgplayer_products (
  game TEXT NOT NULL,
  card_id TEXT NOT NULL,
  product_id BIGINT CHECK (product_id IS NULL OR product_id > 0),
  resolved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (game, card_id)
);

ALTER TABLE public.card_tcgplayer_products ENABLE ROW LEVEL SECURITY;
-- Server-only: no client policies.
REVOKE ALL ON public.card_tcgplayer_products FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.card_tcgplayer_products TO service_role;

GRANT INSERT, UPDATE ON public.price_history TO service_role;

-- Per-user proxy caps gain a 'price' bucket; the body is otherwise
-- unchanged from 20261024100000_tcg_cards.sql.
ALTER TABLE public.catalog_proxy_usage DROP CONSTRAINT catalog_proxy_usage_provider_check;
ALTER TABLE public.catalog_proxy_usage ADD CONSTRAINT catalog_proxy_usage_provider_check
  CHECK (provider IN ('pokemon', 'barcode', 'magic', 'upc', 'riftbound', 'pokewallet', 'price'));

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
  IF p_user_id IS NULL OR p_provider NOT IN ('pokemon', 'barcode', 'magic', 'upc', 'riftbound', 'pokewallet', 'price') OR p_provider IS NULL THEN
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
