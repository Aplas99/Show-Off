# Age and standards rollout

User decision, 2026-09-15: store reported age in the private profile table, not
date of birth. `reported_age` and `age_recorded_at` support a conservative age
calculation. Someone reporting 17 becomes eligible for 18+ content no earlier
than one recording anniversary later. This is self-reporting, not verified
identity or an exact birthday calculation. Corrections go through support;
normal client profile updates cannot raise age or backdate the record.

Apply `20260915140000_profile_age_and_standards.sql` after deletion guards.
It captures email signup age/terms acceptance, rejects under-13 email signup,
and provisions missing OAuth profiles. OAuth and legacy users must complete
age/standards onboarding. The acceptance RPC writes the policy version and a
server timestamp. Restrictive policies guard content and upload writes before
acceptance. Private profile reads remain owner-only even if broad legacy
policies exist; public-profile RPCs retain their explicit field lists.

Email clients that omit the new age and acceptance metadata cannot sign up
after this migration. Coordinate the backend/client rollout in the test
environment first. Existing signed-in users will be routed to onboarding.
Test signup with actual Auth triggers and username/default-showcase creation;
the local PostgreSQL tests use a minimal fixture. Test failed profile reads,
account switching, callback/recovery routes, and access to policies before
onboarding completion. Onboarding does not substitute for parental consent
where independently required.

## Public ratings and media

`20260915150000_showcase_ratings_and_private_media.sql` makes existing public
showcases private until their owners classify and republish them. Private
showcases store no audience designation. The sharing/settings modal requires
an explicit general/18+ choice for publication; only adults can publish 18+.
The same modal supports title/description edits and deletion of non-default
showcases. Deleting a showcase retains its collection items.

Restricted reads cover showcase/item rows, links, the public RPC, the legacy
feed view, and posts/media/interactions connected to restricted items. If an
item or uploaded file appears in an 18+ public showcase, its reuse in a general
showcase, avatar, or post cannot bypass the media restriction for younger or
unconfirmed viewers.

Both upload buckets become private, with explicit MIME allowlists and a
100 MiB global ceiling. Folder ownership guards survive broad legacy policies.
The image wrapper uses authorization headers, no disk/memory image caching,
and an account-specific recycling key. Videos use authenticated native sources
or an abortable browser Blob that is revoked on cleanup. Tokens are never put
in media URLs and are sent only to the configured Supabase origin. Signing
operations are excluded from client storage reads to prevent long-lived bearer
links; Storage must provide its operation context. Test this against the actual
deployed Storage version before rollout.

Existing public URLs may be cached outside the application. Purge/expire CDN
caches and verify old public URLs no longer download before inviting testers;
copies already downloaded by users cannot be recalled. Inventory legacy files
outside user UUID folders and migrate them with their references rather than
opening a blanket read policy. New uploads request zero cache lifetime.

Local checks: six media-source unit tests, application TypeScript/lint, and an
isolated PostgreSQL fixture covering classification, owner/adult/teen/unknown/
anonymous access, reused items/files, linked post previews, invoker-view access,
foreign upload denial, and signing-operation denial. This does not test real
Storage HTTP/CORS, CDN invalidation, video streaming, or native image caches.
Verify all of these in the Supabase test project and on the hosted web build.

Blocking/reporting/moderation and advertising changes remain in progress.
Age is never included in public profile responses or sent for minors'
personalized advertising. An age rating never permits prohibited content.
