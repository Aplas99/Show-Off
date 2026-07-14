import { z } from "zod";
import { getTcgProductDetail, scanTcgCardImage } from "@/api/tcg/catalog";
import type { PokemonTcgCard } from "./index";

const TCG_TRACKING_URL = "https://openapi.tcgtracking.com/v1";
const POKEMON_CATEGORY_ID = 3;

// A last-resort fallback (see scanPokemonCardViaTcgTracking below) — its
// confidence scale isn't comparable to the text-OCR pipeline's 0-1
// score, so every result is given a fixed score safely below
// MIN_REVIEW_SCORE (0.6 in TcgCreateScreen.tsx), forcing manual
// confirmation via the candidate picker rather than risking an
// incorrect auto-accept.
const IMAGE_SCAN_FALLBACK_SCORE = 0.5;

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

/** Maps the generic multi-game TcgCard shape (api/tcg/catalog.ts) into PokemonTcgCard. */
function tcgCardToPokemonCard(card: {
  productId: number;
  name: string;
  number: string | null;
  rarity: string | null;
  setId: number;
  setName: string;
  imageUrl: string | null;
  tcgplayerUrl: string | null;
}): PokemonTcgCard {
  return {
    id: `tcgtracking:${card.productId}`,
    name: card.name,
    supertype: "Pokémon",
    subtypes: [],
    types: [],
    set: {
      id: `tcgtracking:${card.setId}`,
      name: card.setName || "Unknown set",
    },
    number: collectorNumber(card.number) ?? "unknown",
    rarity: card.rarity ?? undefined,
    nationalPokedexNumbers: [],
    images: { small: card.imageUrl ?? "", large: card.imageUrl ?? "" },
    tcgplayer: card.tcgplayerUrl ? { url: card.tcgplayerUrl } : undefined,
    source: "tcgtracking",
    externalIds: { tcgtrackingProductId: card.productId },
  };
}

/**
 * Last-resort image-based fallback for scans the text-OCR pipeline
 * (on-device ML Kit, then the PaddleOCR server pass) couldn't resolve.
 * Uploads the captured photo to TCGTracking's /v1/scan endpoint scoped
 * to Pokemon and hydrates the top candidates. Curator-only — gated by
 * the caller the same way the PaddleOCR fallback already is.
 */
export async function scanPokemonCardViaTcgTracking(
  imageUri: string,
  limit = 3,
): Promise<{ card: PokemonTcgCard; score: number }[]> {
  const results = await scanTcgCardImage(POKEMON_CATEGORY_ID, imageUri);
  const top = results.slice(0, limit);

  const hydrated = await Promise.all(
    top.map(async (result) => {
      try {
        const detail = await getTcgProductDetail(
          POKEMON_CATEGORY_ID,
          result.productId,
          "Pokemon",
        );
        return {
          card: tcgCardToPokemonCard(detail),
          score: IMAGE_SCAN_FALLBACK_SCORE,
        };
      } catch {
        return null;
      }
    }),
  );

  return hydrated.filter(
    (entry): entry is { card: PokemonTcgCard; score: number } => entry !== null,
  );
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
