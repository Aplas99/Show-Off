-- Native IAP (App Store / Play) membership support.
--
-- The subscriptions table already carries a `provider` column (added in
-- 20260714090000) precisely so a mobile IAP rail could write into the same
-- table. The revenuecat-webhook Edge Function writes rows with
-- provider = 'revenuecat', storing the STORE PRODUCT ID in `price_id`.
--
-- subscriptions_with_tier resolves a row's tier by joining price_id ->
-- membership_tiers, defaulting to 'collector' on no match. So the store product
-- ids must be seeded here as 'curator', exactly like the Stripe price ids, or
-- IAP subscribers would fail-safe to the free tier.

-- Speeds up provider-scoped reads/audits (e.g. "all IAP subscriptions").
CREATE INDEX IF NOT EXISTS subscriptions_provider_idx
  ON public.subscriptions (provider);

-- Seed the IAP product ids -> 'curator'. These MUST match:
--   * the products you create in App Store Connect / Google Play Console,
--   * the app's PLAN_STORE_PRODUCT_IDS / EXPO_PUBLIC_IAP_PRODUCT_* values, and
--   * the `product_id` RevenueCat actually sends in its webhook payload.
--
-- NOTE (Google Play): RevenueCat may report the product id with a base-plan
-- suffix (e.g. "curator_annual:annual-autorenew"). Confirm the real value from
-- a sandbox webhook delivery and add/adjust rows here if it differs.
INSERT INTO public.membership_tiers (price_id, tier) VALUES
  ('curator_founding_monthly', 'curator'),
  ('curator_monthly', 'curator'),
  ('curator_annual', 'curator')
ON CONFLICT (price_id) DO UPDATE SET tier = EXCLUDED.tier;

NOTIFY pgrst, 'reload schema';
