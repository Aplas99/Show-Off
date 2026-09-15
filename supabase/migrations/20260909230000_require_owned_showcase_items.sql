-- Linking requires ownership of both the destination showcase and the item.
-- Batch RPCs use separate SQL statements within the same transaction so their
-- newly inserted items are visible to the link policy's ownership check.
-- Read ownership through a narrowly scoped definer function to avoid a cycle:
-- item SELECT policies already consult showcase_items for public visibility.
CREATE FUNCTION public.owns_showcase_item_link(p_showcase_id UUID, p_item_id INTEGER)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.showcase s WHERE s.id = p_showcase_id AND s.profile_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.items i WHERE i.id = p_item_id AND i.user_id = auth.uid());
$$;
REVOKE ALL ON FUNCTION public.owns_showcase_item_link(UUID, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owns_showcase_item_link(UUID, INTEGER) TO authenticated, service_role;

CREATE POLICY showcase_items_insert_owner_guard ON public.showcase_items AS RESTRICTIVE
  FOR INSERT TO PUBLIC WITH CHECK (public.owns_showcase_item_link(showcase_id, item_id));

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
DECLARE
  v_item_ids INTEGER[];
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
      'USD'
    FROM UNNEST(
      p_card_ids,
      COALESCE(p_prices, ARRAY[]::NUMERIC[])
    ) AS u(card_id, price)
    RETURNING id, items.pokemon_tcg_card_id
  )
  SELECT array_agg(inserted.id) INTO v_item_ids FROM inserted;

  INSERT INTO public.showcase_items (showcase_id, item_id)
  SELECT p_showcase_id, saved_id FROM unnest(v_item_ids) AS saved(saved_id);

  RETURN QUERY SELECT i.id::BIGINT, i.pokemon_tcg_card_id
  FROM public.items i WHERE i.id = ANY(v_item_ids) ORDER BY i.id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_pokemon_tcg_batch(UUID, TEXT[], NUMERIC[])
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_pokemon_tcg_batch(UUID, TEXT[], NUMERIC[])
  TO authenticated;


CREATE OR REPLACE FUNCTION public.create_magic_card_batch(
  p_showcase_id UUID,
  p_card_ids TEXT[],
  p_prices NUMERIC[] DEFAULT NULL
)
RETURNS TABLE(item_id BIGINT, magic_card_id TEXT)
LANGUAGE PLPGSQL
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_item_ids INTEGER[];
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

  WITH inserted AS (
    INSERT INTO public.items (
      user_id,
      magic_card_id,
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
      'USD'
    FROM UNNEST(
      p_card_ids,
      COALESCE(p_prices, ARRAY[]::NUMERIC[])
    ) AS u(card_id, price)
    RETURNING id, items.magic_card_id
  )
  SELECT array_agg(inserted.id) INTO v_item_ids FROM inserted;

  INSERT INTO public.showcase_items (showcase_id, item_id)
  SELECT p_showcase_id, saved_id FROM unnest(v_item_ids) AS saved(saved_id);

  RETURN QUERY SELECT i.id::BIGINT, i.magic_card_id
  FROM public.items i WHERE i.id = ANY(v_item_ids) ORDER BY i.id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_magic_card_batch(UUID, TEXT[], NUMERIC[])
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_magic_card_batch(UUID, TEXT[], NUMERIC[])
  TO authenticated;


NOTIFY pgrst, 'reload schema';
