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
| `EXPO_PUBLIC_DISCOVER_MOCK_POSTS` | Set to `false` to hide the client-side sample posts (`api/social/mockPosts.ts`) mixed into the Discover feed |
| `EXPO_PUBLIC_ACTION_DEBUG` | Set to `false` to silence `lib/actionDebug.ts` logs (barcode scanning, product/API search, manual item creation, Magic: The Gathering search) |
| `EXPO_PUBLIC_MEMBERSHIP_DEBUG` | Set to `false` to silence development-only `[Membership]` checkout diagnostics; logs never include tokens, checkout URLs, or payment details |
| `CATALOG_PROXY_DEBUG` | Supabase Edge Function secret: set to `false` to keep only warnings/errors in `catalog-proxy` logs (step-by-step `[catalog-proxy]` logs are on by default) |
| `OCR_SERVICE_URL` | Supabase Edge Function secret: HTTPS Railway PaddleOCR base URL (`server/paddleocr`) |
| `OCR_SERVICE_TOKEN` | Secret on Supabase Edge Functions and Railway; never put in app env |
| `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key (reserved for future native SDK use) |
| `EXPO_PUBLIC_REVENUECAT_IOS_KEY` / `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` | RevenueCat public SDK keys for native IAP memberships (store builds). Unset disables native billing and falls back to Stripe web checkout — see `docs/iap-memberships.md` |
| `EXPO_PUBLIC_IAP_PRODUCT_FOUNDING_CURATOR` / `EXPO_PUBLIC_IAP_PRODUCT_CURATOR_MONTHLY` / `EXPO_PUBLIC_IAP_PRODUCT_CURATOR_ANNUAL` | Optional overrides for the App Store / Play product ids per plan (defaults in `PLAN_STORE_PRODUCT_IDS`) |
| `EXPO_PUBLIC_ADMOB_BANNER_UNIT_ID` | AdMob banner ad unit id; unset falls back to Google's test unit |
| `EXPO_PUBLIC_ADMOB_REWARDED_UNIT_ID` | AdMob rewarded ad unit id (grants bonus scans); unset falls back to Google's test unit |

Stripe server secrets (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID_FOUNDING_CURATOR`, `STRIPE_PRICE_ID_CURATOR_MONTHLY`, `STRIPE_PRICE_ID_CURATOR_ANNUAL`) live in Supabase Edge Function secrets, not app env — see `docs/stripe-memberships.md`.

Catalog secrets (`POKEMON_TCG_API_KEY`, `BARCODE_LOOKUP_API_KEY`, `BARCODENEST_KEY`, `POKEWALLET_API_KEY`) also live only
in Edge Function secrets. Barcode-code lookups (scan/typed code in the barcode
wizard) go cache-first, then BarcodeNest; text product search still uses
UPCItemDB + Barcode Lookup. Deploy `catalog-proxy` and all catalog migrations
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
  riftbound/      Riftbound TCG via Riftcodex (cache-first name search, printed-code lookup, set listing, batch save)
  tcg/            Shared pipeline for every other card game (constants/tcgGames.ts) via PokéWallet: cache-first search, batch save
  prices/         Per-card market price history for every game (Curator graph): TCGTracking prices via catalog-proxy, one cached snapshot per card per day
  scanning/       Free-tier daily quotas: card/barcode scans (10/day) and searches (15/day)
  showcase/       Showcase CRUD
  social/         Feed, interactions (likes, bookmarks, comments)
  auth/           Auth hooks
  memberships/    Stripe membership state + checkout/portal hooks
  storage/        Image upload to Supabase Storage (5MB free / 10MB Founding Curator / 100MB Curator)
