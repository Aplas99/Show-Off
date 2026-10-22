import { z } from "zod";

import { TCG_GAME_CODES, type TcgGameCode } from "@/constants/tcgGames";

/**
 * PokéWallet card ids: a game prefix (`ygo_`, `op_`, `mtg_`, `pk_` …) + hex
 * for TCGplayer-backed cards, bare hex for CardMarket-only ones.
 */
export const POKEWALLET_ID_PATTERN = /^(?:[a-z]{2,4}_)?[a-f0-9]{16,200}$/;

export const tcgGameSchema = z.enum(TCG_GAME_CODES);

/**
 * Set ids for set rosters: numeric group ids (negative for CardMarket-only
 * sets), or a One Piece set code (`OP01`, `EB-01`, `P`), since One Piece
 * cards carry no set id and /op/sets accepts the code.
 */
export const POKEWALLET_SET_ID_PATTERN = /^(?:-?\d{1,12}|[A-Z]{1,4}(?:-?\d{2})?)$/;

/** Set codes are One Piece only; every other game takes a numeric set id. */
export function isValidPokewalletSetId(game: TcgGameCode, setId: string): boolean {
  return game === "op" ? POKEWALLET_SET_ID_PATTERN.test(setId) : /^-?\d{1,12}$/.test(setId);
}

/** Cards per set-roster page (PokéWallet's maximum) and the most pages fetched. */
export const POKEWALLET_SET_PAGE_SIZE = 200;
export const POKEWALLET_SET_MAX_PAGES = 5;

/** Results per PokéWallet search; each uncached card also costs one image request. */
export const POKEWALLET_PAGE_SIZE = 10;

// Vendor fields are loosely typed (set_code can be numeric, card_number "20/189").
const looseText = z.union([z.string(), z.number()]).nullish()
  .transform((value) => (value == null || String(value).trim() === "" ? null : String(value).trim()));

const tcgplayerPriceSchema = z.object({
  sub_type_name: z.string().nullish(),
  market_price: z.number().nullish(),
  low_price: z.number().nullish(),
}).passthrough();

export const pokewalletCardSchema = z.object({
  id: z.string().regex(POKEWALLET_ID_PATTERN),
  card_info: z.object({
    name: z.string().trim().min(1).max(300),
    set_name: looseText,
    set_code: looseText,
    set_id: looseText,
    card_number: looseText,
    rarity: looseText,
    card_type: looseText,
    product_type: z.string().nullish(),
  }).passthrough(),
  images: z.object({ languages: z.array(z.string()).nullish() }).passthrough().nullish(),
  tcgplayer: z.object({
    prices: z.array(tcgplayerPriceSchema).nullish(),
    url: z.string().nullish(),
  }).passthrough().nullish(),
  cardmarket: z.object({}).passthrough().nullish(),
}).passthrough();

export type PokewalletCard = z.infer<typeof pokewalletCardSchema>;

/** One Piece's set code from a card number: `OP01-001` → `OP01`, `EB-01-012` → `EB-01`, `P-025` → `P`. */
export function onePieceSetCode(cardNumber: string | null | undefined): string | null {
  const match = cardNumber?.toUpperCase().match(/^([A-Z]{1,4}(?:-?\d{2})?)-\d{3}/);
  return match ? match[1] : null;
}

// One Piece answers with flat cards (`name`, `card_number` at the top level,
// `tcgplayer.prices` as one object) instead of the `card_info` shape the
// other games share. Normalize it so everything downstream sees one shape.
const onePieceCardSchema = z.object({
  id: z.string(),
  name: z.string(),
  card_number: looseText,
  sub_type_name: z.string().nullish(),
  rarity: looseText,
  card_type: looseText,
  tcgplayer: z.object({
    url: z.string().nullish(),
    prices: z.object({ market_price: z.number().nullish(), low_price: z.number().nullish() }).passthrough().nullish(),
  }).passthrough().nullish(),
  cardmarket: z.object({}).passthrough().nullish(),
}).passthrough();

