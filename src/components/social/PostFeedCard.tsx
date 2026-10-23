import ContentSafetyMenu from "@/src/components/social/ContentSafetyMenu";
import {
  useBookmarkPost,
  useIsPostBookmarked,
  useIsPostLiked,
  useLikePost,
  useUnbookmarkPost,
  useUnlikePost,
  type FeedPost,
} from "@/api/social/posts";
import { COLORS } from "@/constants/theme";
import { useHaptics } from "@/hooks/useHaptics";
import CyclingImage from "@/src/components/media/CyclingImage";
import { useProtectedVideoSource } from "@/hooks/useProtectedVideoSource";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "@/src/components/media/ProtectedImage";
import { LinearGradient } from "expo-linear-gradient";
import { useVideoPlayer, VideoView } from "expo-video";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const CARD_MARGIN_H = 12;
const IMAGE_BORDER_RADIUS = 18;

interface Props {
  post: FeedPost;
  cardHeight: number;
  tabBarHeight?: number;
  onCommentPress?: (postId: number) => void;
  isActive?: boolean;
}

function getRelativeTime(isoString: string): string {
  const now = Date.now();
  const then = new Date(isoString).getTime();
  const diffSec = Math.floor((now - then) / 1000);

  if (diffSec < 60) return "JUST NOW";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}M AGO`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}H AGO`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}D AGO`;
  const diffWeek = Math.floor(diffDay / 7);
  if (diffWeek < 5) return `${diffWeek}W AGO`;
  const diffMonth = Math.floor(diffDay / 30);
  if (diffMonth < 12) return `${diffMonth}MO AGO`;
  return `${Math.floor(diffMonth / 12)}Y AGO`;
}

/** Muted, looping, tap-to-toggle-play video for the feed. */
function FeedVideo({ url, isActive }: { url: string; isActive: boolean }) {
  const source = useProtectedVideoSource(url);
  const player = useVideoPlayer(source, (p) => {
    p.loop = true;
    p.muted = true;
  });

  useEffect(() => {
    if (isActive) {
      player.play();
    } else {
      player.pause();
    }
  }, [isActive, player]);

  return (
    <VideoView
      player={player}
      style={StyleSheet.absoluteFill}
      contentFit="cover"
      nativeControls={false}
    />
  );
}

const PostFeedCard = ({
  post,
  cardHeight,
  tabBarHeight = 0,
  onCommentPress,
  isActive,
}: Props) => {
  const haptics = useHaptics();
  const insets = useSafeAreaInsets();
  const [expanded, setExpanded] = useState(false);

  // Mock posts (api/social/mockPosts) have no rows to like or bookmark, so
  // their interactions stay local. A 0 id disables the remote lookups.
  const isMock = !!post.is_mock;
  const [mockLiked, setMockLiked] = useState(false);
  const [mockBookmarked, setMockBookmarked] = useState(false);
  const { data: remoteLiked } = useIsPostLiked(isMock ? 0 : post.id);
  const { data: remoteBookmarked } = useIsPostBookmarked(isMock ? 0 : post.id);
  const isLiked = isMock ? mockLiked : remoteLiked;
  const isBookmarked = isMock ? mockBookmarked : remoteBookmarked;
  const likePost = useLikePost();
  const unlikePost = useUnlikePost();
  const bookmarkPost = useBookmarkPost();
  const unbookmarkPost = useUnbookmarkPost();

  const likeScale = useRef(new Animated.Value(1)).current;
  const bookmarkScale = useRef(new Animated.Value(1)).current;

  const displayName = post.profile?.username || "User";
  const displayAvatar = post.profile?.avatar_url;
  const relativeTime = getRelativeTime(post.created_at);

  const videos = post.media.filter((media) => media.media_type === "video");
  const images = post.media.filter((media) => media.media_type === "image");

  const TOP_AREA = insets.top + 50;
  const HEADER_HEIGHT = 60;
  const BOTTOM_PADDING = tabBarHeight + 16;
  const TEXT_AREA_HEIGHT = 90;
  const mediaHeight =
    cardHeight - TOP_AREA - HEADER_HEIGHT - TEXT_AREA_HEIGHT - BOTTOM_PADDING;

  const formatCount = (count: number): string => {
    if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return String(count);
  };

  const springBounce = (animVal: Animated.Value) => {
    Animated.sequence([
      Animated.spring(animVal, {
        toValue: 1.4,
        useNativeDriver: true,
        speed: 50,
        bounciness: 12,
      }),
      Animated.spring(animVal, {
        toValue: 1,
        useNativeDriver: true,
        speed: 30,
        bounciness: 8,
      }),
    ]).start();
  };

  const handleLike = () => {
    if (likePost.isPending || unlikePost.isPending) return;
    haptics.medium();
    if (isMock) {
      setMockLiked((liked) => !liked);
    } else if (isLiked) {
      unlikePost.mutate(post.id);
    } else {
      likePost.mutate(post.id);
    }
    springBounce(likeScale);
  };

  const handleBookmark = () => {
    if (bookmarkPost.isPending || unbookmarkPost.isPending) return;
    haptics.light();
    if (isMock) {
      setMockBookmarked((bookmarked) => !bookmarked);
    } else if (isBookmarked) {
      unbookmarkPost.mutate(post.id);
    } else {
      bookmarkPost.mutate(post.id);
    }
    springBounce(bookmarkScale);
  };

  return (
    <View style={[styles.container, { height: cardHeight }]}>
      <View style={{ height: TOP_AREA }} />

      {/* User header */}
      <View style={styles.userHeader}>
        <TouchableOpacity style={styles.avatarContainer}>
          {displayAvatar ? (
            <Image source={{ uri: displayAvatar }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Ionicons name="person" size={18} color="#888" />
            </View>
          )}
        </TouchableOpacity>
        <View style={styles.userInfo}>
          <Text style={styles.username}>{displayName}</Text>
          <Text style={styles.timestamp}>{relativeTime}</Text>
        </View>
      </View>

      {!isMock && <ContentSafetyMenu type="post" id={post.id} ownerId={post.user_id} />}
      {/* Media */}
      <View style={[styles.mediaSection, { height: mediaHeight }]}>
        <View style={styles.mediaCard}>
          {videos.length > 0 ? (
            <FeedVideo url={videos[0].url} isActive={!!isActive} />
          ) : images.length > 0 ? (
            <CyclingImage
              urls={images.map((media) => media.url)}
              style={StyleSheet.absoluteFill}
              contentFit={Platform.OS === "web" ? "contain" : "cover"}
              autoCycle={!!isActive}
            />
          ) : (
            <View style={styles.mediaEmpty}>
              <Ionicons name="chatbox-ellipses-outline" size={44} color="rgba(255,255,255,0.4)" />
            </View>
          )}

          <LinearGradient
            colors={["transparent", "rgba(0,0,0,0.7)"]}
            style={styles.mediaBottomGradient}
            pointerEvents="none"
          />

          {/* Referenced showcase item */}
          {post.item && (
            <View style={styles.itemChip}>
              {post.item.image_url ? (
                <Image source={{ uri: post.item.image_url }} style={styles.itemChipImage} contentFit="cover" />
              ) : (
                <View style={[styles.itemChipImage, styles.itemChipImageFallback]}>
                  <Ionicons name="cube-outline" size={14} color="#FFF" />
                </View>
              )}
              <View style={styles.itemChipText}>
                <Text style={styles.itemChipTitle} numberOfLines={1}>
                  {post.item.title}
                </Text>
                {post.item.subtitle ? (
                  <Text style={styles.itemChipSubtitle} numberOfLines={1}>
                    {post.item.subtitle}
                  </Text>
                ) : null}
              </View>
            </View>
          )}

          {/* Caption */}
          {!!post.caption && (
            <View style={styles.textOverlay}>
              <Text
                style={styles.caption}
                numberOfLines={expanded ? undefined : 3}
                onPress={() => setExpanded(!expanded)}
              >
                {post.caption}
              </Text>
            </View>
          )}
        </View>

        {/* Action sidebar */}
        <View style={styles.glassSidebar}>
          <TouchableOpacity style={styles.sidebarAction} onPress={handleLike}>
            <Animated.View style={{ transform: [{ scale: likeScale }] }}>
              <Ionicons name="heart" size={28} color={isLiked ? "#ff6e84" : "#FFF"} />
            </Animated.View>
            <Text style={styles.sidebarCount}>{formatCount(post.like_count + (mockLiked ? 1 : 0))}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.sidebarAction}
            onPress={() => {
              haptics.light();
              if (!isMock) onCommentPress?.(post.id);
            }}
          >
            <Ionicons name="chatbubble" size={24} color="#FFF" />
            <Text style={styles.sidebarCount}>{post.comment_count}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.sidebarAction} onPress={handleBookmark}>
            <Animated.View style={{ transform: [{ scale: bookmarkScale }] }}>
              <Ionicons
                name="bookmark"
                size={24}
                color={isBookmarked ? COLORS.primary : "#FFF"}
              />
            </Animated.View>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: "100%",
    backgroundColor: "#000",
    overflow: "hidden",
  },
  userHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
  },
  avatarContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: COLORS.primary,
    overflow: "hidden",
    backgroundColor: "rgba(30,30,30,0.6)",
  },
  avatar: { width: "100%", height: "100%" },
  avatarPlaceholder: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(30,30,30,0.6)",
  },
  userInfo: { flex: 1 },
  username: { color: "#FFF", fontSize: 15, fontWeight: "800" },
  timestamp: {
    fontSize: 10,
    color: "rgba(255,255,255,0.55)",
    letterSpacing: 1.2,
    fontWeight: "700",
    marginTop: 2,
  },
  mediaSection: {
    paddingHorizontal: CARD_MARGIN_H,
    position: "relative",
  },
  mediaCard: {
    flex: 1,
    width: "100%",
    borderRadius: IMAGE_BORDER_RADIUS,
    overflow: "hidden",
    backgroundColor: "#101014",
  },
  mediaEmpty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  mediaBottomGradient: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 140,
  },
  itemChip: {
    position: "absolute",
    top: 12,
    left: 12,
    maxWidth: "70%",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 6,
    paddingRight: 12,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.62)",
  },
  itemChipImage: {
    width: 34,
    height: 34,
    borderRadius: 8,
  },
  itemChipImageFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  itemChipText: { flexShrink: 1 },
  itemChipTitle: { color: "#FFF", fontSize: 12, fontWeight: "800" },
  itemChipSubtitle: { color: "rgba(255,255,255,0.78)", fontSize: 11, marginTop: 1 },
  textOverlay: {
    position: "absolute",
    left: 14,
    right: 60,
    bottom: 14,
  },
  caption: {
    color: "rgba(255,255,255,0.92)",
    fontSize: 13,
    lineHeight: 18,
  },
  glassSidebar: {
    position: "absolute",
    right: CARD_MARGIN_H + 10,
    bottom: 18,
    alignItems: "center",
    gap: 18,
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: 24,
    backgroundColor: "rgba(20,20,24,0.55)",
  },
  sidebarAction: { alignItems: "center", gap: 3 },
  sidebarCount: { color: "#FFF", fontSize: 11, fontWeight: "700" },
});

export default PostFeedCard;
