-- Adds a Curator tier above the existing single paid ("Collector") tier.
--
-- Tier is resolved from a price_id -> tier lookup table rather than a
-- hand-set column on subscriptions: Stripe's price_id (already written by
-- the stripe-webhook Edge Function) is the real source of truth, so a
-- future price can be added later as a data row instead of a deploy.
-- The stripe-webhook function needs NO changes for this — it already
-- mirrors whatever price_id Stripe sends into subscriptions.price_id.

CREATE TABLE IF NOT EXISTS public.membership_tiers (
  price_id TEXT PRIMARY KEY,
  tier TEXT NOT NULL CHECK (tier IN ('collector', 'curator')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.membership_tiers ENABLE ROW LEVEL SECURITY;

-- Plan/tier names aren't sensitive — any authenticated user can read the
-- full lookup table (e.g. to render plan pickers).
DROP POLICY IF EXISTS "Authenticated users can read membership tiers"
  ON public.membership_tiers;
CREATE POLICY "Authenticated users can read membership tiers"
  ON public.membership_tiers
  FOR SELECT
  TO authenticated
  USING (TRUE);

GRANT SELECT ON public.membership_tiers TO authenticated;

-- Seed once real Stripe Price ids exist (Dashboard -> Product catalog).
-- Run manually (SQL editor or a follow-up migration) after creating the
-- Prices for Founding Collector ($3.99/mo), Curator Monthly ($5.99/mo),
-- and Curator Annual ($59.99/yr) — this migration intentionally ships
-- with no rows since the ids don't exist yet:
--
--   INSERT INTO public.membership_tiers (price_id, tier) VALUES
--     ('price_REPLACE_FOUNDING_COLLECTOR_MONTHLY', 'collector'),
--     ('price_REPLACE_CURATOR_MONTHLY', 'curator'),
--     ('price_REPLACE_CURATOR_ANNUAL', 'curator')
--   ON CONFLICT (price_id) DO UPDATE SET tier = EXCLUDED.tier;

-- Tracks which payment rail wrote a subscription row. Only 'stripe' is
-- wired up today; this exists so a future mobile IAP integration (e.g.
-- RevenueCat, for App Store/Play Store compliance) can write into the
-- same table without a later migration touching a table every paid user
-- already has a row in.
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'stripe';

-- Client-facing view: joins a user's own subscription row to its tier,
-- defaulting to 'collector' when a price_id has no match yet (fail
-- toward the tier already being paid for, never silently upgrade to
-- Curator on an unrecognized price). `security_invoker` makes the view
-- respect the querying user's own RLS on `subscriptions` (own rows only)
-- rather than running with the view owner's privileges.
CREATE OR REPLACE VIEW public.subscriptions_with_tier
WITH (security_invoker = TRUE) AS
SELECT
  s.*,
  COALESCE(mt.tier, 'collector') AS tier
FROM public.subscriptions s
LEFT JOIN public.membership_tiers mt ON mt.price_id = s.price_id;

GRANT SELECT ON public.subscriptions_with_tier TO authenticated;

-- Sibling to has_active_membership(), scoped to the Curator tier only.
CREATE OR REPLACE FUNCTION public.has_curator_membership(uid UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.subscriptions s
    JOIN public.membership_tiers mt ON mt.price_id = s.price_id
    WHERE s.user_id = uid
      AND s.status IN ('active', 'trialing')
      AND mt.tier = 'curator'
  );
$$;

REVOKE ALL ON FUNCTION public.has_curator_membership(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_curator_membership(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
