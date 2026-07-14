-- Curator-tier showcase customization: an accent color and optional
-- banner image per showcase. Editing is gated client-side on isCurator
-- (see CuratorGate); reading/writing at the DB level reuses the existing
-- "update_own_showcase" policy (owner can already update any column on
-- their own showcase row), so no RLS changes are needed here.

ALTER TABLE public.showcase
  ADD COLUMN IF NOT EXISTS accent_color TEXT,
  ADD COLUMN IF NOT EXISTS banner_image_url TEXT;

NOTIFY pgrst, 'reload schema';
