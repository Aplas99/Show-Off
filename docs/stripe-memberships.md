# Stripe membership scaffolding

Recurring memberships are implemented with Stripe Checkout in the browser +
Supabase Edge Functions. No native Stripe SDK is required, so it works in
any dev build (and Expo Go) without a rebuild.

## Architecture

```
App (api/memberships hooks)
  └─ supabase.functions.invoke("stripe-checkout")   ← user JWT verified
       └─ creates Stripe Checkout / Billing Portal session, returns URL
  └─ expo-web-browser opens the URL (openAuthSessionAsync)
       └─ Stripe redirects back to showoff://membership deep link

Stripe ──(webhook)──▶ supabase/functions/stripe-webhook
  └─ verifies signature, upserts public.subscriptions (service role)

App reads public.subscriptions (RLS: own rows only) via useMembership()
```

Key pieces:

| Piece | Location |
|---|---|
| DB tables `billing_customers`, `subscriptions`, `has_active_membership()` | `supabase/migrations/20260713120000_create_membership_billing.sql` |
| Checkout / portal session Edge Function | `supabase/functions/stripe-checkout/index.ts` |
| Webhook Edge Function | `supabase/functions/stripe-webhook/index.ts` |
| Client hooks (`useMembership`, `useStartCheckout`, `useOpenBillingPortal`) | `api/memberships/index.ts` |
| Membership screen | `src/features/profile/MembershipScreen.tsx` (route: `app/(tabs)/profile/membership.tsx`) |
| Paid upload limit gate | `api/storage/index.ts` (`getHasActiveMembership`) |

## Setup

1. **Stripe Dashboard**
   - Create a Product ("Curator Membership") with three recurring Prices —
     a Founder rate, a standard monthly, and an annual. Note each
     `price_...` id (they map to `STRIPE_PRICE_ID_FOUNDING_CURATOR`,
     `STRIPE_PRICE_ID_CURATOR_MONTHLY`, `STRIPE_PRICE_ID_CURATOR_ANNUAL`).
   - Developers → Webhooks → Add endpoint:
     `https://<project-ref>.functions.supabase.co/stripe-webhook`
     with events `checkout.session.completed`,
     `customer.subscription.created`, `customer.subscription.updated`,
     `customer.subscription.deleted`. Note the `whsec_...` secret.

2. **Database**
   ```bash
   npx supabase db push   # applies the membership migration
   ```

3. **Edge Function secrets**
   ```bash
   npx supabase secrets set \
     STRIPE_SECRET_KEY=sk_test_... \
     STRIPE_WEBHOOK_SECRET=whsec_... \
     STRIPE_PRICE_ID_FOUNDING_CURATOR=price_... \
     STRIPE_PRICE_ID_CURATOR_MONTHLY=price_... \
     STRIPE_PRICE_ID_CURATOR_ANNUAL=price_...
   ```

   > The Edge Function reads exactly these three `STRIPE_PRICE_ID_*` names
   > (see `PLAN_PRICE_ENV_VARS` in `stripe-checkout/index.ts`). A missing or
   > misnamed price secret makes checkout return
   > `No Stripe price configured for plan "..."`.

4. **Deploy functions**
   ```bash
   npx supabase functions deploy stripe-checkout
   npx supabase functions deploy stripe-webhook --no-verify-jwt
   ```

5. **Test** with Stripe test cards (`4242 4242 4242 4242`). The
   `stripe listen --forward-to` CLI can proxy webhooks against local dev.

## Gating features on membership

- In components: `const { data } = useMembership(); data?.isPaidUser`
- In plain async code: `await getHasActiveMembership()`
- In SQL / RLS policies: `public.has_active_membership(auth.uid())`

## Production notes

- **Apple / Google store policy:** digital memberships sold in-app normally
  must use In-App Purchase / Play Billing. Web-checkout via external links
  is only permitted in limited jurisdictions (e.g. US external-purchase
  entitlements). Decide the compliance strategy before shipping this flow
  in store builds.
- Plan copy/prices in `MEMBERSHIP_PLANS` (`api/memberships/index.ts`) are
  display-only placeholders — keep them in sync with the Stripe Prices.
- The webhook is idempotent (upsert keyed by subscription id); Stripe
  retries failed deliveries automatically.
