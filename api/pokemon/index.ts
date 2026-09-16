import { CatalogRequestError, fetchCatalog } from "@/api/catalog";
import { supabase } from "@/lib/supabase";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { pokemonTcgCardSchema, pokemonSearchResponseSchema, pokemonCardResponseSchema, type PokemonTcgCard } from "@/lib/pokemonCatalog";

export { pokemonTcgCardSchema, pokemonCardToCacheRow, type PokemonTcgCard } from "@/lib/pokemonCatalog";

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

interface PokemonSetRosterCacheRow {
  set_id: string;
  cached_card_count: number;
  is_complete: boolean;
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

async function fetchPokemonApi(path: string) {
  try {
    return await fetchCatalog({ provider: "pokemon", path });
  } catch (error) {
    if (error instanceof CatalogRequestError && error.status === 404) {
      throw new PokemonTcgApiError(404, path);
    }
    throw error;
  }
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
      .or("catalog_trusted.eq.true,id.like.manual:%")
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
  // The proxy persists trusted results before returning them.
  cacheCards: async () => undefined,
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

async function getCompleteSetRosterFromCache(
  setId: string,
): Promise<PokemonTcgCard[] | null> {
  const { data: manifest, error: manifestError } = await supabase
    .from("pokemon_tcg_set_rosters")
    .select("set_id, cached_card_count, is_complete")
    .eq("set_id", setId)
    .maybeSingle();

  if (manifestError) {
    console.warn(
      "[Pokémon TCG] Set roster manifest unavailable:",
      manifestError.message,
    );
    return null;
  }

  const parsedManifest = manifest as PokemonSetRosterCacheRow | null;
  if (!parsedManifest?.is_complete) return null;

  const { data: rows, error: cardsError } = await supabase
    .from("pokemon_tcg_cards")
    .select("id, raw_data")
    .eq("set_id", setId)
    .eq("catalog_trusted", true)
    .limit(1000);

  if (cardsError) {
    console.warn("[Pokémon TCG] Cached set lookup failed:", cardsError.message);
    return null;
  }

  const cards = ((rows ?? []) as PokemonCardCacheRow[])
    .map(parseCachedCard)
    .filter((card): card is PokemonTcgCard => card !== null)
    .sort((a, b) =>
      a.number.localeCompare(b.number, undefined, {
        numeric: true,
        sensitivity: "base",
      }),
    );

  // Never serve a partial roster. Search and scanning also populate the card
  // table, so only the manifest's exact count proves this set cache is whole.
  if (cards.length !== parsedManifest.cached_card_count) return null;

  console.log("[Pokémon TCG] Set roster cache hit", {
    setId,
    cardCount: cards.length,
  });
  return cards;
}

/**
 * Returns a complete set roster from Supabase first. Only a missing or partial
 * database roster reaches the Pokémon API; successful API responses populate
 * both the shared card cache and the complete-roster manifest.
 */
export async function fetchAllCardsInSet(
  setId: string,
): Promise<PokemonTcgCard[]> {
  const normalizedSetId = setId.trim();
  if (!normalizedSetId) return [];

  const cachedRoster = await getCompleteSetRosterFromCache(normalizedSetId);
  if (cachedRoster) return cachedRoster;

  console.log("[Pokémon TCG] Set roster cache miss", {
    setId: normalizedSetId,
  });

  const raw = await fetchPokemonApi(`/sets/${encodeURIComponent(normalizedSetId)}/cards`);
  return pokemonSearchResponseSchema.parse(raw).data;
}

/**
 * Full roster for the Curator set-completion view. TanStack Query handles the
 * current session; Supabase provides the persistent cross-user roster cache.
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
