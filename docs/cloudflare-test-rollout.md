# Cloudflare production-like test rollout

Status: main Supabase backend deployed on 2026-09-15; Cloudflare frontend pending.
No merge to main performed.
The owner accepts remaining implementation for testing. This is not a public
launch or store-submission checklist; use final-push-checklist.md for those gates.

## Architecture and domain

Cloudflare Pages serves the exported Expo web app and public policy pages.
The browser connects to Supabase Auth, PostgreSQL/RLS, private Storage and Edge
Functions. Catalog vendors are called by Supabase functions, not by Cloudflare.
Native iOS/Android apps connect to the same backend and RevenueCat; RevenueCat
webhooks reach Supabase. Cloudflare does not host the mobile binaries or process
store payments. Stripe new purchases remain deferred; web purchases are unavailable.

A custom domain is not required for this test: use the project's HTTPS pages.dev
address. Pick one stable test hostname so email/OAuth redirects stay predictable.
A custom domain can be added later. Cloudflare describes [Pages serving](https://developers.cloudflare.com/pages/configuration/serving-pages/)
and [rewrite rules](https://developers.cloudflare.com/pages/configuration/redirects/);
Expo describes [static rendering](https://docs.expo.dev/router/web/static-rendering/).

## Backend before client

1. The owner chose the existing main Supabase project (Collector,
   yvgqiuewfhwrammwuglr) for this rollout. Verify deployed migration
   history against the repository; apply the complete ordered missing chain,
   through 20260915181000_filter_manual_pokemon_text.sql, after taking an appropriate
   backup if the backend contains retained data. Do not apply only the last file.
2. Test the upgrade with representative legacy users/items/files. The age/rating
   migrations privatize existing showcases until classification and make upload
   buckets private. Old public media URLs will stop serving directly; the new
   client uses authenticated delivery. The Pokemon migration clears legacy
   roster-complete flags and removes existing Pokemon verification badges;
   untrusted catalog entries require a vendor refresh for searches. Older clients
   which write the shared cache are incompatible with the new permissions.
3. Deploy catalog-proxy and delete-account, plus updated billing functions needed
   for the test. Keep JWT verification enabled on user-callable functions. The
   RevenueCat webhook uses its documented secret-header authentication and
   appropriate function JWT configuration. Inventory all deployed functions;
   deploying static Pages files does not deploy any of them.
4. Configure vendor secrets in Supabase only; configure RevenueCat webhook/API/app
   ID/product mappings if testing native purchases. See catalog-proxy.md,
   iap-memberships.md and account-deletion-rollout.md. Never put service-role,
   vendor, webhook or secret RevenueCat API keys into EXPO_PUBLIC variables.
5. Seed the protected moderator table for an existing test operator, following
   content-safety-rollout.md. Legacy profile is_admin does not grant moderation.
   Maintain manual image/video review; the text filter is deliberately limited.

## Build and upload

1. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_ANON_KEY to the chosen main project.
   Leave EXPO_PUBLIC_ADS_ENABLED=false and debug flags false. Remote OCR stays
   disabled in code. Remove obsolete public vendor/OCR credentials from the build
   environment, and rotate any previously exposed secrets.
2. Run npm run build:web. Upload the contents of dist to Cloudflare Pages, or use
   that build command with output directory dist in a Git-backed Pages project.
   Upload the whole directory including _expo, assets, _redirects and _headers.
3. The post-export preparation supplies shells and 200 rewrites for /s/* and
   /showcase/*. These let arbitrary showcase IDs load on direct navigation and
   refresh; browser data loads still enforce Supabase access. Legal pages are
   exported individually. Verify actual deployed rewrite behavior after upload.
4. In Supabase Auth, configure the test site URL and exact HTTPS redirects for
   /auth/callback and /reset-password. Configure enabled OAuth provider callbacks
   and email delivery. Follow auth-rollout.md; native scheme redirects remain.
5. Record the branch commit, backend migration version, build environment and
   Pages URL. A merge to main is an integration step; it does not apply database
   migrations/functions or prove the app is ready for public release.

## Test before broadening access

- Open privacy/terms/community/support/deletion pages signed out; verify contact.
- Test signup below 13, teen and adult signup, legacy/OAuth onboarding, email
  confirmation, recovery and account switching on the deployed host.
- Test browser image/video uploads, actual server size limits, private media,
  public general/18+ showcases, teen/unknown/adult access, reused media and copied
  public URLs. Check direct /s/<id> navigation and refresh, not only in-app links.
- Test report -> moderator review -> restrict/restore and suspend/unsuspend;
  reciprocal block/unblock across feed, comments, profiles and media.
- Test vendor search, fallback, manual Pokemon save, complete set, batch creation,
  provider failure and request limits; confirm direct client catalog writes fail.
- Delete a disposable test account; verify database and all upload folders and
  retry behavior. Store subscriptions need separate cancellation handling.
- Test IAP on native development/release builds with Apple/Google sandbox and
  RevenueCat configured: purchase, cancel, restore, expiry, refund, plan changes,
  duplicate/delayed webhook and account switches. Pages cannot verify this.

Keep ads disabled until consent/network configuration and observed native behavior
are verified. Rewarded-ad server verification and all minor-ad support remain open.
Before public launch, complete remaining release gates, SDK/privacy declarations,
permissions/artifacts, asset rights, operational ownership and device QA.

## Local candidate evidence

27 Jest suites / 291 tests and app TypeScript pass. Lint has 0 errors and 11
warnings. Catalog Edge Function Deno check and isolated PostgreSQL provenance,
private manual cards, text filter, owner creation, blocks/moderation and media
checks pass. npm run build:web exports 52 routes plus the Pages shells/rules.
Browser smoke checks pass for policy/deletion navigation, sign-in/signup age copy
and a direct unavailable showcase; no browser runtime errors were observed.
Configured legacy vendor/OCR values were not found in exported JS/HTML.

The export uses the current local app/icon configuration. Those existing app.json
and generated icon changes remain outside these implementation commits; review
and commit them before expecting a checkout of main to reproduce that branding.
Live Storage/CORS, actual Pages routing, vendor responses, provider credentials,
upgrade fixtures and native purchase behavior still require deployed testing.

## Main backend deployment - 2026-09-15

The linked main project passed migration-history comparison and the complete
pending chain in a rollback-only transaction. A logical backup of public, auth,
storage and supabase_migrations was made with official portable PostgreSQL 15.19
utilities, then fully read with pg_restore to validate the archive. Its location
is %TEMP%/show-off-rollout-20260915/main-before-rollout.dump. Stored file bytes
are not included. Previously deployed Stripe function sources were also saved
in that folder. No actual restore has been attempted.

All fourteen September migrations applied successfully. A subsequent dry-run
reports the remote database up to date. Account/item/file counts remain 2/46/7;
all upload buckets are private and both formerly public showcases now require
owner classification/republishing. Existing users must complete age/standards
onboarding in the new client. Legacy Pokemon verified badges/complete-set flags
were reset as documented above.

catalog-proxy, delete-account, revenuecat-webhook, stripe-checkout and
stripe-webhook are ACTIVE. User endpoints retain JWT verification; provider
webhooks use their handler's signature or secret-header checks. RevenueCat's
JWT setting is explicitly recorded in config.toml. The existing Barcode Lookup
key was configured as BARCODE_LOOKUP_API_KEY. POKEMON_TCG_API_KEY and RevenueCat
server/public SDK credentials still need owner setup; unavailable features stay
closed. Ads remain disabled by default.

production_rollout_smoke.sql passed against the main backend with all fixtures
rolled back: actual auth/profile/creation triggers, under-13 denial, owner
creation/RETURNING, manual verification denial, protected reporting, blocking,
public general access and mature access denial for teens. HTTP smoke checks pass
for catalog OPTIONS and anonymous/invalid request rejection on catalog, deletion,
RevenueCat and Stripe webhook endpoints. Actual signed-in Storage/CORS, catalog
vendor lookups, OAuth/email flows, billing lifecycle and moderation resolution
still need frontend/device testing.

Pending owner input: the moderator username and Cloudflare HTTPS hostname.
Set the Pages production branch to codex/final-push after it is published. The
build command is npm run build:web; framework None; output dist; root blank.
Do not use the older main branch for this client build.
