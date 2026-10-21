-- Riftbound items: link items to the riftbound_cards cache
-- (20261022140000_riftbound_cards.sql) and save scanned/searched cards in
-- batches, mirroring create_magic_card_batch. Riftcodex has no prices, so the
-- batch takes card IDs only.

ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS riftbound_card_id TEXT
  REFERENCES public.riftbound_cards(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS items_riftbound_card_id_idx
  ON public.items (riftbound_card_id);

-- Linked Riftbound cards are always 'tcg', like Pokémon and Magic cards.
-- Otherwise unchanged from 20261022100000_item_categories.sql.
CREATE OR REPLACE FUNCTION public.set_item_category()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_product_category TEXT;
BEGIN
  IF NEW.pokemon_tcg_card_id IS NOT NULL
    OR NEW.magic_card_id IS NOT NULL
    OR NEW.riftbound_card_id IS NOT NULL THEN
    NEW.category := 'tcg';
  ELSIF NEW.category IS NULL THEN
    IF NEW.product_ean IS NOT NULL THEN
      SELECT p.data ->> 'category' INTO v_product_category
      FROM public.products AS p
      WHERE p.ean = NEW.product_ean
      LIMIT 1;
    END IF;
    NEW.category := public.infer_item_category(
      NULL,
      NULL,
      NEW.product_ean,
      concat_ws(' ', NEW.custom_category, v_product_category)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS items_set_category ON public.items;
CREATE TRIGGER items_set_category
  BEFORE INSERT OR UPDATE OF category, pokemon_tcg_card_id, magic_card_id, riftbound_card_id
  ON public.items
  FOR EACH ROW
  EXECUTE FUNCTION public.set_item_category();

CREATE OR REPLACE FUNCTION public.create_riftbound_card_batch(
  p_showcase_id UUID,
  p_card_ids TEXT[]
)
RETURNS TABLE(item_id BIGINT, riftbound_card_id TEXT)
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

  IF ARRAY_LENGTH(p_card_ids, 1) > 200 THEN
    RAISE EXCEPTION 'Too many cards in one batch';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.showcase
    WHERE id = p_showcase_id
      AND profile_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Showcase not found';
  END IF;

  -- Cards must already be in the server-written cache; the FK would reject
  -- unknown IDs too, but this gives a clearer error.
  IF EXISTS (
    SELECT 1
    FROM UNNEST(p_card_ids) AS u(card_id)
    WHERE NOT EXISTS (SELECT 1 FROM public.riftbound_cards c WHERE c.id = u.card_id)
  ) THEN
    RAISE EXCEPTION 'Unknown Riftbound card';
  END IF;

  WITH inserted AS (
    INSERT INTO public.items (
      user_id,
      riftbound_card_id,
      is_verified,
      condition,
      for_sale,
      category
    )
    SELECT
      auth.uid(),
      u.card_id,
      TRUE,
      NULL,
      FALSE,
      'tcg'
    FROM UNNEST(p_card_ids) AS u(card_id)
    RETURNING id
  )
  SELECT array_agg(inserted.id) INTO v_item_ids FROM inserted;

  INSERT INTO public.showcase_items (showcase_id, item_id)
  SELECT p_showcase_id, saved_id FROM unnest(v_item_ids) AS saved(saved_id);

  RETURN QUERY SELECT i.id::BIGINT, i.riftbound_card_id
  FROM public.items i WHERE i.id = ANY(v_item_ids) ORDER BY i.id;
END;
$$;
REVOKE ALL ON FUNCTION public.create_riftbound_card_batch(UUID, TEXT[])
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_riftbound_card_batch(UUID, TEXT[])
  TO authenticated;

NOTIFY pgrst, 'reload schema';
