import { supabase } from "@/lib/supabase";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  /** Scanner fallback searches need the complete official result set. */
  bypassCache?: boolean;
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

export class PokemonTcgApiError extends Error {
  status: number;
  path: string;

  constructor(status: number, path: string) {
    super(`Pokemon TCG API error: ${status}`);
    this.name = "PokemonTcgApiError";
    this.status = status;
    this.path = path;
  }
}

export function isPokemonTcgApiErrorStatus(
  error: unknown,
  status: number,
): error is PokemonTcgApiError {
  return error instanceof PokemonTcgApiError && error.status === status;
}

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
  const nameQuery = query.trim() ? buildPokemonNameQuery(query) : null;
  // Strip leading zeros ("042" → "42") — cards print padded numbers but the
  // catalog stores them unpadded, and the API matches the string exactly.
  const normalizedNumber = number
    ?.split(/[\/.]/, 1)[0]
    .replace(/[^a-z0-9]/gi, "")
    .replace(/^0+(?=\d)/, "")
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
    throw new PokemonTcgApiError(response.status, path);
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
  if (!query && !input.number && !input.collection && !input.printedTotal && !input.setCode) {
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
  const cachedCards = input.bypassCache
    ? []
    : await dependencies.findCachedCards(cacheQuery, pageSize, offset);

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
      if (query && normalize(card.name) !== normalize(query)) return false;
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

  let externalResult: Omit<PokemonCardSearchResult, "source">;
  try {
    externalResult =
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
  } catch (error) {
    if (isPokemonTcgApiErrorStatus(error, 404)) {
      return {
        cards: [],
        page,
        pageSize,
        totalCount: 0,
        source: "api",
      };
    }
    throw error;
  }

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

/**
 * Fetch the complete card roster for one set, paginating until the API's
 * reported total is reached. Results are cached to Supabase. Intended for
 * on-demand use (set-completion view), never proactively across all sets.
 */
export async function fetchAllCardsInSet(
  setId: string,
): Promise<PokemonTcgCard[]> {
  const normalizedSetId = setId.trim();
  if (!normalizedSetId) return [];

  const allCards: PokemonTcgCard[] = [];
  let page = 1;
  for (;;) {
    const params = new URLSearchParams({
      q: `set.id:"${normalizedSetId.replace(/([\\"])/g, "\\$1")}"`,
      page: String(page),
      pageSize: "250",
      orderBy: "number",
    });
    const raw = await fetchPokemonApi(`/cards?${params.toString()}`);
    const parsed = pokemonSearchResponseSchema.parse(raw);
    allCards.push(...parsed.data);
    if (
      parsed.data.length === 0 ||
      page * parsed.pageSize >= parsed.totalCount
    ) {
      break;
    }
    page += 1;
  }

  await defaultDependencies.cacheCards(allCards);
  return allCards;
}

/**
 * Full roster for a set, for the Curator set-completion view. Cached a day —
 * set rosters only change when a new set releases.
 */
export function useSetCards(setId: string | null) {
  return useQuery({
    queryKey: ["pokemon", "set-cards", setId],
    queryFn: () => fetchAllCardsInSet(setId!),
    enabled: !!setId,
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
  });
}

export function useCreatePokemonCardBatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      showcaseId: string;
      cardIds: string[];
      /** Current market price per card (USD), aligned with `cardIds`. */
      prices?: (number | null)[];
    }) => {
      if (input.cardIds.length === 0) {
        throw new Error("Scan at least one card before saving");
      }
      if (input.prices && input.prices.length !== input.cardIds.length) {
        throw new Error("Price list must match card list");
      }

      const { data, error } = await supabase.rpc("create_pokemon_tcg_batch", {
        p_showcase_id: input.showcaseId,
        p_card_ids: input.cardIds,
        p_prices: input.prices ?? null,
      });

      if (error && error.code !== "PGRST202") throw new Error(error.message);
      if (error) {
        console.warn(
          "[Pokémon TCG] Batch RPC is unavailable; using client fallback. Apply migration 20260713100000 for atomic saves.",
        );
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) throw new Error("User not authenticated");

        const { data: items, error: insertError } = await supabase
          .from("items")
          .insert(input.cardIds.map((cardId, index) => {
            const price = input.prices?.[index] ?? null;
            return {
              user_id: user.id,
              pokemon_tcg_card_id: cardId,
              is_verified: true,
              condition: null,
              for_sale: false,
              price,
              currency_code: price != null ? "USD" : null,
            };
          }))
          .select("id, pokemon_tcg_card_id");
        if (insertError) throw new Error(insertError.message);

        const insertedItems = items ?? [];
        const { error: linkError } = await supabase
          .from("showcase_items")
          .insert(insertedItems.map((item) => ({
            showcase_id: input.showcaseId,
            item_id: item.id,
          })));
        if (linkError) {
          const insertedIds = insertedItems.map((item) => item.id);
          if (insertedIds.length > 0) {
            await supabase.from("items").delete().in("id", insertedIds);
          }
          throw new Error(linkError.message);
        }

        return insertedItems.map((item) => ({
          item_id: item.id,
          pokemon_tcg_card_id: item.pokemon_tcg_card_id,
        }));
      }
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
