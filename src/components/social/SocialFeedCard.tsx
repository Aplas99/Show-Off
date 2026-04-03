import { useGetItemCommentCount } from "@/api/social/comments";
import { FeedItem } from "@/api/social/feed";
import {
  useBookmarkItem,
  useIsItemBookmarked,
  useIsItemLiked,
  useLikeItem,
  useUnbookmarkItem,
  useUnlikeItem,
} from "@/api/social/interactions";
import { COLORS } from "@/constants/theme";
import { useHaptics } from "@/hooks/useHaptics";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import React, { useCallback, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const { width: screenWidth } = Dimensions.get("window");
const CARD_MARGIN_H = 12;
const IMAGE_BORDER_RADIUS = 18;

interface Props {
  item: FeedItem;
  cardHeight: number;
  tabBarHeight?: number;
  onCommentPress?: (itemId: number) => void;
  isActive?: boolean;
}

/**
 * Compute a human-readable relative timestamp from an ISO date string.
 */
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

const SocialFeedCard = ({
  item,
  cardHeight,
  tabBarHeight = 0,
  onCommentPress,
  isActive,
}: Props) => {
  const haptics = useHaptics();
  const insets = useSafeAreaInsets();
  const [expanded, setExpanded] = useState(false);

  const itemId = typeof item.id === "number" ? item.id : parseInt(item.id);
  const { data: isLiked } = useIsItemLiked(itemId);
  const { data: isBookmarked } = useIsItemBookmarked(itemId);
  const { data: commentCountData } = useGetItemCommentCount({
    itemId,
    enabled: !!isActive,
  });
  const likeItem = useLikeItem();
  const unlikeItem = useUnlikeItem();
  const bookmarkItem = useBookmarkItem();
  const unbookmarkItem = useUnbookmarkItem();

  // Animation refs
  const likeScale = useRef(new Animated.Value(1)).current;
  const bookmarkScale = useRef(new Animated.Value(1)).current;
  const doubleTapHeartOpacity = useRef(new Animated.Value(0)).current;
  const doubleTapHeartScale = useRef(new Animated.Value(0.3)).current;

  // Double-tap tracking
  const lastTapRef = useRef(0);

  const likeCount = item.like_count;
  const commentCount = commentCountData ?? item.comment_count ?? 0;

  const displayName = item.profile?.username || "User";
  const displayAvatar = item.profile?.avatar_url;
  const displayImage =
    item.image_url || item.products?.data?.images?.[0];
  const displayCaption =
    item.user_description ||
    item.products?.searchableDescription ||
    "";
  const displayTitle = item.products?.searchableTitle || "";
  const relativeTime = getRelativeTime(item.created_at);

  // Layout calculations — keep everything within safe bounds
  const TOP_AREA = insets.top + 50; // below status bar + "FOR YOU" header
  const HEADER_HEIGHT = 60; // user row height
  const BOTTOM_PADDING = tabBarHeight + 16;
  const TEXT_AREA_HEIGHT = 90; // title + caption area estimate
  const imageHeight =
    cardHeight - TOP_AREA - HEADER_HEIGHT - TEXT_AREA_HEIGHT - BOTTOM_PADDING;

  const formatCount = (count: number): string => {
    if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return String(count);
  };

  // Spring bounce helper
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

  const triggerDoubleTapHeart = () => {
    doubleTapHeartScale.setValue(0.3);
    doubleTapHeartOpacity.setValue(1);
    Animated.sequence([
      Animated.spring(doubleTapHeartScale, {
        toValue: 1,
        useNativeDriver: true,
        speed: 20,
        bounciness: 10,
      }),
      Animated.timing(doubleTapHeartOpacity, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handleDoubleTap = useCallback(() => {
    const now = Date.now();
    const DOUBLE_TAP_DELAY = 300;
    if (now - lastTapRef.current < DOUBLE_TAP_DELAY) {
      if (!isLiked && !likeItem.isPending) {
        haptics.medium();
        likeItem.mutate(itemId);
        springBounce(likeScale);
      }
      triggerDoubleTapHeart();
    }
    lastTapRef.current = now;
  }, [isLiked, likeItem, itemId]);

  const handleLike = () => {
    if (likeItem.isPending || unlikeItem.isPending) return;
    haptics.medium();
    if (isLiked) {
      unlikeItem.mutate(itemId);
    } else {
      likeItem.mutate(itemId);
    }
    springBounce(likeScale);
  };

  const handleBookmark = () => {
    if (bookmarkItem.isPending || unbookmarkItem.isPending) return;
    haptics.light();
    if (isBookmarked) {
      unbookmarkItem.mutate(itemId);
    } else {
      bookmarkItem.mutate(itemId);
    }
    springBounce(bookmarkScale);
  };

  const handleComment = () => {
    haptics.light();
    if (onCommentPress) onCommentPress(item.id);
  };

  const handleShare = () => {
    haptics.light();
  };

  return (
    <View style={[styles.container, { height: cardHeight }]}>
      {/* Spacer for status bar + "FOR YOU" header */}
      <View style={{ height: TOP_AREA }} />

      {/* User Header — sits above the image */}
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
        <TouchableOpacity style={styles.moreButton} hitSlop={12}>
          <Ionicons
            name="ellipsis-vertical"
            size={22}
            color="rgba(255,255,255,0.85)"
          />
        </TouchableOpacity>
      </View>

      {/* Image Area — contained in a rounded card with sidebar */}
      <View style={[styles.imageSection, { height: imageHeight }]}>
        <TouchableOpacity
          activeOpacity={1}
          onPress={handleDoubleTap}
          style={styles.imageCard}
        >
          {displayImage ? (
            <Image
              source={{ uri: displayImage }}
              style={styles.mainImage}
              contentFit="cover"
              transition={300}
            />
          ) : (
            <Image
              source={require("@/assets/images/placeholder.png")}
              style={styles.mainImage}
              contentFit="cover"
            />
          )}

          {/* Bottom gradient inside the image card for text readability */}
          <LinearGradient
            colors={["transparent", "rgba(0,0,0,0.7)"]}
            style={styles.imageBottomGradient}
            pointerEvents="none"
          />

          {/* Title & Caption — overlaid at image bottom */}
          <View style={styles.textOverlay}>
            {!!displayTitle && (
              <Text style={styles.itemTitle} numberOfLines={1}>
                {displayTitle}
              </Text>
            )}
            {!!displayCaption && (
              <Text
                style={styles.caption}
                numberOfLines={expanded ? undefined : 3}
                onPress={() => setExpanded(!expanded)}
              >
                {displayCaption}
              </Text>
            )}
          </View>

          {/* Double-tap heart animation */}
          <Animated.View
            pointerEvents="none"
            style={[
              styles.doubleTapHeart,
              {
                opacity: doubleTapHeartOpacity,
                transform: [{ scale: doubleTapHeartScale }],
              },
            ]}
          >
            <Ionicons name="heart" size={80} color="#ff6e84" />
          </Animated.View>
        </TouchableOpacity>

        {/* Glass Action Sidebar — overlaid on right edge of image */}
        <View style={styles.glassSidebar}>
          {/* Like */}
          <TouchableOpacity style={styles.sidebarAction} onPress={handleLike}>
            <Animated.View style={{ transform: [{ scale: likeScale }] }}>
              <Ionicons
                name="heart"
                size={28}
                color={isLiked ? "#ff6e84" : "#FFF"}
              />
            </Animated.View>
            <Text style={styles.sidebarCount}>{formatCount(likeCount)}</Text>
          </TouchableOpacity>

          {/* Comment */}
          <TouchableOpacity
            style={styles.sidebarAction}
            onPress={handleComment}
          >
            <Ionicons name="chatbubble" size={24} color="#FFF" />
            <Text style={styles.sidebarCount}>{commentCount}</Text>
          </TouchableOpacity>

          {/* Bookmark */}
          <TouchableOpacity
            style={styles.sidebarAction}
            onPress={handleBookmark}
          >
            <Animated.View style={{ transform: [{ scale: bookmarkScale }] }}>
              <Ionicons
                name="bookmark"
                size={24}
                color={isBookmarked ? COLORS.primary : "#FFF"}
              />
            </Animated.View>
          </TouchableOpacity>

          {/* Share */}
          <TouchableOpacity
            style={styles.sidebarAction}
            onPress={handleShare}
          >
            <Ionicons name="share-social" size={24} color="#FFF" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: screenWidth,
    backgroundColor: "#000",
    overflow: "hidden",
  },
  // --- User Header (above image) ---
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
  avatar: {
    width: "100%",
    height: "100%",
  },
  avatarPlaceholder: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(30,30,30,0.6)",
  },
  userInfo: {
    flex: 1,
  },
  username: {
    color: "#FFF",
    fontSize: 15,
    fontWeight: "800",
  },
  timestamp: {
    fontSize: 10,
    color: "rgba(255,255,255,0.55)",
    letterSpacing: 1.2,
    fontWeight: "700",
    marginTop: 2,
  },
  moreButton: {
    padding: 6,
  },
  // --- Image Section ---
  imageSection: {
    paddingHorizontal: CARD_MARGIN_H,
    position: "relative",
  },
  imageCard: {
    flex: 1,
    width: "100%",
    borderRadius: IMAGE_BORDER_RADIUS,
    overflow: "hidden",
    backgroundColor: COLORS.surfaceContainerHigh,
  },
  mainImage: {
    width: "100%",
    height: "100%",
  },
  // --- Gradient inside image ---
  imageBottomGradient: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 200,
  },
  // --- Text overlaid at bottom of image ---
  textOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 80, // leave room for sidebar
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  itemTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: "#FFF",
    letterSpacing: -0.3,
    marginBottom: 6,
    textTransform: "uppercase",
    textShadowColor: "rgba(0,0,0,0.7)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  caption: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 14,
    lineHeight: 21,
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  // --- Double-tap heart ---
  doubleTapHeart: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 50,
  },
  // --- Glass Sidebar (overlaid on image right edge) ---
  glassSidebar: {
    position: "absolute",
    right: CARD_MARGIN_H + 8,
    bottom: 24,
    alignItems: "center",
    gap: 20,
    paddingVertical: 18,
    paddingHorizontal: 11,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.30)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    zIndex: 10,
  },
  sidebarAction: {
    alignItems: "center",
    gap: 4,
  },
  sidebarCount: {
    color: "#FFF",
    fontSize: 12,
    fontWeight: "700",
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});

export default React.memo(SocialFeedCard);
