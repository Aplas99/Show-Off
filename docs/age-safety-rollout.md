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

Publication ratings, restricted media access, blocking/reporting/moderation,
and advertising changes are separate implementation steps still in progress.
Age is never included in public profile responses or sent for minors'
personalized advertising. An age rating never permits prohibited content.
