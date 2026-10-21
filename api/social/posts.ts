import { getHasActiveMembership } from "@/api/memberships";
import { uploadImageToSupabase } from "@/api/storage";
import { createActionLogger } from "@/lib/actionDebug";
import { supabase } from "@/lib/supabase";
import { getRiftboundSetName } from "@/constants/riftboundSets";
import {
    useInfiniteQuery,
    useMutation,
    useQuery,
    useQueryClient,
} from "@tanstack/react-query";

const postDebug = createActionLogger("Posts");

/** Media attachments per post: free tier vs Curator. Per-file size limits
 * (5MB free / 10MB Founding Curator / 100MB Curator) are enforced in
 * api/storage. */
export const FREE_MAX_MEDIA_PER_POST = 3;
export const PAID_MAX_MEDIA_PER_POST = 10;

export interface PostMedia {
    id: number;
    media_type: "image" | "video";
    url: string;
    position: number;
}

export interface FeedPost {
    id: number;
    user_id: string;
    item_id: number | null;
    caption: string | null;
    like_count: number;
    comment_count: number;
    created_at: string;
    media: PostMedia[];
    profile?: {
        id: string;
        username: string;
        first_name: string | null;
        last_name: string | null;
        avatar_url: string | null;
    } | null;
    /** Referenced showcase item, when the author attached one. */
    item?: {
        id: number;
        image_url: string | null;
        title: string;
        subtitle: string | null;
    } | null;
}

function mapItemReference(item: any): FeedPost["item"] {
    if (!item) return null;
    const pokemonCard = item.pokemon_tcg_cards;
    const magicCard = item.magic_cards;
    const riftboundCard = item.riftbound_cards;
    const title =
        item.products?.searchableTitle ||
        pokemonCard?.name ||
        magicCard?.name ||
        riftboundCard?.name ||
        item.custom_title ||
        "Collection item";
    const subtitle =
        item.products?.searchableBrand ||
        pokemonCard?.set_name ||
        magicCard?.set_name ||
        (riftboundCard ? getRiftboundSetName(riftboundCard.set_code, riftboundCard.set_name) : null) ||
        null;
    const image =
        item.image_url ||
        pokemonCard?.image_small ||
        magicCard?.image_small ||
        riftboundCard?.image_url ||
        item.products?.data?.images?.[0] ||
        null;
    return { id: item.id, image_url: image, title, subtitle };
}

const POST_SELECT = `
  id, user_id, item_id, caption, like_count, comment_count, created_at,
  post_media ( id, media_type, url, position ),
  items (
    id, image_url, custom_title,
    products ( searchableTitle, searchableBrand, data ),
    pokemon_tcg_cards ( name, set_name, image_small ),
    magic_cards ( name, set_name, image_small ),
    riftbound_cards ( name, set_code, set_name, image_url )
  )
`;

export const useGetPostsFeed = ({
    limit = 10,
    enabled = true,
}: { limit?: number; enabled?: boolean } = {}) => {
    return useInfiniteQuery({
        queryKey: ["social", "posts-feed"],
        enabled,
        queryFn: async ({ pageParam }: { pageParam?: string }) => {
            let query = supabase
                .from("posts")
                .select(POST_SELECT)
                .order("created_at", { ascending: false })
                .limit(limit + 1);

            if (pageParam) {
                query = query.lt("created_at", pageParam);
            }

            const { data, error } = await query;
            if (error) {
                postDebug.error("feed.fetch-failed", error);
                throw new Error(error.message);
            }

            const rows = data ?? [];
            const userIds = [...new Set(rows.map((row: any) => row.user_id as string))];

            let profiles: any[] = [];
            if (userIds.length > 0) {
                const { data: profileRows, error: profileError } = await supabase
                    .rpc("get_public_profiles", { p_user_ids: userIds });
                if (profileError) {
                    postDebug.error("feed.profiles-failed", profileError);
                } else {
                    profiles = profileRows ?? [];
                }
            }
            const profileMap = new Map(profiles.map((p) => [p.id, p]));

            const posts: FeedPost[] = rows.map((row: any) => ({
                id: row.id,
                user_id: row.user_id,
                item_id: row.item_id,
                caption: row.caption,
                like_count: row.like_count,
                comment_count: row.comment_count,
                created_at: row.created_at,
                media: [...(row.post_media ?? [])].sort(
                    (a: PostMedia, b: PostMedia) => a.position - b.position,
                ),
                profile: profileMap.get(row.user_id) ?? null,
                item: mapItemReference(row.items),
            }));

            const hasMore = posts.length > limit;
            const pagePosts = hasMore ? posts.slice(0, limit) : posts;
            return {
                items: pagePosts,
                nextCursor:
                    hasMore && pagePosts.length > 0
                        ? pagePosts[pagePosts.length - 1].created_at
                        : null,
            };
        },
        initialPageParam: undefined,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
        staleTime: 1000 * 60 * 2,
    });
};

