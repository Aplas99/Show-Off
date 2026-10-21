-- Server-maintained Pokémon set catalog. The scanner trusts OCR'd set codes,
-- printed totals and set names only when they appear in a known set list;
-- the bundled snapshot (constants/pokemonTcgSets.ts) goes stale as new sets
-- release, so catalog-proxy refreshes this table from GET /v2/sets and clients
-- merge it over the bundled list. Written only by the service role.

CREATE TABLE IF NOT EXISTS public.pokemon_tcg_sets (
  id TEXT PRIMARY KEY CHECK (id ~ '^[a-zA-Z0-9_-]{1,100}$'),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  series TEXT,
  -- Promo sets use hyphenated codes such as PR-SW.
  ptcgo_code TEXT CHECK (ptcgo_code IS NULL OR ptcgo_code ~ '^[A-Za-z0-9-]{1,12}$'),
  printed_total INTEGER CHECK (printed_total IS NULL OR printed_total BETWEEN 0 AND 2000),
  total INTEGER CHECK (total IS NULL OR total BETWEEN 0 AND 2000),
  release_date DATE,
  refreshed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pokemon_tcg_sets_release_date_idx
  ON public.pokemon_tcg_sets (release_date DESC NULLS LAST);

ALTER TABLE public.pokemon_tcg_sets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read Pokemon sets"
  ON public.pokemon_tcg_sets;
CREATE POLICY "Authenticated users can read Pokemon sets"
  ON public.pokemon_tcg_sets
  FOR SELECT
  TO authenticated
  USING (TRUE);

-- Same trusted-write boundary as pokemon_tcg_cards / set rosters: clients read,
-- only catalog-proxy (service role) writes.
REVOKE ALL ON public.pokemon_tcg_sets FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.pokemon_tcg_sets TO authenticated;
GRANT ALL ON public.pokemon_tcg_sets TO service_role;

NOTIFY pgrst, 'reload schema';
