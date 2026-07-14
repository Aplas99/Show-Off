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
| `EXPO_PUBLIC_POKE_KEY` | Pokémon TCG API key (bundled; move to Edge Function before production) |
| `EXPO_PUBLIC_BARCODE_LOOKUP_API_KEY` | Barcode Lookup product search API |
| `EXPO_PUBLIC_CARD_SCAN_DEBUG` | Set to `false` to silence `[CardScan]` OCR logs |
| `EXPO_PUBLIC_OCR_FALLBACK_URL` | Optional PaddleOCR fallback service URL (`server/paddleocr`); unset disables the server second pass |
| `EXPO_PUBLIC_OCR_FALLBACK_TOKEN` | Bearer token for the OCR fallback service (`OCR_SERVICE_TOKEN`) |
| `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key (reserved for future native SDK use) |

Stripe server secrets (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID_MONTHLY`, `STRIPE_PRICE_ID_ANNUAL`) live in Supabase Edge Function secrets, not app env — see `docs/stripe-memberships.md`.

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
  showcase/       Showcase CRUD
  social/         Feed, interactions (likes, bookmarks, comments)
  auth/           Auth hooks
  memberships/    Stripe membership state + checkout/portal hooks
  storage/        Image upload to Supabase Storage (upload limit gated on membership)
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

Items can be created three ways:
- **Barcode scan** → `BarcodeScannerModal` → `useCreateItemWithProductLookup` (in `api/items`)
- **Manual wizard** → `ManualCreateItemWizard` → same mutation
- **Pokémon TCG card** → `TcgCreateScreen` (scan queue) → `useCreatePokemonCardBatch` RPC

An item is "verified" (`is_verified = true`) when it has a `product_ean` (barcode path) or `pokemon_tcg_card_id` (TCG path).

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

- `items` — user-owned collectibles; links to `products` via `product_ean` or `pokemon_tcg_cards` via `pokemon_tcg_card_id`
- `products` — shared product catalog (barcode path); `ean` is the PK
- `pokemon_tcg_cards` — TCG card cache; `id` is the TCG provider ID (e.g. `xy1-1`)
- `showcase_items` — join table linking items to showcases
- `billing_customers` / `subscriptions` — Stripe membership state, written only by the `stripe-webhook` Edge Function (see `docs/stripe-memberships.md`)
- Migrations in `supabase/migrations/` must be applied in timestamp order

### Memberships (Stripe)

Checkout runs in the browser via the `stripe-checkout` Edge Function; subscription state syncs back through `stripe-webhook` into `public.subscriptions`. Client hooks live in `api/memberships` (`useMembership`, `useStartCheckout`, `useOpenBillingPortal`); gate features with `isPaidUser`, `getHasActiveMembership()` (plain async), or the `has_active_membership()` SQL helper. Full setup in `docs/stripe-memberships.md`.

### Routing

Expo Router file-based: `app/(auth)` for unauthenticated screens, `app/(tabs)` for main tabs, `app/(admin)` for admin. Auth gating via `<Redirect>` in `app/index.tsx`. New screens go in the correct segment with a `_layout.tsx` if needed.

### Theming

All colors come from `constants/theme.ts` via the `useColors()` hook (`ThemeColors`). Never hardcode color values except white/black where the existing code already does so. Layout constants (tab bar height, etc.) are in `constants/layoutConfig.ts`.

## Testing

Jest + ts-jest, `testEnvironment: "node"`. Tests live beside their subjects (`lib/*.test.ts`, `api/pokemon/*.test.ts`). Use `@/` alias imports in tests. Assert both success and failure paths for Zod schemas.

## Pokémon TCG scanner debugging

Scanner logs emit with the `[CardScan]` prefix and cover: image crop dimensions, raw OCR text, parsed identifiers (name candidates, number, set code, printed total), catalog search attempts with source (`cache`/`api`), match scores, manual selections, and batch-save status. Set `EXPO_PUBLIC_CARD_SCAN_DEBUG=false` to silence them.
