-- Deploy with the updated catalog proxy before releasing the new client.
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.products;
REVOKE ALL ON public.products FROM PUBLIC, anon, authenticated;
-- Remove historical column grants as well as table grants, including schemas
-- where extra column privileges were configured outside migration history.
DO $$
DECLARE v_columns TEXT;
BEGIN
  SELECT string_agg(quote_ident(attname), ', ') INTO v_columns
  FROM pg_attribute WHERE attrelid = 'public.products'::regclass
    AND attnum > 0 AND NOT attisdropped;
  EXECUTE format('REVOKE ALL (%s) ON public.products FROM PUBLIC, anon, authenticated', v_columns);
END;
$$;
GRANT SELECT ON public.products TO anon, authenticated;
GRANT ALL ON public.products TO service_role;

ALTER TABLE public.catalog_proxy_usage DROP CONSTRAINT catalog_proxy_usage_provider_check;
ALTER TABLE public.catalog_proxy_usage ADD CONSTRAINT catalog_proxy_usage_provider_check
  CHECK (provider IN ('pokemon', 'barcode', 'magic', 'upc'));

CREATE OR REPLACE FUNCTION public.consume_catalog_proxy_request(
  p_user_id UUID,
  p_provider TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_day DATE := (v_now AT TIME ZONE 'UTC')::DATE;
  v_minute TIMESTAMPTZ := date_trunc('minute', v_now);
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Service authorization required';
  END IF;
  IF p_user_id IS NULL OR p_provider NOT IN ('pokemon', 'barcode', 'magic', 'upc') OR p_provider IS NULL THEN
    RAISE EXCEPTION 'Invalid catalog usage request';
  END IF;

  -- Bound retention without depending on a separately configured cron job.
  DELETE FROM public.catalog_proxy_usage
  WHERE user_id = p_user_id AND provider = p_provider AND usage_date < v_day - 7;

  INSERT INTO public.catalog_proxy_usage AS usage (
    user_id, provider, usage_date, request_count, minute_started_at, minute_count
  ) VALUES (p_user_id, p_provider, v_day, 1, v_minute, 1)
  ON CONFLICT (user_id, provider, usage_date) DO UPDATE
  SET request_count = usage.request_count + 1,
      minute_started_at = v_minute,
      minute_count = CASE WHEN usage.minute_started_at = v_minute
        THEN usage.minute_count + 1 ELSE 1 END
  WHERE usage.request_count < 1000
    AND (usage.minute_started_at < v_minute OR usage.minute_count < 60);

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_catalog_proxy_request(UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_catalog_proxy_request(UUID, TEXT)
  TO service_role;

-- Conservative project-wide trial limits: published plan pages disagree on
-- search allowance (20 vs 40). Use 20 until the provider confirms otherwise.
CREATE TABLE public.upc_catalog_admission (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
  usage_date DATE NOT NULL,
  request_count INTEGER NOT NULL CHECK (request_count BETWEEN 0 AND 100),
  search_count INTEGER NOT NULL CHECK (search_count BETWEEN 0 AND 20),
  next_allowed_at TIMESTAMPTZ NOT NULL
);
ALTER TABLE public.upc_catalog_admission ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.upc_catalog_admission FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.upc_catalog_admission TO service_role;
INSERT INTO public.upc_catalog_admission VALUES (TRUE, CURRENT_DATE, 0, 0, '-infinity');

CREATE OR REPLACE FUNCTION public.reserve_upc_catalog_request(p_is_search BOOLEAN)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_day DATE := (clock_timestamp() AT TIME ZONE 'UTC')::DATE;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Service authorization required';
  END IF;
  IF p_is_search IS NULL THEN RAISE EXCEPTION 'Request type required'; END IF;
  UPDATE public.upc_catalog_admission
  SET usage_date = v_day,
      request_count = CASE WHEN usage_date = v_day THEN request_count + 1 ELSE 1 END,
      search_count = CASE WHEN usage_date = v_day THEN search_count ELSE 0 END + p_is_search::INT,
      next_allowed_at = clock_timestamp() + interval '16 seconds'
  WHERE singleton AND next_allowed_at <= clock_timestamp()
    AND (usage_date < v_day OR (usage_date = v_day AND request_count < 100 AND (NOT p_is_search OR search_count < 20)));
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.defer_upc_catalog_requests(p_seconds INTEGER)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Service authorization required';
  END IF;
  UPDATE public.upc_catalog_admission SET next_allowed_at = GREATEST(
    next_allowed_at, clock_timestamp() + make_interval(secs => LEAST(86400, GREATEST(60, COALESCE(p_seconds, 60))))
  ) WHERE singleton;
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_upc_catalog_request(BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.defer_upc_catalog_requests(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_upc_catalog_request(BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION public.defer_upc_catalog_requests(INTEGER) TO service_role;
NOTIFY pgrst, 'reload schema';
