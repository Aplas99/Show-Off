-- Exercises actual deployed signup/creation triggers and access rules.
-- All fixture rows roll back; sequence values can advance normally.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
DO $$ DECLARE owner_id uuid=gen_random_uuid(); teen_id uuid=gen_random_uuid(); BEGIN
  PERFORM set_config('rollout.owner_id',owner_id::text,true);
  PERFORM set_config('rollout.teen_id',teen_id::text,true);
  INSERT INTO auth.users(id,email,raw_app_meta_data,raw_user_meta_data)
  VALUES(owner_id,'rollout-' || owner_id::text || '@example.invalid','{"provider":"email"}',
    '{"reported_age":30,"accepted_policy_version":"2026-09-15"}'),
    (teen_id,'rollout-' || teen_id::text || '@example.invalid','{"provider":"email"}',
    '{"reported_age":17,"accepted_policy_version":"2026-09-15"}');
  BEGIN
    INSERT INTO auth.users(id,email,raw_app_meta_data,raw_user_meta_data)
    VALUES(gen_random_uuid(),'rollout-under13@example.invalid','{"provider":"email"}',
      '{"reported_age":12,"accepted_policy_version":"2026-09-15"}');
    RAISE EXCEPTION 'Under-13 signup was admitted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'Ages 13 and older only' THEN RAISE; END IF; END;
  IF has_table_privilege('authenticated','public.pokemon_tcg_cards','INSERT')
    OR has_table_privilege('authenticated','public.pokemon_tcg_cards','UPDATE')
    OR has_table_privilege('authenticated','public.pokemon_tcg_set_rosters','INSERT')
    OR has_table_privilege('authenticated','public.magic_cards','INSERT')
    OR has_table_privilege('authenticated','public.products','INSERT') THEN
    RAISE EXCEPTION 'Client shared catalog write access remains'; END IF;
END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('rollout.owner_id'),true);
DO $$ DECLARE s uuid; i integer; p bigint; manual jsonb; BEGIN
  IF NOT public.can_use_app() OR public.viewer_age()<>30 THEN RAISE EXCEPTION 'Signup profile age was not provisioned'; END IF;
  INSERT INTO public.showcase(profile_id,name,is_public,audience_rating)
    VALUES(auth.uid(),'Rollout general',true,'general') RETURNING id INTO s;
  PERFORM set_config('rollout.showcase_id',s::text,true);
  manual=public.create_manual_pokemon_card('Rollout card','Local collection','A1');
  INSERT INTO public.items(user_id,pokemon_tcg_card_id,is_verified)
    VALUES(auth.uid(),manual->>'id',true) RETURNING id INTO i;
  PERFORM set_config('rollout.item_id',i::text,true);
  IF (SELECT is_verified FROM public.items WHERE id=i) THEN RAISE EXCEPTION 'Manual verification bypass'; END IF;
  INSERT INTO public.showcase_items(showcase_id,item_id) VALUES(s,i);
  INSERT INTO public.posts(user_id,item_id,caption) VALUES(auth.uid(),i,'Rollout post') RETURNING id INTO p;
  IF p IS NULL OR public.get_public_showcase(s) IS NULL THEN RAISE EXCEPTION 'Owner creation/read failed'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub',current_setting('rollout.teen_id'),true);
DO $$ BEGIN
  IF public.viewer_age()<>17 OR NOT public.can_use_app() THEN RAISE EXCEPTION 'Teen onboarding failed'; END IF;
  IF NOT public.can_view_item(current_setting('rollout.item_id')::integer) THEN RAISE EXCEPTION 'General public item missing'; END IF;
  PERFORM public.report_content('showcase',current_setting('rollout.showcase_id'),'other','Rollout fixture report');
  IF EXISTS(SELECT 1 FROM public.content_reports) THEN RAISE EXCEPTION 'Protected report queue leaked'; END IF;
  BEGIN
    UPDATE public.profile SET reported_age=99 WHERE id=auth.uid();
    RAISE EXCEPTION 'Client edited age';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM public.set_user_block(current_setting('rollout.owner_id')::uuid,true);
  IF public.can_view_item(current_setting('rollout.item_id')::integer)
    OR public.get_public_showcase(current_setting('rollout.showcase_id')::uuid) IS NOT NULL THEN
    RAISE EXCEPTION 'Blocked content remains visible'; END IF;
  PERFORM public.set_user_block(current_setting('rollout.owner_id')::uuid,false);
END $$;
SELECT set_config('request.jwt.claim.sub',current_setting('rollout.owner_id'),true);
UPDATE public.showcase SET audience_rating='18_plus' WHERE id=current_setting('rollout.showcase_id')::uuid;
SELECT set_config('request.jwt.claim.sub',current_setting('rollout.teen_id'),true);
DO $$ BEGIN
  IF public.can_view_item(current_setting('rollout.item_id')::integer)
    OR public.get_public_showcase(current_setting('rollout.showcase_id')::uuid) IS NOT NULL THEN
    RAISE EXCEPTION 'Teen mature access bypass'; END IF;
END $$;
ROLLBACK;
