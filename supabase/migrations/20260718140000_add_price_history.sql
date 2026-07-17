-- Per-card market price history for the Curator price-history graph.
-- Snapshots are captured by triggers whenever the card caches are written
-- (scan, search, set-roster fetch, cache refresh), capped at one row per
-- card per day. This trades scheduled-job infrastructure for organic
-- coverage: any card someone interacts with accrues history, and opening
-- the graph triggers a fresh cache write for that card.

CREATE TABLE IF NOT EXISTS public.price_history (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  game TEXT NOT NULL CHECK (game IN ('pokemon', 'magic')),
  card_id TEXT NOT NULL,
  price NUMERIC NOT NULL,
  currency_code TEXT NOT NULL DEFAULT 'USD',
  captured_on DATE NOT NULL DEFAULT CURRENT_DATE,
  UNIQUE (game, card_id, captured_on)
);

CREATE INDEX IF NOT EXISTS price_history_card_idx
  ON public.price_history (game, card_id, captured_on DESC);

ALTER TABLE public.price_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read price history"
  ON public.price_history;
CREATE POLICY "Authenticated users can read price history"
  ON public.price_history
  FOR SELECT
  TO authenticated
  USING (TRUE);

-- Writes happen only through the SECURITY DEFINER trigger functions below.
GRANT SELECT ON public.price_history TO authenticated;

-- Preferred-variant market price from the Pokémon TCG API's tcgplayer blob,
-- mirroring extractMarketPrice in api/pokemon/ocrPostprocessing.ts.
CREATE OR REPLACE FUNCTION public.extract_pokemon_market_price(p_tcgplayer JSONB)
RETURNS NUMERIC
LANGUAGE SQL
IMMUTABLE
SET search_path = ''
AS $$
  SELECT COALESCE(
    (p_tcgplayer->'prices'->'normal'->>'market')::NUMERIC,
    (p_tcgplayer->'prices'->'holofoil'->>'market')::NUMERIC,
    (p_tcgplayer->'prices'->'reverseHolofoil'->>'market')::NUMERIC,
    (
      SELECT (variant.value->>'market')::NUMERIC
      FROM JSONB_EACH(p_tcgplayer->'prices') AS variant
      WHERE variant.value->>'market' IS NOT NULL
      LIMIT 1
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.snapshot_pokemon_card_price()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_price NUMERIC;
BEGIN
  v_price := public.extract_pokemon_market_price(NEW.tcgplayer);
  IF v_price IS NOT NULL AND v_price > 0 THEN
    INSERT INTO public.price_history (game, card_id, price, captured_on)
    VALUES ('pokemon', NEW.id, v_price, CURRENT_DATE)
    ON CONFLICT (game, card_id, captured_on)
    DO UPDATE SET price = EXCLUDED.price;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS snapshot_pokemon_card_price_trigger
  ON public.pokemon_tcg_cards;
CREATE TRIGGER snapshot_pokemon_card_price_trigger
  AFTER INSERT OR UPDATE OF tcgplayer ON public.pokemon_tcg_cards
  FOR EACH ROW
  EXECUTE FUNCTION public.snapshot_pokemon_card_price();

CREATE OR REPLACE FUNCTION public.snapshot_magic_card_price()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.price_usd IS NOT NULL AND NEW.price_usd > 0 THEN
    INSERT INTO public.price_history (game, card_id, price, captured_on)
    VALUES ('magic', NEW.id, NEW.price_usd, CURRENT_DATE)
    ON CONFLICT (game, card_id, captured_on)
    DO UPDATE SET price = EXCLUDED.price;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS snapshot_magic_card_price_trigger
  ON public.magic_cards;
CREATE TRIGGER snapshot_magic_card_price_trigger
  AFTER INSERT OR UPDATE OF price_usd ON public.magic_cards
  FOR EACH ROW
  EXECUTE FUNCTION public.snapshot_magic_card_price();

-- Backfill today's snapshot from whatever is already cached, so the graph
-- has at least one point per card immediately after this migration.
INSERT INTO public.price_history (game, card_id, price, captured_on)
SELECT 'pokemon', card.id, public.extract_pokemon_market_price(card.tcgplayer), CURRENT_DATE
FROM public.pokemon_tcg_cards AS card
WHERE public.extract_pokemon_market_price(card.tcgplayer) > 0
ON CONFLICT (game, card_id, captured_on) DO NOTHING;

INSERT INTO public.price_history (game, card_id, price, captured_on)
SELECT 'magic', card.id, card.price_usd, CURRENT_DATE
FROM public.magic_cards AS card
WHERE card.price_usd > 0
ON CONFLICT (game, card_id, captured_on) DO NOTHING;

NOTIFY pgrst, 'reload schema';
