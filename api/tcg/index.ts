import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { CatalogRequestError, fetchCatalog } from "@/api/catalog";
import type { TcgGameCode } from "@/constants/tcgGames";
import { createActionLogger } from "@/lib/actionDebug";
import { tcgCardSchema, tcgSearchResponseSchema, type TcgCard } from "@/lib/pokewalletCatalog";
import { supabase } from "@/lib/supabase";

export { type TcgCard } from "@/lib/pokewalletCatalog";

// Shared pipeline for every card game without its own (see constants/tcgGames.ts).
// PokéWallet is reached only through the authenticated catalog-proxy, which
// saves cards (and copies their images) before returning them. Its plan
// limits are tight, so searches read the shared cache first.

const tcgDebug = createActionLogger("TcgCards");

export interface TcgCardSearchResult {
  cards: TcgCard[];
  page: number;
  /** Provider page count for API results; cache results don't know it. */
  totalPages: number | null;
  source: "cache" | "api";
}

export interface SearchTcgCardsInput {
  game: TcgGameCode;
  query: string;
  page?: number;
  /** Skip the cache, e.g. when the cached matches aren't the right printing. */
  bypassCache?: boolean;
}

export interface TcgDependencies {
  findCachedCards: (game: TcgGameCode, query: string, limit: number, offset: number) => Promise<TcgCard[]>;
  searchProvider: (game: TcgGameCode, query: string, page: number) => Promise<unknown>;
}

const CACHE_PAGE_SIZE = 40;

const defaultDependencies: TcgDependencies = {
  findCachedCards: async (game, query, limit, offset) => {
    const { data, error } = await supabase.rpc("search_tcg_cards", {
      p_game: game,
      search_term: query,
      result_limit: limit,
      result_offset: offset,
    });
    if (error) {
      tcgDebug.log("cache-search.unavailable", { message: error.message });
      return [];
    }
    return ((data ?? []) as unknown[]).flatMap((row) => {
      const parsed = tcgCardSchema.safeParse(row);
      return parsed.success ? [parsed.data] : [];
    });
  },
  searchProvider: (game, query, page) => fetchCatalog({ provider: "pokewallet", game, query, page }),
};

/** Cache-first name/number search; falls back to PokéWallet `/{game}/search`. */
export async function searchTcgCardsCacheFirst(
  input: SearchTcgCardsInput,
  dependencies: TcgDependencies = defaultDependencies,
): Promise<TcgCardSearchResult> {
  const query = input.query.replace(/\s+/g, " ").trim();
  const page = Math.max(input.page ?? 1, 1);
  if (query.length < 2) return { cards: [], page: 1, totalPages: 0, source: "cache" };
  tcgDebug.log("search.started", { game: input.game, query, page, bypassCache: !!input.bypassCache });

  if (!input.bypassCache) {
    const cached = await dependencies.findCachedCards(input.game, query, CACHE_PAGE_SIZE, (page - 1) * CACHE_PAGE_SIZE);
    if (cached.length > 0) {
      tcgDebug.log("search.completed", { game: input.game, query, source: "cache", resultCount: cached.length });
      return { cards: cached, page, totalPages: null, source: "cache" };
    }
  }

  try {
    const parsed = tcgSearchResponseSchema.parse(await dependencies.searchProvider(input.game, query, page));
    tcgDebug.log("search.completed", { game: input.game, query, source: "api", resultCount: parsed.cards.length });
    return { cards: parsed.cards, page: parsed.page, totalPages: parsed.totalPages, source: "api" };
  } catch (error) {
    if (error instanceof CatalogRequestError && error.status === 404) {
      return { cards: [], page, totalPages: 0, source: "api" };
    }
    tcgDebug.error("search.failed", error);
    throw error;
  }
}

export function useTcgCardSearch(input: SearchTcgCardsInput) {
  const query = input.query.replace(/\s+/g, " ").trim();
  return useQuery({
    queryKey: ["tcg-cards", "search", input.game, query, input.page ?? 1, !!input.bypassCache],
    queryFn: () => searchTcgCardsCacheFirst({ ...input, query }),
    enabled: query.length >= 2,
    placeholderData: keepPreviousData,
    staleTime: 10 * 60_000,
    // Every miss spends PokéWallet quota; let the user retry instead.
    retry: false,
  });
}

/** Saves queued cards as verified items in one showcase (create_tcg_card_batch). */
export function useCreateTcgCardBatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { showcaseId: string; cardIds: string[] }) => {
      tcgDebug.log("batch-save.started", { showcaseId: input.showcaseId, cardCount: input.cardIds.length });
      if (input.cardIds.length === 0) throw new Error("Add at least one card before saving");

      const { data, error } = await supabase.rpc("create_tcg_card_batch", {
        p_showcase_id: input.showcaseId,
        p_card_ids: input.cardIds,
      });
      if (error) {
        tcgDebug.error("batch-save.failed", error);
        throw new Error(error.message);
      }
      tcgDebug.log("batch-save.completed", { showcaseId: input.showcaseId, cardCount: input.cardIds.length });
      return data ?? [];
    },
    onSuccess: (_data, input) => {
      queryClient.invalidateQueries({ queryKey: ["showcase:items", input.showcaseId] });
      queryClient.invalidateQueries({ queryKey: ["showcase"] });
      queryClient.invalidateQueries({ queryKey: ["items", "my"] });
    },
  });
}
