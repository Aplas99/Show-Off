import { z } from "zod";
import type { PokemonTcgCard } from "./index";

const TCG_TRACKING_URL = "https://openapi.tcgtracking.com/v1";
const POKEMON_CATEGORY_ID = 3;

const setSchema = z.object({
  id: z.number(),
  name: z.string(),
  abbreviation: z.string().nullable().optional(),
  published_on: z.string().nullable().optional(),
});

const setSearchSchema = z.object({
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

const cardsSchema = z.object({
  set_id: z.number(),
  set_name: z.string(),
  set_abbr: z.string().nullable().optional(),
  set_released: z.string().nullable().optional(),
  products: z.array(productSchema),
});

export interface TcgTrackingSearchInput {
  name: string;
  collection: string;
  number?: string;
  limit?: number;
}

function normalize(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[^a-z0-9]/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function collectorNumber(value?: string | null) {
  return value?.split(/[\/.]/, 1)[0].replace(/^0+(?=\d)/, "") || null;
}

async function fetchJson(path: string) {
  const response = await fetch(`${TCG_TRACKING_URL}${path}`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`TCGTracking API error: ${response.status}`);
  }
  return response.json();
}

function mapProduct(
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

export async function searchTcgTrackingPokemonCards(
  input: TcgTrackingSearchInput,
) {
  const name = normalize(input.name);
  const collection = input.collection.replace(/\s+/g, " ").trim();
  if (!name || !collection) return [];

  const setRaw = await fetchJson(
    `/${POKEMON_CATEGORY_ID}/search?q=${encodeURIComponent(collection)}`,
  );
  const sets = setSearchSchema.parse(setRaw).sets.slice(0, 5);
  const requestedNumber = collectorNumber(input.number);
  const results: PokemonTcgCard[] = [];

  for (const candidateSet of sets) {
    const raw = await fetchJson(
      `/${POKEMON_CATEGORY_ID}/sets/${candidateSet.id}/cards`,
    );
    const set = cardsSchema.parse(raw);
    for (const product of set.products) {
      const mapped = mapProduct(product, set);
      const mappedName = normalize(mapped.name);
      const nameMatches = mappedName.includes(name) || name.includes(mappedName);
      const numberMatches =
        !requestedNumber || collectorNumber(mapped.number) === requestedNumber;
      if (nameMatches && numberMatches) results.push(mapped);
      if (results.length >= (input.limit ?? 50)) return results;
    }
  }

  return results;
}
