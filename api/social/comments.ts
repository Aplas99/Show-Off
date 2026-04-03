import { supabase } from "@/lib/supabase";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface Comment {
    id: string;
    item_id: number;
    user_id: string;
    content: string;
    created_at: string;
    profile?: {
        username: string;
        avatar_url: string | null;
    };
}

export function useGetItemCommentCount({ itemId, enabled = true }: { itemId: number; enabled?: boolean }) {
    return useQuery({
        queryKey: ["social", "comments", "count", itemId],
        enabled: !!itemId && enabled,
        queryFn: async (): Promise<number> => {
            const { error, count } = await supabase
                .from("comments")
                .select("id", { count: "exact", head: true })
                .eq("item_id", itemId);

            if (error) {
                // An empty message usually means an RLS policy is blocking the request.
                // The count is a non-critical UI decoration — return 0 gracefully.
                // Fix: add a SELECT policy on the comments table in Supabase Dashboard.
                console.warn("[Comments] Count query blocked (check RLS policy):", error);
                return 0;
            }

            return count ?? 0;
        },
    });
}

export function useGetItemComments({ itemId, enabled = true }: { itemId: number; enabled?: boolean }) {
    return useQuery({
        queryKey: ["social", "comments", itemId],
        enabled: !!itemId && enabled,
        queryFn: async (): Promise<Comment[]> => {
            const { data: commentsData, error: commentsError } = await supabase
                .from("comments")
                .select(`id, item_id, user_id, content, created_at`)
                .eq("item_id", itemId)
                .order("created_at", { ascending: false });

            if (commentsError) {
                console.error("[Comments] Fetch error:", commentsError);
                throw commentsError;
            }

            const comments = commentsData || [];
            const userIds = Array.from(new Set(comments.map((c) => c.user_id)));

            let profileMap = new Map<string, { username: string; avatar_url: string | null }>();
            if (userIds.length > 0) {
                const { data: profiles, error: profilesError } = await supabase
                    .from("profile")
                    .select("id, username, avatar_url")
                    .in("id", userIds);

                if (profilesError) {
                    console.error("[Comments] Profile fetch error:", profilesError);
                } else if (profiles) {
                    profileMap = new Map(profiles.map((p) => [p.id, { username: p.username, avatar_url: p.avatar_url }]));
                }
            }

            return comments.map((comment) => ({
                ...comment,
                profile: profileMap.get(comment.user_id) ?? undefined,
            }));
        },
    });
}

export function useCreateComment() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ itemId, content }: { itemId: number; content: string }) => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("Not authenticated");

            const { data, error } = await supabase
                .from("comments")
                .insert({
                    item_id: itemId,
                    user_id: user.id,
                    content,
                })
                .select()
                .single();

            if (error) throw error;
            return data;
        },
        onSuccess: (_, vars) => {
            qc.invalidateQueries({ queryKey: ["social", "comments", vars.itemId] });
            qc.invalidateQueries({ queryKey: ["social", "feed"] });
        },
    });
}