export interface CreatePostMediaInput {
    uri: string;
    type: "image" | "video";
    fileSize?: number;
}

export function useCreatePost() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (input: {
            caption: string;
            itemId?: number | null;
            media: CreatePostMediaInput[];
        }) => {
            const {
                data: { user },
            } = await supabase.auth.getUser();
            if (!user) throw new Error("Not authenticated");

            if (input.media.length === 0 && !input.caption.trim()) {
                throw new Error("Add a photo, video, or caption to post");
            }

            const isPaidUser = await getHasActiveMembership();
            const maxMedia = isPaidUser
                ? PAID_MAX_MEDIA_PER_POST
                : FREE_MAX_MEDIA_PER_POST;
            if (input.media.length > maxMedia) {
                throw new Error(
                    isPaidUser
                        ? `Posts can include up to ${maxMedia} photos or videos.`
                        : `Free accounts can attach up to ${maxMedia} photos or videos per post. Upgrade to Curator for more.`,
                );
            }

            postDebug.log("create.started", {
                mediaCount: input.media.length,
                hasItem: input.itemId != null,
                captionLength: input.caption.trim().length,
            });

            // Upload media first so a failed upload never leaves a media-less
            // post behind.
            const uploaded: { type: "image" | "video"; url: string }[] = [];
            for (const media of input.media) {
                const url = await uploadImageToSupabase({
                    uri: media.uri,
                    fileSize: media.fileSize,
                    bucketName: "post-media",
                    kind: "media",
                });
                uploaded.push({ type: media.type, url });
            }

            const { data: post, error } = await supabase
                .from("posts")
                .insert({
                    user_id: user.id,
                    item_id: input.itemId ?? null,
                    caption: input.caption.trim() || null,
                })
                .select("id")
                .single();
            if (error) {
                postDebug.error("create.insert-failed", error);
                throw new Error(error.message);
            }

            if (uploaded.length > 0) {
                const { error: mediaError } = await supabase.from("post_media").insert(
                    uploaded.map((media, index) => ({
                        post_id: post.id,
                        media_type: media.type,
                        url: media.url,
                        position: index,
                    })),
                );
                if (mediaError) {
                    // Roll the post back rather than leaving a broken shell.
                    await supabase.from("posts").delete().eq("id", post.id);
                    postDebug.error("create.media-insert-failed", mediaError);
                    throw new Error(mediaError.message);
                }
            }

            postDebug.log("create.completed", { postId: post.id });
            return { postId: post.id as number };
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["social", "posts-feed"] });
        },
    });
}

export function useDeletePost() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (postId: number) => {
            const { error } = await supabase.from("posts").delete().eq("id", postId);
            if (error) throw new Error(error.message);
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["social", "posts-feed"] });
        },
    });
}

// ---------------------------------------------------------------------------
// Interactions
// ---------------------------------------------------------------------------

export function useIsPostLiked(postId: number) {
    return useQuery({
        queryKey: ["social", "post-like", postId],
        queryFn: async (): Promise<boolean> => {
            const {
                data: { user },
            } = await supabase.auth.getUser();
            if (!user) return false;
            const { data } = await supabase
                .from("post_likes")
                .select("post_id")
                .eq("post_id", postId)
                .eq("user_id", user.id)
                .maybeSingle();
            return !!data;
        },
        enabled: !!postId,
    });
}

export function useLikePost() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (postId: number) => {
            const {
                data: { user },
            } = await supabase.auth.getUser();
            if (!user) throw new Error("Not authenticated");
            const { error } = await supabase
                .from("post_likes")
                .insert({ post_id: postId, user_id: user.id });
            if (error && error.code !== "23505") throw error;
        },
        onSuccess: (_, postId) => {
            qc.invalidateQueries({ queryKey: ["social", "post-like", postId] });
            qc.invalidateQueries({ queryKey: ["social", "posts-feed"] });
        },
    });
}

