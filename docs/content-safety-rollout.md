# Content safety test rollout

Apply `20260915170000_content_safety.sql` before releasing the new Report/Block
controls. Grant moderator access through a service-role database operation:

```sql
INSERT INTO public.moderators(user_id) VALUES ('YOUR_AUTH_USER_UUID');
```

Settings shows the moderation queue only after checking this protected role.
Clients cannot appoint moderators, write restrictions, read another user's
blocks, or read the report queue without moderator access. The legacy
client-editable profile admin flag is no longer the moderation authority.

Reports cover accounts, items, showcases, posts, and both comment types. The
server validates visibility and stores bounded context, a reason, and optional
details in a protected queue. Twenty reports per account/day limits abuse;
urgent concerns can be sent to onistudiosupport@gmail.com. The queue displays
the latest 100 reports. Moderators can restrict content, suspend accounts,
restore after appeal, dismiss reports, and rate public showcases 18+. Each
action requires a note and records an audit event.

Blocking hides content between the two signed-in accounts, prevents follows
and interactions, and removes existing follows. It covers profile lookups,
feeds, showcases, comments, public showcase RPCs, and private media access.
Settings allows unblocking. Unblocking does not restore follows. Public content
can still be viewed while signed out; blocking cannot revoke existing copies.

Restrictions hide the affected content and uploaded media from other users.
Account suspension prevents content/upload writes and hides its public content.
Account deletion and support remain available. Restriction is reversible;
operators must separately purge prohibited content and investigate existing
copies or cached public URLs where needed.

A service-managed regex table provides an initial text filter for threats and
child-exploitation phrases across profile, item, showcase, post and comment
text. This is a limited filter, with possible false positives; review appeals
and update patterns carefully. It does not inspect images/video or guarantee
detection. Manual review and operator response are still required.

Oni Studios must monitor the queue/support inbox during the test. Prioritize
child safety, threats and privacy exposure. Never download/reproduce suspected
CSAM in reports; restrict access, preserve only necessary identifiers, and use
the appropriate legal reporting/escalation process. Public anti-CSAE standards
are in Community Standards. Complete Play category/declarations and designate
the child-safety contact before store submission.

Local PostgreSQL tests cover reciprocal blocking, public RPC/media denial,
non-moderator denial, restriction/restoration, suspension, and text filtering.
Test a real report through resolution with separate accounts on the hosted app;
verify deployed RLS, Storage access and support delivery. Set an explicit
retention schedule for report context and audit records before public launch.
