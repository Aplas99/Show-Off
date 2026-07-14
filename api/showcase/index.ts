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
  /** Curator-only customization; null unless the owner has set them. */
  accent_color?: string | null;
  banner_image_url?: string | null;
}

const SHOWCASE_SELECT =
  "id, profile_id, is_default, created_at, name, is_public, accent_color, banner_image_url";

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
        .select(SHOWCASE_SELECT)
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

export function useCreateShowcase() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { name: string; isPublic?: boolean }) => {
      const name = input.name.replace(/\s+/g, " ").trim();
      if (!name) throw new Error("Showcase name is required");

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      const { data, error } = await supabase
        .from("showcase")
        .insert({
          profile_id: user.id,
          name,
          is_default: false,
          is_public: input.isPublic ?? false,
        })
        .select(SHOWCASE_SELECT)
        .single();

      if (error) throw new Error(error.message);
      return data as ShowcaseRow;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.showcase.visible() });
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
        .select(SHOWCASE_SELECT)
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

/**
 * Toggles whether a showcase is publicly viewable (via `app/s/[id].tsx`,
 * unauthenticated). Reuses the existing `is_public` column/RLS policy —
 * it already grants `anon` read on the showcase row when true. Callers
 * must gate this on `isCurator` themselves (see CuratorGate); this
 * mutation only enforces ownership, via "update_own_showcase" RLS.
 */
export function useSetShowcasePublic() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { showcaseId: string; isPublic: boolean }) => {
      const { data, error } = await supabase
        .from("showcase")
        .update({ is_public: input.isPublic })
        .eq("id", input.showcaseId)
        .select(SHOWCASE_SELECT)
        .single();

      if (error) throw new Error(error.message);
      return data as ShowcaseRow;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.showcase.visible() });
      queryClient.invalidateQueries({
        queryKey: queryKeys.showcase.byId(vars.showcaseId),
      });
    },
  });
}

/**
 * Update a showcase's Curator-only customization (accent color / banner
 * image). Callers must gate the entry point on `isCurator` themselves
 * (see CuratorGate) — this mutation relies on the existing
 * "update_own_showcase" RLS policy for ownership enforcement, not tier.
 */
export function useUpdateShowcaseCustomization() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      showcaseId: string;
      accentColor?: string | null;
      bannerImageUrl?: string | null;
    }) => {
      const update: Record<string, string | null> = {};
      if (input.accentColor !== undefined) update.accent_color = input.accentColor;
      if (input.bannerImageUrl !== undefined)
        update.banner_image_url = input.bannerImageUrl;

      const { data, error } = await supabase
        .from("showcase")
        .update(update)
        .eq("id", input.showcaseId)
        .select(SHOWCASE_SELECT)
        .single();

      if (error) throw new Error(error.message);
      return data as ShowcaseRow;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.showcase.visible() });
      queryClient.invalidateQueries({
        queryKey: queryKeys.showcase.byId(vars.showcaseId),
      });
    },
  });
}
