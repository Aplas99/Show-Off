# Final push checklist

Prepared: 2026-09-09

Baseline: `iap-memberships` at `6181a4a`; implementation branch: `codex/final-push`.
Launch scope: ages 13+, United States only, iOS and Android.
Implementation was authorized on 2026-09-09. Production deployment, merging,
and store submission remain separate release steps.

Audience decision: classify the entire public showcase as general or 18+.
Private showcases do not ask for a designation. Creating a public showcase or
switching a private showcase to public requires classification. Under-18 and
age-unverified visitors cannot access an 18+ public showcase's details or media.
An 18+ designation does not permit content otherwise prohibited by store policy.

## Implementation progress - 2026-09-09

Implementation completed locally so far on `codex/final-push`:

| Item | Local result | Still required before closing |
| --- | --- | --- |
| SEC-01 | Pokemon and Barcode Lookup now use an authenticated, validated Edge Function with timeouts, byte limits, and atomic per-user/provider rate caps. | Deploy the migration/function, configure server secrets, and verify real searches/scans/rosters on device. |
| SEC-02 (Magic/products) | Magic, Barcode Lookup, and UPCItemDB provider responses are validated and saved on the server. Migrations revoke client table/column writes to `magic_cards` and `products`. Item creation reads existing products and retains uncached custom details on personal items. | Deploy and verify search/scan/item saving and trial fallback; migrate Pokemon cards, set rosters, and TCGTracking/manual cards before closing SEC-02. |
| SEC-05 | Removed both vendor-key reads from client code and public env examples. | Remove old values from deployment environments, rotate exposed keys, inspect release bundles, and address the optional OCR token. |
| SEC-03 (creation/link ownership) | Removed permissive item/showcase INSERT policies and added restrictive ownership guards. Client calls to privileged default-showcase provisioning are revoked. Links require ownership of both the showcase and item; batch RPCs retain atomic saves under the new policy. Isolated owner/other-user/anonymous/provisioning/link/rollback tests pass. | Deploy and test signup/item/showcase creation and batch saves with real membership triggers; review comment reads, existing links, and the remaining social/storage policies before closing SEC-03. |
| SEC-03 (item comments, 2026-09-15) | Comment reads/inserts/edits now follow parent-item access. Restrictive checks block broad-policy bypasses and forged authors; clients may update only comment content. Private-showcase transitions and author/ownership cases pass isolated PostgreSQL tests. | Deploy and verify comment flows with actual triggers; review post interactions, other social/storage policies, and old links before closing SEC-03. |
| QA-02 | Excluded nested worktrees from Jest/ESLint discovery; all 221 tests and the app TypeScript check pass after the product changes. | Repeat on the final release candidate; 13 pre-existing lint warnings remain. |
| QA-03 | Deno type-check passed. Isolated PostgreSQL assertions passed for role permissions, rate caps, rollover, isolation, retention cleanup, deletion cascade, Magic/product client write denial, service writes, shared admission, and UPC trial caps/cooldowns. | Verify real Supabase deployment/JWT/vendor behavior; load and concurrent-request checks remain. |
| SAFE-07 | Updated requirements to the user-confirmed 13+ minimum and whole-public-showcase rating. | Implement signup age handling, publication classification, and backend/media access controls. |

Local work is being recorded in small commits on `codex/final-push` as requested.
No remote push or live backend deployment has been performed.
Pokemon client catalog writes remain present: SEC-02 and the overall
shared-cache poisoning risk are not resolved. Existing cached records also need
integrity review; restricting future writes does not validate historical data.
See [catalog rollout](catalog-proxy.md) for
the required backend-before-client deployment sequence. No release-gate checkbox
has been marked complete solely on local test evidence.

## How to close this checklist

- Check an item only after its acceptance condition is met. Record the commit,
  test result, build, dashboard evidence, or operational document beside it.
- Sections 1-8 are the proposed release gate. Some are engineering acceptance
  criteria, not store-policy mandates. Section 9 contains optional scope that
  must be either completed or explicitly deferred.
