-- Shared TCG items: link items to the tcg_cards cache
-- (20261024100000_tcg_cards.sql) for every PokéWallet game, and save searched
-- cards in batches, mirroring create_riftbound_card_batch. The CSV import RPC
-- gains a tcg_card_id column so exports re-import with their links.

ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS tcg_card_id TEXT
  REFERENCES public.tcg_cards(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS items_tcg_card_id_idx
  ON public.items (tcg_card_id);

-- Linked shared-pipeline cards are 'tcg' like every other card.
-- Otherwise unchanged from 20261022150000_riftbound_items.sql.
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
    OR NEW.riftbound_card_id IS NOT NULL
    OR NEW.tcg_card_id IS NOT NULL THEN
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
  BEFORE INSERT OR UPDATE OF category, pokemon_tcg_card_id, magic_card_id, riftbound_card_id, tcg_card_id
  ON public.items
  FOR EACH ROW
  EXECUTE FUNCTION public.set_item_category();

CREATE OR REPLACE FUNCTION public.create_tcg_card_batch(
  p_showcase_id UUID,
  p_card_ids TEXT[]
)
RETURNS TABLE(item_id BIGINT, tcg_card_id TEXT)
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
    WHERE NOT EXISTS (SELECT 1 FROM public.tcg_cards c WHERE c.id = u.card_id)
  ) THEN
    RAISE EXCEPTION 'Unknown card';
  END IF;

  WITH inserted AS (
    INSERT INTO public.items (
      user_id,
      tcg_card_id,
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

  RETURN QUERY SELECT i.id::BIGINT, i.tcg_card_id
  FROM public.items i WHERE i.id = ANY(v_item_ids) ORDER BY i.id;
END;
$$;
REVOKE ALL ON FUNCTION public.create_tcg_card_batch(UUID, TEXT[])
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_tcg_card_batch(UUID, TEXT[])
  TO authenticated;

-- import_items_csv: adds tcg_card_id (checked after riftbound_card_id).
-- Otherwise unchanged from 20261023100000_import_items_csv.sql.
CREATE OR REPLACE FUNCTION public.import_items_csv(p_items JSONB)
RETURNS TABLE(row_index INTEGER, item_id BIGINT, linked BOOLEAN, error TEXT)
LANGUAGE PLPGSQL
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_row JSONB;
  v_index BIGINT;
  v_pokemon TEXT;
  v_magic TEXT;
  v_riftbound TEXT;
  v_tcg TEXT;
  v_ean TEXT;
  v_title TEXT;
  v_price NUMERIC;
  v_image TEXT;
  v_linked BOOLEAN;
  v_item_id INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT public.has_active_membership(v_user_id) THEN
    RAISE EXCEPTION 'CSV import requires an active membership'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'At least one item is required';
  END IF;

  IF jsonb_array_length(p_items) > 100 THEN
    RAISE EXCEPTION 'Too many items in one batch';
  END IF;

  FOR v_row, v_index IN SELECT e.value, e.ordinality FROM jsonb_array_elements(p_items) WITH ORDINALITY AS e LOOP
    row_index := (v_index - 1)::INTEGER;
    item_id := NULL;
    linked := FALSE;
    error := NULL;

    BEGIN
      -- An item links to at most one catalog record; card ids win over barcodes.
      SELECT c.id INTO v_pokemon FROM public.pokemon_tcg_cards c
        WHERE c.id = NULLIF(btrim(v_row ->> 'pokemon_card_id'), '');
      v_magic := NULL;
      v_riftbound := NULL;
      v_tcg := NULL;
      v_ean := NULL;
      IF v_pokemon IS NULL THEN
        SELECT c.id INTO v_magic FROM public.magic_cards c
          WHERE c.id = NULLIF(btrim(v_row ->> 'magic_card_id'), '');
      END IF;
      IF v_pokemon IS NULL AND v_magic IS NULL THEN
        SELECT c.id INTO v_riftbound FROM public.riftbound_cards c
          WHERE c.id = NULLIF(btrim(v_row ->> 'riftbound_card_id'), '');
      END IF;
      IF v_pokemon IS NULL AND v_magic IS NULL AND v_riftbound IS NULL THEN
        SELECT c.id INTO v_tcg FROM public.tcg_cards c
          WHERE c.id = NULLIF(btrim(v_row ->> 'tcg_card_id'), '');
      END IF;
      IF v_pokemon IS NULL AND v_magic IS NULL AND v_riftbound IS NULL AND v_tcg IS NULL THEN
        SELECT p.ean INTO v_ean FROM public.products p
          WHERE p.ean = NULLIF(btrim(v_row ->> 'barcode'), '');
      END IF;

      v_linked := COALESCE(v_pokemon, v_magic, v_riftbound, v_tcg, v_ean) IS NOT NULL;
      v_title := NULLIF(left(btrim(v_row ->> 'title'), 200), '');

      IF NOT v_linked AND v_title IS NULL THEN
        RAISE EXCEPTION 'Barcode or card id was not found, and the row has no title';
      END IF;

      v_price := NULLIF(v_row ->> 'price', '')::NUMERIC;
      IF v_price < 0 THEN
        RAISE EXCEPTION 'Price must be a non-negative number';
      END IF;

      -- Only remote https images; anything else would never load for viewers.
      v_image := NULLIF(btrim(v_row ->> 'image_url'), '');
      IF v_image !~ '^https://' THEN
        v_image := NULL;
      END IF;

      INSERT INTO public.items (
        user_id,
        product_ean,
        pokemon_tcg_card_id,
        magic_card_id,
        riftbound_card_id,
        tcg_card_id,
        is_verified,
        custom_title,
        custom_brand,
        custom_publisher,
        custom_category,
        category,
        condition,
        user_description,
        price,
        currency_code,
        image_url
      ) VALUES (
        v_user_id,
        v_ean,
        v_pokemon,
        v_magic,
        v_riftbound,
        v_tcg,
        v_linked,
        v_title,
        NULLIF(left(btrim(v_row ->> 'brand'), 200), ''),
        NULLIF(left(btrim(v_row ->> 'publisher'), 200), ''),
        NULLIF(left(btrim(v_row ->> 'type'), 100), ''),
        -- NULL lets the items_set_category trigger infer it.
        NULLIF(v_row ->> 'category', ''),
        NULLIF(v_row ->> 'condition', '')::public.item_condition,
        NULLIF(left(v_row ->> 'description', 2000), ''),
        v_price,
        COALESCE(NULLIF(upper(v_row ->> 'currency'), ''), 'USD'),
        v_image
      )
      RETURNING id INTO v_item_id;

      -- The showcase_items owner guard rejects showcases the caller doesn't own;
      -- that fails (and rolls back) only this row.
      INSERT INTO public.showcase_items (showcase_id, item_id)
      SELECT DISTINCT s.value::UUID, v_item_id
      FROM jsonb_array_elements_text(COALESCE(v_row -> 'showcase_ids', '[]'::JSONB)) AS s(value);

      item_id := v_item_id;
      linked := v_linked;
    EXCEPTION WHEN OTHERS THEN
      error := SQLERRM;
    END;

    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.import_items_csv(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_items_csv(JSONB) TO authenticated;

NOTIFY pgrst, 'reload schema';
