import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { CatalogRequestError, fetchCatalog } from "@/api/catalog";
import type { TcgGameCode } from "@/constants/tcgGames";
import { createActionLogger } from "@/lib/actionDebug";
import {
  TCG_SET_ID_PATTERN,
  tcgCardSchema,
  tcgSearchResponseSchema,
  tcgSetRosterResponseSchema,
  type TcgCard,
} from "@/lib/tcgApiCatalog";
import { supabase } from "@/lib/supabase";

export { type TcgCard } from "@/lib/tcgApiCatalog";

// Shared pipeline for every card game without its own (see constants/tcgGames.ts).
// TCG API (tcgapi.dev) is reached only through the authenticated
// catalog-proxy, which saves cards before returning them. Its daily request
// budget is shared by every user, so searches read the shared cache first.

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
  /** Read only the cache, e.g. for printed codes TCG API can't search. */
  cacheOnly?: boolean;
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
  searchProvider: (game, query, page) => fetchCatalog({ provider: "tcgapi", game, query, page }),
};

/** Cache-first name/number search; falls back to TCG API `/v1/search` (names only). */
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
    if (input.cacheOnly) {
      tcgDebug.log("search.completed", { game: input.game, query, source: "cache", resultCount: 0 });
      return { cards: [], page, totalPages: null, source: "cache" };
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

export interface TcgSetRosterDependencies {
  /** Rows for a set, or null unless tcg_set_rosters says the set is fully cached. */
  findCachedRoster: (game: TcgGameCode, setId: string) => Promise<TcgCard[] | null>;
  fetchRoster: (game: TcgGameCode, setId: string) => Promise<unknown>;
}

const defaultRosterDependencies: TcgSetRosterDependencies = {
  findCachedRoster: async (game, setId) => {
    const { data: manifest, error: manifestError } = await supabase
      .from("tcg_set_rosters")
      .select("card_count")
      .eq("game", game)
      .eq("set_id", setId)
      .maybeSingle();
    if (manifestError || !manifest) return null;
    const { data, error } = await supabase
      .from("tcg_cards")
      .select("id, game, name, set_name, set_code, set_id, card_number, rarity, card_type, image_url, market_price")
      .eq("game", game)
      .eq("set_id", setId)
      .limit(2000);
    if (error) return null;
    const cards = (data ?? []).flatMap((row) => {
      const parsed = tcgCardSchema.safeParse(row);
      return parsed.success ? [parsed.data] : [];
    });
    // Search also adds cards to tcg_cards; only the manifest's count proves the set is whole.
    return cards.length >= (manifest as { card_count: number }).card_count ? cards : null;
  },
  fetchRoster: (game, setId) => fetchCatalog({ provider: "tcgapi", game, setId }),
};

/**
 * Every card in a TCG API set, for set completion. Reads the shared cache
 * first; a miss costs one TCG API request per 100 cards, after which the
 * set is cached for every user.
 */
export async function fetchTcgSetRoster(
  game: TcgGameCode,
  setId: string,
  dependencies: TcgSetRosterDependencies = defaultRosterDependencies,
): Promise<TcgCard[]> {
  if (!TCG_SET_ID_PATTERN.test(setId)) return [];
  const cached = await dependencies.findCachedRoster(game, setId);
  if (cached) {
    tcgDebug.log("set-roster.completed", { game, setId, source: "cache", cardCount: cached.length });
    return cached;
  }
  const parsed = tcgSetRosterResponseSchema.parse(await dependencies.fetchRoster(game, setId));
  tcgDebug.log("set-roster.completed", { game, setId, source: "api", cardCount: parsed.cards.length });
  return parsed.cards;
}

/** Cached card counts per set id, read from tcg_set_rosters; sets never loaded are absent. */
export function useTcgSetRosterCounts(game: TcgGameCode | null, setIds: string[]) {
  const ids = [...new Set(setIds.filter((id) => !!game && TCG_SET_ID_PATTERN.test(id)))].sort();
  return useQuery({
    queryKey: ["tcg-cards", "set-roster-counts", game, ids],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tcg_set_rosters")
        .select("set_id, card_count")
        .eq("game", game!)
        .in("set_id", ids);
      if (error) throw new Error(error.message);
      return new Map((data ?? []).map((row) => [String(row.set_id), Number(row.card_count)]));
    },
    enabled: !!game && ids.length > 0,
    staleTime: 10 * 60_000,
  });
}

export function useTcgCardSearch(input: SearchTcgCardsInput) {
  const query = input.query.replace(/\s+/g, " ").trim();
  return useQuery({
    queryKey: ["tcg-cards", "search", input.game, query, input.page ?? 1, !!input.bypassCache],
    queryFn: () => searchTcgCardsCacheFirst({ ...input, query }),
    enabled: query.length >= 2,
    placeholderData: keepPreviousData,
    staleTime: 10 * 60_000,
    // Every miss spends shared TCG API quota; let the user retry instead.
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
