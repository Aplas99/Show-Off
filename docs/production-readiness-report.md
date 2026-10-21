# Production Readiness Report — Show-Off

_Branch: `feature/final-design-pass` · Date: 2026-10-21_

This pass reviewed the item detail / image pipeline in depth (the reported bug),
then swept app config, item creation, social surfaces, Supabase migrations/RLS,
and Edge Functions for launch blockers and inconsistencies.

**Verification after fixes:** `tsc --noEmit` clean · `npm run lint` 0 errors
(11 pre-existing warnings) · `npm test` 35 suites / 350 tests passing.
Camera capture and image display were **not** tested on a device. They need a
dev build (`expo-image-picker` camera config changed in `app.json`, so a new
native build is required).

---

## 1. Fixed in this pass

### 1.1 Item detail images missing for catalog / API items (reported bug) — **Fixed**
**Cause:** `ItemDetailModal` built its gallery only from `items.image_url` /
`items.image_urls`. Items created from a barcode/product lookup without a
user photo store their image in `products.data.images`. Every other surface
(grid, bookcase, carousel, feed) already fell back to that, but the detail
modal didn't, so it showed an empty frame.

**Second cause:** Legacy catalog rows (UPCItemDB / Barcode Lookup) often
store `http://` image URLs. iOS ATS and Android's cleartext policy block
those in release builds, so the images failed silently on every surface.

**Fix:**
- New `lib/itemImages.ts`: `getItemImageUrls()` / `getItemCoverUrl()` return
  a cover-first, de-duplicated list. They fall back to catalog images,
  upgrade `http://` and `//` URLs to `https://`, drop non-string or unsafe
  values, and parse legacy string JSON. Tests are in `lib/itemImages.test.ts`.
- These helpers are used in `ItemDetailModal`, `ShowcaseListItem`,
  `ShowcaseCarousel`, `BookcaseView` (3 cards), `BookItem`, and
  `SocialFeedCard`.

### 1.2 Detail modal showed stale data after adding photos — **Fixed**
`app/(tabs)/showcase/[id].tsx` kept a snapshot of the tapped item in state.
After "Add photos" (or a condition change), the query refetched but the modal
still showed the old object, so new photos only appeared after closing and
reopening it. The modal now reads the live item from the showcase query by id.

### 1.3 "Add photos" could not take a picture — **Fixed**
- New `lib/imagePicker.ts` → `pickImages()`. It shows a **Take Photo /
  Choose from Library / Cancel** sheet on native, requests the right
  permission with a helpful message on denial, and handles picker errors. Web
  goes straight to the file picker, and mobile browsers already offer the
  camera there.
- Used by the item detail "Add photos" button (icon is now a camera) and by
  the photo step in both `CreateItemWizard` and `ManualCreateItemWizard`.
- `app.json`: added `cameraPermission` to the `expo-image-picker` plugin
  (unified with the `expo-camera` string) and `microphonePermission: false`
  so iOS doesn't request a microphone permission it doesn't need.
- When a user adds photos to an item that only had a catalog image, the
  catalog image stays as the cover instead of being replaced.

### 1.4 Create wizards blocked Curator uploads over 5 MB — **Fixed**
Both wizards hard-rejected images over 5 MB, but tier limits are 5 / 10 /
100 MB and are already enforced in `uploadImageToSupabase`. Removed the
duplicate client check so the upload layer is the single source of truth.

### 1.5 Duplicate items when the showcase link failed — **Fixed**
In both wizards, if the item was created but `linkToShowcases` then failed,
the user saw "Failed to create item". Retrying created a duplicate. The error
now says *"Item saved… couldn't be added to the selected showcase"* when the
item already exists. Raw `alert()` calls were also replaced with the app's
`showMessage()`.

### 1.6 Corrupted text in the UI — **Fixed**
`CreateItemWizard.tsx` ("Looking up barcode…") and `app/(admin)/index.tsx`
(report row separators) contained Windows-1252 bytes, which are invalid
UTF-8 and rendered as `�`. Converted them to `…` and `—`. All other tracked
source files are valid UTF-8.

### 1.7 `showcase_members` table had no RLS — **Fixed (migration must be applied)**
The table was captured in the baseline migration without `ENABLE ROW LEVEL
SECURITY`. Supabase's default grants therefore exposed it to `anon` and
`authenticated` through PostgREST, for both reads and writes. The client never
uses it. Added `supabase/migrations/20261022110000_showcase_members_rls.sql`,
which enables RLS and limits access to `service_role`.
**Action:** apply this migration, together with the untracked
`20261022100000_item_categories.sql`, before release.

