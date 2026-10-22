import { fetchCatalog } from "@/api/catalog";
import { createActionLogger } from "@/lib/actionDebug";
import { type PriceGame } from "@/lib/cardPricing";
import { supabase } from "@/lib/supabase";
import { useQuery } from "@tanstack/react-query";

export type { PriceGame } from "@/lib/cardPricing";

const pricesDebug = createActionLogger("Prices");

export interface PricePoint {
  price: number;
  capturedOn: string;
}

/**
 * Daily market-price snapshots for one card (Curator price-history graph),
 * for every card game. Today's TCGplayer price comes from TCGTracking
 * through catalog-proxy, which stores one price_history row per card per day,
 * so each card costs at most one upstream request a day across all users.
 * Older points are the rows saved on earlier days (plus the Pokémon/Magic
 * cache triggers).
 */
export function usePriceHistory(
  game: PriceGame | null | undefined,
  cardId: string | null | undefined,
) {
  return useQuery({
    queryKey: ["priceHistory", game, cardId],
    enabled: !!game && !!cardId,
    queryFn: async (): Promise<PricePoint[]> => {
      try {
        const today = await fetchCatalog({ provider: "price", game: game!, cardId: cardId! });
        pricesDebug.log("today.refreshed", { game, cardId, today });
      } catch (error) {
        // Still show the history already saved if today's refresh fails.
        pricesDebug.error("today.refresh-failed", error);
      }

      const { data, error } = await supabase
        .from("price_history")
        .select("price, captured_on")
        .eq("game", game!)
        .eq("card_id", cardId!)
        .order("captured_on", { ascending: false })
        .limit(365);

      if (error) throw new Error(error.message);
      return (data ?? [])
        .map((row) => ({
          price: Number(row.price),
          capturedOn: row.captured_on as string,
        }))
        .reverse();
    },
    // Prices change once a day upstream.
    staleTime: 6 * 60 * 60 * 1000,
  });
}
