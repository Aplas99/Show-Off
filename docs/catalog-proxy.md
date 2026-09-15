# Catalog proxy rollout

Status: local implementation on `codex/final-push`; not deployed.

Pokemon TCG, Barcode Lookup, UPCItemDB, and Magic/Scryfall requests use the authenticated
`catalog-proxy` Edge Function. The client contains no vendor key and has no
direct fallback to these providers. Magic results are validated and persisted
by the server before being returned. Product responses are also normalized and
saved by the server. Migrations revoke client writes to `magic_cards` and
`products`; Pokemon card/roster and manual-card writes remain pending SEC-02.
Existing cached records need integrity review; restricting future writes does
not prove historical data is trustworthy.

## Deployment order

1. Verify migration history and apply
   `20260909160000_add_catalog_proxy_rate_limits.sql` and then
   `20260909200000_secure_magic_catalog_writes.sql`, followed by
   `20260909210000_secure_product_catalog_writes.sql`, to a test environment.
2. Configure `POKEMON_TCG_API_KEY` and `BARCODE_LOOKUP_API_KEY` as Supabase Edge
   Function secrets. They are not Expo environment variables.
3. Deploy `catalog-proxy` with its `deno.json` and JWT verification enabled.
   Its handler additionally verifies the user with Supabase Auth.
4. Test valid searches, exact Pokemon IDs, multi-page set rosters, barcode
   filters, Magic search and fuzzy OCR matching followed by batch saving,
   missing/expired sessions, missing secrets, rate limits, and vendor failures.
   Check double-faced cards, Magic's no-match behavior, UPC trial exhaustion,
   paid barcode fallback, numeric-code matching, and manual item creation.
   Verify product persistence against the deployed searchable-column schema
   (both ordinary and legacy generated columns are supported). Repeat against a
   production-like build before rollout.
5. Roll out the client only after the endpoint and migration are available.
6. Remove the old public vendor variables from local/EAS/CI environments and
   rotate previously bundled keys when old releases no longer need them.
   Previously released bundles cannot be made secret retroactively.

Without the deployed endpoint or secrets, vendor searches show an actionable
error. Existing cached card/product reads remain available, but UPCItemDB now
also requires the proxy. Do not enable a client-side vendor-key fallback as a
rollback strategy.

Magic and UPCItemDB require no vendor secret, but do require the migrations and updated
function. Existing cached Magic reads remain available. Coordinate the database,
function, and client release: old clients still attempt to write Magic and product
records and may fail to save newly discovered results after permissions are revoked. Verify an
upgrade path before production rollout. Do not restore public cache writes as a
rollback strategy.

## Request and response controls

- Only POST (plus OPTIONS) is accepted; identity comes from a verified bearer
  token, never a request-body user ID.
- A strict Zod schema bounds query/filter length and pagination. Pokemon
  requests accept only card lookup/search operations and known parameters;
  caller-supplied hosts, credentials, duplicate parameters, and redirects fail.
- Request bodies are limited to 8 KiB; vendor responses to 8 MiB; upstream
  requests time out after 15 seconds.
- The database atomically caps each user's requests to each provider at
  60 per UTC minute and 1,000 per UTC day. These are technical abuse caps,
  including paid users, separate from the app's existing scan/search quotas.
  They do not establish that existing free-tier/reward quotas cannot be bypassed.
- Authenticated/anonymous clients cannot read/write counters or call the
  accounting RPC. Rate-accounting failures prevent vendor requests.
- Inactive usage history is pruned when that user next calls the same provider;
  account deletion cascades all usage rows. No search text is persisted here.
- Vendor errors/URLs/credentials are not forwarded or logged. Pokemon 404s
  preserve existing not-found behavior; barcode 404s return an empty list.
- Magic accepts only bounded `/cards/search` and `/cards/named` queries. Request
  bodies cannot contain card records or write instructions. Shared schemas
  validate Scryfall responses, including double-faced card fields, before a
  service-role upsert. Cache write failures return 503; successful responses
  therefore contain cards available to the subsequent item-saving RPC.
- Magic uses the same per-user caps plus a database-controlled admission slot
  shared across users/Edge instances, spaced at least 550 ms apart. The handler
  waits up to ten 100 ms intervals for a slot, then returns 429. This is a
  conservative application limit; deployment/load tests must verify actual
  upstream pacing. Provider 429s are returned without an in-handler retry.
  Scryfall requires appropriate request headers and reduced traffic after
  throttling; see its [access guidance](https://scryfall.com/docs/faqs/i-m-having-trouble-accessing-the-scryfall-api-or-i-m-blocked-17).
- Products are cached only from provider responses, never from an item-creation
  payload. Normalization preserves display-code zeroes and deduplicates database
  BIGINT keys. Unusable codes cannot populate the shared table. Uncached selected
  details can be saved as personal item fields without the verified label; an
  empty lookup requires a manual title. Existing records are reused first.
- UPCItemDB's free endpoint is now shared by the project: at most 100 requests
  per UTC day, including at most 20 searches, with admission spaced 16 seconds
  apart. The provider's [plan table](https://www.upcitemdb.com/wp/docs/main/development/plan/)
  and [rate documentation](https://www.upcitemdb.com/wp/docs/main/development/api-rate-limits/)
  disagree on the search allowance (20 vs 40); the implementation uses 20.
  Provider 429 reset/retry headers extend a shared cooldown (60 seconds to one
  day). No upstream retry occurs in the handler. Actual reset windows and shared
  hosting IPs may impose tighter limits; verify live behavior. The client uses
  Barcode Lookup after free-tier failure or no match, subject to its own quota.
  No paid UPCItemDB subscription or credential has been added.

## Verification

- Jest: `lib/catalogValidation.test.ts`, `lib/catalogProxy.test.ts`, and
  `api/catalog/index.test.ts`, plus existing Pokemon provider tests.
- Deno: `deno check --config supabase/functions/catalog-proxy/deno.json supabase/functions/catalog-proxy/index.ts`.
- PostgreSQL: apply the migration to a disposable test database, then run
  `supabase/tests/catalog_proxy_rate_limits.sql` and
  `supabase/tests/magic_catalog_security.sql`, plus
  `supabase/tests/product_catalog_security.sql`. The assertions roll back. Local
  verification included pre-existing broad policies and table/column grants
  to check that client writes are still denied after migration.
- Run app lint, TypeScript, and the full Jest suite before release.
- Product normalization, fallback/linking, and item-creation regressions are
  covered by `lib/productCatalog.test.ts`, `api/products/index.test.ts`, and
  `api/items/catalogCreate.test.ts`. The product batch passed 221 tests; see the
  final-push checklist for the current full-suite result.

Database tests in a local PostgreSQL engine do not replace live Supabase gateway,
JWT, vendor credential, device, load, or deployment verification. No production
database changes are required to run the isolated tests.
