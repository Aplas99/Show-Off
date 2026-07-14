# Production readiness audit — 2026-07-13

Snapshot of shortcomings, incomplete features, and bugs found while reviewing
the codebase on `feature/production-ready`. Baseline health: `tsc --noEmit`
clean, ESLint clean, 86/86 Jest tests passing.

Legend: 🔴 blocker before launch · 🟠 should fix soon · 🟡 nice to have

## Status update (later on 2026-07-13)

Fixed on this branch: 1 (password reset flow), 2 (fake Google buttons
removed — real OAuth still TODO), 5 (confirm-email state), 6 partial
(image-picker plugin, eas.json; store metadata/privacy policy still TODO),
7 partial (error boundary; crash reporting still TODO), 8, 9, 10, 11, 12
partial (item + account deletion; item/showcase editing still TODO), 13
partial (uploads scoped + sized; orphan cleanup on item delete still TODO),
17, 19 partial (query defaults + sign-out cache clear), 18 partial
(session logging removed), 16 partial (marketplace tab hidden), 23 (CI).

Still open: 3 (API keys in bundle → Edge Function proxy), 4 (TCG cache
RLS lockdown — depends on 3), 14 (feed scalability/personalization), 15
(verify social RLS policies), 20 (auth screen theming), 21, 22 (a11y
sweep beyond auth screens), OAuth providers (Google/Apple), and the
membership IAP-policy decision.

## 🔴 Blockers

1. **Password reset is a dead button.** `app/(auth)/signin.tsx` — "Forgot
   Password?" has `onPress={() => {}}`. There is no
   `resetPasswordForEmail` flow, no reset screen, and no deep-link handling
   for the recovery URL. Users who forget a password are locked out.

2. **Google sign-in silently fakes success.** `app/(auth)/signup.tsx`
   `handleGoogleSignIn` is `// TODO` + `router.push("/")`; the sign-in
   screen's Google button has no handler at all. Either implement
   `signInWithOAuth` (Google plus **Sign in with Apple, required by App
   Store review when any third-party login is offered**) or remove the
   buttons.

3. **Secrets bundled in the client.** `EXPO_PUBLIC_POKE_KEY` and
   `EXPO_PUBLIC_BARCODE_LOOKUP_API_KEY` ship in the JS bundle and are
   extractable from any release build (CLAUDE.md already flags the Pokémon
   key). Proxy both through Edge Functions before production.

4. **Open client writes to the shared TCG cache.** The
   `pokemon_tcg_cards` RLS policies allow any authenticated user to
   INSERT/UPDATE arbitrary rows (the migration itself says to move writes
   to a service-role Edge Function first). A malicious user can poison the
   catalog every other user sees.

5. **No email-confirmation handling in signup.** `signup.tsx` calls
   `router.push("/")` right after `signUp`. With Supabase
   `enable_confirmations = true` in production there is no session yet —
   the user is bounced back to sign-in with no explanation, and there is no
   "check your email" state or resend option.

6. **App/store metadata absent.** No `eas.json`, no bundle versioning
   strategy (`version: 1.0.0`, no `runtimeVersion`/`buildNumber`/
   `versionCode`), no privacy-policy URL, and `expo-image-picker` is in
   dependencies but its config plugin (photo-library permission strings) is
   not in `app.json` — App Store review will reject missing
   `NSPhotoLibraryUsageDescription`.

## 🟠 High priority

7. **No error boundary / crash reporting.** `app/_layout.tsx` has no
   ErrorBoundary export and there is no Sentry (or similar) integration —
   any render error white-screens the app with zero telemetry.

8. **Auth session storage will break for large tokens.**
   `lib/supabase.ts` stores the whole Supabase session in
   `expo-secure-store`, which warns above 2048 bytes and may fail; sessions
   with long JWTs regularly exceed this. Recommended pattern: AsyncStorage
   for the session + SecureStore only if you encrypt, or chunked storage.
   Also `supabaseUrl!`/`supabaseAnonKey!` crash cryptically when env is
   missing — validate at startup with a clear error.

