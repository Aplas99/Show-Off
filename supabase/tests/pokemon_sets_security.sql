-- Run inside a transaction; assertions roll back.
RESET ROLE;
INSERT INTO public.pokemon_tcg_sets(id,name,ptcgo_code,printed_total)
VALUES ('sv1','Scarlet & Violet','SVI',198);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',true);
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.pokemon_tcg_sets WHERE id='sv1') THEN
    RAISE EXCEPTION 'Signed-in client cannot read sets';
  END IF;
  BEGIN
    INSERT INTO public.pokemon_tcg_sets(id,name,ptcgo_code) VALUES('fake','Fake','FAK');
    RAISE EXCEPTION 'Client inserted a set';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    UPDATE public.pokemon_tcg_sets SET ptcgo_code='XXX' WHERE id='sv1';
    RAISE EXCEPTION 'Client changed a set code';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    DELETE FROM public.pokemon_tcg_sets WHERE id='sv1';
    RAISE EXCEPTION 'Client deleted a set';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $$ BEGIN
  BEGIN
    PERFORM 1 FROM public.pokemon_tcg_sets;
    RAISE EXCEPTION 'Anonymous client read sets';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