function normalizeOnePieceCard(raw: unknown, setName: string | null = null): unknown {
  const parsed = onePieceCardSchema.safeParse(raw);
  if (!parsed.success) return raw;
  const card = parsed.data;
  const setCode = onePieceSetCode(card.card_number);
  return {
    ...card,
    card_info: {
      name: card.name,
      set_name: setName,
      set_code: setCode,
      set_id: setCode,
      card_number: card.card_number,
      rarity: card.rarity,
      card_type: card.card_type,
      product_type: "card",
    },
    tcgplayer: card.tcgplayer
      ? {
          url: card.tcgplayer.url ?? null,
          prices: card.tcgplayer.prices
            ? [{ sub_type_name: card.sub_type_name ?? null, ...card.tcgplayer.prices }]
            : [],
        }
      : null,
  };
}

function toCards(results: unknown[]) {
  return results.flatMap((result) => {
    const card = pokewalletCardSchema.safeParse(result);
    return card.success && card.data.card_info.product_type !== "sealed" ? [card.data] : [];
  });
}

const searchResponseSchema = z.object({
  results: z.array(z.unknown()).max(100),
  pagination: z.object({
    page: z.number().int().positive(),
    total: z.number().int().nonnegative(),
    total_pages: z.number().int().nonnegative(),
  }).passthrough(),
});

const onePieceSearchResponseSchema = z.object({
  data: z.array(z.unknown()).max(100),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
});

/** Cards from a `/{game}/search` page; sealed products and malformed rows are dropped. */
export function parsePokewalletSearch(game: TcgGameCode, raw: unknown) {
  if (game === "op") {
    const parsed = onePieceSearchResponseSchema.parse(raw);
    return {
      cards: toCards(parsed.data.map((card) => normalizeOnePieceCard(card))),
      page: parsed.page,
      total: parsed.total,
      totalPages: Math.ceil(parsed.total / parsed.limit),
    };
  }
  const parsed = searchResponseSchema.parse(raw);
  return {
    cards: toCards(parsed.results),
    page: parsed.pagination.page,
    total: parsed.pagination.total,
    totalPages: parsed.pagination.total_pages,
  };
}

const setRosterResponseSchema = z.object({
  set: z.object({ name: looseText, set_id: looseText }).passthrough(),
  cards: z.array(z.unknown()).max(POKEWALLET_SET_PAGE_SIZE),
});

const onePieceSetResponseSchema = z.object({
  set: z.object({ name: looseText }).passthrough(),
  data: z.array(z.unknown()).max(POKEWALLET_SET_PAGE_SIZE),
});

/**
 * One page of `/{game}/sets/{setId}`. A disambiguation reply (several sets
 * share a code) has no `cards`; it can't happen for numeric set ids, so it
 * is treated as malformed.
 */
export function parsePokewalletSetPage(game: TcgGameCode, raw: unknown) {
  if (game === "op") {
    const parsed = onePieceSetResponseSchema.parse(raw);
    return {
      setName: parsed.set.name,
      rawCount: parsed.data.length,
      cards: toCards(parsed.data.map((card) => normalizeOnePieceCard(card, parsed.set.name))),
    };
  }
  const parsed = setRosterResponseSchema.parse(raw);
  return { setName: parsed.set.name, rawCount: parsed.cards.length, cards: toCards(parsed.cards) };
}

/**
 * Where PokéWallet serves a card's image. The prefixed games use
 * `/{game}/images/{id}` (one size); One Piece serves images by card number.
 */
export function pokewalletImagePath(game: TcgGameCode, card: PokewalletCard): string | null {
  if (game === "op") {
    const number = card.card_info.card_number;
    return number && /^[A-Z0-9-]{3,20}$/i.test(number) ? `/images/${encodeURIComponent(number)}` : null;
  }
  return `/${game}/images/${card.id}`;
}

