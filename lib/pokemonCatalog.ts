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