- Repository evidence does not prove deployed configuration or store approval.
- Recommended execution order: security, content safety, auth/privacy/deletion,
  billing, reliability, release configuration, then final verification.

## 1. Data security and backend integrity

- [ ] **SEC-01: Move vendor API access off the client.** Proxy Pokemon and
  barcode lookups through authenticated Edge Functions; validate inputs, bound
  requests, enforce quotas/rate limits, and handle upstream failures. App lookup,
  scan, search, and set-completion flows must continue working.
- [ ] **SEC-02: Move shared-catalog writes to trusted server code.** Cover
  Pokemon cards, Pokemon set rosters, Magic cards, and barcode product caching.
  Deploy replacement server paths before revoking client writes. Authenticated
  clients must be unable to insert or modify shared catalog records directly.
- [ ] **SEC-03: Remove overly broad RLS policies.** Address unrestricted item
  and showcase INSERT policies and blanket authenticated comment reads. Verify
  posts, comments, likes, bookmarks, profiles, showcases, and storage using
  anonymous, owner, and unrelated-user cases, including private content.
- [ ] **SEC-04: Verify deployed storage limits and ownership.** Remove any
  legacy blanket bucket policies. Confirm size/type limits and user-folder
  isolation, including requests made outside the app UI. Keep client messages
  consistent with actual server-enforced limits.
- [ ] **SEC-05: Close credential exposure.** Remove vendor keys from public
  environment variables and release bundles; rotate exposed credentials after
  migration. Inspect the optional public OCR bearer token and replace shared
  client credentials with appropriate per-user authorization if enabled.
- [ ] **SEC-06: Verify backend rollout.** Apply migrations on a fresh test
  database and test an upgrade from existing data. Inventory deployed functions,
  secrets, JWT verification settings, grants, and webhook authentication.
  Confirm backups and a recovery procedure before production changes.

## 2. Public-content moderation and user safety

- [ ] **SAFE-01: Publish community standards and require acceptance.** Define
  prohibited content/behavior and record acceptance before users upload or
  create public content. Include account/profile text, posts, comments, item
  descriptions, and showcase media in the moderation scope.
- [ ] **SAFE-02: Add reporting.** Users can report content and accounts in the
  app; each report reaches a protected review queue with enough context to act.
- [ ] **SAFE-03: Add user blocking.** Verify its documented behavior across
  feeds, comments, profiles, showcases, and interactions; enforce access rules
  server-side where required, rather than only hiding UI controls.
- [ ] **SAFE-04: Implement moderation and filtering.** Provide tools to review,
  remove/restrict content, and suspend abusive accounts. Assign an operator and
  a response process; test a report through resolution. The admin stub and
  route gate alone do not satisfy this requirement. Include the public-showcase
  18+ designation in the review process.
- [ ] **SAFE-05: Publish support contact details.** Make help and safety
  reporting discoverable in the app and public support pages; verify delivery.
- [ ] **SAFE-06: Resolve Google child-safety applicability.** If the Play
  category is Social, publish anti-CSAE standards, designate a safety contact,
  establish removal/escalation procedures, and complete required declarations.
  The 13+ minimum does not exempt an in-scope Social app.
- [ ] **SAFE-07: Implement the 13+ minimum and showcase age restrictions.**
  Choose a privacy-conscious age-screening approach and document its limits.
  Block under-13 signup. Ask for a whole-showcase rating only when creating or
  publishing a public showcase; require classification before an existing
  private showcase becomes public. Block under-18 and unverified viewers from
  18+ public showcases at the backend and media layer, including share links,
  previews, feeds, and items reused in other showcases. Private showcases do not
  ask for classification. Decide how existing public showcases are classified
  before release. Align audience settings and accurate rating questionnaires.

## 3. Authentication, privacy, and deletion

- [ ] **AUTH-01: Fix OAuth flow consistency.** Align the Supabase auth flow
  with the code-exchange handler. Test Google/Discord success, cancellation,
  errors, and redirects on cold and warm app starts.
