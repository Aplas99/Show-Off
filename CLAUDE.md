# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

**Show-Off** is a React Native + Expo social app for collectors to showcase items. Users create "showcases" (collections), add items verified against product databases, follow other users, and interact via likes/comments/bookmarks. The current active feature branch adds Pokémon TCG card scanning.

Tech: Expo SDK 54, React 19, TypeScript strict, Expo Router (file-based), Supabase (auth + DB + storage), TanStack Query, Zustand, Zod, react-native-reanimated.

New Architecture (`newArchEnabled: true`) and React Compiler are both enabled.

## Commands

```bash
npm start              # Expo dev server (interactive menu)
npm run ios            # native iOS build (requires Xcode)
npm run android        # native Android build (requires Android SDK)
npm run web            # web target via react-native-web
npm run lint           # ESLint
npm test               # Jest (all tests)
npx jest path/to/file.test.ts                       # single file
npx jest path/to/file.test.ts -t "test name"        # single case
npx jest --watch                                    # watch mode
```

## Environment variables

| Variable | Purpose |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `EXPO_PUBLIC_ANON_KEY` | Supabase public anon key |
| `EXPO_PUBLIC_CARD_SCAN_DEBUG` | Set to `false` to silence `[CardScan]` OCR logs |
| `EXPO_PUBLIC_ACTION_DEBUG` | Set to `false` to silence `lib/actionDebug.ts` logs (barcode scanning, product/API search, manual item creation, Magic: The Gathering search) |
| `EXPO_PUBLIC_MEMBERSHIP_DEBUG` | Set to `false` to silence development-only `[Membership]` checkout diagnostics; logs never include tokens, checkout URLs, or payment details |
| `OCR_SERVICE_URL` | Supabase Edge Function secret: HTTPS Railway PaddleOCR base URL (`server/paddleocr`) |
| `OCR_SERVICE_TOKEN` | Secret on Supabase Edge Functions and Railway; never put in app env |
| `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key (reserved for future native SDK use) |
| `EXPO_PUBLIC_REVENUECAT_IOS_KEY` / `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` | RevenueCat public SDK keys for native IAP memberships (store builds). Unset disables native billing and falls back to Stripe web checkout — see `docs/iap-memberships.md` |
| `EXPO_PUBLIC_IAP_PRODUCT_FOUNDING_CURATOR` / `EXPO_PUBLIC_IAP_PRODUCT_CURATOR_MONTHLY` / `EXPO_PUBLIC_IAP_PRODUCT_CURATOR_ANNUAL` | Optional overrides for the App Store / Play product ids per plan (defaults in `PLAN_STORE_PRODUCT_IDS`) |
| `EXPO_PUBLIC_ADMOB_BANNER_UNIT_ID` | AdMob banner ad unit id; unset falls back to Google's test unit |
| `EXPO_PUBLIC_ADMOB_REWARDED_UNIT_ID` | AdMob rewarded ad unit id (grants bonus scans); unset falls back to Google's test unit |

Stripe server secrets (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID_FOUNDING_CURATOR`, `STRIPE_PRICE_ID_CURATOR_MONTHLY`, `STRIPE_PRICE_ID_CURATOR_ANNUAL`) live in Supabase Edge Function secrets, not app env — see `docs/stripe-memberships.md`.

Catalog secrets (`POKEMON_TCG_API_KEY`, `BARCODE_LOOKUP_API_KEY`) also live only
in Edge Function secrets. Deploy `catalog-proxy` and all catalog migrations
before using the client; see `docs/catalog-proxy.md`. Magic and product cache
writes now use trusted server code, including UPCItemDB's shared trial budget.
Pokemon card/roster and manual-card writes still need migration.

## Architecture

### Directory layout

