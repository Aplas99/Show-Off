-- Generic multi-game trading card cache + item link, parallel to the
-- existing Pokemon-specific pokemon_tcg_cards/create_pokemon_tcg_batch.
-- Backs Magic: The Gathering and Yu-Gi-Oh! support (api/tcg/catalog.ts),
-- via https://openapi.tcgtracking.com. Deliberately a NEW table rather
-- than generalizing pokemon_tcg_cards -- keeps the working Pokemon
-- pipeline (and its live data) completely untouched.

CREATE TABLE IF NOT EXISTS public.tcg_cards (
  -- `tcg:{game_category_id}:{product_id}`, globally unique across games.
  id TEXT PRIMARY KEY,
  game_category_id INTEGER NOT NULL,
  game_name TEXT NOT NULL,
  product_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  number TEXT,
  rarity TEXT,
  set_id INTEGER NOT NULL,
  set_name TEXT NOT NULL,
  image_url TEXT,
  tcgplayer_url TEXT,
  market_price NUMERIC,
  raw_data JSONB,
  cached_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tcg_cards_game_set_idx
  ON public.tcg_cards (game_category_id, set_id);

CREATE INDEX IF NOT EXISTS tcg_cards_cached_at_idx
  ON public.tcg_cards (cached_at DESC);

ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS tcg_card_id TEXT
  REFERENCES public.tcg_cards(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS items_tcg_card_id_idx
  ON public.items (tcg_card_id);

ALTER TABLE public.tcg_cards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read TCG cards"
  ON public.tcg_cards;
CREATE POLICY "Authenticated users can read TCG cards"
  ON public.tcg_cards
  FOR SELECT
  TO authenticated
  USING (TRUE);

-- Same trust model as pokemon_tcg_cards: the client populates the shared
-- cache directly for now. Move to a service-role Edge Function before
-- allowing fully untrusted clients.
DROP POLICY IF EXISTS "Authenticated users can cache TCG cards"
  ON public.tcg_cards;
CREATE POLICY "Authenticated users can cache TCG cards"
  ON public.tcg_cards
  FOR INSERT
  TO authenticated
  WITH CHECK (TRUE);

DROP POLICY IF EXISTS "Authenticated users can refresh TCG cards"
  ON public.tcg_cards;
CREATE POLICY "Authenticated users can refresh TCG cards"
  ON public.tcg_cards
  FOR UPDATE
  TO authenticated
  USING (TRUE)
  WITH CHECK (TRUE);

GRANT SELECT, INSERT, UPDATE ON public.tcg_cards TO authenticated;

-- Generic sibling to create_pokemon_tcg_batch(). The free-tier item-limit
-- trigger (enforce_free_tier_item_limit) already applies here unchanged
-- -- it counts all of a user's items regardless of card type.
CREATE OR REPLACE FUNCTION public.create_tcg_card_batch(
  p_showcase_id UUID,
  p_card_ids TEXT[],
  p_prices NUMERIC[] DEFAULT NULL
)
RETURNS TABLE(item_id BIGINT, tcg_card_id TEXT)
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

  IF p_prices IS NOT NULL
    AND COALESCE(ARRAY_LENGTH(p_prices, 1), 0) <> COALESCE(ARRAY_LENGTH(p_card_ids, 1), 0) THEN
    RAISE EXCEPTION 'Price list must match card list';
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
      tcg_card_id,
      is_verified,
      condition,
      for_sale,
      price,
      currency_code
    )
    SELECT
      auth.uid(),
      u.card_id,
      TRUE,
      NULL,
      FALSE,
      u.price,
      CASE WHEN u.price IS NOT NULL THEN 'USD' END
    FROM UNNEST(
      p_card_ids,
      COALESCE(p_prices, ARRAY[]::NUMERIC[])
    ) AS u(card_id, price)
    RETURNING id, items.tcg_card_id
  ),
  linked AS (
    INSERT INTO public.showcase_items (showcase_id, item_id)
    SELECT p_showcase_id, inserted.id
    FROM inserted
    RETURNING showcase_items.item_id
  )
  SELECT inserted.id::BIGINT, inserted.tcg_card_id
  FROM inserted
  INNER JOIN linked ON linked.item_id = inserted.id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_tcg_card_batch(UUID, TEXT[], NUMERIC[])
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_tcg_card_batch(UUID, TEXT[], NUMERIC[])
  TO authenticated;

NOTIFY pgrst, 'reload schema';
