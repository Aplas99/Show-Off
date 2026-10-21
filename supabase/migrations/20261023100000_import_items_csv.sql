-- CSV import (Curator perk) used to insert straight into public.items, so only
-- the client enforced the membership gate. This RPC is now the import path:
-- it requires an active membership, links barcodes/card ids only when they
-- already exist in the catalog caches, and returns one row per input row
-- (in input order) so the client can report failed and unlinked rows.
--
-- Each row is saved in its own subtransaction: a row that fails (bad value,
-- foreign showcase, constraint) is rolled back and reported in `error`, and
-- the remaining rows are still saved. Only the auth, membership and batch
-- checks fail the whole call.
--
-- Selling is outside MVP scope, so imports never set for_sale; the column
-- keeps its DEFAULT FALSE.
--
-- p_items is a JSON array (max 100) of objects with the keys:
--   title, brand, publisher, type, category, condition, price,
--   currency, description, barcode, pokemon_card_id, magic_card_id,
--   riftbound_card_id, image_url, showcase_ids (array of owned showcase UUIDs)
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
        SELECT p.ean INTO v_ean FROM public.products p
          WHERE p.ean = NULLIF(btrim(v_row ->> 'barcode'), '');
      END IF;

      v_linked := COALESCE(v_pokemon, v_magic, v_riftbound, v_ean) IS NOT NULL;
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
