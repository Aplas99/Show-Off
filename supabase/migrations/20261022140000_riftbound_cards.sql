-- Riftbound card cache (Riftcodex, https://api.riftcodex.com). Same trusted-write
-- boundary as magic_cards: clients read, only catalog-proxy (service role)
-- writes. Deploy before the catalog-proxy update that persists Riftbound cards.

CREATE TABLE IF NOT EXISTS public.riftbound_cards (
  -- Riftcodex ObjectId; riftbound_id is the printed code (e.g. ogn-011-298).
  id TEXT PRIMARY KEY CHECK (id ~ '^[a-f0-9]{24}$'),
  riftbound_id TEXT NOT NULL CHECK (riftbound_id ~ '^[a-z0-9]{2,10}(-[a-z0-9*]{1,10}){1,3}$'),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  tcgplayer_id TEXT,
  collector_number INTEGER,
  card_type TEXT,
  supertype TEXT,
  rarity TEXT,
  domains TEXT[] NOT NULL DEFAULT '{}',
  energy INTEGER,
  might INTEGER,
  power INTEGER,
  plain_text TEXT,
  set_code TEXT NOT NULL,
  set_name TEXT,
  artist TEXT,
  image_url TEXT CHECK (image_url IS NULL OR image_url LIKE 'https://%'),
  tags TEXT[] NOT NULL DEFAULT '{}',
  alternate_art BOOLEAN NOT NULL DEFAULT FALSE,
  overnumbered BOOLEAN NOT NULL DEFAULT FALSE,
  signature BOOLEAN NOT NULL DEFAULT FALSE,
  raw_data JSONB NOT NULL,
  cached_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  search_vector TSVECTOR GENERATED ALWAYS AS (
    TO_TSVECTOR(
      'simple',
      COALESCE(riftbound_id, '') || ' ' ||
      COALESCE(name, '') || ' ' ||
      COALESCE(set_code, '') || ' ' ||
      COALESCE(set_name, '') || ' ' ||
      COALESCE(card_type, '') || ' ' ||
      COALESCE(supertype, '') || ' ' ||
      COALESCE(rarity, '') || ' ' ||
      COALESCE(artist, '')
    )
  ) STORED
);

CREATE INDEX IF NOT EXISTS riftbound_cards_search_idx
  ON public.riftbound_cards USING GIN (search_vector);
CREATE INDEX IF NOT EXISTS riftbound_cards_riftbound_id_idx
  ON public.riftbound_cards (riftbound_id);
CREATE INDEX IF NOT EXISTS riftbound_cards_set_number_idx
  ON public.riftbound_cards (set_code, collector_number);

ALTER TABLE public.riftbound_cards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read Riftbound cards"
  ON public.riftbound_cards;
CREATE POLICY "Authenticated users can read Riftbound cards"
  ON public.riftbound_cards
  FOR SELECT
  TO authenticated
  USING (TRUE);

REVOKE ALL ON public.riftbound_cards FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.riftbound_cards TO authenticated;
GRANT ALL ON public.riftbound_cards TO service_role;

CREATE OR REPLACE FUNCTION public.search_riftbound_cards(
  search_term TEXT,
  result_limit INTEGER DEFAULT 20,
  result_offset INTEGER DEFAULT 0
)
RETURNS SETOF public.riftbound_cards
LANGUAGE SQL
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT card.*
  FROM public.riftbound_cards AS card
  WHERE
    BTRIM(search_term) <> ''
    AND (
      card.riftbound_id = LOWER(BTRIM(search_term))
      OR LOWER(card.name) = LOWER(BTRIM(search_term))
      OR card.search_vector @@ WEBSEARCH_TO_TSQUERY('simple', BTRIM(search_term))
    )
  ORDER BY
    CASE WHEN card.riftbound_id = LOWER(BTRIM(search_term)) THEN 0 ELSE 1 END,
    CASE WHEN LOWER(card.name) = LOWER(BTRIM(search_term)) THEN 0 ELSE 1 END,
    TS_RANK(
      card.search_vector,
      WEBSEARCH_TO_TSQUERY('simple', BTRIM(search_term))
    ) DESC,
    card.name,
    card.riftbound_id
  LIMIT LEAST(GREATEST(result_limit, 1), 100)
  OFFSET GREATEST(result_offset, 0);
$$;
REVOKE ALL ON FUNCTION public.search_riftbound_cards(TEXT, INTEGER, INTEGER)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_riftbound_cards(TEXT, INTEGER, INTEGER)
  TO authenticated;

-- Per-user proxy caps gain a 'riftbound' bucket; the body is otherwise
-- unchanged from 20260909210000_secure_product_catalog_writes.sql.
ALTER TABLE public.catalog_proxy_usage DROP CONSTRAINT catalog_proxy_usage_provider_check;
ALTER TABLE public.catalog_proxy_usage ADD CONSTRAINT catalog_proxy_usage_provider_check
  CHECK (provider IN ('pokemon', 'barcode', 'magic', 'upc', 'riftbound'));

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
  IF p_user_id IS NULL OR p_provider NOT IN ('pokemon', 'barcode', 'magic', 'upc', 'riftbound') OR p_provider IS NULL THEN
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
