-- Persist the purchased plan separately from the broad entitlement tier.
-- All paid plans grant the Curator tier, but Founding Curator has a different
-- upload allowance and remains identifiable after it closes to new signups.

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS plan_id TEXT;

ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_plan_id_check;
ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_plan_id_check
  CHECK (
    plan_id IS NULL OR plan_id IN (
      'founding_curator',
      'curator_monthly',
      'curator_annual'
    )
  );

ALTER TABLE public.membership_tiers
  ADD COLUMN IF NOT EXISTS plan_id TEXT;

ALTER TABLE public.membership_tiers
  DROP CONSTRAINT IF EXISTS membership_tiers_plan_id_check;
ALTER TABLE public.membership_tiers
  ADD CONSTRAINT membership_tiers_plan_id_check
  CHECK (
    plan_id IS NULL OR plan_id IN (
      'founding_curator',
      'curator_monthly',
      'curator_annual'
    )
  );

-- Known RevenueCat product ids. Stripe price ids should also be assigned a
-- plan_id when they are seeded (examples below).
UPDATE public.membership_tiers
SET plan_id = CASE price_id
  WHEN 'curator_founding_monthly' THEN 'founding_curator'
  WHEN 'curator_monthly' THEN 'curator_monthly'
  WHEN 'curator_annual' THEN 'curator_annual'
  WHEN 'price_1Tw7eIDWVhDBLzJE6TtFiBUm' THEN 'founding_curator'
  WHEN 'price_1Tw7eKDWVhDBLzJEqlb0cvh7' THEN 'curator_monthly'
  WHEN 'price_1Tw7eKDWVhDBLzJErtrm0WYB' THEN 'curator_annual'
  ELSE plan_id
END
WHERE price_id IN (
  'curator_founding_monthly',
  'curator_monthly',
  'curator_annual',
  'price_1Tw7eIDWVhDBLzJE6TtFiBUm',
  'price_1Tw7eKDWVhDBLzJEqlb0cvh7',
  'price_1Tw7eKDWVhDBLzJErtrm0WYB'
);

-- For existing Stripe prices, run the equivalent with real ids if they were
-- seeded before this migration:
-- UPDATE public.membership_tiers SET plan_id = 'founding_curator'
--   WHERE price_id = 'price_REPLACE_FOUNDING_CURATOR';
-- UPDATE public.membership_tiers SET plan_id = 'curator_monthly'
--   WHERE price_id = 'price_REPLACE_CURATOR_MONTHLY';
-- UPDATE public.membership_tiers SET plan_id = 'curator_annual'
--   WHERE price_id = 'price_REPLACE_CURATOR_ANNUAL';

-- Prefer the plan written directly by a webhook. Fall back to the price lookup
-- so subscriptions created before this migration can still resolve their plan.
CREATE OR REPLACE VIEW public.subscriptions_with_tier
WITH (security_invoker = TRUE) AS
SELECT
  s.id,
  s.user_id,
  s.status,
  s.price_id,
  s.cancel_at_period_end,
  s.current_period_end,
  s.created_at,
  s.updated_at,
  s.provider,
  CASE
    WHEN s.plan_id IN (
      'founding_curator',
      'curator_monthly',
      'curator_annual'
    ) THEN 'curator'
    ELSE COALESCE(mt.tier, 'collector')
  END AS tier,
  COALESCE(s.plan_id, mt.plan_id) AS plan_id
FROM public.subscriptions s
LEFT JOIN public.membership_tiers mt ON mt.price_id = s.price_id;

GRANT SELECT ON public.subscriptions_with_tier TO authenticated;

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
    LEFT JOIN public.membership_tiers mt ON mt.price_id = s.price_id
    WHERE s.user_id = uid
      AND s.status IN ('active', 'trialing')
      AND (
        s.plan_id IN (
          'founding_curator',
          'curator_monthly',
          'curator_annual'
        )
        OR mt.tier = 'curator'
      )
  );
$$;

REVOKE ALL ON FUNCTION public.has_curator_membership(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_curator_membership(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
