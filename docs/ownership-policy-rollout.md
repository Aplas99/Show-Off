# Ownership policy rollout

Local implementation only; no production migrations applied.

Apply `20260909220000_require_creation_ownership.sql` and then
`20260909230000_require_owned_showcase_items.sql` to a test environment after
verifying migration history.

The first migration removes legacy unrestricted item/showcase INSERT policies
and adds restrictive owner checks. Extra permissive policies cannot override
these checks. It also revokes client execution of `ensure_default_showcase`, a
privileged provisioning helper. Server-side provisioning retains access.

The second requires ownership of the item and destination showcase when linking.
Its boolean ownership helper bypasses recursive visibility checks but always
compares against the caller's authenticated identity. It accepts no user ID and
returns no item data. Existing links are not modified; review historical links
for unauthorized associations before release.

Both card batch RPCs now insert items, link them, and return their IDs using
separate statements inside the same transaction. This makes the newly created
items visible to the ownership check. Link failure rolls back item creation.
Unpriced cards retain USD because the captured schema requires a non-null
currency; duplicate copies and explicitly priced cards remain supported.

Verification completed in isolated PostgreSQL fixtures using captured table
definitions and visibility policies:

- `supabase/tests/creation_ownership.sql`: own creation succeeds; cross-user,
  anonymous, and missing-identity creation fail; client provisioning calls fail;
  trusted provisioning succeeds, even with extra permissive INSERT policies.
- `supabase/tests/showcase_item_ownership.sql`: owned links succeed; another
  user's publicly readable item cannot be linked; links to another user's
  showcase fail; both batch RPCs save correctly and roll back on link failures.

These fixtures omit unrelated membership quota triggers. Before production,
verify email/OAuth signup provisioning, manual items, both card batch flows,
free-tier limits, paid memberships, and existing showcase access together in
Supabase. The broader SEC-03 comment/social/storage policy review remains open.

Changes are committed locally in separate groups. Reverting a source commit
does not undo a migration already applied to a database; deployed SQL changes
need a reviewed forward migration. No database rollback is needed for the
current local-only work.
