-- Run after all three catalog migrations in a disposable database. Rolls back.
BEGIN;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', true);
INSERT INTO public.products (ean, data, "searchableTitle", "searchableDescription", "searchableBrand")
VALUES (99999999999999, '{"title":"Trusted"}', 'Trusted', '', '')
ON CONFLICT (ean) DO UPDATE SET data = EXCLUDED.data;

DO $$
BEGIN
  UPDATE public.upc_catalog_admission SET request_count = 0, search_count = 0,
    usage_date = (clock_timestamp() AT TIME ZONE 'UTC')::DATE, next_allowed_at = '-infinity';
  IF NOT public.reserve_upc_catalog_request(FALSE) THEN RAISE EXCEPTION 'First lookup must pass'; END IF;
  -- Avoid wall-clock assumptions in assertions.
  UPDATE public.upc_catalog_admission SET next_allowed_at = clock_timestamp() + interval '1 minute';
  IF public.reserve_upc_catalog_request(FALSE) THEN RAISE EXCEPTION 'Burst admission must reject'; END IF;
  UPDATE public.upc_catalog_admission SET next_allowed_at = '-infinity', search_count = 20;
  IF public.reserve_upc_catalog_request(TRUE) THEN RAISE EXCEPTION 'Daily search cap must reject'; END IF;
  IF NOT public.reserve_upc_catalog_request(FALSE) THEN RAISE EXCEPTION 'Search cap must still permit lookup'; END IF;
  UPDATE public.upc_catalog_admission SET next_allowed_at = '-infinity', request_count = 99;
  IF NOT public.reserve_upc_catalog_request(FALSE) THEN RAISE EXCEPTION 'Last daily request must pass'; END IF;
  UPDATE public.upc_catalog_admission SET next_allowed_at = '-infinity';
  IF public.reserve_upc_catalog_request(FALSE) THEN RAISE EXCEPTION 'Combined daily cap must reject'; END IF;
  UPDATE public.upc_catalog_admission SET usage_date = usage_date - 1;
  IF NOT public.reserve_upc_catalog_request(TRUE) THEN RAISE EXCEPTION 'New UTC day must reset counts'; END IF;
  IF EXISTS (SELECT 1 FROM public.upc_catalog_admission WHERE request_count <> 1 OR search_count <> 1) THEN
    RAISE EXCEPTION 'New day counts must start at one';
  END IF;
  PERFORM public.defer_upc_catalog_requests(120);
  IF public.reserve_upc_catalog_request(FALSE) THEN RAISE EXCEPTION 'Provider cooldown must reject'; END IF;
  IF EXISTS (SELECT 1 FROM public.upc_catalog_admission WHERE next_allowed_at < clock_timestamp() + interval '119 seconds') THEN
    RAISE EXCEPTION 'Provider cooldown must extend the deadline';
  END IF;
END;
$$;

RESET ROLE;
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.products WHERE ean = 99999999999999) THEN RAISE EXCEPTION 'Reads must work'; END IF;
  BEGIN
    INSERT INTO public.products (ean, data, "searchableTitle", "searchableDescription", "searchableBrand")
    VALUES (88888888888888, '{}', 'Forged', '', '');
    RAISE EXCEPTION 'Client inserts must fail';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    UPDATE public.products SET data = '{"title":"Poisoned"}' WHERE ean = 99999999999999;
    RAISE EXCEPTION 'Client updates must fail';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    DELETE FROM public.products WHERE ean = 99999999999999;
    RAISE EXCEPTION 'Client deletes must fail';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.reserve_upc_catalog_request(FALSE);
    RAISE EXCEPTION 'Client admission calls must fail';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.defer_upc_catalog_requests(60);
    RAISE EXCEPTION 'Client cooldown calls must fail';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END;
$$;

RESET ROLE;
DO $$
DECLARE v_role TEXT; v_column TEXT;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF has_table_privilege(v_role, 'public.products', 'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES') THEN
      RAISE EXCEPTION 'Unexpected product table write privilege for %', v_role;
    END IF;
    FOR v_column IN SELECT attname FROM pg_attribute
      WHERE attrelid = 'public.products'::regclass AND attnum > 0 AND NOT attisdropped LOOP
      IF has_column_privilege(v_role, 'public.products', v_column, 'INSERT,UPDATE,REFERENCES') THEN
        RAISE EXCEPTION 'Unexpected product column write privilege for % on %', v_role, v_column;
      END IF;
    END LOOP;
    IF has_table_privilege(v_role, 'public.upc_catalog_admission', 'SELECT,INSERT,UPDATE,DELETE')
      OR has_function_privilege(v_role, 'public.reserve_upc_catalog_request(boolean)', 'EXECUTE')
      OR has_function_privilege(v_role, 'public.defer_upc_catalog_requests(integer)', 'EXECUTE') THEN
      RAISE EXCEPTION 'Unexpected trial accounting privileges for %', v_role;
    END IF;
  END LOOP;
END;
$$;
ROLLBACK;
