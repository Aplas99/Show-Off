import { supabase } from "@/lib/supabase";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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

const pokemonSearchResponseSchema = z.object({
  data: z.array(pokemonTcgCardSchema),
  page: z.number(),
  pageSize: z.number(),
  count: z.number(),
  totalCount: z.number(),
});

const pokemonCardResponseSchema = z.object({
  data: pokemonTcgCardSchema,
});

export type PokemonTcgCard = z.infer<typeof pokemonTcgCardSchema>;

export interface PokemonCardSearchResult {
  cards: PokemonTcgCard[];
  page: number;
  pageSize: number;
  totalCount: number;
  source: "cache" | "api";
}

interface PokemonCardCacheRow {
  id: string;
  raw_data: unknown;
}

export interface SearchPokemonCardsInput {
  query: string;
  number?: string;
  collection?: string;
  printedTotal?: number;
  setCode?: string;
  page?: number;
  pageSize?: number;
}

export interface PokemonTcgDependencies {
  findCachedCards: (
    query: string,
    limit: number,
    offset: number,
  ) => Promise<PokemonTcgCard[]>;
  findCachedCardById: (id: string) => Promise<PokemonTcgCard | null>;
  fetchCards: (
    query: string,
    page: number,
    pageSize: number,
    number?: string,
    collection?: string,
    printedTotal?: number,
    setCode?: string,
  ) => Promise<Omit<PokemonCardSearchResult, "source">>;
  fetchCardById: (id: string) => Promise<PokemonTcgCard>;
  cacheCards: (cards: PokemonTcgCard[]) => Promise<void>;
}

const POKEMON_TCG_API_URL = "https://api.pokemontcg.io/v2";
const PokemonTcgAPIKey = process.env.EXPO_PUBLIC_POKE_KEY || "";

function parseCachedCard(row: PokemonCardCacheRow): PokemonTcgCard | null {
  const parsed = pokemonTcgCardSchema.safeParse(row.raw_data);
  return parsed.success ? parsed.data : null;
}

