import { z } from "zod";

const pokemonPriceSchema = z
  .object({
    low: z.number().nullable().optional(),
    mid: z.number().nullable().optional(),
    high: z.number().nullable().optional(),
    market: z.number().nullable().optional(),
    directLow: z.number().nullable().optional(),
  })
  .passthrough();

const pokemonMarketplaceSchema = z
  .object({
    url: z.string().optional(),
    updatedAt: z.string().optional(),
    prices: z.record(z.string(), pokemonPriceSchema).optional(),
  })
  .passthrough();

const pokemonCardmarketSchema = z
  .object({
    url: z.string().optional(),
    updatedAt: z.string().optional(),
    prices: z.record(z.string(), z.number().nullable()).optional(),
  })
  .passthrough();

export const pokemonTcgCardSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    supertype: z.string(),
    subtypes: z.array(z.string()).optional().default([]),
    hp: z.string().optional(),
    types: z.array(z.string()).optional().default([]),
    set: z
      .object({
        id: z.string(),
        name: z.string(),
        series: z.string().optional(),
        printedTotal: z.number().optional(),
        total: z.number().optional(),
        ptcgoCode: z.string().optional(),
        releaseDate: z.string().optional(),
      })
      .passthrough(),
    number: z.string(),
    artist: z.string().optional(),
    rarity: z.string().optional(),
    regulationMark: z.string().optional(),
    nationalPokedexNumbers: z.array(z.number()).optional().default([]),
    images: z.object({
      small: z.string(),
      large: z.string(),
    }),
    tcgplayer: pokemonMarketplaceSchema.optional(),
    cardmarket: pokemonCardmarketSchema.optional(),
  })
  .passthrough();

export const pokemonSearchResponseSchema = z.object({
  data: z.array(pokemonTcgCardSchema),
  page: z.number(),
  pageSize: z.number(),
  count: z.number(),
  totalCount: z.number(),
});

export const pokemonCardResponseSchema = z.object({
  data: pokemonTcgCardSchema,
});

export type PokemonTcgCard = z.infer<typeof pokemonTcgCardSchema>;

/** One entry of GET /v2/sets. Promo codes are hyphenated (e.g. "PR-SW"). */
export const pokemonTcgSetSchema = z
  .object({
    id: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),
    name: z.string().trim().min(1).max(200),
    series: z.string().max(200).optional(),
    printedTotal: z.number().int().min(0).max(2000).optional(),
    total: z.number().int().min(0).max(2000).optional(),
    ptcgoCode: z.string().regex(/^[A-Za-z0-9-]{1,12}$/).optional(),
    releaseDate: z.string().optional(),
  })
  .passthrough();

export const pokemonSetListResponseSchema = z.object({
  data: z.array(z.unknown()).max(250),
  page: z.number(),
  pageSize: z.number(),
  count: z.number(),
  totalCount: z.number(),
});

export type PokemonTcgSetRecord = z.infer<typeof pokemonTcgSetSchema>;

/**
 * Validate each set on its own: one odd vendor entry (e.g. a code with an
 * unexpected character) is dropped instead of blocking the whole refresh.
 */
export function parsePokemonSetList(data: unknown): PokemonTcgSetRecord[] {
  const response = pokemonSetListResponseSchema.parse(data);
  // A single page must hold every set; anything larger means the request
  // shape changed and a partial list would silently hide sets.
  if (response.page !== 1 || response.totalCount > response.data.length) {
    throw new Error("Incomplete Pokemon set list");
  }
  return response.data.flatMap((entry) => {
    const parsed = pokemonTcgSetSchema.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  });
}

export function pokemonSetToCacheRow(set: PokemonTcgSetRecord) {
  const releaseDate = set.releaseDate && /^\d{4}\/\d{2}\/\d{2}$/.test(set.releaseDate)
    ? set.releaseDate.replaceAll("/", "-")
    : null;
  return {
    id: set.id,
    name: set.name,
    series: set.series ?? null,
    ptcgo_code: set.ptcgoCode ?? null,
    printed_total: set.printedTotal ?? null,
    total: set.total ?? null,
    release_date: releaseDate,
    refreshed_at: new Date().toISOString(),
  };
}

/** Fields the scanner uses to trust OCR'd set codes, totals and names. */
export interface PokemonTcgSetSummary {
  id: string;
  name: string;
  code: string | null;
  printedTotal: number | null;
}

export interface PokemonTcgSetRow {
  id: string;
  name: string;
  ptcgo_code: string | null;
  printed_total: number | null;
}

/**
 * Server sets win on conflicts (they carry corrections) and come first;
 * bundled sets missing from the server list are kept so a partial or empty
 * table never removes a set the app already knew about.
 */
export function mergePokemonTcgSets(
  serverRows: readonly PokemonTcgSetRow[],
  bundled: readonly PokemonTcgSetSummary[],
): PokemonTcgSetSummary[] {
  const merged = new Map<string, PokemonTcgSetSummary>();
  for (const row of serverRows) {
    merged.set(row.id, {
      id: row.id,
      name: row.name,
      code: row.ptcgo_code,
      printedTotal: row.printed_total,
    });
  }
  for (const set of bundled) {
    if (!merged.has(set.id)) merged.set(set.id, set);
  }
  return [...merged.values()];
}

export function pokemonCardToCacheRow(card: PokemonTcgCard) {
  return {
    id: card.id,
    name: card.name,
    supertype: card.supertype,
    subtypes: card.subtypes,
    hp: card.hp ?? null,
    types: card.types,
    set_id: card.set.id,
    set_name: card.set.name,
    set_series: card.set.series ?? null,
    set_printed_total: card.set.printedTotal ?? null,
    set_total: card.set.total ?? null,
    set_ptcgo_code: card.set.ptcgoCode ?? null,
    set_release_date: card.set.releaseDate?.replaceAll("/", "-") ?? null,
    number: card.number,
    artist: card.artist ?? null,
    rarity: card.rarity ?? null,
    regulation_mark: card.regulationMark ?? null,
    national_pokedex_numbers: card.nationalPokedexNumbers,
    image_small: card.images.small,
    image_large: card.images.large,
    tcgplayer: card.tcgplayer ?? null,
    cardmarket: card.cardmarket ?? null,
    raw_data: card,
    catalog_trusted: true,
    cached_at: new Date().toISOString(),
  };
}

