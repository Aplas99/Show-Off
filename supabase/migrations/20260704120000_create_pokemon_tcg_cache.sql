CREATE TABLE IF NOT EXISTS public.pokemon_tcg_cards (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  supertype TEXT NOT NULL,
  subtypes TEXT[] NOT NULL DEFAULT '{}',
  hp TEXT,
  types TEXT[] NOT NULL DEFAULT '{}',
  set_id TEXT NOT NULL,
  set_name TEXT NOT NULL,
  set_series TEXT,
  set_printed_total INTEGER,
  set_total INTEGER,
  set_ptcgo_code TEXT,
  set_release_date DATE,
  number TEXT NOT NULL,
  artist TEXT,
  rarity TEXT,
  regulation_mark TEXT,
  national_pokedex_numbers INTEGER[] NOT NULL DEFAULT '{}',
  image_small TEXT,
  image_large TEXT,
  tcgplayer JSONB,
  cardmarket JSONB,
  raw_data JSONB NOT NULL,
  cached_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  search_vector TSVECTOR GENERATED ALWAYS AS (
    TO_TSVECTOR(
      'simple',
      COALESCE(id, '') || ' ' ||
      COALESCE(name, '') || ' ' ||
      COALESCE(set_id, '') || ' ' ||
      COALESCE(set_name, '') || ' ' ||
      COALESCE(set_series, '') || ' ' ||
      COALESCE(set_ptcgo_code, '') || ' ' ||
      COALESCE(number, '') || ' ' ||
      COALESCE(artist, '') || ' ' ||
      COALESCE(rarity, '')
    )
  ) STORED
);

CREATE INDEX IF NOT EXISTS pokemon_tcg_cards_search_idx
  ON public.pokemon_tcg_cards USING GIN (search_vector);

CREATE INDEX IF NOT EXISTS pokemon_tcg_cards_set_number_idx
  ON public.pokemon_tcg_cards (set_id, number);

CREATE INDEX IF NOT EXISTS pokemon_tcg_cards_cached_at_idx
  ON public.pokemon_tcg_cards (cached_at DESC);

ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS pokemon_tcg_card_id TEXT
  REFERENCES public.pokemon_tcg_cards(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS items_pokemon_tcg_card_id_idx
  ON public.items (pokemon_tcg_card_id);

ALTER TABLE public.pokemon_tcg_cards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read Pokemon TCG cards"
  ON public.pokemon_tcg_cards;
CREATE POLICY "Authenticated users can read Pokemon TCG cards"
  ON public.pokemon_tcg_cards
  FOR SELECT
  TO authenticated
  USING (TRUE);

-- This permits the current authenticated Expo client to populate the shared cache.
-- Move cache writes to a service-role Edge Function before allowing untrusted clients.
DROP POLICY IF EXISTS "Authenticated users can cache Pokemon TCG cards"
  ON public.pokemon_tcg_cards;
CREATE POLICY "Authenticated users can cache Pokemon TCG cards"
  ON public.pokemon_tcg_cards
  FOR INSERT
  TO authenticated
  WITH CHECK (TRUE);

DROP POLICY IF EXISTS "Authenticated users can refresh Pokemon TCG cards"
  ON public.pokemon_tcg_cards;
CREATE POLICY "Authenticated users can refresh Pokemon TCG cards"
  ON public.pokemon_tcg_cards
  FOR UPDATE
  TO authenticated
  USING (TRUE)
  WITH CHECK (TRUE);

GRANT SELECT, INSERT, UPDATE ON public.pokemon_tcg_cards TO authenticated;

CREATE OR REPLACE FUNCTION public.search_pokemon_tcg_cards(
  search_term TEXT,
  result_limit INTEGER DEFAULT 20,
  result_offset INTEGER DEFAULT 0
)
RETURNS SETOF public.pokemon_tcg_cards
LANGUAGE SQL
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT card.*
  FROM public.pokemon_tcg_cards AS card
  WHERE
    BTRIM(search_term) <> ''
    AND (
      LOWER(card.id) = LOWER(BTRIM(search_term))
      OR LOWER(card.name) = LOWER(BTRIM(search_term))
      OR card.search_vector @@ WEBSEARCH_TO_TSQUERY('simple', BTRIM(search_term))
    )
  ORDER BY
    CASE WHEN LOWER(card.id) = LOWER(BTRIM(search_term)) THEN 0 ELSE 1 END,
    CASE WHEN LOWER(card.name) = LOWER(BTRIM(search_term)) THEN 0 ELSE 1 END,
    TS_RANK(
      card.search_vector,
      WEBSEARCH_TO_TSQUERY('simple', BTRIM(search_term))
    ) DESC,
    card.name,
    card.set_release_date DESC NULLS LAST
  LIMIT LEAST(GREATEST(result_limit, 1), 100)
  OFFSET GREATEST(result_offset, 0);
$$;

REVOKE ALL ON FUNCTION public.search_pokemon_tcg_cards(TEXT, INTEGER, INTEGER)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_pokemon_tcg_cards(TEXT, INTEGER, INTEGER)
  TO authenticated;
