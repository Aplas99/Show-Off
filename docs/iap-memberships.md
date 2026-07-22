# Native IAP memberships (App Store / Play) via RevenueCat

Store builds sell the Curator membership through **native in-app purchase**
(StoreKit on iOS, Play Billing on Android), fronted by **RevenueCat**. The web
target keeps the existing **Stripe** checkout. Both rails reconcile into the
same `public.subscriptions` table, so every membership gate (`isPaidUser`,
`has_active_membership()`, `subscriptions_with_tier`, the upload limit, etc.)
works identically no matter how the user paid.

```
store build   →  RevenueCat purchase  →  revenuecat-webhook  →  subscriptions (provider='revenuecat')
web / browser →  Stripe Checkout      →  stripe-webhook      →  subscriptions (provider='stripe')
                                                                        │
                                             useMembership() reads ─────┘  (unchanged)
```

## Why native IAP and not "redirect to a web checkout"

Apple (Guideline 3.1.1) and Google Play require digital goods **consumed inside
the app** to use their billing. *Steering* users to an external web checkout —
detecting a payment tap and opening the browser to Stripe — is prohibited
except under specific programs/storefronts (US external-link entitlements, the
EU DMA external-purchase/offers entitlements, Google's Japan external-payment
program with mandatory Play-Billing user-choice). It is **not** a generally
compliant pattern, and the "make it hard for reviewers to spot" framing is what
gets apps removed. The Netflix/Spotify "reader app" exemption does not apply to
a collectibles social app.

Selling through native IAP on store builds is the low-risk, universally
compliant path — the store handles the payment, RevenueCat handles receipt
validation and renewal webhooks. Keep the Stripe flow for the **web** app and
out-of-app signups only.

> The US storefront currently *does* permit external links on both stores (court
> orders). If you later want web-checkout-at-a-discount for US users, that's an
> additive change on top of this — gated to the US storefront with the required
> disclosure — not a replacement for IAP.

## Code map

| Piece | Location |
|---|---|
| Native billing wrapper (RevenueCat) | `api/memberships/nativeBilling.ts` |
| Provider routing + hooks (`usePurchaseMembership`, `useManageMembership`, `useRestorePurchases`, `getActiveBillingProvider`) | `api/memberships/index.ts` |
| RevenueCat webhook → `subscriptions` | `supabase/functions/revenuecat-webhook/index.ts` |
| Store-product → tier seed + `provider` index | `supabase/migrations/20260723090000_iap_membership_products.sql` |
| Membership UI (reference wiring) | `src/features/profile/MembershipScreen.tsx` |

## Prerequisites: this needs a dev/store build

`react-native-purchases` is a **native module** — like the ML Kit scanner, it
**does not run in Expo Go**. Test on a development build (`npm run ios` /
`npm run android`) or a TestFlight / internal-testing build. On web and in Expo
Go, `isNativeBillingAvailable()` returns `false` and the app falls back to the
Stripe path automatically.

## Setup

### 1. Install the SDK (done by this PR)

```bash
npm install react-native-purchases
npx expo prebuild   # regenerate native projects so the module links
```

### 2. Store product setup

Create an **auto-renewable subscription** in each store, one product per plan.
The product identifiers must match `PLAN_STORE_PRODUCT_IDS` in
`api/memberships/index.ts` (overridable via `EXPO_PUBLIC_IAP_PRODUCT_*`) **and**
the rows seeded in the migration:

| Plan | Default product id |
|---|---|
| Founding Curator | `curator_founding_monthly` |
| Curator (monthly) | `curator_monthly` |
| Curator (annual) | `curator_annual` |

- **App Store Connect** → your app → Subscriptions → create a Subscription Group
  ("Curator") with the three products. Fill in localized display name, price,
  and review screenshot (required or the products stay "Missing Metadata").
