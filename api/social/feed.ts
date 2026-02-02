import { supabase } from "@/lib/supabase";
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
          )
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

            // Fetch profiles for all users
            let profilesData: any[] = [];
            if (userIds.length > 0) {
                const { data: profiles, error: profilesError } = await supabase
                    .from("profile") // Note: changed from 'profiles' to 'profile'
                    .select("id, username, first_name, last_name, avatar_url")
                    .in("id", userIds);

                if (profilesError) {
                    console.error("[Feed] Profiles error:", profilesError);
                } else {
                    profilesData = profiles || [];
                }
            }

            // Create a map of user_id -> profile for quick lookup
            const profileMap = new Map(profilesData.map((p) => [p.id, p]));

            // Combine items with their profiles
            const items = (itemsData || []).map((item: any) => ({
                ...item,
                profile: profileMap.get(item.user_id as string) || null,
            })) as FeedItem[];

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
