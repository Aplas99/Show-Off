import { supabase } from "@/lib/supabase";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export const queryKeys = {
  showcase: {
    all: () => ["showcase"],
    visible: () => ["showcase", "visible"],
    byId: (id: string) => ["showcase", "byId", id],
    items: (id: string) => ["showcase", "items", id],
  },
};

export interface ShowcaseRow {
  id: string;
  profile_id: string;
  name: string;
  is_default: boolean;
  is_public: boolean;
  created_at: string;
}

/**
 * Fetch all visible showcases for the current user.
 */
export function useGetVisibleShowcases() {
  return useQuery({
    queryKey: queryKeys.showcase.visible(),
    queryFn: async (): Promise<ShowcaseRow[]> => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return [];

      const { data, error } = await supabase
        .from("showcase")
        .select("id, profile_id, is_default, created_at, name, is_public")
        .eq("profile_id", user.id)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: false });

      if (error) {
        throw new Error(error.message);
      }

      return (data ?? []) as ShowcaseRow[];
    },
  });
}

/**
 * Link an item to one or more showcases.
 */
export function useLinkItemToShowcases() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { itemId: number; showcaseIds: string[] }) => {
      // In the real implementation this links items.
      // For now we just simulate it or do a basic insert if the table exists.
      // Assuming 'showcase_items' table exists as per reference repo.

      const rows = input.showcaseIds.map((sid) => ({
        showcase_id: sid,
        item_id: input.itemId,
      }));

      if (rows.length === 0) return;

      const { error } = await supabase.from("showcase_items").insert(rows);
      if (error) {
        console.error("[Showcase] ❌ Link error:", error);
        throw new Error(error.message);
      }
    },
    onSuccess: (_data, vars) => {
      vars.showcaseIds.forEach((sid) =>
        qc.invalidateQueries({ queryKey: queryKeys.showcase.items(sid) })
      );
    },
  });
}

/**
 * Fetch a single showcase by ID.
 */
export function useGetShowcase(id: string) {
  return useQuery({
    queryKey: queryKeys.showcase.byId(id),
    queryFn: async (): Promise<ShowcaseRow | null> => {
      const { data, error } = await supabase
        .from("showcase")
        .select("id, profile_id, is_default, created_at, name, is_public")
        .eq("id", id)
        .single();

      if (error) {
        // Return null if not found
        return null;
      }

      return data as ShowcaseRow;
    },
    enabled: !!id,
  });
}
