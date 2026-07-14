-- Stripe membership scaffolding.
-- billing_customers maps a Supabase user to a Stripe customer.
-- subscriptions mirrors Stripe subscription state (written only by the
-- stripe-webhook Edge Function via the service role).

CREATE TABLE IF NOT EXISTS public.billing_customers (
  user_id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  stripe_customer_id TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.subscriptions (
  -- Stripe subscription id (e.g. sub_123).
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  -- Stripe subscription status: trialing, active, past_due, canceled,
  -- unpaid, incomplete, incomplete_expired, paused.
  status TEXT NOT NULL,
  price_id TEXT,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS subscriptions_user_id_idx
  ON public.subscriptions (user_id);

ALTER TABLE public.billing_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- Users may read their own billing rows. All writes go through Edge
-- Functions using the service role key, so no INSERT/UPDATE/DELETE
-- policies are defined for authenticated users.
DROP POLICY IF EXISTS "Users can read own billing customer"
  ON public.billing_customers;
CREATE POLICY "Users can read own billing customer"
  ON public.billing_customers
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can read own subscriptions"
  ON public.subscriptions;
CREATE POLICY "Users can read own subscriptions"
  ON public.subscriptions
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

GRANT SELECT ON public.billing_customers TO authenticated;
GRANT SELECT ON public.subscriptions TO authenticated;

-- Convenience helper for RLS policies / RPCs that need to gate features
-- on membership (e.g. storage upload limits).
CREATE OR REPLACE FUNCTION public.has_active_membership(uid UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.subscriptions
    WHERE user_id = uid
      AND status IN ('active', 'trialing')
  );
$$;

REVOKE ALL ON FUNCTION public.has_active_membership(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_active_membership(UUID) TO authenticated;