### 1.8 Misc cleanup
- Removed the `console.log` of the current user ID in `api/profile`.
- Removed the dead `reset-project` npm script, whose target file doesn't exist.

---

## 2. Launch blockers — still open (need your input or credentials)

| # | Issue | Where | What to do |
|---|---|---|---|
| B1 | ~~AdMob app IDs are Google's test IDs~~ **Fixed:** test IDs removed. Ads are off by default and the AdMob native SDK is excluded from autolinking, so it isn't in the binary. `api/ads/sdk.ts` loads the JS package only when the flag is on *and* the native module exists, so the ad code stays without crashing. To enable, see `.env.example`. | `app.json`, `app.config.ts`, `package.json`, `api/ads/*` | When approved, follow the 3 steps in `.env.example`. |
| B2 | **Share links fall back to `showoff:///s/<id>`** on native when `EXPO_PUBLIC_SITE_URL` is unset. Recipients without the app get a dead link. | `app/(tabs)/showcase/[id].tsx:134`, `ShowcaseSettingsModal.tsx:22` | Set `EXPO_PUBLIC_SITE_URL` in the production EAS environment, and set up universal links / app links for that domain. |
| B3 | ~~Display name is `show-off`~~ **Fixed:** `expo.name` is now `"Show Off"`; `slug` stays `show-off`. | `app.json`, `app.config.ts` | Shows up on the next native build. |
| B4 | ~~Bundle identifiers differ~~ **Fixed:** Android is now `com.onistudios.showoff`, matching iOS. | `app.json` | Regenerate `android/` (`npx expo prebuild --clean -p android`). Register the new package in Play Console, RevenueCat, and any Google OAuth client. Uninstall the old `com.zed99.showoff` build from test devices. |
| B5 | **Unapplied migrations / untracked files.** `item_categories` migration, `ItemCategoryPicker`, `lib/itemCategory*` are untracked, and the working tree has ~35 modified files. | git | Commit, apply migrations in order, and redeploy `catalog-proxy`. |
| B6 | **No device verification of native-only flows** after this pass: camera capture, ML Kit OCR, RevenueCat purchase/restore. | — | Run a `productionTest` EAS build and smoke test on a physical iOS and Android device. |

---

## 3. High priority (fix before or right after launch)

**H1. Protected images are never cached — Fixed (follow-up).** `ProtectedImage`
now uses `cachePolicy="memory"` with a viewer-scoped `cacheKey`
(`<userId|anon>:<authenticated URL>`, never the token; see
`lib/protectedMedia.ts`). Nothing private is written to disk, the
`no-store` request header is unchanged, and `AuthInitializer` clears the
image memory cache whenever the signed-in user changes. Original finding:
`ProtectedImage` forced
`cachePolicy="none"` and sends `Cache-Control: no-store` for every
`item-images` / `post-media` URL. `CyclingImage` cross-fades galleries every
3.5 s, so each cycle re-downloads full-size photos through the authenticated
storage endpoint, which runs `can_read_upload()` (several unindexed joins) on
every request. Expect blank flashes on slow networks, high bandwidth use, and
DB load as the app grows. Suggestion: allow `cachePolicy="memory"` with a
user-scoped `recyclingKey`. This keeps revoked access short-lived without
refetching on every render.

**H2 — Fixed (follow-up).** Free users can now add one photo of their own
to an item ("Add photo"). It replaces the catalog image as the cover, and
adding more photos still opens the Curator paywall. "Own photo" means a file
in the `item-images` bucket (`hasUploadedItemPhoto`), because barcode items
copy the catalog image into `image_url`. The gallery limit was client-only
before. It's now enforced in the database by
`20261022120000_enforce_item_gallery_tier.sql`: more than one photo needs
Curator, and shrinking a gallery is always allowed. Original finding:
Free users couldn't add even one photo to an existing item. "Add photos"
on the detail screen always opens the Curator paywall for free users, even
when the item has no photo. A free user who skipped the photo at creation
can't add one later. Decide whether a single cover photo should be free and
only the multi-photo gallery should require Curator.

