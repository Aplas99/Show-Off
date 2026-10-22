import { supabase } from "@/lib/supabase";
import { getRiftboundSetName } from "@/constants/riftboundSets";
import { getTcgGameName } from "@/constants/tcgGames";
import { TCG_CARD_ITEM_COLUMNS, tcgCardItemProduct } from "@/lib/pokewalletCatalog";
import { useInfiniteQuery } from "@tanstack/react-query";

export interface FeedItem {
    id: number;
    user_id: string;
    product_ean: string | null;
    condition: string | null;
    user_description: string | null;
    image_url: string | null;
    is_public: boolean;
    like_count: number;
    comment_count: number;
    created_at: string;
    profile?: {
        id: string;
        username: string;
        first_name: string | null;
        last_name: string | null;
        avatar_url: string | null;
    } | null;
    products?: {
        ean: string;
        searchableTitle: string;
        searchableDescription: string | null;
        searchableBrand: string;
        data: any;
    } | null;
}

// Get personalized feed with infinite scroll
export const useGetFeed = ({ limit = 20, enabled = true }: { limit?: number; enabled?: boolean } = {}) => {
    return useInfiniteQuery({
        queryKey: ["social", "feed"],
        enabled,
        queryFn: async ({ pageParam }: { pageParam?: string }) => {
            const {
                data: { session },
                error: sessionError,
            } = await supabase.auth.getSession();

            if (sessionError || !session?.user) {
                throw new Error("Not authenticated");
            }

            // Build query for all public items
            let query = supabase
                .from("items")
                .select(
                    `
          id,
          user_id,
          product_ean,
          condition,
          user_description,
          image_url,
          is_public,
          like_count,
          comment_count,
          created_at,
          products (
            ean,
            searchableTitle,
            searchableDescription,
            searchableBrand,
            data
          ),
          pokemon_tcg_cards (
            id, name, set_name, number, rarity, image_small, image_large
          ),
          magic_cards (
            id, name, set_name, collector_number, rarity, image_small, image_normal
          ),
          riftbound_cards (
            id, name, set_code, set_name, collector_number, rarity, image_url
          ),
          tcg_cards ( ${TCG_CARD_ITEM_COLUMNS} )
        `
                )
                .eq("is_public", true)
                .order("created_at", { ascending: false })
                .limit(limit + 1); // Fetch one extra to determine if there's more

            // Apply cursor pagination if provided
            if (pageParam) {
                query = query.lt("created_at", pageParam);
            }

            const { data: itemsData, error } = await query;

            if (error) {
                console.error("[Feed] Query error:", error);
                throw new Error(`Failed to fetch feed: ${error.message}`);
            }

            // Get unique user IDs from items
            const userIds = [
                ...new Set(
                    (itemsData || []).map(
                        (item: any) => item.user_id as string
                    )
                ),
            ];

            // Fetch profiles via the column-limited SECURITY DEFINER RPC —
            // a direct table read would come back empty for other users
            // under owner-only RLS, leaving every post attributed to "User".
            let profilesData: any[] = [];
            if (userIds.length > 0) {
                const { data: profiles, error: profilesError } = await supabase
                    .rpc("get_public_profiles", { p_user_ids: userIds });

                if (profilesError) {
                    console.error("[Feed] Profiles error:", profilesError);
                } else {
                    profilesData = profiles || [];
                }
            }

            // Create a map of user_id -> profile for quick lookup
            const profileMap = new Map(profilesData.map((p) => [p.id, p]));

            // Combine items with their profiles. Trading-card items have no
            // products row — synthesize one from the card cache so the feed
            // card renders a real title/image instead of a placeholder.
            const items = (itemsData || []).map((item: any) => {
                const pokemonCard = item.pokemon_tcg_cards;
                const magicCard = item.magic_cards;
                const riftboundCard = item.riftbound_cards;
                const tcgCard = item.tcg_cards;
                let products = item.products;
                if (!products && pokemonCard) {
                    products = {
                        ean: null,
                        searchableTitle: pokemonCard.name,
                        searchableDescription: [
                            pokemonCard.set_name,
                            `#${pokemonCard.number}`,
                            pokemonCard.rarity,
                        ].filter(Boolean).join(" • "),
                        searchableBrand: "Pokémon",
                        data: {
                            images: [
                                pokemonCard.image_large,
                                pokemonCard.image_small,
                            ].filter(Boolean),
                        },
                    };
                } else if (!products && magicCard) {
                    products = {
                        ean: null,
                        searchableTitle: magicCard.name,
                        searchableDescription: [
                            magicCard.set_name,
                            magicCard.collector_number
                                ? `#${magicCard.collector_number}`
                                : null,
                            magicCard.rarity,
                        ].filter(Boolean).join(" • "),
                        searchableBrand: "Magic: The Gathering",
                        data: {
                            images: [
                                magicCard.image_normal,
                                magicCard.image_small,
                            ].filter(Boolean),
                        },
                    };
                } else if (!products && riftboundCard) {
                    products = {
                        ean: null,
                        searchableTitle: riftboundCard.name,
                        searchableDescription: [
                            getRiftboundSetName(riftboundCard.set_code, riftboundCard.set_name),
                            riftboundCard.collector_number != null
                                ? `#${riftboundCard.collector_number}`
                                : null,
                            riftboundCard.rarity,
                        ].filter(Boolean).join(" • "),
                        searchableBrand: "Riftbound",
                        data: {
                            images: [riftboundCard.image_url].filter(Boolean),
                        },
                    };
                } else if (!products && tcgCard) {
                    products = tcgCardItemProduct(tcgCard, getTcgGameName(tcgCard.game));
                }
                return {
                    ...item,
                    products,
                    profile: profileMap.get(item.user_id as string) || null,
                };
            }) as FeedItem[];

            const hasMore = items.length > limit;
            const feedItems = hasMore ? items.slice(0, limit) : items;
            const nextCursor =
                hasMore && feedItems.length > 0
                    ? feedItems[feedItems.length - 1].created_at
                    : null;

            return {
                items: feedItems,
                nextCursor,
            };
        },
        initialPageParam: undefined,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
        staleTime: 1000 * 60 * 5, // 5 minutes - data fresh for 5 min
    });
};