export const tcgSetRosterResponseSchema = z.object({
  setName: z.string().nullable(),
  cards: z.array(z.lazy(() => tcgCardSchema)).max(POKEWALLET_SET_PAGE_SIZE * POKEWALLET_SET_MAX_PAGES),
});

/** Lowest TCGplayer market price across finishes, in USD. */
export function getPokewalletMarketPrice(card: PokewalletCard): number | null {
  const prices = (card.tcgplayer?.prices ?? [])
    .map((price) => price.market_price)
    .filter((price): price is number => typeof price === "number" && Number.isFinite(price) && price >= 0);
  return prices.length > 0 ? Math.min(...prices) : null;
}

/** Storage path for a card's copied image in the public tcg-card-images bucket. */
export function tcgCardImagePath(game: TcgGameCode, id: string) {
  return `${game}/${id}.jpg`;
}

export function tcgCardToCacheRow(game: TcgGameCode, card: PokewalletCard, imageUrl: string | null) {
  const info = card.card_info;
  return {
    id: card.id,
    game,
    name: info.name,
    set_name: info.set_name,
    set_code: info.set_code,
    set_id: info.set_id,
    card_number: info.card_number,
    rarity: info.rarity,
    card_type: info.card_type,
    image_url: imageUrl,
    market_price: getPokewalletMarketPrice(card),
    raw_data: card,
    cached_at: new Date().toISOString(),
  };
}

export type TcgCardCacheRow = ReturnType<typeof tcgCardToCacheRow>;

/** The card shape clients see, from the cache or from the proxy. */
export const tcgCardSchema = z.object({
  id: z.string().regex(POKEWALLET_ID_PATTERN),
  game: tcgGameSchema,
  name: z.string().min(1),
  set_name: z.string().nullable(),
  set_code: z.string().nullable(),
  set_id: z.string().nullable(),
  card_number: z.string().nullable(),
  rarity: z.string().nullable(),
  card_type: z.string().nullable(),
  image_url: z.string().nullable(),
  market_price: z.coerce.number().nullable(),
});


export type TcgCard = z.infer<typeof tcgCardSchema>;

export const tcgSearchResponseSchema = z.object({
  cards: z.array(tcgCardSchema).max(100),
  page: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

export function cacheRowToTcgCard(row: TcgCardCacheRow): TcgCard {
  const { raw_data: _raw, cached_at: _cachedAt, ...card } = row;
  return card;
}

/** Columns item queries select from tcg_cards (`tcg_cards ( ${TCG_CARD_ITEM_COLUMNS} )`). */
export const TCG_CARD_ITEM_COLUMNS = "id, game, name, set_name, set_code, set_id, card_number, rarity, card_type, image_url, market_price";

export interface TcgCardItemRow {
  id: string;
  game: string;
  name: string;
  set_name: string | null;
  set_code: string | null;
  set_id?: string | null;
  card_number: string | null;
  rarity: string | null;
  card_type?: string | null;
  image_url: string | null;
  market_price?: number | string | null;
}

/**
 * Product-shaped view of a shared-pipeline card, matching what the item
 * queries build for Pokémon, Magic and Riftbound cards.
 */
export function tcgCardItemProduct(card: TcgCardItemRow, gameName: string) {
  return {
    ean: null,
    searchableTitle: card.name,
    searchableDescription: [
      card.set_name ?? card.set_code,
      card.card_number ? `#${card.card_number}` : null,
      card.rarity,
    ].filter(Boolean).join(" • "),
    searchableBrand: gameName,
    data: {
      category: "TCG",
      game: card.game,
      set_name: card.set_name,
      set_code: card.set_code,
      card_number: card.card_number,
      rarity: card.rarity,
      card_type: card.card_type ?? null,
      images: [card.image_url].filter(Boolean),
    },
  };
}