9. **Token auto-refresh not tied to AppState.** Supabase RN docs call for
   `AppState`-driven `startAutoRefresh()/stopAutoRefresh()`; without it,
   long-backgrounded apps come back with expired sessions until the next
   full launch.

10. **Sign-in/up buttons have no pending state.** `signin.tsx` tracks
    `loading` but never disables the button or shows a spinner; `signup.tsx`
    ignores `isPending`. Double-taps fire duplicate auth calls.

11. **`(admin)` route group is unprotected.** `app/(admin)/index.tsx` is a
    stub with no role gating; `AuthInitializer` only referees `(auth)` vs
    everything else. Add an `is_admin` check in an `(admin)/_layout.tsx` or
    delete the group until it's real.

12. **No item edit/delete or account deletion.** There is no mutation to
    delete an item, showcase (beyond create), comment, or the account
    itself. Apple requires in-app account deletion for apps with accounts.

13. **Storage uploads are unscoped and orphaned.** `api/storage/index.ts`
    writes to `public/<timestamp>-<rand>.<ext>` — not keyed by user id, so
    RLS-per-owner on the bucket is impossible, and nothing deletes images
    when items are removed. Uploads also ignore actual file size when the
    caller doesn't pass one (`fileSize: undefined` in `api/items`).

14. **Feed scalability.** `useGetFeed` fetches all public items globally
    (no follow-graph filter despite a "personalized feed" label) and does a
    second round-trip for profiles instead of a foreign-key join or view.
    Fine for beta, but it needs an index-backed query and a real
    follow-based feed before scale.

15. **`useIsItemLiked`/`useIsItemBookmarked` swallow errors** (return
    `false` on any error) and `useGetItemCommentCount` masks an RLS
    misconfiguration by returning 0 with only a console warning — verify
    the `comments`/`likes`/`bookmarks` SELECT policies actually exist.

## 🟡 Medium / cleanup

16. **Incomplete surfaces shipped in tabs:** Marketplace tab renders
    "Coming Soon"; hide the tab until it exists. Item `for_sale`/`price`
    data exists but nothing consumes it.
17. **Branding mismatch:** auth screens say "AuctionAlley" while the app is
    "show-off" — pick one before store listing.
18. **Console noise:** ~30 `console.log/warn/error` calls in `api/` and
    `src/` (including `AuthInitializer` logging session objects). Route
    through a debug-gated logger like `cardScanDebug` does, and never log
    session tokens.
19. **QueryClient defaults untouched** (`app/providers/QueryProvider.tsx`):
    no global `retry`, `staleTime`, or offline/persist config;
    `queryClient.clear()` on sign-out is in `useSignOut` but ProfileScreen
    signs out via raw `supabase.auth.signOut()`, bypassing it — cached data
    from the previous user survives into the next session.
20. **Hardcoded colors on auth screens** (`#9333EA` etc.) violate the
    project's own theming rule; dark/light theme doesn't apply there.
21. **`stillPhotoRecognitionExperiment.ts`** looks like experiment code
    shipping in the production bundle — confirm it's tree-shaken or move it
    out of `api/`.
22. **Accessibility:** custom tab bar has labels, but auth inputs/buttons
    lack `accessibilityLabel`s; no dynamic-type audit has been done.
23. **No CI.** Tests/lint/typecheck exist but nothing runs them on push —
    add a GitHub Actions workflow.

## Suggested order of attack

1. Auth completeness (password reset, confirm-email state, real OAuth or
   remove buttons, pending states) — items 1, 2, 5, 10.
2. Platform hygiene (error boundary + Sentry, env validation, session
   storage, AppState refresh) — items 7, 8, 9.
3. Data security (Edge-Function proxies for external APIs, TCG cache RLS,
   storage scoping, admin gating) — items 3, 4, 11, 13.
4. Store readiness (eas.json, permissions plugins, account deletion,
   branding, IAP-policy decision for memberships) — items 6, 12, 17.
