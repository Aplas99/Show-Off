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
  audience_rating: "general" | "18_plus" | null;
  description?: string | null;
  created_at: string;
  /** Curator-only customization; null unless the owner has set them. */
  accent_color?: string | null;
  banner_image_url?: string | null;
}

const SHOWCASE_SELECT =
  "id, profile_id, is_default, created_at, name, is_public, audience_rating, description, accent_color, banner_image_url";

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
    mutationFn: async (input: { name: string; isPublic?: boolean; audienceRating?: "general" | "18_plus" }) => {
      const name = input.name.replace(/\s+/g, " ").trim();
      if (!name) throw new Error("Showcase name is required");
      if (input.isPublic && !input.audienceRating) throw new Error("Choose an audience for this public showcase.");

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
          audience_rating: input.isPublic ? input.audienceRating : null,
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
      vars.showcaseIds.forEach((sid) => {
        qc.invalidateQueries({ queryKey: queryKeys.showcase.items(sid) });
        qc.invalidateQueries({ queryKey: ["showcase", "stats", sid] });
        qc.invalidateQueries({ queryKey: ["showcase:items", sid] });
      });
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
        .maybeSingle();

      if (error) throw new Error("Could not load this showcase. Please retry.");

      return data as ShowcaseRow;
    },
    enabled: !!id,
  });
}

export interface ShowcaseStats {
  itemCount: number;
  followerCount: number;
  estimatedValue: number;
  isFollowing: boolean;
}

export function useGetShowcaseStats(id: string) {
  return useQuery({
    queryKey: ["showcase", "stats", id],
    enabled: !!id,
    queryFn: async (): Promise<ShowcaseStats> => {
      const { data: { user } } = await supabase.auth.getUser();
      const [links, followers, ownFollow] = await Promise.all([
        supabase.from("showcase_items").select("item_id, items(price)").eq("showcase_id", id),
        supabase.from("showcase_follows").select("id", { count: "exact", head: true }).eq("showcase_id", id),
        user ? supabase.from("showcase_follows").select("id").eq("showcase_id", id).eq("user_id", user.id).maybeSingle() : Promise.resolve({ data: null, error: null }),
      ]);
      if (links.error) throw new Error(links.error.message);
      if (followers.error) throw new Error(followers.error.message);
      if (ownFollow.error) throw new Error(ownFollow.error.message);
      const rows = links.data as unknown as { item_id: number; items: { price: number | null } | null }[];
      return {
        itemCount: rows.length,
        followerCount: followers.count ?? 0,
        estimatedValue: rows.reduce((sum, row) => sum + (Number(row.items?.price) || 0), 0),
        isFollowing: !!ownFollow.data,
      };
    },
  });
}

export function useGetShowcaseOwner(profileId: string) {
  return useQuery({
    queryKey: ["showcase", "owner", profileId],
    enabled: !!profileId,
    queryFn: async (): Promise<{ username: string | null; avatar_url: string | null; bio: string | null } | null> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.id === profileId) {
        const { data, error } = await supabase.from("profile")
          .select("username, avatar_url, bio").eq("id", profileId).maybeSingle();
        if (error) throw new Error(error.message);
        return data;
      }
      const { data, error } = await supabase.rpc("get_public_profiles", { p_user_ids: [profileId] });
      if (error) throw new Error(error.message);
      const profile = data?.[0];
      return profile ? { username: profile.username, avatar_url: profile.avatar_url, bio: null } : null;
    },
  });
}

export function useToggleShowcaseFollow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ showcaseId, following }: { showcaseId: string; following: boolean }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Sign in to follow this showcase.");
      if (following) {
        const { error } = await supabase.from("showcase_follows").delete()
          .eq("showcase_id", showcaseId).eq("user_id", user.id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase.from("showcase_follows")
          .upsert({ showcase_id: showcaseId, user_id: user.id }, { onConflict: "user_id,showcase_id" });
        if (error) throw new Error(error.message);
      }
    },
    onSuccess: (_result, input) => {
      queryClient.invalidateQueries({ queryKey: ["showcase", "stats", input.showcaseId] });
    },
  });
}

/**
 * Toggles whether a showcase is publicly viewable (via `app/s/[id].tsx`,
 * unauthenticated). Reuses the existing `is_public` column/RLS policy —
 * it already grants `anon` read on the showcase row when true. Sharing is
 * available to every membership tier; this mutation enforces ownership via
 * the "update_own_showcase" RLS policy.
 */
export function useSetShowcasePublic() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { showcaseId: string; isPublic: boolean; audienceRating?: "general" | "18_plus"; name?: string; description?: string }) => {
      if (input.isPublic && !input.audienceRating) throw new Error("Choose an audience for this public showcase.");
      if (input.name !== undefined && (!input.name.trim() || input.name.trim().length > 100)) throw new Error("Use a showcase name between 1 and 100 characters.");
      if (input.description && input.description.length > 2000) throw new Error("Keep the description under 2,000 characters.");
      const { data, error } = await supabase
        .from("showcase")
        .update({ is_public: input.isPublic, audience_rating: input.isPublic ? input.audienceRating : null,
          ...(input.name === undefined ? {} : { name: input.name.trim() }),
          ...(input.description === undefined ? {} : { description: input.description.trim() }) })
        .eq("id", input.showcaseId)
        .select(SHOWCASE_SELECT)
        .single();

      if (error) throw new Error(error.message);
      return data as ShowcaseRow;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["social"] });
      queryClient.invalidateQueries({ queryKey: ["showcase", "public", vars.showcaseId] });
      queryClient.invalidateQueries({ queryKey: queryKeys.showcase.visible() });
      queryClient.invalidateQueries({
        queryKey: queryKeys.showcase.byId(vars.showcaseId),
      });
    },
  });
}

export function useDeleteShowcase() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: async (id: string) => {
    const { data, error } = await supabase.from("showcase").delete().eq("id", id).eq("is_default", false).select("id");
    if (error || !data?.length) throw new Error("Could not delete this showcase. The default showcase cannot be deleted.");
  }, onSuccess: () => { qc.invalidateQueries({ queryKey: ["showcase"] }); qc.invalidateQueries({ queryKey: ["social"] }); } });
}

/** Update owner-controlled accent color and optional banner image. */
export function useUpdateShowcaseCustomization() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      showcaseId: string;
      accentColor?: string | null;
      bannerImageUrl?: string | null;
    }) => {
      if (input.accentColor && !/^#[0-9A-Fa-f]{6}$/.test(input.accentColor)) {
        throw new Error("Enter a six-digit hex color, such as #A77BFF.");
      }
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
