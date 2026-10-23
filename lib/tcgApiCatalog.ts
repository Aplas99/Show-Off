import { z } from "zod";

import { TCG_GAME_CODES, type TcgGameCode } from "@/constants/tcgGames";

// TCG API (https://tcgapi.dev) responses for the shared card pipeline, and
// the tcg_cards cache rows built from them. TCG API data is TCGplayer's
// catalog: one row per printing, numeric ids, public TCGplayer CDN images.

/** TCG API card ids (numeric), stored as text in tcg_cards.id. */
export const TCG_CARD_ID_PATTERN = /^\d{1,12}$/;

/** TCG API set ids (numeric). */
export const TCG_SET_ID_PATTERN = /^\d{1,12}$/;

export const tcgGameSchema = z.enum(TCG_GAME_CODES);

/** Results per search page; a request costs the same at any size. */
export const TCG_API_PAGE_SIZE = 100;
/** Cards per set-roster page and the most pages fetched (each spends a request). */
export const TCG_API_SET_PAGE_SIZE = 100;
export const TCG_API_SET_MAX_PAGES = 10;
/** Pages of a game's set list fetched when refreshing tcg_sets (public, no quota). */
export const TCG_API_SET_LIST_MAX_PAGES = 10;

// Vendor fields are loosely typed (ids and numbers can be numeric or text).
const looseText = z.union([z.string(), z.number()]).nullish()
  .transform((value) => (value == null || String(value).trim() === "" ? null : String(value).trim()));
const numericId = z.union([z.number().int().positive(), z.string().regex(/^\d{1,12}$/)]).transform(String);
const money = z.union([z.number(), z.string()]).nullish()
  .transform((value) => {
    const parsed = value == null || value === "" ? NaN : Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  });

export const tcgApiCardSchema = z.object({
  id: numericId,
  name: z.string().trim().min(1).max(300),
  number: looseText,
  rarity: looseText,
  card_type: looseText,
  image_url: z.string().nullish(),
  tcgplayer_id: z.number().int().positive().nullish(),
  product_type: z.string().nullish(),
  set_id: z.union([z.number().int().positive(), z.string().regex(/^\d{1,12}$/)]).nullish()
    .transform((value) => (value == null ? null : String(value))),
  set_name: looseText,
  game_slug: z.string().nullish(),
  printing: z.string().nullish(),
  market_price: money,
}).passthrough();

export type TcgApiCard = z.infer<typeof tcgApiCardSchema>;

/** One card with every printing TCG API returned for it. */
export interface TcgApiCardPrintings {
  card: TcgApiCard;
  printings: { printing: string | null; market_price: number | null }[];
}

const pageMetaSchema = z.object({
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  per_page: z.number().int().positive(),
  has_more: z.boolean(),
}).passthrough();

const cardPageSchema = z.object({
  data: z.array(z.unknown()).max(200),
  meta: pageMetaSchema,
}).passthrough();

/**
 * Valid card rows for one game: sealed products, other games' rows and
 * malformed rows are dropped, and printings of one card are merged.
 */
function toCards(slug: string, rows: unknown[]): TcgApiCardPrintings[] {
  const cards = new Map<string, TcgApiCardPrintings>();
  for (const row of rows) {
    const parsed = tcgApiCardSchema.safeParse(row);
    if (!parsed.success) continue;
    const card = parsed.data;
    if (card.product_type && card.product_type !== "Cards") continue;
    if (card.game_slug && card.game_slug !== slug) continue;
    const printing = { printing: card.printing ?? null, market_price: card.market_price };
    const existing = cards.get(card.id);
    if (existing) existing.printings.push(printing);
    else cards.set(card.id, { card, printings: [printing] });
  }
  return [...cards.values()];
}

/** Cards from a `/v1/search` page. */
export function parseTcgApiSearch(slug: string, raw: unknown) {
  const parsed = cardPageSchema.parse(raw);
  const { meta } = parsed;
  return {
    cards: toCards(slug, parsed.data),
    page: meta.page,
    total: meta.total,
    totalPages: Math.ceil(meta.total / meta.per_page),
  };
}

/** One page of `/v1/sets/{id}/cards`. */
export function parseTcgApiSetPage(slug: string, raw: unknown) {
  const parsed = cardPageSchema.parse(raw);
  return { cards: toCards(slug, parsed.data), rawCount: parsed.data.length, hasMore: parsed.meta.has_more };
}

