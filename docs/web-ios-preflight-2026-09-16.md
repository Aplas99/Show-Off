# Web and iOS preflight — 2026-09-16

## Verified locally

- Web sign-out now uses a browser confirmation, awaits Supabase sign-out, clears the query cache, and returns to sign-in on success. Other web-facing confirmations and error messages use browser dialogs where React Native `Alert` is unsupported.
- The owner item-detail Edit control now opens a form for title, brand, publisher, category, extra details, price, and sale status. It saves through an owner-filtered Supabase mutation. The previously inert share control was removed.
- Main auth, profile, showcase, discover, create, tab bar, and item-detail layouts now constrain content width on desktop. Browser smoke checks covered sign-in, signup, and the privacy page at 1280 x 720. Narrow viewport and authenticated flows still require device/browser testing.
- `npx tsc --noEmit` passed; `npx jest --runInBand` passed 28 suites / 295 tests; `npm run lint` passed with 0 errors / 10 warnings; `npm run build:web` exported 52 static routes and prepared Cloudflare rewrites and headers.
- No `OCR_SERVICE_TOKEN` or obsolete public vendor key name was found in generated web JS/HTML. The client invokes Supabase `ocr-fallback`; that function holds the Railway URL and shared token. Cloudflare serves the frontend and needs only public Expo settings.

## Release checks still needed

- Deploy the new `ocr-fallback` Edge Function with JWT verification and verify a real opted-in Curator scan reaches Railway. Verify Railway and Supabase hold the same token; keep it out of Cloudflare public variables and client bundles.
- Test with a real account on the deployed web host: sign-out, edit/save/refetch, uploads and Storage CORS, auth callback and recovery, public/private showcase routing, reports, blocking, and account deletion. The local smoke test had no authenticated account and did not exercise these mutations.
- Inspect an actual signed iOS archive for bundle ID/build number, SDK/Xcode version, privacy manifests and required-reason API declarations, permission strings, embedded SDKs, and icon/screenshot appearance. No native iOS archive was produced in this Windows workspace.
- Configure and test Apple products and RevenueCat on a TestFlight build: purchase, restore, renew/expire/refund, price disclosures, entitlements, and review account. Local web tests cannot exercise StoreKit.
- Complete App Store Connect metadata, privacy nutrition labels, age rating, support/privacy URLs, screenshots, reviewer credentials and notes, content/asset rights, moderation operations, and the account deletion path. These dashboard and operational requirements cannot be certified by source review.
- Repeat accessibility and narrow-screen testing on Safari/iPhone, including VoiceOver, keyboard focus, large text, and modal behavior. Run the release candidate checks again after all changes are assembled.

The broader release gates remain in `docs/final-push-checklist.md`. This preflight is local evidence, not App Store approval.
