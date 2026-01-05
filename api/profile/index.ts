import { supabase } from "@/lib/supabase";
import { useQuery } from "@tanstack/react-query";

// Get current user profile data with social stats
export const useGetCurrentUserProfile = () => {
    return useQuery({
        queryKey: ["profile", "current"],
        queryFn: async () => {
            // Get current session
            const {
                data: { session },
                error: sessionError,
            } = await supabase.auth.getSession();

            if (sessionError) {
                throw new Error(`Session error: ${sessionError.message}`);
            }

            if (!session?.user) {
                throw new Error("No authenticated user found");
            }

            const userId = session.user.id;
            console.log("[Profile] 👤 Current user ID:", userId);

            // Fetch user profile data from your profile table
            const { data: profile, error: profileError } = await supabase
                .from("profile")
                .select("*")
                .eq("id", userId)
                .single();

            if (profileError) {
                throw new Error(`Profile fetch error: ${profileError.message}`);
            }

            // Get social stats (follower/following counts)
            const [followersResult, followingResult, itemsResult] = await Promise.all(
                [
                    supabase
                        .from("follows")
                        .select("follower_id", { count: "exact", head: true })
                        .eq("following_id", userId),
                    supabase
                        .from("follows")
                        .select("following_id", { count: "exact", head: true })
                        .eq("follower_id", userId),
                    supabase
                        .from("items")
                        .select("id", { count: "exact", head: true })
                        .eq("user_id", userId),
                ]
            );

            const socialStats = {
                followers: followersResult.count || 0,
                following: followingResult.count || 0,
                items: itemsResult.count || 0,
            };

            return {
                user: session.user,
                profile: profile,
                socialStats,
            };
        },
        enabled: true, // Always try to fetch when component mounts
    });
};
