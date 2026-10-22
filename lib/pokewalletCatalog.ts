import { z } from "zod";

import { TCG_GAME_CODES, type TcgGameCode } from "@/constants/tcgGames";

/** `pk_` + hex for TCGplayer-backed cards, bare hex for CardMarket-only ones. */
export const POKEWALLET_ID_PATTERN = /^(pk_)?[a-f0-9]{16,160}$/;

export const tcgGameSchema = z.enum(TCG_GAME_CODES);

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

const searchResponseSchema = z.object({
  results: z.array(z.unknown()).max(100),
  pagination: z.object({
    page: z.number().int().positive(),
    total: z.number().int().nonnegative(),
    total_pages: z.number().int().nonnegative(),
  }).passthrough(),
});

/** Cards from a `/{game}/search` page; sealed products and malformed rows are dropped. */
export function parsePokewalletSearch(raw: unknown) {
  const parsed = searchResponseSchema.parse(raw);
  const cards = parsed.results.flatMap((result) => {
    const card = pokewalletCardSchema.safeParse(result);
    return card.success && card.data.card_info.product_type !== "sealed" ? [card.data] : [];
  });
  return { cards, page: parsed.pagination.page, total: parsed.pagination.total, totalPages: parsed.pagination.total_pages };
}

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
export const TCG_CARD_ITEM_COLUMNS = "id, game, name, set_name, set_code, card_number, rarity, card_type, image_url, market_price";

export interface TcgCardItemRow {
  id: string;
  game: string;
  name: string;
  set_name: string | null;
  set_code: string | null;
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