- [ ] **AUTH-02: Resolve iOS equivalent-login requirements.** Recommended:
  implement Sign in with Apple. Alternatively, document another valid way of
  satisfying guideline 4.8. Verify first-login username onboarding.
- [ ] **AUTH-03: Complete email confirmation.** Add resend with pending/error
  handling; verify production confirmation settings, delivery, allowed redirect
  URLs, expired links, and return-to-app behavior.
- [ ] **AUTH-04: Verify existing auth fixes on device.** Test password reset,
  large-session persistence, background/resume refresh, sign-out, and switching
  between two accounts without carrying over cached private data.
- [ ] **PRIV-01: Publish privacy policy and terms/EULA.** Add working links in
  Settings, purchase surfaces, and store metadata. Cover actual data collection,
  providers, security, retention, deletion, and a privacy contact. Google's
  privacy-policy URL must be publicly accessible and not a PDF.
- [ ] **PRIV-02: Inventory SDK and service data flows.** Cover Supabase,
  RevenueCat, Stripe, AdMob, OAuth providers, lookup services, and optional
  remote OCR. Verify what is transmitted, stored, shared, and retained before
  completing Apple App Privacy and Google Data safety declarations.
- [ ] **PRIV-03: Resolve advertising consent and tracking.** Determine actual
  SDK behavior. Obtain ATT permission before tracking on iOS, or verify a
  non-tracking configuration. Implement applicable privacy choices and respect
  denial without blocking core functionality. Test initialization timing,
  including paid accounts where the ad component currently initializes the SDK.
- [ ] **PRIV-04: Verify remote OCR behavior.** If enabled, require secure
  transport and appropriate authorization, explain image processing, obtain
  permission where required, and document retention. If disabled for launch,
  verify the release configuration leaves it disabled.
- [ ] **DEL-01: Make account deletion reliable.** Handle returned database and
  storage errors, paginate file cleanup beyond 1,000 files, and provide retries
  for partial failures. Verify deletion of associated content and data; document
  any justified retention. Do not report full cleanup when it has failed.
- [ ] **DEL-02: Provide external deletion requests.** Publish a working request
  page/process usable without reinstalling the app, verify identity safely,
  and enter the URL in Google Play Console.
- [ ] **DEL-03: Explain subscriptions during deletion.** Make ongoing billing
  and cancellation steps clear, provide provider-specific management access,
  and verify what happens to active Stripe and store subscriptions.
- [ ] **DEL-04: Remove orphaned uploads.** Cover item/post deletion, replaced
  images, and failed creation after upload. Retry failed cleanup and avoid
  deleting files still referenced by retained content.

## 4. Membership billing and purchase experience

Proposed launch approach: native IAP on mobile; Stripe on web. This is an
engineering recommendation, not a claim that U.S. external links are forbidden.

- [ ] **BILL-01: Finalize purchase routing.** For the proposed native-IAP
  approach, missing keys or unavailable native modules must show a recoverable
  unavailable state instead of silently switching mobile checkout to Stripe.
- [ ] **BILL-02: Configure all products and plans.** Verify Founding Curator,
  monthly, and annual identifiers, Play base plans, RevenueCat offerings and
  entitlement, database mappings, pricing, and store review metadata.
- [ ] **BILL-03: Use authoritative prices and consistent disclosures.** Both
  membership surfaces must show the actual product price, billing interval,
  renewal terms, cancellation route, included benefits, and policy links before
  purchase. Verify founding-rate and annual-savings claims against real offers.
- [ ] **BILL-04: Verify purchase lifecycle end to end.** Test purchase,
  cancellation of the purchase sheet, restore, renewal, expiration, refund,
  billing problems, delayed/repeated webhooks, plan changes, and account/device
  changes. Avoid duplicate subscriptions and incorrect entitlement grants.
- [ ] **BILL-05: Verify management and entitlement behavior.** Restore and
  provider-specific cancellation links work. Paid features, uploads, and ad
  removal match the purchased plan and remain correct after refresh/relaunch.
