-- Shared card cache for every trading card game served by PokéWallet
-- (https://api.pokewallet.io) that has no dedicated pipeline: Yu-Gi-Oh!,
-- One Piece, Lorcana, Flesh and Blood, Digimon, Star Wars Unlimited,
-- Dragon Ball Super, Cardfight!! Vanguard and Cyberpunk. Pokémon, Magic and
-- Riftbound keep their own tables.
--
-- Same trusted-write boundary as riftbound_cards: clients read, only
-- catalog-proxy (service role) writes. PokéWallet images need the API key,
-- so the proxy copies each card image into the public tcg-card-images bucket
-- and image_url points there.

CREATE TABLE IF NOT EXISTS public.tcg_cards (
  -- PokéWallet card id: `pk_` + hex for TCGplayer-backed cards, bare hex for
  -- CardMarket-only ones.
  id TEXT PRIMARY KEY CHECK (id ~ '^(pk_)?[a-f0-9]{16,160}$'),
  -- Keep in sync with constants/tcgGames.ts.
  game TEXT NOT NULL CHECK (game IN ('ygo', 'op', 'lor', 'fab', 'dgm', 'swu', 'dbs', 'cfv', 'cpk')),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 300),
  set_name TEXT,
  set_code TEXT,
  set_id TEXT,
  card_number TEXT,
  rarity TEXT,
  card_type TEXT,
  image_url TEXT CHECK (image_url IS NULL OR image_url LIKE 'https://%'),
  -- Lowest TCGplayer market price across finishes (USD), for sorting/display.
  market_price NUMERIC CHECK (market_price IS NULL OR market_price >= 0),
  raw_data JSONB NOT NULL,
  cached_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  search_vector TSVECTOR GENERATED ALWAYS AS (
    TO_TSVECTOR(
      'simple',
      COALESCE(name, '') || ' ' ||
      COALESCE(set_name, '') || ' ' ||
      COALESCE(set_code, '') || ' ' ||
      COALESCE(card_number, '') || ' ' ||
      COALESCE(rarity, '') || ' ' ||
      COALESCE(card_type, '')
    )
  ) STORED
);

CREATE INDEX IF NOT EXISTS tcg_cards_search_idx
  ON public.tcg_cards USING GIN (search_vector);
CREATE INDEX IF NOT EXISTS tcg_cards_game_name_idx
  ON public.tcg_cards (game, LOWER(name));
CREATE INDEX IF NOT EXISTS tcg_cards_game_set_number_idx
  ON public.tcg_cards (game, set_code, card_number);

ALTER TABLE public.tcg_cards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read TCG cards" ON public.tcg_cards;
CREATE POLICY "Authenticated users can read TCG cards"
  ON public.tcg_cards
  FOR SELECT
  TO authenticated
  USING (TRUE);

REVOKE ALL ON public.tcg_cards FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.tcg_cards TO authenticated;
GRANT ALL ON public.tcg_cards TO service_role;

CREATE OR REPLACE FUNCTION public.search_tcg_cards(
  p_game TEXT,
  search_term TEXT,
  result_limit INTEGER DEFAULT 20,
  result_offset INTEGER DEFAULT 0
)
RETURNS SETOF public.tcg_cards
LANGUAGE SQL
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT card.*
  FROM public.tcg_cards AS card
  WHERE
    card.game = p_game
    AND BTRIM(search_term) <> ''
    AND (
      LOWER(card.name) = LOWER(BTRIM(search_term))
      OR card.search_vector @@ WEBSEARCH_TO_TSQUERY('simple', BTRIM(search_term))
    )
  ORDER BY
    CASE WHEN LOWER(card.name) = LOWER(BTRIM(search_term)) THEN 0 ELSE 1 END,
    TS_RANK(
      card.search_vector,
      WEBSEARCH_TO_TSQUERY('simple', BTRIM(search_term))
    ) DESC,
    card.name,
    card.set_name,
    card.card_number
  LIMIT LEAST(GREATEST(result_limit, 1), 100)
  OFFSET GREATEST(result_offset, 0);
$$;
REVOKE ALL ON FUNCTION public.search_tcg_cards(TEXT, TEXT, INTEGER, INTEGER)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_tcg_cards(TEXT, TEXT, INTEGER, INTEGER)
  TO authenticated;

-- Public read; no write policies, so only the service role can add images.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('tcg-card-images', 'tcg-card-images', TRUE, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET
  public = TRUE,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Per-user proxy caps gain a 'pokewallet' bucket; the body is otherwise
-- unchanged from 20261022140000_riftbound_cards.sql.
ALTER TABLE public.catalog_proxy_usage DROP CONSTRAINT catalog_proxy_usage_provider_check;
ALTER TABLE public.catalog_proxy_usage ADD CONSTRAINT catalog_proxy_usage_provider_check
  CHECK (provider IN ('pokemon', 'barcode', 'magic', 'upc', 'riftbound', 'pokewallet'));

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
  IF p_user_id IS NULL OR p_provider NOT IN ('pokemon', 'barcode', 'magic', 'upc', 'riftbound', 'pokewallet') OR p_provider IS NULL THEN
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
