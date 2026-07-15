import { supabase } from "@/lib/supabase";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  TCG_CATEGORIES,
  getTcgProductDetail,
  getTcgSetCards,
  scanTcgCardImage,
  searchTcgSets,
  type TcgCard,
  type TcgGameKey,
  type TcgScanResult,
  type TcgSet,
} from "./catalog";

export { TCG_CATEGORIES, type TcgCard, type TcgGameKey, type TcgScanResult, type TcgSet };

export const tcgQueryKeys = {
  sets: (gameKey: TcgGameKey, query: string) => ["tcg", "sets", gameKey, query] as const,
  setCards: (gameKey: TcgGameKey, setId: number) => ["tcg", "setCards", gameKey, setId] as const,
  cardSearch: (gameKey: TcgGameKey, query: string) =>
    ["tcg", "cardSearch", gameKey, query] as const,
};

interface TcgCardCacheRow {
  id: string;
  game_category_id: number;
  game_name: string;
  product_id: number;
  name: string;
  number: string | null;
  rarity: string | null;
  set_id: number;
  set_name: string;
  image_url: string | null;
  tcgplayer_url: string | null;
  market_price: number | null;
}

function cacheRowToTcgCard(row: TcgCardCacheRow): TcgCard {
  return {
    id: row.id,
    gameCategoryId: row.game_category_id,
    gameName: row.game_name,
    productId: row.product_id,
    name: row.name,
    number: row.number,
    rarity: row.rarity,
    setId: row.set_id,
    setName: row.set_name,
    imageUrl: row.image_url,
    tcgplayerUrl: row.tcgplayer_url,
    marketPrice: row.market_price,
  };
}

function tcgCardToCacheRow(card: TcgCard) {
  return {
    id: card.id,
    game_category_id: card.gameCategoryId,
    game_name: card.gameName,
    product_id: card.productId,
    name: card.name,
    number: card.number,
    rarity: card.rarity,
    set_id: card.setId,
    set_name: card.setName,
    image_url: card.imageUrl,
    tcgplayer_url: card.tcgplayerUrl,
    market_price: card.marketPrice,
    raw_data: card,
    cached_at: new Date().toISOString(),
  };
}

/** Upserts into the shared tcg_cards cache so showcase item queries can join against it. */
export async function cacheTcgCards(cards: TcgCard[]) {
  if (cards.length === 0) return;
  const { error } = await supabase
    .from("tcg_cards")
    .upsert(cards.map(tcgCardToCacheRow), { onConflict: "id" });
  if (error) {
    console.warn("[TCG] Failed to cache cards:", error.message);
  }
}

/** Search sets by name within a game (e.g. "Kaladesh") — there is no cross-set card-name search on this API. */
export function useSearchTcgSets(gameKey: TcgGameKey, query: string) {
  const categoryId = TCG_CATEGORIES[gameKey].id;
  return useQuery({
    queryKey: tcgQueryKeys.sets(gameKey, query),
    queryFn: () => searchTcgSets(categoryId, query),
    enabled: query.trim().length > 1,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Card-name search — TCGTracking has no such endpoint, so this only
 * ever searches OUR OWN cache (grown by useTcgSetCards/useHydrateTcgCard
 * as users browse). Starts empty for an uncached game and fills in over
 * time; browsing by set (useSearchTcgSets + useTcgSetCards) is still the
 * only way to find a card nobody has looked at yet.
 */
export function useSearchTcgCardsByName(gameKey: TcgGameKey, query: string) {
  const categoryId = TCG_CATEGORIES[gameKey].id;
  return useQuery({
    queryKey: tcgQueryKeys.cardSearch(gameKey, query),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("search_tcg_cards", {
        search_term: query,
        p_game_category_id: categoryId,
        result_limit: 30,
      });
      if (error) throw new Error(error.message);
      return ((data ?? []) as TcgCardCacheRow[]).map(cacheRowToTcgCard);
    },
    enabled: query.trim().length > 1,
    staleTime: 60 * 1000,
  });
}

/** All cards in a set — the entry point for the free-tier "browse a set" manual add flow. */
export function useTcgSetCards(gameKey: TcgGameKey, setId: number | null) {
  const categoryId = TCG_CATEGORIES[gameKey].id;
  const gameName = TCG_CATEGORIES[gameKey].label;
  return useQuery({
    queryKey: tcgQueryKeys.setCards(gameKey, setId ?? -1),
    queryFn: async () => {
      const cards = await getTcgSetCards(categoryId, setId!, gameName);
      // Fire-and-forget: warms the cache for later showcase item joins,
      // doesn't block the browse UI on a write.
      cacheTcgCards(cards).catch(() => undefined);
      return cards;
    },
    enabled: setId != null,
    staleTime: 60 * 60 * 1000,
  });
}

/**
 * Hydrates full detail (incl. live market price) for one card — called
 * once, at the moment a user selects/confirms a specific card, not for
 * every row in a browse list.
 */
export function useHydrateTcgCard() {
  return useMutation({
    mutationFn: async (input: {
      gameKey: TcgGameKey;
      productId: number;
      setName?: string;
    }) => {
      const categoryId = TCG_CATEGORIES[input.gameKey].id;
      const gameName = TCG_CATEGORIES[input.gameKey].label;
      const card = await getTcgProductDetail(
        categoryId,
        input.productId,
        gameName,
        input.setName,
      );
      await cacheTcgCards([card]);
      return card;
    },
  });
}

/** Curator-only camera scan — image-to-product matching via TCGTracking's /v1/scan. */
export function useScanTcgCardImage() {
  return useMutation({
    mutationFn: async (input: { gameKey: TcgGameKey; imageUri: string }) => {
      const categoryId = TCG_CATEGORIES[input.gameKey].id;
      return scanTcgCardImage(categoryId, input.imageUri);
    },
  });
}

/** Generic sibling to useCreatePokemonCardBatch — writes to items.tcg_card_id. */
export function useCreateTcgCardBatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      showcaseId: string;
      cardIds: string[];
      prices?: (number | null)[];
    }) => {
      if (input.cardIds.length === 0) {
        throw new Error("Add at least one card before saving");
      }
      if (input.prices && input.prices.length !== input.cardIds.length) {
        throw new Error("Price list must match card list");
      }

      const { data, error } = await supabase.rpc("create_tcg_card_batch", {
        p_showcase_id: input.showcaseId,
        p_card_ids: input.cardIds,
        p_prices: input.prices ?? null,
      });

      if (error) throw new Error(error.message);
      return data as { item_id: number; tcg_card_id: string }[];
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["showcase:items", vars.showcaseId] });
    },
  });
}
