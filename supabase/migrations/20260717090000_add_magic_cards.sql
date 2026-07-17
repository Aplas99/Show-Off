-- Magic: The Gathering card cache, backed by the official
-- api.magicthegathering.io API. Mirrors the pokemon_tcg_cards pattern
-- (20260704120000_create_pokemon_tcg_cache.sql) but is a fully separate
-- table/FK — Magic cards are never mixed into the Pokémon cache.

CREATE TABLE IF NOT EXISTS public.magic_cards (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  mana_cost TEXT,
  cmc NUMERIC,
  colors TEXT[] NOT NULL DEFAULT '{}',
  color_identity TEXT[] NOT NULL DEFAULT '{}',
  type TEXT,
  types TEXT[] NOT NULL DEFAULT '{}',
  subtypes TEXT[] NOT NULL DEFAULT '{}',
  supertypes TEXT[] NOT NULL DEFAULT '{}',
  rarity TEXT,
  set_code TEXT,
  set_name TEXT,
  text TEXT,
  flavor TEXT,
  artist TEXT,
  number TEXT,
  power TEXT,
  toughness TEXT,
  loyalty TEXT,
  multiverse_id TEXT,
  image_url TEXT,
  raw_data JSONB NOT NULL,
  cached_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  search_vector TSVECTOR GENERATED ALWAYS AS (
    TO_TSVECTOR(
      'simple',
      COALESCE(id, '') || ' ' ||
      COALESCE(name, '') || ' ' ||
      COALESCE(set_code, '') || ' ' ||
      COALESCE(set_name, '') || ' ' ||
      COALESCE(type, '') || ' ' ||
      COALESCE(number, '') || ' ' ||
      COALESCE(artist, '') || ' ' ||
      COALESCE(rarity, '')
    )
  ) STORED
);

CREATE INDEX IF NOT EXISTS magic_cards_search_idx
  ON public.magic_cards USING GIN (search_vector);

CREATE INDEX IF NOT EXISTS magic_cards_set_number_idx
  ON public.magic_cards (set_code, number);

CREATE INDEX IF NOT EXISTS magic_cards_cached_at_idx
  ON public.magic_cards (cached_at DESC);

ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS magic_card_id TEXT
  REFERENCES public.magic_cards(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS items_magic_card_id_idx
  ON public.items (magic_card_id);

ALTER TABLE public.magic_cards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read Magic cards"
  ON public.magic_cards;
CREATE POLICY "Authenticated users can read Magic cards"
  ON public.magic_cards
  FOR SELECT
  TO authenticated
  USING (TRUE);

-- This permits the current authenticated Expo client to populate the shared
-- cache. Move cache writes to a service-role Edge Function before allowing
-- untrusted clients, matching the pokemon_tcg_cards policy note.
DROP POLICY IF EXISTS "Authenticated users can cache Magic cards"
  ON public.magic_cards;
CREATE POLICY "Authenticated users can cache Magic cards"
  ON public.magic_cards
  FOR INSERT
  TO authenticated
  WITH CHECK (TRUE);

DROP POLICY IF EXISTS "Authenticated users can refresh Magic cards"
  ON public.magic_cards;
CREATE POLICY "Authenticated users can refresh Magic cards"
  ON public.magic_cards
  FOR UPDATE
  TO authenticated
  USING (TRUE)
  WITH CHECK (TRUE);

GRANT SELECT, INSERT, UPDATE ON public.magic_cards TO authenticated;

CREATE OR REPLACE FUNCTION public.search_magic_cards(
  search_term TEXT,
  result_limit INTEGER DEFAULT 20,
  result_offset INTEGER DEFAULT 0
)
RETURNS SETOF public.magic_cards
LANGUAGE SQL
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT card.*
  FROM public.magic_cards AS card
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
    card.name
  LIMIT LEAST(GREATEST(result_limit, 1), 100)
  OFFSET GREATEST(result_offset, 0);
$$;

REVOKE ALL ON FUNCTION public.search_magic_cards(TEXT, INTEGER, INTEGER)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_magic_cards(TEXT, INTEGER, INTEGER)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.create_magic_card_batch(
  p_showcase_id UUID,
  p_card_ids TEXT[]
)
RETURNS TABLE(item_id BIGINT, magic_card_id TEXT)
LANGUAGE PLPGSQL
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF COALESCE(ARRAY_LENGTH(p_card_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'At least one card is required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.showcase
    WHERE id = p_showcase_id
      AND profile_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Showcase not found';
  END IF;

  RETURN QUERY
  WITH inserted AS (
    INSERT INTO public.items (
      user_id,
      magic_card_id,
      is_verified,
      condition,
      for_sale
    )
    SELECT
      auth.uid(),
      card_id,
      TRUE,
      NULL,
      FALSE
    FROM UNNEST(p_card_ids) AS card_id
    RETURNING id, items.magic_card_id
  ),
  linked AS (
    INSERT INTO public.showcase_items (showcase_id, item_id)
    SELECT p_showcase_id, inserted.id
    FROM inserted
    RETURNING showcase_items.item_id
  )
  SELECT inserted.id::BIGINT, inserted.magic_card_id
  FROM inserted
  INNER JOIN linked ON linked.item_id = inserted.id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_magic_card_batch(UUID, TEXT[])
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_magic_card_batch(UUID, TEXT[])
  TO authenticated;

NOTIFY pgrst, 'reload schema';
