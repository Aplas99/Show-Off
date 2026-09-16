-- Current provider snapshots, not client data or webhook event order, grant IAP.
CREATE TABLE public.revenuecat_sync_state (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  observed_at_ms BIGINT NOT NULL
);
ALTER TABLE public.revenuecat_sync_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.revenuecat_sync_state FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.revenuecat_sync_state TO service_role;

REVOKE INSERT, UPDATE, DELETE ON public.subscriptions, public.billing_customers,
  public.membership_tiers FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.apply_revenuecat_snapshot(p_user_id UUID, p_state JSONB)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  observed BIGINT := (p_state->>'observed_at_ms')::BIGINT;
  previous BIGINT;
  next_status TEXT := p_state->>'status';
  next_plan TEXT := p_state->>'plan_id';
  expires TIMESTAMPTZ := (p_state->>'current_period_end')::TIMESTAMPTZ;
BEGIN
  IF observed IS NULL OR observed <= 0 OR observed > extract(epoch FROM now()) * 1000 + 60000
    OR next_status IS NULL OR next_status NOT IN ('active','trialing','canceled') THEN
    RAISE EXCEPTION 'Invalid billing snapshot';
  END IF;
  IF next_status IN ('active','trialing') AND (
    next_plan IS NULL OR next_plan NOT IN ('founding_curator','curator_monthly','curator_annual')
    OR expires IS NULL OR expires <= now() OR nullif(p_state->>'price_id','') IS NULL
  ) THEN RAISE EXCEPTION 'Invalid active membership'; END IF;
  PERFORM 1 FROM auth.users WHERE id = p_user_id FOR KEY SHARE;
  IF NOT FOUND OR EXISTS (SELECT 1 FROM public.account_deletion_requests WHERE user_id = p_user_id) THEN
    RETURN FALSE;
  END IF;
  INSERT INTO public.revenuecat_sync_state VALUES(p_user_id, 0) ON CONFLICT DO NOTHING;
  SELECT observed_at_ms INTO previous FROM public.revenuecat_sync_state
    WHERE user_id = p_user_id FOR UPDATE;
  IF observed <= previous THEN RETURN FALSE; END IF;
  -- Retire transaction-keyed rows from the previous receiver atomically.
  UPDATE public.subscriptions SET status = 'canceled', updated_at = now()
    WHERE user_id = p_user_id AND provider = 'revenuecat';
  INSERT INTO public.subscriptions(id,user_id,status,price_id,plan_id,provider,
    cancel_at_period_end,current_period_end,updated_at)
  VALUES('rc_user_' || p_user_id::TEXT,p_user_id,next_status,p_state->>'price_id',next_plan,
    'revenuecat',coalesce((p_state->>'cancel_at_period_end')::BOOLEAN,FALSE),expires,now())
  ON CONFLICT(id) DO UPDATE SET status=excluded.status,price_id=excluded.price_id,
    plan_id=excluded.plan_id,cancel_at_period_end=excluded.cancel_at_period_end,
    current_period_end=excluded.current_period_end,updated_at=excluded.updated_at;
  UPDATE public.revenuecat_sync_state SET observed_at_ms = observed WHERE user_id = p_user_id;
  RETURN TRUE;
END;
$$;
REVOKE ALL ON FUNCTION public.apply_revenuecat_snapshot(UUID,JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_revenuecat_snapshot(UUID,JSONB) TO service_role;

CREATE OR REPLACE FUNCTION public.has_active_membership(uid UUID DEFAULT auth.uid())
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.subscriptions
    WHERE user_id = uid AND status IN ('active','trialing') AND current_period_end > now());
$$;
CREATE OR REPLACE FUNCTION public.has_curator_membership(uid UUID DEFAULT auth.uid())
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.subscriptions s
    LEFT JOIN public.membership_tiers mt ON mt.price_id=s.price_id
    WHERE s.user_id=uid AND s.status IN ('active','trialing') AND s.current_period_end > now()
    AND (s.plan_id IN ('founding_curator','curator_monthly','curator_annual') OR mt.tier='curator'));
$$;

NOTIFY pgrst, 'reload schema';
