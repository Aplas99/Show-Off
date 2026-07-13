ALTER TABLE public.items
  ALTER COLUMN condition DROP NOT NULL;

DROP FUNCTION IF EXISTS public.create_pokemon_tcg_batch(UUID, TEXT[], TEXT);

CREATE OR REPLACE FUNCTION public.create_pokemon_tcg_batch(
  p_showcase_id UUID,
  p_card_ids TEXT[]
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
      for_sale
    )
    SELECT
      auth.uid(),
      card_id,
      TRUE,
      NULL,
      FALSE
    FROM UNNEST(p_card_ids) AS card_id
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

REVOKE ALL ON FUNCTION public.create_pokemon_tcg_batch(UUID, TEXT[])
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_pokemon_tcg_batch(UUID, TEXT[])
  TO authenticated;

NOTIFY pgrst, 'reload schema';