const tcgApiSetSchema = z.object({
  id: numericId,
  name: z.string().trim().min(1).max(300),
  abbreviation: looseText,
  card_count: z.number().int().nonnegative().nullish(),
  release_date: z.string().nullish(),
}).passthrough();

/** One page of `/v1/games/{slug}/sets`, as tcg_sets rows. */
export function parseTcgApiSetList(game: TcgGameCode, raw: unknown) {
  const parsed = z.object({ data: z.array(z.unknown()).max(200), meta: pageMetaSchema }).parse(raw);
  const cachedAt = new Date().toISOString();
  const sets = parsed.data.flatMap((row) => {
    const set = tcgApiSetSchema.safeParse(row);
    if (!set.success) return [];
    return [{
      game,
      id: set.data.id,
      name: set.data.name,
      abbreviation: set.data.abbreviation,
      card_count: set.data.card_count ?? null,
      release_date: set.data.release_date?.slice(0, 10) ?? null,
      cached_at: cachedAt,
    }];
  });
  return { sets, hasMore: parsed.meta.has_more };
}

export type TcgSetRow = ReturnType<typeof parseTcgApiSetList>["sets"][number];

export const tcgSetRosterResponseSchema = z.object({
  setName: z.string().nullable(),
  cards: z.array(z.lazy(() => tcgCardSchema)).max(TCG_API_SET_PAGE_SIZE * TCG_API_SET_MAX_PAGES),
});

// The finish a collector most likely owns, as in lib/cardPricing.ts.
const PRINTING_PREFERENCE = ["Normal", "Unlimited", "1st Edition", "Holofoil", "Foil", "Reverse Holofoil"];

/** One market price for a card: the preferred printing, else the lowest priced one. */
export function getTcgApiMarketPrice(printings: TcgApiCardPrintings["printings"]): number | null {
  for (const printing of PRINTING_PREFERENCE) {
    const match = printings.find((entry) => entry.printing === printing && entry.market_price != null);
    if (match) return match.market_price;
  }
  const priced = printings.map((entry) => entry.market_price).filter((price): price is number => price != null);
  return priced.length > 0 ? Math.min(...priced) : null;
}

/**
 * The card image: TCG API's TCGplayer CDN URL, or one built from the
 * TCGplayer product id. Only https TCGplayer hosts are kept.
 */
export function tcgApiImageUrl(card: TcgApiCard): string | null {
  if (card.image_url) {
    try {
      const url = new URL(card.image_url);
      if (url.protocol === "https:" && !url.username && !url.password
        && (url.hostname === "tcgplayer.com" || url.hostname.endsWith(".tcgplayer.com"))) {
        return url.toString();
      }
    } catch {
      // Fall through to the product id.
    }
  }
  return card.tcgplayer_id ? `https://tcgplayer-cdn.tcgplayer.com/product/${card.tcgplayer_id}_in_1000x1000.jpg` : null;
}

/**
 * Set code for display and search, from the printed number's prefix:
 * `OP01-003` → `OP01`, `LOB-EN005` → `LOB`, `EB-01-012` → `EB-01`.
 */
export function setCodeFromNumber(cardNumber: string | null | undefined): string | null {
  const match = cardNumber?.toUpperCase().match(/^([A-Z0-9]+(?:-\d{2})?)-[A-Z]{0,2}\d{1,4}[A-Z]?$/);
  return match ? match[1] : null;
}

/**
 * A cache row for tcg_cards. `set` fills the set id/code when the card row
 * lacks them (search results carry only the set name).
 */
export function tcgCardToCacheRow(
  game: TcgGameCode,
  { card, printings }: TcgApiCardPrintings,
  set: { id: string; name: string | null; abbreviation: string | null } | null = null,
) {
  return {
    id: card.id,
    game,
    name: card.name,
    set_name: card.set_name ?? set?.name ?? null,
    set_code: set?.abbreviation ?? setCodeFromNumber(card.number),
    set_id: card.set_id ?? set?.id ?? null,
    card_number: card.number,
    rarity: card.rarity,
    card_type: card.card_type,
    image_url: tcgApiImageUrl(card),
    market_price: getTcgApiMarketPrice(printings),
    raw_data: { ...card, printings },
    cached_at: new Date().toISOString(),
  };
}

export type TcgCardCacheRow = ReturnType<typeof tcgCardToCacheRow>;

/** The card shape clients see, from the cache or from the proxy. */
export const tcgCardSchema = z.object({
  id: z.string().regex(TCG_CARD_ID_PATTERN),
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
  cards: z.array(tcgCardSchema).max(200),
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
