import { supabase } from "@/lib/supabase";
import { pokemonTcgCardSchema } from "@/lib/pokemonCatalog";
import {
  searchPokemonCardsCacheFirst,
  type PokemonTcgCard,
} from "./index";
import { searchTcgTrackingPokemonCards } from "./tcgTracking";
import { cardScanDebug, summarizePokemonCard } from "./cardScanDebug";

export interface PokemonSourceSearchInput {
  name: string;
  collection?: string;
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

function normalizeCollection(value: string) {
  return normalize(value.replace(/^[a-z0-9]+\s*:\s*/i, ""));
}

function cardKey(card: PokemonTcgCard) {
  return [
    normalize(card.name),
    normalizeCollection(card.set.name),
    normalize(card.number).replace(/^0+(?=\d)/, ""),
  ].join("|");
}

/**
 * Search for Pokémon cards across the supported text-search providers.
 *
 * Provider order:
 * 1. Pokémon TCG API via `searchPokemonCardsCacheFirst`, which checks the
 *    Supabase cache before making an external API request.
 * 2. TCGTracking, only as a manual fallback when the user supplied a
 *    collection/set and the primary source did not return enough results.
 *
 * This is the manual/fallback search path used by `ManualCardSearchModal`;
 * it is intentionally NOT used for scan recognition. The scan pipeline should
 * stay deterministic and text-identifier based through `searchCardsByIdentifiers`
 * in `recognition.ts`.
 *
 * @param input.name Card name or partial card name entered by the user.
 * @param input.collection Optional set/collection name or code. Supplying this
 * enables TCGTracking fallback.
 * @param input.number Optional collector/card number, including promo numbers.
 * @param input.limit Maximum merged results returned across providers.
 * @returns Deduplicated Pokémon card records suitable for user confirmation.
 *
 * For the scan-pipeline search, see `searchCardsByIdentifiers` in
 * `recognition.ts`, which only uses the Pokémon TCG API + Supabase cache.
 */
export async function searchPokemonCardSources(
  input: PokemonSourceSearchInput,
) {
  const name = input.name.replace(/\s+/g, " ").trim();
  const collection = input.collection?.replace(/\s+/g, " ").trim();
  if (!name) return [];
  cardScanDebug("manual-search.started", {
    name,
    collection: collection ?? null,
    number: input.number?.trim() || null,
  });

  let primary: PokemonTcgCard[] = [];
  let primaryError: unknown;
  try {
    const result = await searchPokemonCardsCacheFirst({
      query: name,
      collection,
      number: input.number,
      pageSize: Math.min(input.limit ?? 50, 100),
    });
    primary = result.cards;
  } catch (error) {
    primaryError = error;
    console.warn(
      "[Pokémon TCG] Primary provider search failed:",
      error instanceof Error ? error.message : error,
    );
  }

  let fallback: PokemonTcgCard[] = [];
  if (collection && primary.length < (input.limit ?? 50)) {
    try {
      fallback = await searchTcgTrackingPokemonCards({
        name,
        collection,
        number: input.number,
        limit: input.limit,
      });
    } catch (error) {
      console.warn(
        "[Pokémon TCG] TCGTracking search failed:",
        error instanceof Error ? error.message : error,
      );
    }
  }

  const merged = new Map<string, PokemonTcgCard>();
  fallback.forEach((card) => merged.set(cardKey(card), card));
  primary.forEach((card) => merged.set(cardKey(card), card));
  const cards = [...merged.values()].slice(0, input.limit ?? 50);
  if (cards.length === 0 && primaryError) throw primaryError;
  cardScanDebug("manual-search.completed", {
    primaryCount: primary.length,
    fallbackCount: fallback.length,
    resultCount: cards.length,
    cards: cards.map(summarizePokemonCard),
  });
  return cards;
}

export async function createManualPokemonCard(input: {
  name: string;
  collection: string;
  number?: string;
}) {
  const name = input.name.replace(/\s+/g, " ").trim();
  const collection = input.collection.replace(/\s+/g, " ").trim();
  if (!name || !collection) {
    throw new Error("Card name and collection are required");
  }

  const { data, error } = await supabase.rpc("create_manual_pokemon_card", { p_name: name, p_collection: collection, p_number: input.number?.trim() || "unknown" });
  if (error) throw new Error(error.message);
  const card = pokemonTcgCardSchema.parse(data);
  cardScanDebug("manual-card.created", {
    card: summarizePokemonCard(card),
  });
  return card;
}