export function useUnlikePost() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (postId: number) => {
            const {
                data: { user },
            } = await supabase.auth.getUser();
            if (!user) throw new Error("Not authenticated");
            const { error } = await supabase
                .from("post_likes")
                .delete()
                .eq("post_id", postId)
                .eq("user_id", user.id);
            if (error) throw error;
        },
        onSuccess: (_, postId) => {
            qc.invalidateQueries({ queryKey: ["social", "post-like", postId] });
            qc.invalidateQueries({ queryKey: ["social", "posts-feed"] });
        },
    });
}

export function useIsPostBookmarked(postId: number) {
    return useQuery({
        queryKey: ["social", "post-bookmark", postId],
        queryFn: async (): Promise<boolean> => {
            const {
                data: { user },
            } = await supabase.auth.getUser();
            if (!user) return false;
            const { data } = await supabase
                .from("post_bookmarks")
                .select("post_id")
                .eq("post_id", postId)
                .eq("user_id", user.id)
                .maybeSingle();
            return !!data;
        },
        enabled: !!postId,
    });
}

export function useBookmarkPost() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (postId: number) => {
            const {
                data: { user },
            } = await supabase.auth.getUser();
            if (!user) throw new Error("Not authenticated");
            const { error } = await supabase
                .from("post_bookmarks")
                .insert({ post_id: postId, user_id: user.id });
            if (error && error.code !== "23505") throw error;
        },
        onSuccess: (_, postId) => {
            qc.invalidateQueries({ queryKey: ["social", "post-bookmark", postId] });
        },
    });
}

export function useUnbookmarkPost() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (postId: number) => {
            const {
                data: { user },
            } = await supabase.auth.getUser();
            if (!user) throw new Error("Not authenticated");
            const { error } = await supabase
                .from("post_bookmarks")
                .delete()
                .eq("post_id", postId)
                .eq("user_id", user.id);
            if (error) throw error;
        },
        onSuccess: (_, postId) => {
            qc.invalidateQueries({ queryKey: ["social", "post-bookmark", postId] });
        },
    });
}

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

export interface PostComment {
    id: number;
    post_id: number;
    user_id: string;
    content: string;
    created_at: string;
    profile?: { username: string; avatar_url: string | null };
}

export function useGetPostComments({
    postId,
    enabled = true,
}: {
    postId: number;
    enabled?: boolean;
}) {
    return useQuery({
        queryKey: ["social", "post-comments", postId],
        enabled: !!postId && enabled,
        queryFn: async (): Promise<PostComment[]> => {
            const { data, error } = await supabase
                .from("post_comments")
                .select("id, post_id, user_id, content, created_at")
                .eq("post_id", postId)
                .order("created_at", { ascending: false });
            if (error) throw new Error(error.message);

            const comments = data ?? [];
            const userIds = [...new Set(comments.map((c) => c.user_id))];
            let profileMap = new Map<string, { username: string; avatar_url: string | null }>();
            if (userIds.length > 0) {
                const { data: profiles } = await supabase.rpc("get_public_profiles", {
                    p_user_ids: userIds,
                });
                profileMap = new Map(
                    ((profiles ?? []) as any[]).map((p) => [
                        p.id,
                        { username: p.username, avatar_url: p.avatar_url },
                    ]),
                );
            }

            return comments.map((comment) => ({
                ...comment,
                profile: profileMap.get(comment.user_id),
            }));
        },
    });
}

export function useCreatePostComment() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ postId, content }: { postId: number; content: string }) => {
            const {
                data: { user },
            } = await supabase.auth.getUser();
            if (!user) throw new Error("Not authenticated");
            const { error } = await supabase.from("post_comments").insert({
                post_id: postId,
                user_id: user.id,
                content: content.trim(),
            });
            if (error) throw new Error(error.message);
        },
        onSuccess: (_, { postId }) => {
            qc.invalidateQueries({ queryKey: ["social", "post-comments", postId] });
            qc.invalidateQueries({ queryKey: ["social", "posts-feed"] });
        },
    });
}
