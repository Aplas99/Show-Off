import { useMutation, useQueryClient } from "@tanstack/react-query";

import { CatalogRequestError, fetchCatalog } from "@/api/catalog";
import { createActionLogger } from "@/lib/actionDebug";
import { magicCardSchema, scryfallSearchResponseSchema, type MagicCard } from "@/lib/magicCatalog";
import { supabase } from "@/lib/supabase";

export { magicCardSchema, getMagicCardImageUrl, getMagicCardPrice, getMagicCardTypeLine, type MagicCard } from "@/lib/magicCatalog";

// Search and on-device OCR name matches resolve through the authenticated
// proxy, which saves provider records before the app creates item references.

const magicDebug = createActionLogger("MagicTCG");

export interface MagicCardSearchResult {
  cards: MagicCard[];
  page: number;
  pageSize: number;
  source: "cache" | "api";
}

interface MagicCardCacheRow {
  id: string;
  raw_data: unknown;
}

export interface SearchMagicCardsInput {
  query: string;
  page?: number;
  pageSize?: number;
  bypassCache?: boolean;
}

export interface MagicTcgDependencies {
  findCachedCards: (
    query: string,
    limit: number,
    offset: number,
  ) => Promise<MagicCard[]>;
  fetchCards: (
    query: string,
    page: number,
  ) => Promise<{ cards: MagicCard[]; page: number }>;
}

export class MagicApiError extends Error {
  status: number;
  path: string;
  details?: string;

  constructor(status: number, path: string, details?: string) {
    super(
      details
        ? `Scryfall API error: ${status} — ${details}`
        : `Scryfall API error: ${status}`,
    );
    this.name = "MagicApiError";
    this.status = status;
    this.path = path;
    this.details = details;
  }
}

/**
 * Scryfall's `q` param is its own query syntax (operators like `OR`,
 * parentheses, colons) — sending raw user text unescaped lets ordinary card
 * names ("(Lightning" typos, a lone "OR", etc.) get parsed as malformed
 * syntax and 400. Quoting as `name:"..."` forces a literal name search,
 * mirroring buildPokemonNameQuery's approach for the Pokémon TCG API.
 */
export function buildMagicNameQuery(query: string) {
  const normalized = query.replace(/\s+/g, " ").trim();
  const escaped = normalized.replace(/([\\"])/g, "\\$1");
  return `name:"${escaped}"`;
}

function parseCachedCard(row: MagicCardCacheRow): MagicCard | null {
  const parsed = magicCardSchema.safeParse(row.raw_data);
  return parsed.success ? parsed.data : null;
}

export async function fetchScryfallApi(path: string) {
  try {
    return await fetchCatalog({ provider: "magic", path });
  } catch (error) {
    if (error instanceof CatalogRequestError && error.status === 404) {
      throw new MagicApiError(404, path);
    }
    throw error;
  }
}

const defaultDependencies: MagicTcgDependencies = {
  findCachedCards: async (query, limit, offset) => {
    const { data, error } = await supabase.rpc("search_magic_cards", {
      search_term: query,
      result_limit: limit,
      result_offset: offset,
    });

    if (error) {
      console.warn("[Magic TCG] Cache search unavailable:", error.message);
      return [];
    }

    return ((data ?? []) as MagicCardCacheRow[])
      .map(parseCachedCard)
      .filter((card): card is MagicCard => card !== null);
  },
  fetchCards: async (query, page) => {
    const params = new URLSearchParams({
      q: buildMagicNameQuery(query),
      page: String(page),
    });
    const raw = await fetchScryfallApi(`/cards/search?${params.toString()}`);
    const parsed = scryfallSearchResponseSchema.parse(raw);

    return { cards: parsed.data, page };
  },
};

export async function searchMagicCardsCacheFirst(
  input: SearchMagicCardsInput,
  dependencies: MagicTcgDependencies = defaultDependencies,
): Promise<MagicCardSearchResult> {
  const query = input.query.replace(/\s+/g, " ").trim();
  const pageSize = Math.min(Math.max(input.pageSize ?? 40, 1), 100);
  magicDebug.log("search.started", { query, page: input.page ?? 1 });
  if (!query) {
    return { cards: [], page: 1, pageSize, source: "cache" };
  }

  const page = Math.max(input.page ?? 1, 1);
  const offset = (page - 1) * pageSize;

  const cachedCards = input.bypassCache
    ? []
    : await dependencies.findCachedCards(query, pageSize, offset);

  if (cachedCards.length > 0) {
    magicDebug.log("search.completed", {
      query,
      source: "cache",
      resultCount: cachedCards.length,
    });
    return { cards: cachedCards, page, pageSize, source: "cache" };
  }

  let externalResult: { cards: MagicCard[]; page: number };
  try {
    externalResult = await dependencies.fetchCards(query, page);
  } catch (error) {
    if (error instanceof MagicApiError && error.status === 404) {
      magicDebug.log("search.completed", {
        query,
        source: "api",
        resultCount: 0,
      });
      return { cards: [], page, pageSize, source: "api" };
    }
    magicDebug.error("search.failed", error);
    throw error;
  }

  const cards = externalResult.cards.slice(0, pageSize);
  magicDebug.log("search.completed", {
    query,
    source: "api",
    resultCount: cards.length,
  });
  return { cards, page, pageSize, source: "api" };
}

export function useCreateMagicCardBatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      showcaseId: string;
      cardIds: string[];
      /** Current market price per card (USD), aligned with `cardIds`. */
      prices?: (number | null)[];
    }) => {
      magicDebug.log("batch-save.started", {
        showcaseId: input.showcaseId,
        cardCount: input.cardIds.length,
        cardIds: input.cardIds,
      });
      if (input.cardIds.length === 0) {
        throw new Error("Add at least one card before saving");
      }
      if (input.prices && input.prices.length !== input.cardIds.length) {
        throw new Error("Price list must match card list");
      }

      const { data, error } = await supabase.rpc("create_magic_card_batch", {
        p_showcase_id: input.showcaseId,
        p_card_ids: input.cardIds,
        p_prices: input.prices ?? null,
      });

      if (error) {
        magicDebug.error("batch-save.failed", error);
        throw new Error(error.message);
      }
      magicDebug.log("batch-save.completed", {
        showcaseId: input.showcaseId,
        cardCount: input.cardIds.length,
      });
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
