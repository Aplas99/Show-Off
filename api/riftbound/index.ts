import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { CatalogRequestError, fetchCatalog } from "@/api/catalog";
import { createActionLogger } from "@/lib/actionDebug";
import {
  RIFTBOUND_ID_PATTERN,
  parseRiftboundCards,
  riftboundCardSchema,
  riftboundListResponseSchema,
  type RiftboundCard,
} from "@/lib/riftboundCatalog";
import { supabase } from "@/lib/supabase";

export { getRiftboundCardImageUrl, riftboundCardSchema, type RiftboundCard } from "@/lib/riftboundCatalog";

// Riftcodex (unofficial fan API, no key) is reached only through the
// authenticated catalog-proxy, which saves cards before returning them so
// later item references point at cached rows.

const riftboundDebug = createActionLogger("Riftbound");

export interface RiftboundCardSearchResult {
  cards: RiftboundCard[];
  page: number;
  pageSize: number;
  /** Provider total for API results; cache results don't know the full count. */
  totalCount: number | null;
  source: "cache" | "api";
}

export interface SearchRiftboundCardsInput {
  query: string;
  page?: number;
  pageSize?: number;
  /** Limit to one set code (e.g. OGN). */
  setId?: string;
  bypassCache?: boolean;
}

export interface RiftboundDependencies {
  findCachedCards: (query: string, limit: number, offset: number) => Promise<RiftboundCard[]>;
  fetchCards: (path: string) => Promise<unknown>;
}

function parseCachedCard(row: { raw_data: unknown }): RiftboundCard | null {
  const parsed = riftboundCardSchema.safeParse(row.raw_data);
  return parsed.success ? parsed.data : null;
}

const defaultDependencies: RiftboundDependencies = {
  findCachedCards: async (query, limit, offset) => {
    const { data, error } = await supabase.rpc("search_riftbound_cards", {
      search_term: query,
      result_limit: limit,
      result_offset: offset,
    });
    if (error) {
      riftboundDebug.log("cache-search.unavailable", { message: error.message });
      return [];
    }
    return ((data ?? []) as { raw_data: unknown }[])
      .map(parseCachedCard)
      .filter((card): card is RiftboundCard => card !== null);
  },
  fetchCards: (path) => fetchCatalog({ provider: "riftbound", path }),
};

/** Cache-first fuzzy name search; falls back to Riftcodex `/cards/name`. */
export async function searchRiftboundCardsCacheFirst(
  input: SearchRiftboundCardsInput,
  dependencies: RiftboundDependencies = defaultDependencies,
): Promise<RiftboundCardSearchResult> {
  const query = input.query.replace(/\s+/g, " ").trim();
  const pageSize = Math.min(Math.max(input.pageSize ?? 40, 1), 100);
  const page = Math.max(input.page ?? 1, 1);
  if (!query) return { cards: [], page: 1, pageSize, totalCount: 0, source: "cache" };
  riftboundDebug.log("search.started", { query, page, setId: input.setId ?? null });

  // A set filter can't be honored by the cache RPC, so go to the provider.
  const cachedCards = input.bypassCache || input.setId
    ? []
    : await dependencies.findCachedCards(query, pageSize, (page - 1) * pageSize);
  if (cachedCards.length > 0) {
    riftboundDebug.log("search.completed", { query, source: "cache", resultCount: cachedCards.length });
    return { cards: cachedCards, page, pageSize, totalCount: null, source: "cache" };
  }

  const params = new URLSearchParams({
    fuzzy: query,
    ...(input.setId ? { set_id: input.setId } : {}),
    page: String(page),
    size: String(pageSize),
  });
  try {
    const parsed = riftboundListResponseSchema.parse(await dependencies.fetchCards(`/cards/name?${params}`));
    riftboundDebug.log("search.completed", { query, source: "api", resultCount: parsed.items.length });
    return { cards: parsed.items, page, pageSize, totalCount: parsed.total, source: "api" };
  } catch (error) {
    if (error instanceof CatalogRequestError && error.status === 404) {
      return { cards: [], page, pageSize, totalCount: 0, source: "api" };
    }
    riftboundDebug.error("search.failed", error);
    throw error;
  }
}

/**
 * Looks up a printed Riftbound code. Riftcodex matches partially, so
 * `ogn-011` returns every printing of that card number.
 */
export async function fetchRiftboundCardsByCode(
  code: string,
  dependencies: RiftboundDependencies = defaultDependencies,
): Promise<RiftboundCard[]> {
  const normalized = code.trim().toLowerCase();
  if (!RIFTBOUND_ID_PATTERN.test(normalized)) return [];
  const path = `/cards/riftbound/${normalized}`;
  try {
    return parseRiftboundCards(path, await dependencies.fetchCards(path));
  } catch (error) {
    if (error instanceof CatalogRequestError && error.status === 404) return [];
    throw error;
  }
}

/** One page of a set, in collector-number order. */
export async function fetchRiftboundSetCards(
  setId: string,
  page = 1,
  dependencies: RiftboundDependencies = defaultDependencies,
) {
  const params = new URLSearchParams({ set_id: setId, sort: "collector_number", page: String(page), size: "100" });
  return riftboundListResponseSchema.parse(await dependencies.fetchCards(`/cards?${params}`));
}

export function useRiftboundCardSearch(input: SearchRiftboundCardsInput) {
  const query = input.query.replace(/\s+/g, " ").trim();
  return useQuery({
    queryKey: ["riftbound", "search", query, input.page ?? 1, input.pageSize ?? 40, input.setId ?? null],
    queryFn: () => searchRiftboundCardsCacheFirst({ ...input, query }),
    enabled: query.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
  });
}

export function useRiftboundCardsByCode(code: string) {
  const normalized = code.trim().toLowerCase();
  return useQuery({
    queryKey: ["riftbound", "code", normalized],
    queryFn: () => fetchRiftboundCardsByCode(normalized),
    enabled: RIFTBOUND_ID_PATTERN.test(normalized),
    staleTime: 30 * 60_000,
  });
}

/** Saves queued cards as verified items in one showcase (create_riftbound_card_batch). */
export function useCreateRiftboundCardBatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { showcaseId: string; cardIds: string[] }) => {
      riftboundDebug.log("batch-save.started", { showcaseId: input.showcaseId, cardCount: input.cardIds.length });
      if (input.cardIds.length === 0) throw new Error("Add at least one card before saving");

      const { data, error } = await supabase.rpc("create_riftbound_card_batch", {
        p_showcase_id: input.showcaseId,
        p_card_ids: input.cardIds,
      });
      if (error) {
        riftboundDebug.error("batch-save.failed", error);
        throw new Error(error.message);
      }
      riftboundDebug.log("batch-save.completed", { showcaseId: input.showcaseId, cardCount: input.cardIds.length });
      return data ?? [];
    },
    onSuccess: (_data, input) => {
      queryClient.invalidateQueries({ queryKey: ["showcase:items", input.showcaseId] });
      queryClient.invalidateQueries({ queryKey: ["showcase"] });
      queryClient.invalidateQueries({ queryKey: ["items", "my"] });
    },
  });
}
