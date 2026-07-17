-- Multiple images per item (Curator perk). `image_url` stays as the cover /
-- legacy single image; `image_urls` holds the full ordered gallery. The
-- >1-image gate is enforced at the entry point in the client, consistent
-- with the other Curator features (downgrade keeps existing galleries
-- displaying, per the tier-downgrade decision).

ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS image_urls TEXT[] NOT NULL DEFAULT '{}';

NOTIFY pgrst, 'reload schema';
