-- Top-level item categories used to separate and filter showcase items:
-- tcg, books, video_games, board_games, figures, music, movies, general.
-- custom_category stays as the free-text "type" label. Linked trading cards
-- are always 'tcg'; when a client omits the category, it is inferred from
-- the barcode and type text.

-- First match wins. Keep the patterns and their order in sync with
-- CATEGORY_RULES in lib/itemCategory.ts.
CREATE OR REPLACE FUNCTION public.infer_item_category(
  p_pokemon_tcg_card_id TEXT,
  p_magic_card_id TEXT,
  p_product_ean BIGINT,
  p_hints TEXT
)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_pokemon_tcg_card_id IS NOT NULL OR p_magic_card_id IS NOT NULL THEN 'tcg'
    -- EAN-13 with the Bookland prefix is an ISBN.
    WHEN p_product_ean::TEXT ~ '^97[89][0-9]{10}$' THEN 'books'
    WHEN COALESCE(p_hints, '') ~* '\y(tcg|ccg|trading cards?|(pok[eé]mon|magic|yu-?gi-?oh|lorcana) cards?|magic: the gathering|mtg)\y' THEN 'tcg'
    WHEN COALESCE(p_hints, '') ~* '\y(books?|novels?|manga|comics?|graphic novels?|magazines?|textbooks?|literature|fiction|paperbacks?|hardcovers?)\y' THEN 'books'
    -- Before music so "Vinyl Figure" is a figure, not a record.
    WHEN COALESCE(p_hints, '') ~* '\y(action figures?|figures?|figurines?|statues?|statuettes?|funko|nendoroids?|amiibo)\y' THEN 'figures'
    WHEN COALESCE(p_hints, '') ~* '\y(video ?games?|gaming|consoles?|nintendo|playstation|ps[1-5]|xbox|switch|sega|game ?boy|gamecube|wii)\y' THEN 'video_games'
    -- Toys that share "Toys & Games" catalog paths stay General.
    WHEN COALESCE(p_hints, '') ~* '\y(plush|dolls?|lego)\y' THEN 'general'
    WHEN COALESCE(p_hints, '') ~* '\y(board ?games?|tabletop|card games?|dice|puzzles?|jigsaw)\y' THEN 'board_games'
    WHEN COALESCE(p_hints, '') ~* '\y(music|vinyl|records?|lps?|albums?|cds?|cassettes?)\y' THEN 'music'
    WHEN COALESCE(p_hints, '') ~* '\y(movies?|films?|dvds?|blu-?rays?|vhs|4k uhd)\y' THEN 'movies'
    -- Platform-less "games" are tabletop; after movies so film titles stay movies.
    WHEN COALESCE(p_hints, '') ~* '\ygames?\y' THEN 'board_games'
    ELSE 'general'
  END
$$;

ALTER TABLE public.items ADD COLUMN IF NOT EXISTS category TEXT;

UPDATE public.items AS i
SET category = public.infer_item_category(
  i.pokemon_tcg_card_id,
  i.magic_card_id,
  i.product_ean,
  concat_ws(' ', i.custom_category, (
    SELECT p.data ->> 'category'
    FROM public.products AS p
    WHERE p.ean = i.product_ean
    LIMIT 1
  ))
)
WHERE i.category IS NULL;

ALTER TABLE public.items ALTER COLUMN category SET NOT NULL;

ALTER TABLE public.items DROP CONSTRAINT IF EXISTS items_category_check;
ALTER TABLE public.items ADD CONSTRAINT items_category_check
  CHECK (category IN (
    'tcg', 'books', 'video_games', 'board_games', 'figures', 'music', 'movies', 'general'
  ));

CREATE OR REPLACE FUNCTION public.set_item_category()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_product_category TEXT;
BEGIN
  IF NEW.pokemon_tcg_card_id IS NOT NULL OR NEW.magic_card_id IS NOT NULL THEN
    NEW.category := 'tcg';
  ELSIF NEW.category IS NULL THEN
    IF NEW.product_ean IS NOT NULL THEN
      SELECT p.data ->> 'category' INTO v_product_category
      FROM public.products AS p
      WHERE p.ean = NEW.product_ean
      LIMIT 1;
    END IF;
    NEW.category := public.infer_item_category(
      NULL,
      NULL,
      NEW.product_ean,
      concat_ws(' ', NEW.custom_category, v_product_category)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS items_set_category ON public.items;
CREATE TRIGGER items_set_category
  BEFORE INSERT OR UPDATE OF category, pokemon_tcg_card_id, magic_card_id
  ON public.items
  FOR EACH ROW
  EXECUTE FUNCTION public.set_item_category();
