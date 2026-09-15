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

Test purchase, cancelled sheet, renewal, expiration, refunds, billing problems,
restore after reinstall, wrong store account, account switching, offline errors,
price changes, retired offers, duplicate/delayed/out-of-order webhooks, and
subscription management on iOS and Android. Confirm backend limits and ad
removal after refresh and relaunch. Verify introductory offer eligibility and
actual price/period presentation. Sandbox evidence does not prove production
credentials or store approval. No live store verification has been completed.

## References

- [RevenueCat displaying products](https://www.revenuecat.com/docs/getting-started/displaying-products)
- [Apple review guidelines](https://developer.apple.com/app-store/review/guidelines/)

The launch choice does not claim U.S. external payment links are forbidden.
Recheck current rules, fees, and program requirements before a future Stripe
integration. This guide supersedes the older blanket payment-policy wording.