- [ ] **BILL-06: Correct outdated billing documentation.** Reconcile the IAP
  and Stripe guides with U.S. policy and the chosen release behavior.

If external mobile checkout is chosen instead, BILL-01 must be replaced by an
explicit storefront-aware design. Apple's U.S. storefront permits external
purchase links without the external-link entitlement. Google requires approved
U.S. external-content-links enrollment and API integration; its published
reporting/fee requirements begin October 1, 2026. Verify these again at submission.

## 5. Reliability and user experience

- [ ] **UX-01: Add crash reporting.** Verify a controlled release-build error
  arrives with actionable diagnostics and without tokens, private content, or
  other sensitive payloads. Preserve the existing error boundary.
- [ ] **UX-02: Surface social-query failures.** Stop treating failed item
  likes/bookmarks/comments reads as successful false/zero results. Distinguish
  loading, empty, failure, and retry states on active screens.
- [ ] **UX-03: Fix feed pagination ties.** Use a stable cursor/order, such as
  creation time plus ID. Verify identical-timestamp posts are neither skipped
  nor duplicated and profile-fetch failures are handled intentionally.
- [ ] **UX-04: Complete logging cleanup.** Remove unnecessary production logs,
  route diagnostics through controlled logging, and verify sensitive-data
  redaction, including profile and membership paths.
- [ ] **UX-05: Apply auth theming.** Verify sign-in, signup, confirmation, and
  recovery screens in light/dark modes with readable contrast.
- [ ] **UX-06: Perform accessibility checks.** Test VoiceOver, TalkBack, large
  text, touch targets, modal focus/close behavior, and purchase controls. Fix
  clipping and unlabeled controls on the release's primary flows.
- [ ] **UX-07: Resolve lint warnings.** Triage all 13 warnings from the prior
  verification, including hook dependencies and generated-file exclusions.
- [ ] **UX-08: Audit release-visible claims and unfinished routes.** Keep
  Marketplace hidden; remove inaccurate claims about personalized/follower-only
  feeds or paid benefits. Verify public showcase navigation while signed out.

## 6. Build, store configuration, and operations

- [ ] **REL-01: Verify release permissions.** Inspect merged release manifests
  and iOS purpose strings. Justify/remove unnecessary microphone, overlay, and
  broad storage permissions. Use system photo selection where sufficient;
  test denial, limited access, and manual creation without camera permission.
- [ ] **REL-02: Verify Android submission artifact.** Confirm target API 36
  or the then-current required level, production upload signing, version code,
  and native-library compatibility, including 16 KB page-size support. Local
  dependency defaults and generated Gradle files are not final AAB evidence.
- [ ] **REL-03: Verify iOS submission artifact.** Confirm the submission's
  required Xcode/SDK versions, signing, bundle ID, build number, privacy manifests,
  declared API usage, and required capabilities in the actual archive.
- [ ] **REL-04: Complete both store listings.** Supply accurate screenshots,
  descriptions, app/support/privacy URLs, content ratings, 13+ target audience
  settings where available, U.S.-only availability, and ad/IAP declarations.
- [ ] **REL-05: Verify content and asset rights.** Document permitted use of
  card art, catalog data, branding, icons, and promotional assets, including
  relevant provider terms. Avoid implying publisher affiliation.
- [ ] **REL-06: Prepare reviewer access.** Provide working demo credentials
  and review notes for auth, moderation, account deletion, scanning, membership,
  and restore. Keep review backends available and test these instructions.
- [ ] **REL-07: Assign launch operations.** Identify owners for support,
  moderation, security reports, billing failures, and crash monitoring. Document
  response procedures, rollback/recovery steps, and production configuration.

## 7. Final verification

- [ ] **QA-01: Verify the intended release branch.** Integrate the approved
  work into the actual release candidate through review; do not accidentally
  submit the older `main` state. Record the final commit and build identifiers.
- [ ] **QA-02: Run application checks.** Lint, TypeScript, and all relevant
  Jest suites pass on the final candidate. Keep nested worktrees out of tool
  discovery so local and CI scope agree.
