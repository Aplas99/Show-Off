import { z } from "zod";

import { isValidPriceCardId, priceGameSchema } from "@/lib/cardPricing";
import { POKEWALLET_SET_ID_PATTERN, isValidPokewalletSetId, tcgGameSchema } from "@/lib/pokewalletCatalog";
import { RIFTBOUND_ID_PATTERN, RIFTCODEX_ID_PATTERN } from "@/lib/riftboundCatalog";

const filterSchema = z.string().trim().max(160);

export const catalogRequestSchema = z.discriminatedUnion("provider", [
  z.object({ provider: z.literal("tcgtracking"), path: z.string().min(1).max(1000) }).strict(),
  z.object({
    provider: z.literal("upc"),
    query: z.string().trim().min(1).max(200),
  }).strict(),
  z.object({
    provider: z.literal("barcodenest"),
    // BarcodeNest accepts EAN-8, UPC-A, EAN-13, and GTIN-14 digit strings.
    code: z.string().trim().regex(/^(\d{8}|\d{12,14})$/),
  }).strict(),
  z.object({
    provider: z.literal("pokemon"),
    path: z.string().min(1).max(2000),
  }).strict(),
  z.object({
    provider: z.literal("riftbound"),
    path: z.string().min(1).max(1000),
  }).strict(),
  z.object({
    provider: z.literal("pokewallet"),
    game: tcgGameSchema,
    // Exactly one of: a search query, or a set id for a full set roster.
    // PokéWallet rejects queries outside 2-100 characters.
    query: z.string().trim().min(2).max(100).optional(),
    setId: z.string().trim().regex(POKEWALLET_SET_ID_PATTERN).optional(),
    page: z.number().int().min(1).max(50).default(1),
  }).strict(),
  z.object({
    // Today's TCGplayer price for one cached card (TCGTracking), for price history.
    provider: z.literal("price"),
    game: priceGameSchema,
    cardId: z.string().trim().min(1).max(100),
  }).strict(),
  z.object({
    provider: z.literal("magic"),
    path: z.string().min(1).max(2000),
  }).strict(),
  z.object({
    provider: z.literal("barcode"),
    query: z.string().trim().min(1).max(200),
    page: z.number().int().min(1).max(100).default(1),
    brand: filterSchema.optional(),
    manufacturer: filterSchema.optional(),
    category: filterSchema.optional(),
  }).strict(),
]);

export type CatalogRequest = z.input<typeof catalogRequestSchema>;

const pokemonParameters = z.object({
  q: z.string().trim().min(1).max(1000),
  page: z.coerce.number().int().min(1).max(100).default(1),
  pageSize: z.coerce.number().int().min(1).max(250).default(20),
  orderBy: z.enum(["number", "-set.releaseDate,number"])
    .default("-set.releaseDate,number"),
}).strict();

const riftboundPaging = {
  page: z.coerce.number().int().min(1).max(100).default(1),
  size: z.coerce.number().int().min(1).max(100).default(50),
};
const riftboundSetId = z.string().trim().regex(/^[a-zA-Z0-9]{2,10}$/);

