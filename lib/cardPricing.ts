import { z } from "zod";

import { TCG_GAME_CODES } from "@/constants/tcgGames";
import { TCG_CARD_ID_PATTERN } from "@/lib/tcgApiCatalog";
import { RIFTCODEX_ID_PATTERN } from "@/lib/riftboundCatalog";

// Daily TCGplayer prices from TCGTracking (openapi.tcgtracking.com) for the
// price-history graph. TCGTracking has no history endpoint, so each day's
// price is cached as one price_history row (see the migration
// 20261026100000_tcgtracking_price_history.sql).

export const priceGameSchema = z.enum(["pokemon", "magic", "riftbound", ...TCG_GAME_CODES]);
export type PriceGame = z.infer<typeof priceGameSchema>;

/** Card ids per game, matching the item link columns. */
export function isValidPriceCardId(game: PriceGame, cardId: string): boolean {
  if (game === "pokemon") return /^[a-zA-Z0-9_.:-]{1,100}$/.test(cardId);
  if (game === "magic") return /^[0-9a-f-]{36}$/.test(cardId);
  if (game === "riftbound") return RIFTCODEX_ID_PATTERN.test(cardId);
  return TCG_CARD_ID_PATTERN.test(cardId);
}

/**
 * TCGplayer product id from a product URL, including links that carry it in
 * a redirect parameter (`...?u=https://tcgplayer.com/product/42382`).
 */
export function tcgplayerIdFromUrl(value: string | null | undefined): number | null {
  if (!value) return null;
  let text = value;
  try {
    text = decodeURIComponent(value);
  } catch {
    // Malformed escapes: match the raw text.
  }
  const match = text.match(/tcgplayer\.com\/product\/(\d{1,12})(?:\D|$)/i);
  const id = match ? Number(match[1]) : NaN;
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

const money = z.union([z.string(), z.number()]).nullish()
  .transform((value) => {
    const parsed = value == null || value === "" ? NaN : Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  });

export const tcgTrackingProductSchema = z.object({
  product: z.object({ product_id: z.number().int().positive() }).passthrough(),
  prices: z.object({
    tcgplayer: z.array(z.object({
      sub_type_name: z.string().nullish(),
      market_price: money,
      low_price: money,
    }).passthrough()).max(50).nullish(),
  }).passthrough().nullish(),
}).passthrough();

// The finish a collector most likely owns, mirroring
// extract_pokemon_market_price's normal → holofoil → reverse order.
const SUBTYPE_PREFERENCE = ["Normal", "Holofoil", "Unlimited", "1st Edition", "Foil", "Reverse Holofoil"];

/** One market price for a product: the preferred finish, else the lowest priced finish. */
export function pickTcgTrackingMarketPrice(raw: unknown): number | null {
  const prices = tcgTrackingProductSchema.parse(raw).prices?.tcgplayer ?? [];
  for (const subtype of SUBTYPE_PREFERENCE) {
    const match = prices.find((price) => price.sub_type_name === subtype && price.market_price != null);
    if (match) return match.market_price;
  }
  const priced = prices.map((price) => price.market_price).filter((price): price is number => price != null);
  return priced.length > 0 ? Math.min(...priced) : null;
}

/** Only pokemontcg.io's own price redirect is followed to find a Pokémon product id. */
export function isPokemonPriceRedirect(value: string | null | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "prices.pokemontcg.io" && url.pathname.startsWith("/tcgplayer/");
  } catch {
    return false;
  }
}
