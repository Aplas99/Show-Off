-- Free-tier scan quota: 10 card scans/day, extendable by watching a
-- rewarded ad. Curator subscribers are unlimited. Tracked server-side
-- (not just client-side) so the limit can't be bypassed by clearing
-- local storage/reinstalling the app.

CREATE TABLE IF NOT EXISTS public.scan_usage (
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  scan_date DATE NOT NULL DEFAULT CURRENT_DATE,
  scan_count INTEGER NOT NULL DEFAULT 0,
  bonus_scans INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, scan_date)
);

ALTER TABLE public.scan_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own scan usage" ON public.scan_usage;
CREATE POLICY "Users can read own scan usage" ON public.scan_usage
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- No INSERT/UPDATE policy for authenticated: all writes go through the
-- SECURITY DEFINER RPCs below, which enforce the daily limit atomically.
GRANT SELECT ON public.scan_usage TO authenticated;

-- Read-only status check, safe to call to render "N scans left today"
-- without consuming a scan.
CREATE OR REPLACE FUNCTION public.get_scan_quota_status()
RETURNS TABLE(is_curator BOOLEAN, remaining INTEGER, daily_limit INTEGER)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_is_curator BOOLEAN;
  v_count INTEGER;
  v_bonus INTEGER;
  v_base_limit CONSTANT INTEGER := 10;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  v_is_curator := public.has_curator_membership(v_user_id);
  IF v_is_curator THEN
    RETURN QUERY SELECT TRUE, NULL::INTEGER, NULL::INTEGER;
    RETURN;
  END IF;

  SELECT scan_count, bonus_scans INTO v_count, v_bonus
  FROM public.scan_usage
  WHERE user_id = v_user_id AND scan_date = CURRENT_DATE;

  RETURN QUERY SELECT
    FALSE,
    GREATEST((v_base_limit + COALESCE(v_bonus, 0)) - COALESCE(v_count, 0), 0),
    v_base_limit + COALESCE(v_bonus, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.get_scan_quota_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_scan_quota_status() TO authenticated;

-- Atomically checks and consumes one scan. Call immediately before
-- running OCR on a captured frame (not on every camera shutter press —
-- retries within the same capture don't need to re-consume).
CREATE OR REPLACE FUNCTION public.record_scan_attempt()
RETURNS TABLE(allowed BOOLEAN, remaining INTEGER, daily_limit INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_count INTEGER;
  v_bonus INTEGER;
  v_base_limit CONSTANT INTEGER := 10;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF public.has_curator_membership(v_user_id) THEN
    RETURN QUERY SELECT TRUE, NULL::INTEGER, NULL::INTEGER;
    RETURN;
  END IF;

  INSERT INTO public.scan_usage (user_id, scan_date, scan_count)
  VALUES (v_user_id, CURRENT_DATE, 0)
  ON CONFLICT (user_id, scan_date) DO NOTHING;

  SELECT scan_count, bonus_scans INTO v_count, v_bonus
  FROM public.scan_usage
  WHERE user_id = v_user_id AND scan_date = CURRENT_DATE
  FOR UPDATE;

  IF v_count >= (v_base_limit + v_bonus) THEN
    RETURN QUERY SELECT FALSE, 0, v_base_limit + v_bonus;
    RETURN;
  END IF;

  UPDATE public.scan_usage
  SET scan_count = scan_count + 1
  WHERE user_id = v_user_id AND scan_date = CURRENT_DATE;

  RETURN QUERY SELECT TRUE, (v_base_limit + v_bonus - v_count - 1), v_base_limit + v_bonus;
END;
$$;

REVOKE ALL ON FUNCTION public.record_scan_attempt() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_scan_attempt() TO authenticated;

-- Called after a rewarded ad completes to grant bonus scans for today.
CREATE OR REPLACE FUNCTION public.grant_bonus_scans(p_bonus INTEGER DEFAULT 5)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_new_bonus INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  INSERT INTO public.scan_usage (user_id, scan_date, scan_count, bonus_scans)
  VALUES (v_user_id, CURRENT_DATE, 0, GREATEST(p_bonus, 0))
  ON CONFLICT (user_id, scan_date)
  DO UPDATE SET bonus_scans = public.scan_usage.bonus_scans + GREATEST(p_bonus, 0)
  RETURNING bonus_scans INTO v_new_bonus;

  RETURN v_new_bonus;
END;
$$;

REVOKE ALL ON FUNCTION public.grant_bonus_scans(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.grant_bonus_scans(INTEGER) TO authenticated;

NOTIFY pgrst, 'reload schema';
