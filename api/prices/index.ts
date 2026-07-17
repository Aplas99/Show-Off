import { supabase } from "@/lib/supabase";
import { useQuery } from "@tanstack/react-query";

export interface PricePoint {
  price: number;
  capturedOn: string;
}

/**
 * Daily market-price snapshots for one card (Curator price-history graph).
 * Rows accrue via DB triggers on the card caches — any cache write for the
 * card records that day's price.
 */
export function usePriceHistory(
  game: "pokemon" | "magic",
  cardId: string | null | undefined,
) {
  return useQuery({
    queryKey: ["priceHistory", game, cardId],
    enabled: !!cardId,
    queryFn: async (): Promise<PricePoint[]> => {
      const { data, error } = await supabase
        .from("price_history")
        .select("price, captured_on")
        .eq("game", game)
        .eq("card_id", cardId!)
        .order("captured_on", { ascending: true })
        .limit(365);

      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => ({
        price: Number(row.price),
        capturedOn: row.captured_on as string,
      }));
    },
    staleTime: 10 * 60 * 1000,
  });
}
