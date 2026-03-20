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
import React, { useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

const { width: screenWidth } = Dimensions.get("window");
const IMAGE_HEIGHT = screenWidth * 1.1; // Tall image area
const CARD_PADDING = 16;

interface Props {
  item: FeedItem;
  cardHeight: number;
  tabBarHeight?: number;
  onCommentPress?: (itemId: number) => void;
  isActive?: boolean;
}

const SocialFeedCard = ({ item, cardHeight, tabBarHeight = 0, onCommentPress, isActive }: Props) => {
  const haptics = useHaptics();
  const [expanded, setExpanded] = useState(false);

  const itemId = typeof item.id === "number" ? item.id : parseInt(item.id);
  const { data: isLiked } = useIsItemLiked(itemId);
  const { data: isBookmarked } = useIsItemBookmarked(itemId);
  const { data: commentCountData } = useGetItemCommentCount({ itemId, enabled: !!isActive });
  const likeItem = useLikeItem();
  const unlikeItem = useUnlikeItem();
  const bookmarkItem = useBookmarkItem();
  const unbookmarkItem = useUnbookmarkItem();

  // Animation refs
  const likeScale = useRef(new Animated.Value(1)).current;
  const bookmarkScale = useRef(new Animated.Value(1)).current;

  const likeCount = item.like_count;
  const commentCount = commentCountData ?? item.comment_count ?? 0;

  const displayName = item.profile?.username || "User";
  const displayAvatar = item.profile?.avatar_url;
  const displayImage = item.image_url || (item.products?.data?.images?.[0]);
  const displayCaption = item.user_description || item.products?.searchableDescription || "";
  const displayTitle = item.products?.searchableTitle || "";

  const formatCount = (count: number): string => {
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return String(count);
  };

  const handleLike = () => {
    if (likeItem.isPending || unlikeItem.isPending) return;
    haptics.medium();
    if (isLiked) {
      unlikeItem.mutate(itemId);
    } else {
      likeItem.mutate(itemId);
    }
    Animated.sequence([
      Animated.timing(likeScale, {
        toValue: 1.5,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(likeScale, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handleBookmark = () => {
    if (bookmarkItem.isPending || unbookmarkItem.isPending) return;
    haptics.light();
    if (isBookmarked) {
      unbookmarkItem.mutate(itemId);
    } else {
      bookmarkItem.mutate(itemId);
    }
    Animated.sequence([
      Animated.timing(bookmarkScale, {
        toValue: 1.5,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(bookmarkScale, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
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
      {/* User Header */}
      <View style={styles.userHeader}>
        <TouchableOpacity style={styles.avatarContainer}>
          {displayAvatar ? (
            <Image source={{ uri: displayAvatar }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Ionicons name="person" size={16} color="#666" />
            </View>
          )}
        </TouchableOpacity>
        <View style={styles.userInfo}>
          <Text style={styles.username}>{displayName}</Text>
          <Text style={styles.timestamp}>2 HOURS AGO</Text>
        </View>
        <TouchableOpacity style={styles.moreButton}>
          <Ionicons name="ellipsis-vertical" size={20} color={COLORS.onSurfaceVariant} />
        </TouchableOpacity>
      </View>

      {/* Image Area with Sidebar */}
      <View style={styles.imageArea}>
        {/* Contained image in rounded card */}
        <View style={styles.imageCard}>
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
        </View>

        {/* Glass Action Sidebar — right edge of image */}
        <View style={styles.glassSidebar}>
          <TouchableOpacity style={styles.sidebarAction} onPress={handleLike}>
            <Animated.View style={{ transform: [{ scale: likeScale }] }}>
              <Ionicons
                name="heart"
                size={26}
                color={isLiked ? "#ff6e84" : "#FFF"}
              />
            </Animated.View>
            <Text style={styles.sidebarCount}>{formatCount(likeCount)}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.sidebarAction} onPress={handleComment}>
            <Ionicons name="chatbubble" size={22} color="#FFF" />
            <Text style={styles.sidebarCount}>{commentCount}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.sidebarAction} onPress={handleBookmark}>
            <Animated.View style={{ transform: [{ scale: bookmarkScale }] }}>
              <Ionicons
                name="bookmark"
                size={22}
                color={isBookmarked ? COLORS.primary : "#FFF"}
              />
            </Animated.View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.sidebarAction} onPress={handleShare}>
            <Ionicons name="share-social" size={22} color="#FFF" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Title & Caption — below the image */}
      <View style={styles.textArea}>
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
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: screenWidth,
    backgroundColor: COLORS.background,
    paddingHorizontal: CARD_PADDING,
  },
  // --- User Header ---
  userHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
  },
  avatarContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    overflow: "hidden",
    backgroundColor: COLORS.surfaceContainerHigh,
  },
  avatar: {
    width: "100%",
    height: "100%",
  },
  avatarPlaceholder: {
    width: "100%",
    height: "100%",
    backgroundColor: COLORS.surfaceContainerHigh,
    justifyContent: "center",
    alignItems: "center",
  },
  userInfo: {
    flex: 1,
  },
  username: {
    color: "#FFF",
    fontSize: 14,
    fontWeight: "700",
  },
  timestamp: {
    fontSize: 10,
    color: COLORS.onSurfaceVariant,
    letterSpacing: 1,
    fontWeight: "600",
    marginTop: 1,
  },
  moreButton: {
    padding: 4,
  },
  // --- Image Area ---
  imageArea: {
    position: "relative",
  },
  imageCard: {
    width: "100%",
    height: IMAGE_HEIGHT,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: COLORS.surfaceContainerHigh,
  },
  mainImage: {
    width: "100%",
    height: "100%",
  },
  // --- Glass Sidebar ---
  glassSidebar: {
    position: "absolute",
    right: 12,
    bottom: 24,
    alignItems: "center",
    gap: 18,
    paddingVertical: 16,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.35)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  sidebarAction: {
    alignItems: "center",
    gap: 4,
  },
  sidebarCount: {
    color: "#FFF",
    fontSize: 11,
    fontWeight: "700",
  },
  // --- Text Area ---
  textArea: {
    paddingTop: 16,
    paddingBottom: 8,
    paddingHorizontal: 4,
  },
  itemTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#FFF",
    letterSpacing: -0.3,
    marginBottom: 8,
    textTransform: "uppercase",
  },
  caption: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 14,
    lineHeight: 22,
  },
});

export default React.memo(SocialFeedCard);
