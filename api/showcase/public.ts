import { supabase } from "@/lib/supabase";
import { useQuery } from "@tanstack/react-query";

/**
 * Read model for the anonymous public showcase route (app/s/[id].tsx).
 * Deliberately separate from the authenticated `api/showcase` hooks —
 * this is the only code path an unauthenticated visitor can reach, so it
 * stays small and auditable rather than reusing the owner-facing hooks.
 */
export interface PublicShowcaseItem {
  id: number;
  price: number | null;
  currency_code: string | null;
  custom_title: string | null;
  image_url: string | null;
  pokemon_tcg_card_id: string | null;
  card_name: string | null;
  card_image_small: string | null;
  card_image_large: string | null;
  card_set_name: string | null;
  card_number: string | null;
  card_rarity: string | null;
}

export interface PublicShowcase {
  id: string;
  name: string;
  audience_rating: "general" | "18_plus";
  accent_color: string | null;
  banner_image_url: string | null;
  created_at: string;
  owner: {
    id: string;
    username: string | null;
    avatar_url: string | null;
  };
  items: PublicShowcaseItem[];
}

/**
 * Fetches a showcase via the `get_public_showcase` SECURITY DEFINER RPC,
 * which returns null for a private or nonexistent showcase (both look
 * the same to an anonymous caller, deliberately). Works whether the
 * caller is signed in or not.
 */
export function usePublicShowcase(showcaseId: string | undefined) {
  return useQuery({
    queryKey: ["showcase", "public", showcaseId],
    queryFn: async (): Promise<PublicShowcase | null> => {
      const { data, error } = await supabase.rpc("get_public_showcase", {
        p_showcase_id: showcaseId,
      });
      if (error) throw new Error(error.message);
      return (data as PublicShowcase | null) ?? null;
    },
    enabled: !!showcaseId,
  });
}