```
app/              Expo Router routes — (auth), (tabs), (admin) segments
  providers/      QueryProvider, AuthInitializer wrappers
  _layout.tsx     Root layout with theme + auth gating
src/features/     Screen-level components (discover, marketplace, profile, showcase, create)
src/components/   Reusable UI, modals, skeleton loaders
api/              All Supabase + external API calls, exported as TanStack Query hooks
  items/          Product search, item creation, barcode lookups
  pokemon/        TCG card cache, OCR recognition pipeline, search, scan debug logging
  magic/          Magic: The Gathering via Scryfall (name search, OCR scan, card cache)
  prices/         Per-card market price history (Curator graph; DB triggers snapshot daily)
  scanning/       Free-tier daily quotas: card/barcode scans (10/day) and searches (15/day)
  showcase/       Showcase CRUD
  social/         Feed, interactions (likes, bookmarks, comments)
  auth/           Auth hooks
  memberships/    Stripe membership state + checkout/portal hooks
  storage/        Image upload to Supabase Storage (5MB free / 10MB Founding Curator / 100MB Curator)
lib/              Supabase client, Zod validation schemas
constants/        theme.ts (colors), layoutConfig.ts, itemCondition.ts, pokemonTcgSets.ts
hooks/            useAuthStore (Zustand), useThemeStore, useAnimations, useHaptics
supabase/migrations/  DB migrations (apply in order)
```

### Data flow pattern

All data access goes through `api/*`:
1. Define helpers and TanStack Query hooks in `api/<domain>/index.ts`.
2. Export hooks (`useXxx`) from that file; components import hooks, not Supabase directly.
3. After mutations, call `queryClient.invalidateQueries({ queryKey: [...] })` to refresh.

### Item creation paths

Items can be created four ways:
- **Barcode scan** → `BarcodeScannerModal` → `useCreateItemWithProductLookup` (in `api/items`)
- **Manual wizard** → `ManualCreateItemWizard` → same mutation
- **Pokémon TCG card** → `TcgCreateScreen` (scan queue) → `useCreatePokemonCardBatch` RPC
- **Magic: The Gathering card** → `MagicCreateScreen` (camera scan via ML Kit OCR + Scryfall fuzzy lookup, or name search) → `useCreateMagicCardBatch` RPC

An item is "verified" (`is_verified = true`) when it has a `product_ean` (barcode path), `pokemon_tcg_card_id`, or `magic_card_id` (TCG paths).

### Pokémon TCG pipeline

OCR scanning lives in `api/pokemon/` and has several layers:

| File | Role |
|---|---|
| `index.ts` | API client, Zod schema for `PokemonTcgCard`, cache-first search, batch RPC mutation |
| `recognition.ts` | Image crop/zone extraction, ML Kit OCR, text parsing, card scoring |
| `ocrPostprocessing.ts` | String normalization, Levenshtein distance, digit ambiguity fixes |
| `search.ts` | Manual/fallback card search (Pokémon TCG API + TCGTracking) |
| `tcgTracking.ts` | TCGTracking API wrapper (`openapi.tcgtracking.com/v1`) |
| `cardScanDebug.ts` | Structured `[CardScan]` log helpers |

**Recognition flow:** `identifyPokemonCardImage` → crop image → ML Kit OCR → `parsePokemonCardText` → `searchCardsByIdentifiers` → score candidates via `scoreCardMatch` → return top matches.

Cache is Supabase table `pokemon_tcg_cards`. Cards are upserted after every API hit. Cache searches use the `search_pokemon_tcg_cards` RPC (full-text). The `bypassCache` flag forces a live API call (used for fuzzy fallbacks).

ML Kit (`@infinitered/react-native-mlkit-text-recognition`) is a native module — **OCR does not work in Expo Go**. Use a development build on device for scanner testing.

### Supabase schema (key tables)