export function buildPokemonNameQuery(query: string) {
  const normalized = query.replace(/\s+/g, " ").trim();
  const escaped = normalized.replace(/([\\"])/g, "\\$1");
  return `name:"${escaped}"`;
}

export function buildPokemonCardQuery(
  query: string,
  number?: string,
  collection?: string,
  printedTotal?: number,
  setCode?: string,
) {
  const nameQuery = buildPokemonNameQuery(query);
  const normalizedNumber = number
    ?.split(/[\/.]/, 1)[0]
    .replace(/[^a-z0-9]/gi, "")
    .trim();
  const normalizedCollection = collection?.replace(/\s+/g, " ").trim();
  const escapedCollection = normalizedCollection?.replace(/([\\"])/g, "\\$1");
  const normalizedSetCode = setCode?.replace(/[^a-z0-9]/gi, "").trim();

  return [
    nameQuery,
    normalizedNumber ? `number:"${normalizedNumber}"` : null,
    escapedCollection ? `set.name:"${escapedCollection}"` : null,
    printedTotal ? `set.printedTotal:${printedTotal}` : null,
    normalizedSetCode ? `set.ptcgoCode:"${normalizedSetCode}"` : null,
  ]
    .filter(Boolean)
    .join(" ");
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
    cached_at: new Date().toISOString(),
  };
}

function pokemonHeaders() {
  const headers: Record<string, string> = {
    Accept: "application/json",
  };

  if (PokemonTcgAPIKey) {
    headers["X-Api-Key"] = PokemonTcgAPIKey;
  }

  return headers;
}

async function fetchPokemonApi(path: string) {
  const response = await fetch(`${POKEMON_TCG_API_URL}${path}`, {
    headers: pokemonHeaders(),
  });

  if (!response.ok) {
    throw new Error(`Pokémon TCG API error: ${response.status}`);
  }

  return response.json();
}

const defaultDependencies: PokemonTcgDependencies = {
  findCachedCards: async (query, limit, offset) => {
    const { data, error } = await supabase.rpc("search_pokemon_tcg_cards", {
      search_term: query,
      result_limit: limit,
      result_offset: offset,
    });

    if (error) {
      console.warn("[Pokémon TCG] Cache search unavailable:", error.message);
      return [];
    }

    return ((data ?? []) as PokemonCardCacheRow[])
      .map(parseCachedCard)
      .filter((card): card is PokemonTcgCard => card !== null);
  },
  findCachedCardById: async (id) => {
    const { data, error } = await supabase
      .from("pokemon_tcg_cards")
      .select("id, raw_data")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.warn("[Pokémon TCG] Cache lookup unavailable:", error.message);
      return null;
    }

    return data ? parseCachedCard(data as PokemonCardCacheRow) : null;
  },
  fetchCards: async (
    query,
    page,
    pageSize,
    number,
    collection,
    printedTotal,
    setCode,
  ) => {
    const params = new URLSearchParams({
      q: buildPokemonCardQuery(
        query,
        number,
        collection,
        printedTotal,
        setCode,
      ),
      page: String(page),
      pageSize: String(pageSize),
      orderBy: "-set.releaseDate,number",
    });
    const raw = await fetchPokemonApi(`/cards?${params.toString()}`);
    const parsed = pokemonSearchResponseSchema.parse(raw);

    return {
      cards: parsed.data,
      page: parsed.page,
      pageSize: parsed.pageSize,
      totalCount: parsed.totalCount,
    };
  },
  fetchCardById: async (id) => {
    const raw = await fetchPokemonApi(`/cards/${encodeURIComponent(id)}`);
    return pokemonCardResponseSchema.parse(raw).data;
  },
  cacheCards: async (cards) => {
    if (cards.length === 0) return;

    const { error } = await supabase
      .from("pokemon_tcg_cards")
      .upsert(cards.map(pokemonCardToCacheRow), { onConflict: "id" });

    if (error) {
      console.warn("[Pokémon TCG] Failed to update cache:", error.message);
    }
  },
};

export async function searchPokemonCardsCacheFirst(
  input: SearchPokemonCardsInput,
  dependencies: PokemonTcgDependencies = defaultDependencies,
): Promise<PokemonCardSearchResult> {
  const query = input.query.replace(/\s+/g, " ").trim();
  if (!query) {
    return { cards: [], page: 1, pageSize: 20, totalCount: 0, source: "cache" };
  }

  const page = Math.max(input.page ?? 1, 1);
  const pageSize = Math.min(Math.max(input.pageSize ?? 20, 1), 100);
  const offset = (page - 1) * pageSize;
  const cacheQuery = [
    query,
    input.number,
    input.collection,
    input.printedTotal,
    input.setCode,
  ]
    .filter(Boolean)
    .join(" ");
  const cachedCards = await dependencies.findCachedCards(
    cacheQuery,
    pageSize,
    offset,
  );

  const normalize = (value: string) =>
    value.toLowerCase().replace(/[^a-z0-9]/g, "");
  const normalizedNumber = input.number
    ?.split("/", 1)[0]
    .replace(/[^a-z0-9]/gi, "")
    .replace(/^0+(?=\d)/, "")
    .toLowerCase();
  const constrainedCache = cachedCards.filter((card) => {
    if (normalizedNumber) {
      const cardNumber = normalize(card.number).replace(/^0+(?=\d)/, "");
      if (cardNumber !== normalizedNumber) return false;
      if (normalize(card.name) !== normalize(query)) return false;
    }
    if (
      input.collection &&
      normalize(card.set.name) !== normalize(input.collection)
    ) {
      return false;
    }
    if (
      input.printedTotal &&
      card.set.printedTotal !== input.printedTotal
    ) {
      return false;
    }
    if (
      input.setCode &&
      card.set.ptcgoCode &&
      normalize(card.set.ptcgoCode) !== normalize(input.setCode)
    ) {
      return false;
    }
    return true;
  });

  if (constrainedCache.length > 0) {
    return {
      cards: constrainedCache,
      page,
      pageSize,
      totalCount: offset + constrainedCache.length,
      source: "cache",
    };
  }

  const externalResult =
    input.number || input.collection || input.printedTotal || input.setCode
    ? await dependencies.fetchCards(
        query,
        page,
        pageSize,
        input.number,
        input.collection,
        input.printedTotal,
        input.setCode,
      )
    : await dependencies.fetchCards(query, page, pageSize);
  await dependencies.cacheCards(externalResult.cards);

  return { ...externalResult, source: "api" };
}

export async function getPokemonCardCacheFirst(
  id: string,
  dependencies: PokemonTcgDependencies = defaultDependencies,
) {
  const normalizedId = id.trim();
  if (!normalizedId) throw new Error("Pokémon card id is required");

  const cachedCard = await dependencies.findCachedCardById(normalizedId);
  if (cachedCard) return { card: cachedCard, source: "cache" as const };

  const card = await dependencies.fetchCardById(normalizedId);
  await dependencies.cacheCards([card]);
  return { card, source: "api" as const };
}

export async function cachePokemonCards(cards: PokemonTcgCard[]) {
  await defaultDependencies.cacheCards(cards);
}

export function useCreatePokemonCardBatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      showcaseId: string;
      cardIds: string[];
      condition?: string;
    }) => {
      if (input.cardIds.length === 0) {
        throw new Error("Scan at least one card before saving");
      }

      const { data, error } = await supabase.rpc("create_pokemon_tcg_batch", {
        p_showcase_id: input.showcaseId,
        p_card_ids: input.cardIds,
        p_condition: input.condition ?? "Excellent",
      });

      if (error) throw new Error(error.message);
      return data ?? [];
    },
    onSuccess: (_data, input) => {
      queryClient.invalidateQueries({
        queryKey: ["showcase:items", input.showcaseId],
      });
      queryClient.invalidateQueries({ queryKey: ["showcase"] });
      queryClient.invalidateQueries({ queryKey: ["items", "my"] });
    },
  });
}
