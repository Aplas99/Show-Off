-- PokéWallet card ids carry a per-game prefix (`ygo_`, `op_`, `mtg_` …), not
-- only Pokémon's `pk_`, and One Piece sets are identified by set code
-- (`OP01`, `EB-01`) because One Piece cards carry no numeric set id. Widen
-- the checks from 20261024100000_tcg_cards.sql and
-- 20261025100000_tcg_set_rosters.sql to match lib/pokewalletCatalog.ts.

ALTER TABLE public.tcg_cards DROP CONSTRAINT IF EXISTS tcg_cards_id_check;
ALTER TABLE public.tcg_cards ADD CONSTRAINT tcg_cards_id_check
  CHECK (id ~ '^([a-z]{2,4}_)?[a-f0-9]{16,200}$');

ALTER TABLE public.tcg_set_rosters DROP CONSTRAINT IF EXISTS tcg_set_rosters_set_id_check;
ALTER TABLE public.tcg_set_rosters ADD CONSTRAINT tcg_set_rosters_set_id_check
  CHECK (set_id ~ '^(-?[0-9]{1,12}|[A-Z]{1,4}(-?[0-9]{2})?)$');

NOTIFY pgrst, 'reload schema';
