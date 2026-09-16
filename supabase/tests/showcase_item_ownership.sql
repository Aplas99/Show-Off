-- Disposable policy fixture database without unrelated membership triggers.
-- Existing creation/link policies and both ownership migrations must be applied.
BEGIN;
INSERT INTO auth.users (id) VALUES
  ('f0000000-0000-4000-8000-000000000021'),
  ('f0000000-0000-4000-8000-000000000022');
INSERT INTO public.profile (id, username) VALUES
  ('f0000000-0000-4000-8000-000000000021', 'link_fixture_21'),
  ('f0000000-0000-4000-8000-000000000022', 'link_fixture_22');
INSERT INTO public.showcase (id, profile_id, name, is_public) VALUES
  ('f0000000-0000-4000-8000-000000000121', 'f0000000-0000-4000-8000-000000000021', 'Owned', FALSE),
  ('f0000000-0000-4000-8000-000000000122', 'f0000000-0000-4000-8000-000000000022', 'Other public', TRUE);
INSERT INTO public.items (id, user_id, custom_title) VALUES
  (2000000021, 'f0000000-0000-4000-8000-000000000021', 'Own item'),
  (2000000022, 'f0000000-0000-4000-8000-000000000022', 'Other item');
INSERT INTO public.showcase_items (showcase_id, item_id)
VALUES ('f0000000-0000-4000-8000-000000000122', 2000000022);

-- Simulate an unexpected permissive insert policy: the guard must still win.
CREATE POLICY unexpected_link_insert ON public.showcase_items FOR INSERT TO authenticated WITH CHECK (TRUE);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'f0000000-0000-4000-8000-000000000021', true);
INSERT INTO public.showcase_items (showcase_id, item_id)
VALUES ('f0000000-0000-4000-8000-000000000121', 2000000021);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.items WHERE id = 2000000022) THEN
    RAISE EXCEPTION 'Test requires the other item to be publicly readable';
  END IF;
  BEGIN
    INSERT INTO public.showcase_items (showcase_id, item_id)
    VALUES ('f0000000-0000-4000-8000-000000000121', 2000000022);
    RAISE EXCEPTION 'Linking another user public item must fail';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    INSERT INTO public.showcase_items (showcase_id, item_id)
    VALUES ('f0000000-0000-4000-8000-000000000122', 2000000021);
    RAISE EXCEPTION 'Linking to another user showcase must fail';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END;
$$;
RESET ROLE;

-- These fixtures satisfy the full catalog schema as well as the minimal harness.
INSERT INTO public.pokemon_tcg_cards (id, name, supertype, set_id, set_name, number, raw_data)
VALUES ('ownership-pokemon-fixture', 'Test', 'Pokemon', 'fixture', 'Fixture', '1', '{}');
INSERT INTO public.magic_cards (id, name, raw_data) VALUES ('ownership-magic-fixture', 'Test', '{}');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'f0000000-0000-4000-8000-000000000021', true);
DO $$
DECLARE v_count INTEGER;
BEGIN
  SELECT count(*) INTO v_count FROM public.create_pokemon_tcg_batch(
    'f0000000-0000-4000-8000-000000000121', ARRAY['ownership-pokemon-fixture', 'ownership-pokemon-fixture'], ARRAY[NULL, 12.5]::NUMERIC[]);
  IF v_count <> 2 THEN RAISE EXCEPTION 'Pokemon batch must save duplicate owned copies'; END IF;
  SELECT count(*) INTO v_count FROM public.create_magic_card_batch(
    'f0000000-0000-4000-8000-000000000121', ARRAY['ownership-magic-fixture']);
  IF v_count <> 1 THEN RAISE EXCEPTION 'Magic batch with no price must save'; END IF;
  SELECT count(*) INTO v_count FROM public.items i JOIN public.showcase_items si ON si.item_id = i.id
    WHERE si.showcase_id = 'f0000000-0000-4000-8000-000000000121' AND i.id < 2000000000;
  IF v_count <> 3 THEN RAISE EXCEPTION 'All batch items must be linked'; END IF;
  IF EXISTS (SELECT 1 FROM public.items WHERE id < 2000000000 AND currency_code IS DISTINCT FROM 'USD') THEN
    RAISE EXCEPTION 'Batch saves must respect the non-null USD currency column';
  END IF;
END;
$$;
RESET ROLE;

CREATE FUNCTION public.ownership_fixture_reject_link() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'fixture_link_failure'; END; $$;
CREATE TRIGGER ownership_fixture_reject_link BEFORE INSERT ON public.showcase_items
FOR EACH ROW EXECUTE FUNCTION public.ownership_fixture_reject_link();
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_before INTEGER; v_after INTEGER;
BEGIN
  SELECT count(*) INTO v_before FROM public.items;
  BEGIN
    PERFORM public.create_pokemon_tcg_batch('f0000000-0000-4000-8000-000000000121', ARRAY['ownership-pokemon-fixture']);
    RAISE EXCEPTION 'Expected link failure';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'fixture_link_failure' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.create_magic_card_batch('f0000000-0000-4000-8000-000000000121', ARRAY['ownership-magic-fixture']);
    RAISE EXCEPTION 'Expected link failure';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'fixture_link_failure' THEN RAISE; END IF;
  END;
  SELECT count(*) INTO v_after FROM public.items;
  IF v_after <> v_before THEN RAISE EXCEPTION 'Failed batch linking must roll back every new item'; END IF;
END;
$$;
RESET ROLE;
ROLLBACK;
