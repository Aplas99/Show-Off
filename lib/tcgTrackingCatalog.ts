import { z } from "zod";
import type { PokemonTcgCard } from "@/lib/pokemonCatalog";

const setSchema = z.object({
  id: z.number(),
  name: z.string(),
  abbreviation: z.string().nullable().optional(),
  published_on: z.string().nullable().optional(),
});

export const setSearchSchema = z.object({
  sets: z.array(setSchema),
});

const productSchema = z.object({
  id: z.number(),
  name: z.string(),
  clean_name: z.string().optional(),
  number: z.string().nullable().optional(),
  rarity: z.string().nullable().optional(),
  image_url: z.string().nullable().optional(),
  tcgplayer_url: z.string().nullable().optional(),
  cardmarket_id: z.number().nullable().optional(),
  cardtrader_id: z.number().nullable().optional(),
  cardtrader: z
    .array(
      z.object({
        name: z.string().optional(),
        collector_number: z.string().nullable().optional(),
      }).passthrough(),
    )
    .optional(),
}).passthrough();

export const cardsSchema = z.object({
  set_id: z.number(),
  set_name: z.string(),
  set_abbr: z.string().nullable().optional(),
  set_released: z.string().nullable().optional(),
  products: z.array(productSchema),
});

function collectorNumber(value?: string | null) {
  return value?.split(/[\/.]/, 1)[0].replace(/^0+(?=\d)/, "") || null;
}

export function mapProduct(
  product: z.infer<typeof productSchema>,
  set: z.infer<typeof cardsSchema>,
): PokemonTcgCard {
  const cardTrader = product.cardtrader?.[0];
  const number = collectorNumber(
    cardTrader?.collector_number ?? product.number,
  ) ?? "unknown";
  const printedTotalMatch = product.number?.match(/[\/.](\d{1,4})/);
  const image = product.image_url ?? "";
  const name =
    cardTrader?.name?.trim() ||
    product.name.replace(/\s+-\s+\d{1,4}[a-z]?\s*[\/.]\s*\d{1,4}.*$/i, "").trim();

  return {
    id: `tcgtracking:${product.id}`,
    name,
    supertype: "Pokémon",
    subtypes: [],
    types: [],
    set: {
      id: `tcgtracking:${set.set_id}`,
      name: set.set_name,
      series: set.set_abbr ?? undefined,
      printedTotal: printedTotalMatch ? Number(printedTotalMatch[1]) : undefined,
      releaseDate: set.set_released?.replaceAll("-", "/") ?? undefined,
    },
    number,
    rarity: product.rarity ?? undefined,
    nationalPokedexNumbers: [],
    images: { small: image, large: image },
    tcgplayer: product.tcgplayer_url
      ? { url: product.tcgplayer_url }
      : undefined,
    source: "tcgtracking",
    externalIds: {
      tcgtrackingProductId: product.id,
      cardmarketId: product.cardmarket_id ?? undefined,
      cardtraderId: product.cardtrader_id ?? undefined,
    },
  };
}


export function parseTrackingCards(input: unknown) {
  const set = cardsSchema.parse(input);
  return set.products.map((product) => mapProduct(product, set));
}