lib/              Supabase client, Zod validation schemas
constants/        theme.ts (colors), layoutConfig.ts, itemCondition.ts, pokemonTcgSets.ts, riftboundSets.ts (set names, printed totals; scanner set-code correction)
hooks/            useAuthStore (Zustand), useThemeStore, useAnimations, useHaptics
supabase/migrations/  DB migrations (apply in order)
```

### Data flow pattern

All data access goes through `api/*`:
1. Define helpers and TanStack Query hooks in `api/<domain>/index.ts`.
2. Export hooks (`useXxx`) from that file; components import hooks, not Supabase directly.
3. After mutations, call `queryClient.invalidateQueries({ queryKey: [...] })` to refresh.

### Item creation paths

Items can be created seven ways (the last is the Curator-only CSV import below):
- **Barcode scan** → `BarcodeScannerModal` → `useCreateItemWithProductLookup` (in `api/items`)
- **Manual wizard** → `ManualCreateItemWizard` → same mutation
- **Pokémon TCG card** → `TcgCreateScreen` (scan queue) → `useCreatePokemonCardBatch` RPC
- **Magic: The Gathering card** → `MagicCreateScreen` (camera scan via ML Kit OCR + Scryfall fuzzy lookup, or name search) → `useCreateMagicCardBatch` RPC
- **Riftbound card** → `RiftboundCreateScreen` (camera scan via ML Kit OCR of the lower card: footer code like `OGN • 011/298` first, name banner as fallback — `api/riftbound/scan.ts`; name/code search as backup; no prices) → `useCreateRiftboundCardBatch` → `create_riftbound_card_batch` RPC

- **Other card games** (Yu-Gi-Oh!, One Piece, Lorcana, Flesh and Blood, Digimon, Star Wars: Unlimited, Dragon Ball Super, Vanguard, Cyberpunk) → `TcgGameCreateScreen` (camera scan via ML Kit OCR of the whole card: the game's printed code like `OP01-003` / `LOB-EN005` first, name lines as fallback — `api/tcg/scan.ts`; name/number search as backup) → `useCreateTcgCardBatch` (`api/tcg`) → `create_tcg_card_batch` RPC. One shared table and item column serve all of them; add a game in `constants/tcgGames.ts` plus the `tcg_cards.game` CHECK constraint.

The Create screen's TCG tab is one game dropdown (`src/features/create/TcgGamePicker.tsx`, brand colors in `GAME_BRAND_COLORS` in `constants/theme.ts`) that routes to the chosen game's create screen. All TCG create screens are scanner-first: after picking a showcase they open the camera, and manual search is the backup path.
- **CSV import** (Curator) → Settings › Collection Data → `useImportItemsCsv` (`api/items/csv.ts`) → `import_items_csv` RPC, which rejects callers without `has_active_membership()`. Parsing/validation is pure in `lib/itemCsv.ts`; file pickers in `lib/csvFile.ts`. Barcodes/card ids link only if they already exist in the catalog caches, otherwise the row is saved as a manual item. `useExportItemsCsv` writes the same columns, so an export re-imports as-is.

An item is "verified" (`is_verified = true`) when it has a `product_ean` (barcode path), `pokemon_tcg_card_id`, `magic_card_id`, `riftbound_card_id`, or `tcg_card_id` (TCG paths). Use `lib/itemCards.ts` (`getItemGame`, `getItemCardId`, `isCardItem`) rather than checking each card column.

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

- `items` — user-owned collectibles; links to `products` via `product_ean`, `pokemon_tcg_cards` via `pokemon_tcg_card_id`, `magic_cards` via `magic_card_id`, `riftbound_cards` via `riftbound_card_id`, or `tcg_cards` via `tcg_card_id`. `category` is the top-level bucket (`tcg`, `books`, `video_games`, `board_games`, `figures`, `music`, `movies`, `general`; see `constants/itemCategory.ts`); `custom_category` is the free-text type label. The `items_set_category` trigger forces `tcg` for linked cards and infers the category when an insert omits it — keep its patterns in sync with `lib/itemCategory.ts`; read categories via `getItemCategory()`
- `products` — shared product catalog (barcode path); `ean` is the PK
- `pokemon_tcg_cards` — Pokémon card cache; `id` is the TCG provider ID (e.g. `xy1-1`)
- `pokemon_tcg_set_rosters` — complete-set cache manifest; set completion reads this plus `pokemon_tcg_cards` before calling the external API
- `pokemon_tcg_sets` — server-maintained set list (codes, printed totals) the scanner trusts; `catalog-proxy` refreshes it from `/v2/sets` when older than 7 days, and `usePokemonTcgSets()` merges it over the bundled `constants/pokemonTcgSets.ts` snapshot
- `magic_cards` — Magic card cache (Scryfall); `id` is the Scryfall UUID
- `riftbound_cards` — Riftbound card cache (Riftcodex, no API key); `id` is the Riftcodex ObjectId, `riftbound_id` the printed code (e.g. `ogn-011-298`, signatures use `*`). Written only by `catalog-proxy`; searched via the `search_riftbound_cards` RPC
- `tcg_cards` — shared card cache for the PokéWallet games; `id` is the PokéWallet id (game prefix like `ygo_`/`op_` + hex, or bare hex), `game` the code from `constants/tcgGames.ts`, `image_url` a copy in the public `tcg-card-images` bucket. Written only by `catalog-proxy`; searched via the `search_tcg_cards` RPC. PokéWallet's plan limits are shared by all users, so always search this cache first
- `tcg_set_rosters` — complete-set manifest for the PokéWallet games (like `pokemon_tcg_set_rosters`); set completion (`api/sets`, `useSetRoster`) reads `tcg_cards` for a set only when this says it is whole
- `price_history` — daily per-card market price snapshots for every game. `catalog-proxy` (`provider: "price"`) fetches today's TCGplayer price from TCGTracking (free, no key, refreshed daily, no history endpoint) the first time a card's price is viewed each day and stores it; the Pokémon/Magic cache triggers also write rows. `card_tcgplayer_products` (server-only) caches each card's TCGplayer product id
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

`lib/actionDebug.ts` exports `createActionLogger(tag)`, used to build namespaced structured loggers (`[Barcode]`, `[Search]`, `[CreateItem]`, `[MagicTCG]`, `[MagicScan]`, `[Riftbound]`, `[RiftboundScan]`, `[TcgCards]`, `[TcgScan]`, `[Catalog]` (every catalog-proxy call: request summary, status, timing), `[Prices]`, `[CardOcr]`) across the non-Pokémon item flows — barcode scan detection/quota checks, product/UPC search requests, manual + barcode item creation lifecycle, and Magic: The Gathering search/queue/batch-save. All share one toggle: set `EXPO_PUBLIC_ACTION_DEBUG=false` to silence them.

Server side, `catalog-proxy` logs `[catalog-proxy] <event>` lines to the Supabase function logs (Dashboard → Edge Functions → catalog-proxy → Logs): rejected requests (which field failed validation), missing secrets, per-user limits, PokéWallet/TCGTracking upstream status, timing and remaining-quota headers, the vendor's own error text, image copy results and save failures. Keys are never logged (`pk_live_…` / `pk_test_…` text is redacted). Set `CATALOG_PROXY_DEBUG=false` to keep only warnings and errors. Pokémon scanning keeps its own `[CardScan]` logger (see above) rather than using this one.
