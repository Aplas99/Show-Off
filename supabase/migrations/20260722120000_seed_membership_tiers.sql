-- Seeds the price_id -> tier mapping for the Curator Membership Stripe
-- Prices (test mode). All three are the Curator tier at different price
-- points; see api/memberships/index.ts MEMBERSHIP_PLANS for the display copy.
--
--   founding_curator  price_1Tw7eIDWVhDBLzJE6TtFiBUm  $3.99 / month
--   curator_monthly   price_1Tw7eKDWVhDBLzJEqlb0cvh7  $5.99 / month
--   curator_annual    price_1Tw7eKDWVhDBLzJErtrm0WYB  $59.99 / year
--
-- Live-mode Prices will have different ids — add a follow-up seed (or update
-- these rows) once the live Product/Prices exist.

INSERT INTO public.membership_tiers (price_id, tier) VALUES
  ('price_1Tw7eIDWVhDBLzJE6TtFiBUm', 'curator'),
  ('price_1Tw7eKDWVhDBLzJEqlb0cvh7', 'curator'),
  ('price_1Tw7eKDWVhDBLzJErtrm0WYB', 'curator')
ON CONFLICT (price_id) DO UPDATE SET tier = EXCLUDED.tier;

NOTIFY pgrst, 'reload schema';
