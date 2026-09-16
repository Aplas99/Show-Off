-- Apply both catalog migrations to a disposable database first. Rolls back.
BEGIN;
INSERT INTO auth.users (id) VALUES ('f0000000-0000-4000-8000-000000000003');

SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', true);
INSERT INTO public.magic_cards (id, name, raw_data)
VALUES ('final-push-security-test', 'Trusted card', '{"name":"Trusted card"}');
UPDATE public.magic_cards SET name = 'Refreshed trusted card' WHERE id = 'final-push-security-test';

DO $$
BEGIN
  IF NOT public.consume_catalog_proxy_request('f0000000-0000-4000-8000-000000000003', 'magic') THEN
    RAISE EXCEPTION 'Magic provider must be accepted by user accounting';
  END IF;
  UPDATE public.catalog_proxy_usage SET minute_count = 60 WHERE provider = 'magic';
  IF public.consume_catalog_proxy_request('f0000000-0000-4000-8000-000000000003', 'magic') THEN
    RAISE EXCEPTION 'Magic must obey the user minute cap';
  END IF;
  UPDATE public.magic_catalog_admission SET next_allowed_at = '-infinity';
  IF NOT public.reserve_magic_catalog_request() THEN RAISE EXCEPTION 'First admission must pass'; END IF;
  -- Use a deterministic future deadline rather than relying on test speed.
  UPDATE public.magic_catalog_admission SET next_allowed_at = clock_timestamp() + interval '1 minute';
  IF public.reserve_magic_catalog_request() THEN RAISE EXCEPTION 'Reserved admission must reject'; END IF;
  UPDATE public.magic_catalog_admission SET next_allowed_at = clock_timestamp() - interval '1 minute';
  IF NOT public.reserve_magic_catalog_request() THEN RAISE EXCEPTION 'Expired admission must pass'; END IF;
END;
$$;

RESET ROLE;
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.magic_cards WHERE id = 'final-push-security-test' AND name = 'Refreshed trusted card') THEN
    RAISE EXCEPTION 'Authenticated cache reads must remain available';
  END IF;
  BEGIN
    INSERT INTO public.magic_cards (id, name, raw_data) VALUES ('forged', 'Forged', '{}');
    RAISE EXCEPTION 'Client inserts must fail';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    UPDATE public.magic_cards SET name = 'Poisoned' WHERE id = 'final-push-security-test';
    RAISE EXCEPTION 'Client updates must fail';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    DELETE FROM public.magic_cards WHERE id = 'final-push-security-test';
    RAISE EXCEPTION 'Client deletes must fail';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    TRUNCATE public.magic_cards;
    RAISE EXCEPTION 'Client truncate must fail';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.reserve_magic_catalog_request();
    RAISE EXCEPTION 'Client admission RPC calls must fail';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    UPDATE public.magic_catalog_admission SET next_allowed_at = '-infinity';
    RAISE EXCEPTION 'Client admission writes must fail';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END;
$$;

RESET ROLE;
SET LOCAL ROLE anon;
DO $$
BEGIN
  BEGIN
    INSERT INTO public.magic_cards (id, name, raw_data) VALUES ('forged', 'Forged', '{}');
    RAISE EXCEPTION 'Anonymous inserts must fail';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.reserve_magic_catalog_request();
    RAISE EXCEPTION 'Anonymous admission RPC calls must fail';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END;
$$;

RESET ROLE;
DO $$
DECLARE v_role TEXT; v_column TEXT;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF has_table_privilege(v_role, 'public.magic_cards', 'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES') THEN
      RAISE EXCEPTION 'Unexpected table write privilege for %', v_role;
    END IF;
    FOR v_column IN SELECT attname FROM pg_attribute
      WHERE attrelid = 'public.magic_cards'::regclass AND attnum > 0 AND NOT attisdropped LOOP
      IF has_column_privilege(v_role, 'public.magic_cards', v_column, 'INSERT,UPDATE,REFERENCES') THEN
        RAISE EXCEPTION 'Unexpected column write privilege for % on %', v_role, v_column;
      END IF;
    END LOOP;
  END LOOP;
END;
$$;
ROLLBACK;
