-- Only the authenticated vendor proxy may populate shared catalog records.
ALTER TABLE public.pokemon_tcg_cards ADD COLUMN owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.pokemon_tcg_cards ADD COLUMN catalog_trusted BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX pokemon_manual_owner_idx ON public.pokemon_tcg_cards(owner_id) WHERE owner_id IS NOT NULL;
-- Legacy caller-written cache entries remain readable, but cannot prove verification.
-- Attribute legacy manual entries only when all references agree on one owner.
UPDATE public.pokemon_tcg_cards c SET owner_id = owners.owner_id
FROM (SELECT pokemon_tcg_card_id, MIN(user_id::text)::uuid owner_id FROM public.items
      WHERE pokemon_tcg_card_id LIKE 'manual:%' GROUP BY pokemon_tcg_card_id
      HAVING COUNT(DISTINCT user_id)=1) owners
WHERE c.id=owners.pokemon_tcg_card_id;
UPDATE public.items i SET is_verified=FALSE WHERE i.pokemon_tcg_card_id IS NOT NULL;
UPDATE public.pokemon_tcg_set_rosters SET is_complete=FALSE;
DO $revoke$ DECLARE t text; cols text; BEGIN
  FOREACH t IN ARRAY ARRAY['pokemon_tcg_cards','pokemon_tcg_set_rosters'] LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated',t);
    SELECT string_agg(quote_ident(attname),',') INTO cols FROM pg_attribute
      WHERE attrelid=format('public.%I',t)::regclass AND attnum>0 AND NOT attisdropped;
    EXECUTE format('REVOKE INSERT (%s), UPDATE (%s), REFERENCES (%s) ON public.%I FROM PUBLIC, anon, authenticated',cols,cols,cols,t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
  END LOOP;
END $revoke$;
CREATE POLICY pokemon_private_manual_guard ON public.pokemon_tcg_cards AS RESTRICTIVE
  FOR SELECT TO authenticated USING (
    (owner_id IS NULL AND id NOT LIKE 'manual:%') OR owner_id=auth.uid()
    OR EXISTS (SELECT 1 FROM public.items i WHERE i.pokemon_tcg_card_id=pokemon_tcg_cards.id AND public.can_view_item(i.id))
  );
CREATE OR REPLACE FUNCTION public.create_manual_pokemon_card(p_name text, p_collection text, p_number text DEFAULT 'unknown')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_id text; v_data jsonb; BEGIN
  IF auth.uid() IS NULL OR NOT public.can_use_app() THEN RAISE EXCEPTION 'Account unavailable'; END IF;
  p_name=btrim(p_name); p_collection=btrim(p_collection); p_number=btrim(p_number);
  IF p_name IS NULL OR length(p_name) NOT BETWEEN 1 AND 160 OR p_collection IS NULL OR length(p_collection) NOT BETWEEN 1 AND 160
     OR p_number IS NULL OR length(p_number) NOT BETWEEN 1 AND 40 THEN RAISE EXCEPTION 'Invalid card details'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text || ':manual-card',0));
  IF (SELECT count(*) FROM public.pokemon_tcg_cards WHERE owner_id=auth.uid() AND cached_at>now()-interval '1 day')>=100
    THEN RAISE EXCEPTION 'Daily manual card limit reached'; END IF;
  v_id='manual:' || auth.uid()::text || ':' || gen_random_uuid()::text;
  v_data=jsonb_build_object('id',v_id,'name',p_name,'supertype','Pokemon','subtypes','[]'::jsonb,'types','[]'::jsonb,
    'set',jsonb_build_object('id','manual:' || auth.uid()::text,'name',p_collection), 'number',p_number,
    'nationalPokedexNumbers','[]'::jsonb,'images',jsonb_build_object('small','','large',''),'source','manual');
  INSERT INTO public.pokemon_tcg_cards(id,name,supertype,set_id,set_name,number,raw_data,owner_id,catalog_trusted)
  VALUES(v_id,p_name,'Pokemon','manual:' || auth.uid()::text,p_collection,p_number,v_data,auth.uid(),FALSE);
  RETURN v_data;
END $$;
REVOKE ALL ON FUNCTION public.create_manual_pokemon_card(text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_manual_pokemon_card(text,text,text) TO authenticated;
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

  IF array_length(p_card_ids,1)>500 OR EXISTS (
    SELECT 1 FROM unnest(p_card_ids) requested(id)
    LEFT JOIN public.pokemon_tcg_cards c ON c.id=requested.id
    WHERE c.id IS NULL OR (c.id LIKE 'manual:%' AND c.owner_id IS DISTINCT FROM auth.uid())
  ) THEN RAISE EXCEPTION 'Card unavailable'; END IF;
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
      c.catalog_trusted AND c.owner_id IS NULL,
      NULL,
      FALSE,
      u.price,
      'USD'
    FROM UNNEST(
      p_card_ids,
      COALESCE(p_prices, ARRAY[]::NUMERIC[])
    ) AS u(card_id, price)
    JOIN public.pokemon_tcg_cards c ON c.id=u.card_id
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
    (card.catalog_trusted OR (card.id LIKE 'manual:%' AND card.owner_id=auth.uid())) AND BTRIM(search_term) <> ''
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

NOTIFY pgrst, 'reload schema';

CREATE FUNCTION public.guard_pokemon_item_verification() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
  IF NEW.pokemon_tcg_card_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.pokemon_tcg_cards c WHERE c.id=NEW.pokemon_tcg_card_id
      AND (c.id NOT LIKE 'manual:%' OR c.owner_id=NEW.user_id)) THEN RAISE EXCEPTION 'Card unavailable'; END IF;
    SELECT c.catalog_trusted AND c.owner_id IS NULL INTO NEW.is_verified
      FROM public.pokemon_tcg_cards c WHERE c.id=NEW.pokemon_tcg_card_id;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_pokemon_item_verification() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER guard_pokemon_item_verification BEFORE INSERT OR UPDATE OF pokemon_tcg_card_id, is_verified, user_id
ON public.items FOR EACH ROW EXECUTE FUNCTION public.guard_pokemon_item_verification();