- [ ] **QA-03: Run backend checks separately.** Validate Edge Functions,
  migrations, RLS, storage, and webhooks; app TypeScript/lint excludes server
  functions and is not evidence that those components pass.
- [ ] **QA-04: Test production-like builds on iOS and Android.** Cover auth,
  manual creation, barcode/card scans, uploads, posts/comments, moderation,
  public/private showcases, purchases/restores, deletion, offline/error states,
  background/resume, and accessibility.
- [ ] **QA-05: Compare declarations to observed behavior.** Verify release
  network activity, permissions, public/private access, SDK initialization,
  privacy choices, and user-visible prices against policies and store forms.
- [ ] **QA-06: Refresh the original audit.** Record resolved items, evidence,
  accepted deferrals, and remaining external verification in
  `production-readiness-audit.md`; do not retain the stale 86-test baseline.

## 8. Final release decision

- [ ] All required items above have evidence; any conditional requirement has
  a documented applicability decision and any exception is explicitly accepted.
- [ ] Recheck store policies and submission requirements at submission time.
- [ ] Obtain final approval for the concrete release candidate before merging,
  production rollout, or store submission where separately required. Preparing
  this checklist does not perform or authorize those actions.

## 9. Optional scope: complete or explicitly defer

These are outstanding product/audit items, not established store blockers.

- [ ] **SCOPE-01:** General item editing beyond condition.
- [ ] **SCOPE-02:** Showcase title/description editing and showcase deletion;
  appearance customization already exists.
- [ ] **SCOPE-03:** User deletion of individual item/post comments.
- [ ] **SCOPE-04:** Follow-based feed personalization and consolidating profile
  retrieval into a measured, index-backed server query.
- [ ] **SCOPE-05:** Persistent offline query caching with account isolation.
- [ ] **SCOPE-06:** Remove/archive the unused still-photo experiment or verify
  its absence from release bundles. No production imports were found.
- [ ] **SCOPE-07:** Marketplace implementation. Keep it hidden if deferred.

## Existing implementation baseline

The following exist in code and should be regression-tested, not rebuilt:
password recovery; confirmation messaging; pending auth buttons; chunked secure
session storage; startup env validation; AppState token refresh; admin route
gating; item/account deletion entry points; item condition/showcase appearance
editing; user-scoped uploads; error boundary; query defaults and sign-out cache
clearing; Show Off branding; hidden Marketplace; CI; native IAP purchase/restore.

Prior read-only verification on this baseline: TypeScript passed; 12 Jest suites
and 158 tests passed; ESLint found 0 errors and 13 warnings. Lint excluded the
nested `.claude` worktree; Jest roots were `api` and `lib`, covering the project's
12 test files. This does not establish device, production-backend, or store
compliance. No new tests were run while writing this checklist.

Original audit coverage: 1/8/9/10/11/16/17/23 are implemented with release
verification outstanding; 2-7 and 12-15 map to sections 1-4 and 9; 18-22 map to
section 5 and optional scope. The membership policy decision is in section 4.

## Policy references

Reviewed during planning on 2026-09-09. Recheck changing requirements before
submission; these references do not certify acceptance by either store.

- [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/):
  UGC, login, privacy, payment, completeness, and intellectual-property rules.
- [Google UGC](https://support.google.com/googleplay/android-developer/answer/9876937)
- [Google User Data and account deletion](https://support.google.com/googleplay/android-developer/answer/10144311)
- [Google subscriptions](https://support.google.com/googleplay/android-developer/answer/9900533)
- [Google U.S. external links](https://support.google.com/googleplay/android-developer/answer/16470497)
- [Google child-safety scope](https://support.google.com/googleplay/android-developer/answer/14747720)
- [Google permissions](https://support.google.com/googleplay/android-developer/answer/16558241)
- [Google target API requirements](https://support.google.com/googleplay/android-developer/answer/11926878)
- [Android 16 KB compatibility](https://developer.android.com/guide/practices/page-sizes)
