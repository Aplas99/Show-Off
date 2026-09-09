-- Deploy before the Magic proxy/client update. Shared Magic records may only
-- be written using trusted server credentials. Existing read policies remain.
ALTER TABLE public.magic_cards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can cache Magic cards" ON public.magic_cards;
DROP POLICY IF EXISTS "Authenticated users can refresh Magic cards" ON public.magic_cards;
REVOKE ALL ON public.magic_cards FROM PUBLIC, anon, authenticated;
-- Remove historical column grants as well as table grants, including schemas
-- where extra column privileges were configured outside migration history.
DO $$
DECLARE v_columns TEXT;
BEGIN
  SELECT string_agg(quote_ident(attname), ', ') INTO v_columns
  FROM pg_attribute WHERE attrelid = 'public.magic_cards'::regclass
    AND attnum > 0 AND NOT attisdropped;
  EXECUTE format('REVOKE ALL (%s) ON public.magic_cards FROM PUBLIC, anon, authenticated', v_columns);
END;
$$;
GRANT SELECT ON public.magic_cards TO authenticated;
GRANT ALL ON public.magic_cards TO service_role;

ALTER TABLE public.catalog_proxy_usage DROP CONSTRAINT catalog_proxy_usage_provider_check;
ALTER TABLE public.catalog_proxy_usage ADD CONSTRAINT catalog_proxy_usage_provider_check
  CHECK (provider IN ('pokemon', 'barcode', 'magic'));

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
  IF p_user_id IS NULL OR p_provider NOT IN ('pokemon', 'barcode', 'magic') OR p_provider IS NULL THEN
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

-- A single row serializes admission across all users and Edge instances.
-- No requests reserve distant future slots or hold a database transaction open.
CREATE TABLE public.magic_catalog_admission (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
  next_allowed_at TIMESTAMPTZ NOT NULL
);
ALTER TABLE public.magic_catalog_admission ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.magic_catalog_admission FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.magic_catalog_admission TO service_role;
INSERT INTO public.magic_catalog_admission VALUES (TRUE, '-infinity');

CREATE OR REPLACE FUNCTION public.reserve_magic_catalog_request()
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Service authorization required';
  END IF;
  UPDATE public.magic_catalog_admission
    SET next_allowed_at = clock_timestamp() + interval '550 milliseconds'
    WHERE singleton AND next_allowed_at <= clock_timestamp();
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_magic_catalog_request() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_magic_catalog_request() TO service_role;

NOTIFY pgrst, 'reload schema';
