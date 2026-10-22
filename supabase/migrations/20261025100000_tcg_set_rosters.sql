-- Complete-set manifest for the shared PokéWallet games, like
-- pokemon_tcg_set_rosters: set completion reads tcg_cards for a set only when
-- this manifest says the whole set was cached and the row count matches.
-- Written only by catalog-proxy (service role), so one user's roster fetch
-- spares every later viewer a PokéWallet request.

CREATE TABLE IF NOT EXISTS public.tcg_set_rosters (
  game TEXT NOT NULL CHECK (game IN ('ygo', 'op', 'lor', 'fab', 'dgm', 'swu', 'dbs', 'cfv', 'cpk')),
  -- PokéWallet set_id (numeric group id, negative for CardMarket-only sets).
  set_id TEXT NOT NULL CHECK (set_id ~ '^-?[0-9]{1,12}$'),
  set_name TEXT,
  card_count INTEGER NOT NULL CHECK (card_count BETWEEN 0 AND 2000),
  cached_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (game, set_id)
);

ALTER TABLE public.tcg_set_rosters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read TCG set rosters" ON public.tcg_set_rosters;
CREATE POLICY "Authenticated users can read TCG set rosters"
  ON public.tcg_set_rosters
  FOR SELECT
  TO authenticated
  USING (TRUE);

REVOKE ALL ON public.tcg_set_rosters FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.tcg_set_rosters TO authenticated;
GRANT ALL ON public.tcg_set_rosters TO service_role;

CREATE INDEX IF NOT EXISTS tcg_cards_game_set_id_idx
  ON public.tcg_cards (game, set_id);

NOTIFY pgrst, 'reload schema';
