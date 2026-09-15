# Native IAP launch

The owner chose Apple and Google IAP via RevenueCat. New Stripe/web purchases
are deferred. Missing SDK keys, modules, store products, or verified prices
leave purchases unavailable. Cloudflare testing can cover the web app, but
purchase/restore testing requires a native development or store build.

## Purchase behavior implemented

- Both membership screens use localized billed amounts and month/year periods
  from products in the current RevenueCat offering. Old offerings and direct
  product lookups cannot resurrect a retired Founding Curator offer.
- Missing prices, unsupported periods, and changed offers block checkout and
  offer a price refresh. Unverified annual savings/permanent-price claims were
  removed. Standard renewal prices are shown; the store confirmation discloses
  eligible introductory offers. Verify every configured offer on real devices.
- Terms and Privacy links, renewal, cancellation, and account-deletion billing
  disclosures appear on both surfaces. Set public policy URLs in store metadata
  once the domain is chosen.
- Purchase/restore operations configure the signed-in Supabase UUID and serialize
  identity changes. Membership and store entitlement checks prevent a second
  new subscription. Changes to an existing plan use subscription management.
- Restore is visible on configured native builds. Backend access relies on
  verified server state, so store confirmation can precede server access.
- The old /membership callback redirects to Membership and never treats query
  parameters as payment evidence. New Stripe checkout is rejected server-side;
  legacy Stripe management is retained.

## Configuration before native testing

1. Build with react-native-purchases installed; Expo Go and web cannot test IAP.
2. Create auto-renewing products in App Store Connect and Play Console. Put
   mutually exclusive plans in one Apple subscription group. Configure Play
   products/base plans and test their exact identifiers (including suffixes).
3. Connect the stores to RevenueCat, set the `curator` entitlement, and attach
   only currently sellable plans to the current offering. Retire the founding
   plan by removing it from that offering.
4. Set EXPO_PUBLIC_REVENUECAT_IOS_KEY / EXPO_PUBLIC_REVENUECAT_ANDROID_KEY
   to their public SDK keys. Override EXPO_PUBLIC_IAP_PRODUCT_FOUNDING_CURATOR,
   EXPO_PUBLIC_IAP_PRODUCT_CURATOR_MONTHLY, EXPO_PUBLIC_IAP_PRODUCT_CURATOR_ANNUAL
   when needed. Defaults: curator_founding_monthly, curator_monthly, curator_annual.
5. Configure server product mappings, webhook authorization and environment,
   and apply membership migrations. Never put server credentials in public env.
6. Configure RevenueCat restore behavior to keep purchases with the original
   App User ID. Do not transfer paid access silently between Show Off accounts.

## Required release evidence

### Server configuration and reconciliation

Deploy migration `20260915160000_verified_membership_snapshots.sql` before the
updated `revenuecat-webhook` function. Configure:

- `REVENUECAT_WEBHOOK_AUTH_HEADER`: random secret sent verbatim by RevenueCat.
- `REVENUECAT_SECRET_API_KEY`: private RevenueCat API key with customer read access.
- `REVENUECAT_APP_IDS`: comma-separated RevenueCat iOS/Android app IDs.
- `REVENUECAT_PRODUCT_PLANS`: optional JSON mapping exact store product identifiers
  to `founding_curator`, `curator_monthly`, or `curator_annual`. Configure custom
  IDs and Play base-plan suffixes explicitly; matching does not strip suffixes.
- `REVENUECAT_ALLOW_SANDBOX=true` only in the isolated test backend. Default false.

The webhook verifies its authorization and fetches current customer state from
RevenueCat's API. Only an unexpired `curator` entitlement backed by a configured
Apple/Play subscription can grant access. Transfers reconcile both participants;
arbitrary aliases and unknown events cannot grant access. Provider failures
return 503 for retry. A service-only transaction rejects older/duplicate
snapshots, retires old transaction-keyed rows, and avoids recreating deleted or
deleting accounts. Membership helpers require a future expiry even when an
expiration webhook is delayed. No private API credential belongs in app env.

Existing RevenueCat accounts require reconciliation during rollout (resend a
recent lifecycle event from the provider dashboard). Verify that new API access
works before switching traffic. Monitor repeated 503s and reconcile provider
outages/refunds; a missing webhook can delay revocation until recorded expiry.
Keep test and production backends separate.

Local evidence: parser/routing/restore tests, Deno function type-check, and
isolated PostgreSQL tests for duplicate/stale snapshots, expiry, deletion, and
service-only privileges pass. Full migration upgrades and real store events
remain release tests.

Test purchase, cancelled sheet, renewal, expiration, refunds, billing problems,
restore after reinstall, wrong store account, account switching, offline errors,
price changes, retired offers, duplicate/delayed/out-of-order webhooks, and
subscription management on iOS and Android. Confirm backend limits and ad
removal after refresh and relaunch. Verify introductory offer eligibility and
actual price/period presentation. Sandbox evidence does not prove production
credentials or store approval. No live store verification has been completed.

## References

- [RevenueCat displaying products](https://www.revenuecat.com/docs/getting-started/displaying-products)
- [RevenueCat customer state API](https://www.revenuecat.com/docs/api-v1/customers)
- [RevenueCat webhook events](https://www.revenuecat.com/docs/integrations/webhooks/event-types-and-fields)
- [Apple review guidelines](https://developer.apple.com/app-store/review/guidelines/)

The launch choice does not claim U.S. external payment links are forbidden.
Recheck current rules, fees, and program requirements before a future Stripe
integration. This guide supersedes the older blanket payment-policy wording.
