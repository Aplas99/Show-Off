-- Card-name search for multi-game cards, mirroring
-- search_pokemon_tcg_cards (20260704120000_create_pokemon_tcg_cache.sql).
--
-- TCGTracking's API has no card-name-search endpoint -- only per-set
-- search (see api/tcg/catalog.ts: searchTcgSets hits /v1/{cat}/search,
-- which matches SET names/abbreviations only; confirmed live that a
-- card name like "Lightning Bolt" returns zero set matches). So unlike
-- the Pokemon pipeline (which can always fall back to a live name-search
-- API call), multi-game name search can only ever search OUR OWN cache
-- -- it starts empty and grows as users browse sets (getTcgSetCards
-- already upserts every card it fetches). Browsing by set therefore
-- remains the only way to discover a card nobody has looked at yet.

ALTER TABLE public.tcg_cards
  ADD COLUMN IF NOT EXISTS search_vector TSVECTOR
  GENERATED ALWAYS AS (
    TO_TSVECTOR(
      'simple',
      COALESCE(name, '') || ' ' ||
      COALESCE(set_name, '') || ' ' ||
      COALESCE(game_name, '') || ' ' ||
      COALESCE(number, '') || ' ' ||
      COALESCE(rarity, '')
    )
  ) STORED;

CREATE INDEX IF NOT EXISTS tcg_cards_search_idx
  ON public.tcg_cards USING GIN (search_vector);

CREATE OR REPLACE FUNCTION public.search_tcg_cards(
  search_term TEXT,
  p_game_category_id INTEGER,
  result_limit INTEGER DEFAULT 30,
  result_offset INTEGER DEFAULT 0
)
RETURNS SETOF public.tcg_cards
LANGUAGE SQL
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT card.*
  FROM public.tcg_cards AS card
  WHERE
    card.game_category_id = p_game_category_id
    AND BTRIM(search_term) <> ''
    AND (
      LOWER(card.name) = LOWER(BTRIM(search_term))
      OR card.search_vector @@ WEBSEARCH_TO_TSQUERY('simple', BTRIM(search_term))
    )
  ORDER BY
    CASE WHEN LOWER(card.name) = LOWER(BTRIM(search_term)) THEN 0 ELSE 1 END,
    TS_RANK(
      card.search_vector,
      WEBSEARCH_TO_TSQUERY('simple', BTRIM(search_term))
    ) DESC,
    card.name
  LIMIT LEAST(GREATEST(result_limit, 1), 100)
  OFFSET GREATEST(result_offset, 0);
$$;

REVOKE ALL ON FUNCTION public.search_tcg_cards(TEXT, INTEGER, INTEGER, INTEGER)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_tcg_cards(TEXT, INTEGER, INTEGER, INTEGER)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
