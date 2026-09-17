# Showcase redesign — 2026-09-16

The showcase list now uses wide banner cards with live item, follower, and estimated value counts. The opened showcase has the matching banner, owner details, follow state, stats, Items/About/Activity tabs, and a two-column generic item grid. Generic cards, trading-card grids, carousel cards, public showcase cards, and the item detail modal use the showcase accent for their outline and image sheen.

Owners can choose any six-digit hex accent color from **Edit Showcase**. This updates the existing `showcase.accent_color` column; it does not require a new color column. Curator members can still upload a custom banner. Showcases without one use `assets/images/showcase-space-banner.png`, generated for this design using the built-in image tool. Prompt: “Cute small astronaut robot on a rocky alien ledge, luminous lavender moon, faceted violet crystal, sparse stars and deep indigo space; wide cinematic polished 3D illustration; no text, logo, UI frame, or watermark.”

Deploy `supabase/migrations/20260916120000_follow_own_showcases.sql` before expecting owners to count as followers. It backfills existing showcases, follows new showcases at insertion, and prevents an owner from removing their own follow. The app shows the owner as Following even while that migration is pending.

Local checks: TypeScript passed; 28 Jest suites / 295 tests passed; ESLint had 0 errors and 10 existing warnings; web export completed. Authenticated showcase views, real stats/follow writes, and mobile visual QA still need a deployed backend and signed-in test account. No deployment or merge was performed.