**H3 — Fixed (follow-up).** `AuthInitializer` re-checks membership when
the app returns to the foreground, at most every 5 minutes. Original finding:
Membership was cached for the whole session (`staleTime: Infinity`,
no refetch). If a subscription expires or is refunded mid-session, the client
keeps showing paid UI until restart. Server-side checks still apply, so this
is UX, not security. Consider refetching on app foreground.

**H4 — Fixed in config, still off.** When ads are enabled, `app.config.ts`
adds the AdMob plugin with Google's 50 SKAdNetwork IDs (from the AdMob iOS
quick-start, 2026-10-20) and `delayAppMeasurementInit`. The Android AD_ID
permission stays blocked. ATT isn't requested because ads are
non-personalized, so no tracking prompt string is set. **Still yours:** the
App Store privacy label and the Play Data safety form must declare the AdMob
SDK once ads ship. Original finding: Ads/ATT on iOS. Ads request non-personalized only, which is good, and
UMP consent is wired. Before enabling `EXPO_PUBLIC_ADS_ENABLED`, add
`skAdNetworkItems` to the AdMob plugin config and confirm App Store privacy
labels match the SDK's data collection.

**H5. No production crash reporting.** There is an Expo Router
`ErrorBoundary`, but nothing reports crashes. Add Sentry (`@sentry/react-native`
with the Expo plugin) or similar before launch.

---

## 4. Medium / consistency

- **CLAUDE.md is out of date.** `EXPO_PUBLIC_ADS_ENABLED` and
  `EXPO_PUBLIC_SITE_URL` aren't in its env table, and `.env.example` says
  Stripe web purchases are "deferred for launch" while CLAUDE.md presents
  Stripe as active.
- **Two ad-hoc `console.log`s remain** outside the debug loggers:
  `api/pokemon/index.ts:364,385` (roster cache hit/miss) and
  `src/features/create/CreateScreen.tsx:117`. Route them through the
  `[CardScan]` / `actionDebug` loggers so production builds stay quiet.
- **Image resolution is still duplicated** in `app/s/[id].tsx` (public page
  uses `card_image_*` fields) and `PokemonCardGridView` (prefers the card
  render over user photos on purpose). These don't upgrade `http://`.
  Low risk, since card images are https, but `getItemCoverUrl` could replace
  the first.
- **RevenueCat webhook auth** compares the header with `!==`. Prefer a
  constant-time compare. Low risk, but it's a one-line change.
- **Dead code:** `toggleShowcase` in `ManualCreateItemWizard.tsx:218` is
  unused (step 3 uses an inline toggle).
- **Lint warnings (11):** mostly `exhaustive-deps` on animation refs, which
  are harmless, plus unused fixtures in `recognition.test.ts` and two
  `require()` imports in Zustand stores. Clean these up so new warnings stand
  out.

---

## 5. Reviewed and looks good

- Stripe webhook verifies signatures (`constructEventAsync`). The RevenueCat
  webhook requires a shared auth header. Only the two webhooks have
  `verify_jwt = false`.
- All catalog/OCR vendor secrets live in Edge Function secrets. Nothing
  sensitive is in `EXPO_PUBLIC_*`, and `.env` is gitignored.
- Content-safety tables (`moderators`, `user_blocks`, `content_reports`, …)
  have RLS enabled and are service-role only.
- Storage: `item-images` / `post-media` reads go through `can_read_upload()`,
  which respects showcase visibility and 18+ ratings. Uploads are scoped to
  the user's own folder.
- Upload size limits are tier-aware and enforced in one place
  (`api/storage`).
- An app-level `ErrorBoundary` exists in `app/_layout.tsx`.

---

## 6. Files changed in this pass

```
lib/itemImages.ts                      (new)  image URL resolver
lib/itemImages.test.ts                 (new)  7 tests
lib/imagePicker.ts                     (new)  camera/library picker
supabase/migrations/20261022110000_showcase_members_rls.sql (new)
src/features/showcase/ItemDetailModal.tsx
app/(tabs)/showcase/[id].tsx
src/components/items/CreateItemWizard.tsx
src/components/items/ManualCreateItemWizard.tsx
src/features/showcase/ShowcaseListItem.tsx
src/features/showcase/ShowcaseCarousel.tsx
src/features/showcase/BookcaseView.tsx
src/features/showcase/bookcase/BookItem.tsx
src/components/social/SocialFeedCard.tsx
app/(admin)/index.tsx
api/profile/index.ts
app.json
package.json
```
