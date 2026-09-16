-- Tracks which Pokémon set rosters have been completely downloaded.
-- Individual cards continue to live in pokemon_tcg_cards; this manifest lets
-- the app distinguish a complete cached set from a handful of cards cached by
-- scanning/search, so set completion can safely use Supabase before the API.

CREATE TABLE IF NOT EXISTS public.pokemon_tcg_set_rosters (
  set_id TEXT PRIMARY KEY,
  set_name TEXT NOT NULL,
  set_series TEXT,
  printed_total INTEGER,
  total INTEGER,
  cached_card_count INTEGER NOT NULL CHECK (cached_card_count >= 0),
  is_complete BOOLEAN NOT NULL DEFAULT FALSE,
  cached_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pokemon_tcg_set_rosters_updated_at_idx
  ON public.pokemon_tcg_set_rosters (updated_at DESC);

ALTER TABLE public.pokemon_tcg_set_rosters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read Pokemon set rosters"
  ON public.pokemon_tcg_set_rosters;
CREATE POLICY "Authenticated users can read Pokemon set rosters"
  ON public.pokemon_tcg_set_rosters
  FOR SELECT
  TO authenticated
  USING (TRUE);

-- Matches the existing pokemon_tcg_cards shared-cache policy. Move cache
-- population to a service-role Edge Function if catalog writes are moved off
-- the authenticated client in the future.
DROP POLICY IF EXISTS "Authenticated users can cache Pokemon set rosters"
  ON public.pokemon_tcg_set_rosters;
CREATE POLICY "Authenticated users can cache Pokemon set rosters"
  ON public.pokemon_tcg_set_rosters
  FOR INSERT
  TO authenticated
  WITH CHECK (TRUE);

DROP POLICY IF EXISTS "Authenticated users can refresh Pokemon set rosters"
  ON public.pokemon_tcg_set_rosters;
CREATE POLICY "Authenticated users can refresh Pokemon set rosters"
  ON public.pokemon_tcg_set_rosters
  FOR UPDATE
  TO authenticated
  USING (TRUE)
  WITH CHECK (TRUE);

GRANT SELECT, INSERT, UPDATE ON public.pokemon_tcg_set_rosters TO authenticated;

NOTIFY pgrst, 'reload schema';
