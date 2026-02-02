import { supabase } from "@/lib/supabase";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export function useIsItemLiked(itemId: number) {
    return useQuery({
        queryKey: ["social", "interactions", "like", itemId],
        queryFn: async (): Promise<boolean> => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return false;

            const { data, error } = await supabase
                .from("likes")
                .select("id")
                .eq("item_id", itemId)
                .eq("user_id", user.id)
                .maybeSingle();

            if (error) return false;
            return !!data;
        },
        enabled: !!itemId,
    });
}

export function useLikeItem() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (itemId: number) => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("Not authenticated");

            const { error } = await supabase
                .from("likes")
                .insert({ item_id: itemId, user_id: user.id });

            if (error) throw error;
        },
        onSuccess: (_, itemId) => {
            qc.invalidateQueries({ queryKey: ["social", "interactions", "like", itemId] });
            qc.invalidateQueries({ queryKey: ["social", "feed"] });
        },
    });
}

export function useUnlikeItem() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (itemId: number) => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("Not authenticated");

            const { error } = await supabase
                .from("likes")
                .delete()
                .eq("item_id", itemId)
                .eq("user_id", user.id);

            if (error) throw error;
        },
        onSuccess: (_, itemId) => {
            qc.invalidateQueries({ queryKey: ["social", "interactions", "like", itemId] });
            qc.invalidateQueries({ queryKey: ["social", "feed"] });
        },
    });
}

export function useIsItemBookmarked(itemId: number) {
    return useQuery({
        queryKey: ["social", "interactions", "bookmark", itemId],
        queryFn: async (): Promise<boolean> => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return false;

            const { data, error } = await supabase
                .from("bookmarks")
                .select("id")
                .eq("item_id", itemId)
                .eq("user_id", user.id)
                .maybeSingle();

            if (error) return false;
            return !!data;
        },
        enabled: !!itemId,
    });
}

export function useBookmarkItem() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (itemId: number) => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("Not authenticated");

            const { error } = await supabase
                .from("bookmarks")
                .insert({ item_id: itemId, user_id: user.id });

            if (error) throw error;
        },
        onSuccess: (_, itemId) => {
            qc.invalidateQueries({ queryKey: ["social", "interactions", "bookmark", itemId] });
        },
    });
}

export function useUnbookmarkItem() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (itemId: number) => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("Not authenticated");

            const { error } = await supabase
                .from("bookmarks")
                .delete()
                .eq("item_id", itemId)
                .eq("user_id", user.id);

            if (error) throw error;
        },
        onSuccess: (_, itemId) => {
            qc.invalidateQueries({ queryKey: ["social", "interactions", "bookmark", itemId] });
        },
    });
}
