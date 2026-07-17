-- Free-tier search quota: 15 searches/day shared across every search
-- surface (product/barcode search, Pokémon manual card search, Magic name
-- search), extendable by watching a rewarded ad. Curator subscribers are
-- unlimited. Mirrors the scan quota (20260714140000_add_scan_quota.sql):
-- tracked server-side so the limit can't be bypassed client-side.

CREATE TABLE IF NOT EXISTS public.search_usage (
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  search_date DATE NOT NULL DEFAULT CURRENT_DATE,
  search_count INTEGER NOT NULL DEFAULT 0,
  bonus_searches INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, search_date)
);

ALTER TABLE public.search_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own search usage" ON public.search_usage;
CREATE POLICY "Users can read own search usage" ON public.search_usage
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- No INSERT/UPDATE policy for authenticated: all writes go through the
-- SECURITY DEFINER RPCs below, which enforce the daily limit atomically.
GRANT SELECT ON public.search_usage TO authenticated;

CREATE OR REPLACE FUNCTION public.get_search_quota_status()
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
  v_base_limit CONSTANT INTEGER := 15;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  v_is_curator := public.has_curator_membership(v_user_id);
  IF v_is_curator THEN
    RETURN QUERY SELECT TRUE, NULL::INTEGER, NULL::INTEGER;
    RETURN;
  END IF;

  SELECT search_count, bonus_searches INTO v_count, v_bonus
  FROM public.search_usage
  WHERE user_id = v_user_id AND search_date = CURRENT_DATE;

  RETURN QUERY SELECT
    FALSE,
    GREATEST((v_base_limit + COALESCE(v_bonus, 0)) - COALESCE(v_count, 0), 0),
    v_base_limit + COALESCE(v_bonus, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.get_search_quota_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_search_quota_status() TO authenticated;

-- Atomically checks and consumes one search. Call once per user-submitted
-- search (not per keystroke or per result page).
CREATE OR REPLACE FUNCTION public.record_search_attempt()
RETURNS TABLE(allowed BOOLEAN, remaining INTEGER, daily_limit INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_count INTEGER;
  v_bonus INTEGER;
  v_base_limit CONSTANT INTEGER := 15;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF public.has_curator_membership(v_user_id) THEN
    RETURN QUERY SELECT TRUE, NULL::INTEGER, NULL::INTEGER;
    RETURN;
  END IF;

  INSERT INTO public.search_usage (user_id, search_date, search_count)
  VALUES (v_user_id, CURRENT_DATE, 0)
  ON CONFLICT (user_id, search_date) DO NOTHING;

  SELECT search_count, bonus_searches INTO v_count, v_bonus
  FROM public.search_usage
  WHERE user_id = v_user_id AND search_date = CURRENT_DATE
  FOR UPDATE;

  IF v_count >= (v_base_limit + v_bonus) THEN
    RETURN QUERY SELECT FALSE, 0, v_base_limit + v_bonus;
    RETURN;
  END IF;

  UPDATE public.search_usage
  SET search_count = search_count + 1
  WHERE user_id = v_user_id AND search_date = CURRENT_DATE;

  RETURN QUERY SELECT TRUE, (v_base_limit + v_bonus - v_count - 1), v_base_limit + v_bonus;
END;
$$;

REVOKE ALL ON FUNCTION public.record_search_attempt() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_search_attempt() TO authenticated;

-- Called after a rewarded ad completes to grant bonus searches for today.
CREATE OR REPLACE FUNCTION public.grant_bonus_searches(p_bonus INTEGER DEFAULT 5)
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

  INSERT INTO public.search_usage (user_id, search_date, search_count, bonus_searches)
  VALUES (v_user_id, CURRENT_DATE, 0, GREATEST(p_bonus, 0))
  ON CONFLICT (user_id, search_date)
  DO UPDATE SET bonus_searches = public.search_usage.bonus_searches + GREATEST(p_bonus, 0)
  RETURNING bonus_searches INTO v_new_bonus;

  RETURN v_new_bonus;
END;
$$;

REVOKE ALL ON FUNCTION public.grant_bonus_searches(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.grant_bonus_searches(INTEGER) TO authenticated;

NOTIFY pgrst, 'reload schema';