/** Riftcodex reads: name lookup, set listing, and exact card IDs only. */
function canonicalRiftboundPath(path: string) {
  const id = path.match(/^\/cards\/riftbound\/([^/?#]+)$/)?.[1];
  if (id !== undefined) {
    if (!RIFTBOUND_ID_PATTERN.test(id)) throw new Error("Invalid Riftbound ID");
    return `/cards/riftbound/${id.toLowerCase()}`;
  }
  const riftcodexId = path.match(/^\/cards\/([^/?#]+)$/)?.[1];
  if (riftcodexId !== undefined && riftcodexId !== "name") {
    if (!RIFTCODEX_ID_PATTERN.test(riftcodexId)) throw new Error("Invalid Riftcodex ID");
    return path;
  }
  const prefix = path.startsWith("/cards/name?") ? "/cards/name?" : "/cards?";
  if (!path.startsWith(prefix)) throw new Error("Unsupported Riftbound catalog request.");
  const entries = [...new URLSearchParams(path.slice(prefix.length)).entries()];
  if (new Set(entries.map(([key]) => key)).size !== entries.length) {
    throw new Error("Duplicate catalog parameters are not supported.");
  }
  const values = Object.fromEntries(entries);
  const params = prefix === "/cards/name?"
    ? z.object({
        fuzzy: z.string().trim().min(1).max(200).optional(),
        exact: z.string().trim().min(1).max(200).optional(),
        set_id: riftboundSetId.optional(),
        ...riftboundPaging,
      }).strict().refine((value) => !!value.fuzzy !== !!value.exact, "Use exactly one of fuzzy or exact").parse(values)
    // Set listings are the only unfiltered read; always sorted by collector number.
    : z.object({ set_id: riftboundSetId, sort: z.literal("collector_number").default("collector_number"), ...riftboundPaging })
      .strict().parse(values);
  return prefix + new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)]),
  ).toString();
}

/** Canonicalize a limited set of read operations; never accept a vendor URL. */
export function validateCatalogRequest(input: unknown) {
  const request = catalogRequestSchema.parse(input);
  if (request.provider === "barcode" || request.provider === "upc" || request.provider === "barcodenest") return request;
  if (request.provider === "price") {
    if (!isValidPriceCardId(request.game, request.cardId)) throw new Error("Invalid card id");
    return request;
  }
  if (request.provider === "pokewallet") {
    if (!request.query === !request.setId) throw new Error("Use exactly one of query or setId");
    if (request.setId && !isValidPokewalletSetId(request.game, request.setId)) throw new Error("Invalid set id");
    return request;
  }

  if (request.provider === "tcgtracking") {
    if (/^\/3\/sets\/[1-9][0-9]{0,9}\/cards$/.test(request.path)) return request;
    if (!request.path.startsWith("/3/search?")) throw new Error("Unsupported tracking request");
    const entries = [...new URLSearchParams(request.path.slice(10)).entries()];
    const params = z.object({ q: z.string().trim().min(1).max(160) }).strict().parse(Object.fromEntries(entries));
    if (entries.length !== 1) throw new Error("Invalid tracking query");
    return { ...request, path: `/3/search?${new URLSearchParams(params)}` };
  }

  if (request.provider === "riftbound") return { ...request, path: canonicalRiftboundPath(request.path) };

  if (request.provider === "magic") {
    const prefix = request.path.startsWith("/cards/search?") ? "/cards/search?" : "/cards/named?";
    if (!request.path.startsWith(prefix)) throw new Error("Unsupported Magic catalog request.");
    const entries = [...new URLSearchParams(request.path.slice(prefix.length)).entries()];
    if (new Set(entries.map(([key]) => key)).size !== entries.length) {
      throw new Error("Duplicate catalog parameters are not supported.");
    }
    const values = Object.fromEntries(entries);
    const params = prefix === "/cards/search?"
      ? z.object({
          q: z.string().trim().min(1).max(1000),
          page: z.coerce.number().int().min(1).max(100).default(1),
        }).strict().parse(values)
      : z.object({ fuzzy: z.string().trim().min(1).max(200) }).strict().parse(values);
    return { ...request, path: prefix + new URLSearchParams(
      Object.entries(params).map(([key, value]) => [key, String(value)]),
    ).toString() };
  }

  // "/sets" is the whole set list; the proxy chooses its own page parameters.
  if (request.path === "/sets") return request;
  if (/^\/cards\/[a-zA-Z0-9_-]{1,100}$/.test(request.path) || /^\/sets\/[a-zA-Z0-9_-]{1,100}\/cards$/.test(request.path)) return request;
  if (!request.path.startsWith("/cards?")) {
    throw new Error("Unsupported Pokemon catalog request.");
  }

  const params = new URLSearchParams(request.path.slice("/cards?".length));
  const entries = [...params.entries()];
  if (new Set(entries.map(([key]) => key)).size !== entries.length) {
    throw new Error("Duplicate catalog parameters are not supported.");
  }
  const parsed = pokemonParameters.parse(Object.fromEntries(entries));
  const canonical = new URLSearchParams({
    q: parsed.q,
    page: String(parsed.page),
    pageSize: String(parsed.pageSize),
    orderBy: parsed.orderBy,
  });
  return { ...request, path: `/cards?${canonical.toString()}` };
}