- `items` — user-owned collectibles; links to `products` via `product_ean`, `pokemon_tcg_cards` via `pokemon_tcg_card_id`, or `magic_cards` via `magic_card_id`
- `products` — shared product catalog (barcode path); `ean` is the PK
- `pokemon_tcg_cards` — Pokémon card cache; `id` is the TCG provider ID (e.g. `xy1-1`)
- `pokemon_tcg_set_rosters` — complete-set cache manifest; set completion reads this plus `pokemon_tcg_cards` before calling the external API
- `magic_cards` — Magic card cache (Scryfall); `id` is the Scryfall UUID
- `price_history` — daily per-card market price snapshots, written by SECURITY DEFINER triggers on both card caches
- `scan_usage` / `search_usage` — free-tier daily quota counters, written only via SECURITY DEFINER RPCs
- `showcase_items` — join table linking items to showcases
- `billing_customers` / `subscriptions` — Stripe membership state, written only by the `stripe-webhook` Edge Function (see `docs/stripe-memberships.md`)
- `get_public_profiles(uuid[])` RPC — column-limited profile lookup for social surfaces (feed/comments); use it instead of selecting from `profile` for other users
- Migrations in `supabase/migrations/` must be applied in timestamp order

### Memberships (Stripe)

Checkout runs in the browser via the `stripe-checkout` Edge Function; subscription state syncs back through `stripe-webhook` into `public.subscriptions`. Collector is the free tier. Founding Curator is an Early Access-only paid plan with a permanent founding rate and 10MB uploads; monthly and annual Curator plans receive 100MB uploads. All tiers can create shareable public showcase links. Client hooks live in `api/memberships` (`useMembership`, `useStartCheckout`, `useOpenBillingPortal`); gate features with `isPaidUser`, `getHasActiveMembership()` (plain async), or the `has_active_membership()` SQL helper. Full setup in `docs/stripe-memberships.md`.

**Store builds use native IAP, not web checkout.** Apple/Google require in-app digital purchases to go through StoreKit / Play Billing, so store builds sell the membership via **RevenueCat** (`api/memberships/nativeBilling.ts` + the `revenuecat-webhook` Edge Function), which writes into the same `public.subscriptions` table with `provider = 'revenuecat'`. Use `getActiveBillingProvider()`, `usePurchaseMembership()`, `useManageMembership()`, and `useRestorePurchases()` — they route to native IAP on store builds and Stripe on web automatically. RevenueCat is a native module (no Expo Go; needs a dev build). Full setup in `docs/iap-memberships.md`.

### Routing

Expo Router file-based: `app/(auth)` for unauthenticated screens, `app/(tabs)` for main tabs, `app/(admin)` for admin. Auth gating via `<Redirect>` in `app/index.tsx`. New screens go in the correct segment with a `_layout.tsx` if needed.

### Theming

All colors come from `constants/theme.ts` via the `useColors()` hook (`ThemeColors`). Never hardcode color values except white/black where the existing code already does so. Layout constants (tab bar height, etc.) are in `constants/layoutConfig.ts`.

## Testing

Jest + ts-jest, `testEnvironment: "node"`. Tests live beside their subjects (`lib/*.test.ts`, `api/pokemon/*.test.ts`). Use `@/` alias imports in tests. Assert both success and failure paths for Zod schemas.

## Pokémon TCG scanner debugging

Scanner logs emit with the `[CardScan]` prefix and cover: image crop dimensions, raw OCR text, parsed identifiers (name candidates, number, set code, printed total), catalog search attempts with source (`cache`/`api`), match scores, manual selections, and batch-save status. Set `EXPO_PUBLIC_CARD_SCAN_DEBUG=false` to silence them.

## General item creation & discovery debugging

`lib/actionDebug.ts` exports `createActionLogger(tag)`, used to build namespaced structured loggers (`[Barcode]`, `[Search]`, `[CreateItem]`, `[MagicTCG]`, `[MagicScan]`) across the non-Pokémon item flows — barcode scan detection/quota checks, product/UPC search requests, manual + barcode item creation lifecycle, and Magic: The Gathering search/queue/batch-save. All share one toggle: set `EXPO_PUBLIC_ACTION_DEBUG=false` to silence them. Pokémon scanning keeps its own `[CardScan]` logger (see above) rather than using this one.
