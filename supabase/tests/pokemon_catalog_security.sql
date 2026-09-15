-- Run with the showcase_ratings_and_media.sql fixture in the same transaction.
RESET ROLE;
INSERT INTO public.pokemon_tcg_cards(id,name,supertype,set_id,set_name,number,raw_data,catalog_trusted)
VALUES ('base1-4','Charizard','Pokemon','base1','Base','4','{}',TRUE);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',true);
DO $$ DECLARE v_card jsonb; v_item integer; BEGIN
  BEGIN
    INSERT INTO public.pokemon_tcg_cards(id,name,supertype,set_id,set_name,number,raw_data,catalog_trusted)
    VALUES('forged','Forged','Pokemon','fake','Fake','1','{}',TRUE);
    RAISE EXCEPTION 'Client poisoned shared cards';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    UPDATE public.pokemon_tcg_cards SET catalog_trusted=TRUE;
    RAISE EXCEPTION 'Client changed verification';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    INSERT INTO public.pokemon_tcg_set_rosters(set_id,set_name,cached_card_count,is_complete) VALUES('fake','Fake',1,TRUE);
    RAISE EXCEPTION 'Client forged complete roster';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  v_card=public.create_manual_pokemon_card('Local card','Local set','A1');
  IF v_card->>'id' NOT LIKE 'manual:' || auth.uid()::text || ':%' THEN RAISE EXCEPTION 'Wrong manual ownership'; END IF;
  INSERT INTO public.items(user_id,pokemon_tcg_card_id,is_verified) VALUES(auth.uid(),v_card->>'id',TRUE) RETURNING id INTO v_item;
  IF (SELECT is_verified FROM public.items WHERE id=v_item) THEN RAISE EXCEPTION 'Manual item verified'; END IF;
  UPDATE public.items SET is_verified=TRUE WHERE id=v_item;
  IF (SELECT is_verified FROM public.items WHERE id=v_item) THEN RAISE EXCEPTION 'Manual verification edit bypass'; END IF;
  INSERT INTO public.items(user_id,pokemon_tcg_card_id,is_verified) VALUES(auth.uid(),'base1-4',FALSE) RETURNING id INTO v_item;
  IF NOT (SELECT is_verified FROM public.items WHERE id=v_item) THEN RAISE EXCEPTION 'Trusted item not verified'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',true);
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM public.pokemon_tcg_cards WHERE id LIKE 'manual:%') THEN RAISE EXCEPTION 'Private manual card leaked'; END IF;
  IF EXISTS(SELECT 1 FROM public.search_pokemon_tcg_cards('Local',20,0)) THEN RAISE EXCEPTION 'Manual catalog search leak'; END IF;
END $$;
RESET ROLE;
-- A guessed manual ID cannot be attached to another user's item, even by a privileged caller.
DO $$ DECLARE v_id text; BEGIN
  SELECT id INTO v_id FROM public.pokemon_tcg_cards WHERE owner_id='11111111-1111-1111-1111-111111111111';
  BEGIN
    INSERT INTO public.items(user_id,pokemon_tcg_card_id) VALUES('22222222-2222-2222-2222-222222222222',v_id);
    RAISE EXCEPTION 'Other user attached private manual card';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'Card unavailable' THEN RAISE; END IF; END;
END $$;
ROLLBACK;
