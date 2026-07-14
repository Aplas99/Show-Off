-- Save the card's current market price (USD, from TCGplayer) on the item
-- when a scanned batch is accepted.

DROP FUNCTION IF EXISTS public.create_pokemon_tcg_batch(UUID, TEXT[]);

CREATE OR REPLACE FUNCTION public.create_pokemon_tcg_batch(
  p_showcase_id UUID,
  p_card_ids TEXT[],
  p_prices NUMERIC[] DEFAULT NULL
)
RETURNS TABLE(item_id BIGINT, pokemon_tcg_card_id TEXT)
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
      pokemon_tcg_card_id,
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
    RETURNING id, items.pokemon_tcg_card_id
  ),
  linked AS (
    INSERT INTO public.showcase_items (showcase_id, item_id)
    SELECT p_showcase_id, inserted.id
    FROM inserted
    RETURNING showcase_items.item_id
  )
  SELECT inserted.id::BIGINT, inserted.pokemon_tcg_card_id
  FROM inserted
  INNER JOIN linked ON linked.item_id = inserted.id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_pokemon_tcg_batch(UUID, TEXT[], NUMERIC[])
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_pokemon_tcg_batch(UUID, TEXT[], NUMERIC[])
  TO authenticated;

NOTIFY pgrst, 'reload schema';