- **Google Play Console** → Monetize → Products → Subscriptions → create the
  products with a base plan each. Play reports the id as
  `product_id:base_plan_id` in some webhooks — confirm from a sandbox delivery
  and add matching rows to `membership_tiers` if it differs from the bare id.

### 3. RevenueCat dashboard

1. Create a project; add the iOS app (App Store shared secret / in-app purchase
   key) and the Android app (Play service-account credentials) so RevenueCat can
   validate receipts and receive store server notifications.
2. Create an **Entitlement** with identifier **`curator`** (must match
   `CURATOR_ENTITLEMENT_ID`).
3. Create **Products** for the three store product ids and attach them to the
   `curator` entitlement.
4. (Recommended) Create an **Offering** with a package per plan so intro/promo
   pricing configured in RevenueCat applies. The app prefers a matching Offering
   package and falls back to a direct product purchase.
5. Copy the **public SDK keys** (one per platform) into env:

```
EXPO_PUBLIC_REVENUECAT_IOS_KEY=appl_xxx
EXPO_PUBLIC_REVENUECAT_ANDROID_KEY=goog_xxx
```

Leaving both unset disables native billing (the UI hides the IAP CTA and uses
Stripe), which is the correct behavior for the web build.

### 4. Webhook

RevenueCat Dashboard → Integrations → **Webhooks**:

- **URL:** `https://<project-ref>.functions.supabase.co/revenuecat-webhook`
- **Authorization header:** a random secret you generate.

Set the same value as an Edge Function secret and deploy:

```bash
npx supabase secrets set REVENUECAT_WEBHOOK_AUTH_HEADER=<the-same-secret>
npx supabase functions deploy revenuecat-webhook --no-verify-jwt
```

`--no-verify-jwt` is required: RevenueCat can't present a Supabase user JWT, so
the shared `Authorization` secret is what authenticates the endpoint.

### 5. Database

```bash
npx supabase db push   # applies 20260723090000_iap_membership_products.sql
```

If your real store product ids differ from the defaults, update both
`PLAN_STORE_PRODUCT_IDS` (env or code) and the `membership_tiers` rows — an
unseeded product id fails safe to the **free** tier (the subscriber would be
charged but not unlocked), so verify the mapping end to end in sandbox.

## Client behavior

- `getActiveBillingProvider()` → `"revenuecat"` on a store build with keys set,
  else `"stripe"`. The membership screen uses it to pick the CTA and copy.
- `usePurchaseMembership()` configures RevenueCat with the Supabase user id
  (so the webhook's `app_user_id` resolves to `user_id`), then opens the native
  purchase sheet (or Stripe browser checkout on web).
- `useManageMembership(subscription.provider)` routes to the native
  manage-subscriptions sheet for IAP rows and the Stripe billing portal for
  Stripe rows — an IAP subscription can only be cancelled in the store account.
- `useRestorePurchases()` backs the **"Restore purchases"** action, which App
  Store review requires for subscription apps.

## Testing

- **iOS:** create a Sandbox Apple Account (App Store Connect → Users and Access
  → Sandbox) and sign into it on-device under Settings → App Store. Sandbox
  renewals are accelerated (e.g. a month ≈ 5 minutes) so you can watch RENEWAL
  and EXPIRATION webhooks land.
- **Android:** add the tester to a Play Console license-testing list and ship an
  internal-testing build.
- Watch webhook deliveries in RevenueCat (Webhooks → delivery log) and confirm
  a `provider='revenuecat'` row appears in `public.subscriptions` and that
  `useMembership()` flips `isCurator` to true.

## Store-review checklist

- [ ] No in-app UI that opens a **web** checkout on the store build (native IAP
      only). The Stripe path must be unreachable when `getActiveBillingProvider()`
      is `revenuecat`.
- [ ] Visible **Restore purchases** action (present on the membership screen).
- [ ] Terms of Use (EULA) and Privacy Policy links, and clear price / renewal /
      cancellation disclosure near the purchase button.
- [ ] Subscription products approved / not "Missing Metadata" before submission.
