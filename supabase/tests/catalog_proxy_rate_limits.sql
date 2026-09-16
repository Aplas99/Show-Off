-- Run against a disposable Supabase database (or a PostgreSQL test database
-- with auth.users/auth.role and anon/authenticated/service_role bootstrapped).
-- The rate-limit migration must be applied first. Everything rolls back.
BEGIN;

INSERT INTO auth.users (id) VALUES
  ('f0000000-0000-4000-8000-000000000001'),
  ('f0000000-0000-4000-8000-000000000002');

SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.consume_catalog_proxy_request('f0000000-0000-4000-8000-000000000001', 'pokemon');
    RAISE EXCEPTION 'Authenticated clients must not execute the limiter';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM 1 FROM public.catalog_proxy_usage;
    RAISE EXCEPTION 'Authenticated clients must not read accounting rows';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;

RESET ROLE;
SET LOCAL ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM public.consume_catalog_proxy_request('f0000000-0000-4000-8000-000000000001', 'pokemon');
    RAISE EXCEPTION 'Anonymous clients must not execute the limiter';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;

RESET ROLE;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', true);

DO $$
DECLARE
  v_user UUID := 'f0000000-0000-4000-8000-000000000001';
  v_day DATE := (clock_timestamp() AT TIME ZONE 'UTC')::DATE;
  v_count INTEGER;
BEGIN
  IF NOT public.consume_catalog_proxy_request(v_user, 'pokemon') THEN
    RAISE EXCEPTION 'First request should pass';
  END IF;

  UPDATE public.catalog_proxy_usage SET minute_count = 60
  WHERE user_id = v_user AND provider = 'pokemon' AND usage_date = v_day;
  IF public.consume_catalog_proxy_request(v_user, 'pokemon') THEN
    RAISE EXCEPTION 'Minute limit should reject';
  END IF;
  SELECT request_count INTO v_count FROM public.catalog_proxy_usage
  WHERE user_id = v_user AND provider = 'pokemon' AND usage_date = v_day;
  IF v_count <> 1 THEN RAISE EXCEPTION 'Rejected request must not increment usage'; END IF;

  UPDATE public.catalog_proxy_usage
  SET minute_started_at = clock_timestamp() - interval '2 minutes'
  WHERE user_id = v_user AND provider = 'pokemon' AND usage_date = v_day;
  IF NOT public.consume_catalog_proxy_request(v_user, 'pokemon') THEN
    RAISE EXCEPTION 'New minute should allow another request';
  END IF;

  UPDATE public.catalog_proxy_usage SET request_count = 999
  WHERE user_id = v_user AND provider = 'pokemon' AND usage_date = v_day;
  IF NOT public.consume_catalog_proxy_request(v_user, 'pokemon') THEN
    RAISE EXCEPTION 'Last daily request should pass';
  END IF;
  IF public.consume_catalog_proxy_request(v_user, 'pokemon') THEN
    RAISE EXCEPTION 'Daily limit should reject';
  END IF;

  IF NOT public.consume_catalog_proxy_request(v_user, 'barcode') THEN
    RAISE EXCEPTION 'Providers should have separate limits';
  END IF;
  IF NOT public.consume_catalog_proxy_request('f0000000-0000-4000-8000-000000000002', 'pokemon') THEN
    RAISE EXCEPTION 'Users should have separate limits';
  END IF;

  UPDATE public.catalog_proxy_usage SET usage_date = v_day - 1
  WHERE user_id = v_user AND provider = 'pokemon' AND usage_date = v_day;
  IF NOT public.consume_catalog_proxy_request(v_user, 'pokemon') THEN
    RAISE EXCEPTION 'New day should reset the daily limit';
  END IF;

  UPDATE public.catalog_proxy_usage SET usage_date = v_day - 8
  WHERE user_id = v_user AND provider = 'pokemon' AND usage_date = v_day - 1;
  PERFORM public.consume_catalog_proxy_request(v_user, 'pokemon');
  IF EXISTS (SELECT 1 FROM public.catalog_proxy_usage WHERE user_id = v_user AND usage_date < v_day - 7) THEN
    RAISE EXCEPTION 'Old windows for this active user should be pruned';
  END IF;
END;
$$;

RESET ROLE;
DELETE FROM auth.users WHERE id = 'f0000000-0000-4000-8000-000000000001';
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.catalog_proxy_usage WHERE user_id = 'f0000000-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'Deleting a user must remove usage data';
  END IF;
END;
$$;
ROLLBACK;
