import { createActionLogger } from "@/lib/actionDebug";
import { supabase } from "@/lib/supabase";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";

// scryfall.com/docs/api — no auth required. Search is field-based only, no
// image/OCR scan endpoint, so this integration is search-only like the
// magicthegathering.io one it replaces.

const magicDebug = createActionLogger("MagicTCG");

const scryfallImageUrisSchema = z
  .object({
    small: z.string().optional(),
    normal: z.string().optional(),
    large: z.string().optional(),
    png: z.string().optional(),
    art_crop: z.string().optional(),
    border_crop: z.string().optional(),
  })
  .passthrough();

const scryfallCardFaceSchema = z
  .object({
    name: z.string(),
    mana_cost: z.string().optional(),
    type_line: z.string().optional(),
    oracle_text: z.string().optional(),
    image_uris: scryfallImageUrisSchema.optional(),
  })
  .passthrough();

const scryfallPricesSchema = z
  .object({
    usd: z.string().nullable().optional(),
    usd_foil: z.string().nullable().optional(),
  })
  .passthrough();

export const magicCardSchema = z
  .object({
    id: z.string().min(1),
    oracle_id: z.string().optional(),
    name: z.string().min(1),
    mana_cost: z.string().optional(),
    cmc: z.number().optional(),
    type_line: z.string().optional(),
    oracle_text: z.string().optional(),
    colors: z.array(z.string()).optional().default([]),
    color_identity: z.array(z.string()).optional().default([]),
    rarity: z.string().optional(),
    set: z.string().optional(),
    set_name: z.string().optional(),
    collector_number: z.string().optional(),
    artist: z.string().optional(),
    image_uris: scryfallImageUrisSchema.optional(),
    card_faces: z.array(scryfallCardFaceSchema).optional(),
    prices: scryfallPricesSchema.optional(),
  })
  .passthrough();

const scryfallSearchResponseSchema = z.object({
  object: z.literal("list"),
  total_cards: z.number().optional(),
  has_more: z.boolean().optional(),
  data: z.array(magicCardSchema),
});

export type MagicCard = z.infer<typeof magicCardSchema>;

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
  cacheCards: (cards: MagicCard[]) => Promise<void>;
}

const SCRYFALL_API_URL = "https://api.scryfall.com";
export const SCRYFALL_REQUEST_HEADERS = {
  Accept: "application/json;q=0.9,*/*;q=0.8",
  "User-Agent": "Show-Off/1.0.0 (Expo React Native)",
} as const;

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

/** DFCs (double-faced cards) have no top-level `image_uris` — fall back to the front face. */
export function getMagicCardImageUrl(
  card: MagicCard,
  size: "small" | "normal" = "normal",
): string | null {
  return (
    card.image_uris?.[size] ?? card.card_faces?.[0]?.image_uris?.[size] ?? null
  );
}

export function getMagicCardPrice(card: MagicCard): number | null {
  const usd = card.prices?.usd ?? card.prices?.usd_foil;
  if (!usd) return null;
  const parsed = Number(usd);
  return Number.isFinite(parsed) ? parsed : null;
}

export function getMagicCardTypeLine(card: MagicCard): string | null {
  return card.type_line ?? card.card_faces?.[0]?.type_line ?? null;
}

export function magicCardToCacheRow(card: MagicCard) {
  const priceUsd = card.prices?.usd ? Number(card.prices.usd) : null;
  const priceUsdFoil = card.prices?.usd_foil ? Number(card.prices.usd_foil) : null;

  return {
    id: card.id,
    oracle_id: card.oracle_id ?? null,
    name: card.name,
    mana_cost: card.mana_cost ?? null,
    cmc: card.cmc ?? null,
    type_line: getMagicCardTypeLine(card),
    oracle_text: card.oracle_text ?? card.card_faces?.[0]?.oracle_text ?? null,
    colors: card.colors,
    color_identity: card.color_identity,
    rarity: card.rarity ?? null,
    set_code: card.set ?? null,
    set_name: card.set_name ?? null,
    collector_number: card.collector_number ?? null,
    artist: card.artist ?? null,
    image_small: getMagicCardImageUrl(card, "small"),
    image_normal: getMagicCardImageUrl(card, "normal"),
    price_usd: Number.isFinite(priceUsd) ? priceUsd : null,
    price_usd_foil: Number.isFinite(priceUsdFoil) ? priceUsdFoil : null,
    raw_data: card,
    cached_at: new Date().toISOString(),
  };
}

export async function fetchScryfallApi(path: string) {
  const response = await fetch(`${SCRYFALL_API_URL}${path}`, {
    headers: SCRYFALL_REQUEST_HEADERS,
  });

  if (!response.ok) {
    let details: string | undefined;
    try {
      const body = await response.json();
      details = typeof body?.details === "string" ? body.details : undefined;
    } catch {
      // Error body wasn't JSON (or was empty) — fall back to just the status.
    }
    throw new MagicApiError(response.status, path, details);
  }

  return response.json();
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
  cacheCards: async (cards) => {
    if (cards.length === 0) return;

    const { error } = await supabase
      .from("magic_cards")
      .upsert(cards.map(magicCardToCacheRow), { onConflict: "id" });

    if (error) {
      console.warn("[Magic TCG] Failed to update cache:", error.message);
    }
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

  await dependencies.cacheCards(externalResult.cards);

  const cards = externalResult.cards.slice(0, pageSize);
  magicDebug.log("search.completed", {
    query,
    source: "api",
    resultCount: cards.length,
  });
  return { cards, page, pageSize, source: "api" };
}

export async function cacheMagicCards(cards: MagicCard[]) {
  await defaultDependencies.cacheCards(cards);
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
