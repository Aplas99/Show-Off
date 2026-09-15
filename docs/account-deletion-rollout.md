# Account deletion rollout

Apply `20260915130000_account_deletion_guards.sql` before deploying the
`delete-account` function. Cleanup errors now fail the request. Both upload
buckets, nested folders, and pagination beyond 1,000 files are covered.
The auth user is deleted last; recorded foreign keys cascade content,
interactions, profile, quota, and billing mapping rows atomically. Shared
catalog records remain shared.

Deletion intent disables new client content and storage writes. After partial
failure, authentication remains available to retry from Settings. Operators
can inspect protected `account_deletion_requests` rows for unfinished requests.
Resolve the cause and retry; do not clear requests to suppress failures.
An upload admitted before deletion intent may still finish: test late uploads
and inspect for remaining objects during recovery.

Local verification: six unit tests cover pagination, both buckets, nested
paths, initialization/list/removal/auth failures, and path isolation. An
isolated PostgreSQL fixture checks every guard, intent privacy, user isolation,
and auth cascade. Deno and app TypeScript pass. The fixture uses minimal tables;
verify actual triggers, foreign keys, legacy unscoped files, concurrent uploads,
and interrupted cleanup in a Supabase test project.

Subscription cancellation and provider retention remain required before
closing DEL-01/DEL-03. Deleting a local billing mapping does not cancel a
Stripe, Apple, or Google subscription.
