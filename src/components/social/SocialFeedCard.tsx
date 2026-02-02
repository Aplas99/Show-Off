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
import React, { useRef, useState } from "react";
import {
    Animated,
    Dimensions,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from "react-native";

const { width: screenWidth } = Dimensions.get("window");

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
    const commentScale = useRef(new Animated.Value(1)).current;
    const shareScale = useRef(new Animated.Value(1)).current;
    const bookmarkScale = useRef(new Animated.Value(1)).current;

    const likeCount = item.like_count;
    const commentCount = commentCountData ?? item.comment_count ?? 0;

    const displayName = item.profile?.username || "User";
    const displayAvatar = item.profile?.avatar_url;
    const displayImage = item.image_url || (item.products?.data?.images?.[0]);
    const displayCaption = item.user_description || item.products?.searchableDescription || "";

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
        // Share logic here
    };

    return (
        <View style={[styles.container, { height: cardHeight }]}>
            {/* Background Image - The "World" */}
            <View style={StyleSheet.absoluteFill}>
                {displayImage ? (
                    <Image
                        source={{ uri: displayImage }}
                        style={styles.mainImage}
                        contentFit="contain"
                        transition={300}
                    />
                ) : (
                    <View style={[styles.mainImage, styles.placeholderImage]}>
                        <Ionicons name="image-outline" size={64} color="#333" />
                    </View>
                )}

                {/* Dark Gradient Overlay for text readability */}
                <LinearGradient
                    colors={["transparent", "rgba(0,0,0,0.8)"]}
                    style={styles.bottomGradient}
                />
            </View>

            {/* Right Side Actions Panel */}
            <View style={styles.rightPanel}>
                <TouchableOpacity style={styles.actionItem} onPress={handleLike}>
                    <Animated.View style={{ transform: [{ scale: likeScale }] }}>
                        <Ionicons
                            name={isLiked ? "heart" : "heart-outline"}
                            size={36}
                            color={isLiked ? "#EF4444" : "#FFF"}
                        />
                    </Animated.View>
                    <Text style={styles.actionText}>{likeCount}</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.actionItem} onPress={handleComment}>
                    <Ionicons name="chatbubble-outline" size={32} color="#FFF" />
                    <Text style={styles.actionText}>{commentCount}</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.actionItem} onPress={handleBookmark}>
                    <Animated.View style={{ transform: [{ scale: bookmarkScale }] }}>
                        <Ionicons
                            name={isBookmarked ? "bookmark" : "bookmark-outline"}
                            size={32}
                            color={isBookmarked ? COLORS.primary : "#FFF"}
                        />
                    </Animated.View>
                    <Text style={styles.actionText}>Save</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.actionItem} onPress={handleShare}>
                    <Ionicons name="share-social-outline" size={32} color="#FFF" />
                    <Text style={styles.actionText}>Share</Text>
                </TouchableOpacity>
            </View>

            {/* Bottom Information Overlay */}
            <View style={[styles.bottomOverlay, { bottom: tabBarHeight + 20 }]}>
                <View style={styles.userInfoRow}>
                    <TouchableOpacity style={styles.avatarContainer}>
                        {displayAvatar ? (
                            <Image source={{ uri: displayAvatar }} style={styles.avatar} />
                        ) : (
                            <View style={styles.avatarPlaceholder}>
                                <Ionicons name="person" size={20} color="#666" />
                            </View>
                        )}
                    </TouchableOpacity>
                    <Text style={styles.username}>@{displayName}</Text>
                </View>

                <View style={styles.captionContainer}>
                    <Text
                        style={styles.caption}
                        numberOfLines={expanded ? undefined : 2}
                        onPress={() => setExpanded(!expanded)}
                    >
                        {displayCaption}
                    </Text>
                    {item.products?.searchableTitle && (
                        <View style={styles.productTag}>
                            <Ionicons name="pricetag-outline" size={14} color={COLORS.primary} />
                            <Text style={styles.productText}>{item.products.searchableTitle}</Text>
                        </View>
                    )}
                </View>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        width: screenWidth,
        backgroundColor: "#000",
    },
    mainImage: {
        width: "100%",
        height: "100%",
    },
    placeholderImage: {
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: "#111",
    },
    bottomGradient: {
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        height: "40%",
    },
    rightPanel: {
        position: "absolute",
        right: 12,
        bottom: 100, // Position above bottom overlay
        alignItems: "center",
        gap: 16,
    },
    actionItem: {
        alignItems: "center",
        marginBottom: 8,
    },
    actionText: {
        color: "#FFF",
        fontSize: 12,
        fontWeight: "600",
        marginTop: 4,
    },
    bottomOverlay: {
        position: "absolute",
        left: 16,
        right: 80, // Leave room for right panel
    },
    userInfoRow: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 10,
    },
    avatarContainer: {
        width: 40,
        height: 40,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: "#FFF",
        overflow: "hidden",
        marginRight: 10,
    },
    avatar: {
        width: "100%",
        height: "100%",
    },
    avatarPlaceholder: {
        width: "100%",
        height: "100%",
        backgroundColor: "#333",
        justifyContent: "center",
        alignItems: "center",
    },
    username: {
        color: "#FFF",
        fontSize: 16,
        fontWeight: "bold",
    },
    captionContainer: {
        gap: 8,
    },
    caption: {
        color: "#FFF",
        fontSize: 14,
        lineHeight: 20,
    },
    productTag: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "rgba(0,0,0,0.6)",
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
        alignSelf: "flex-start",
        gap: 6,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.1)",
    },
    productText: {
        color: "#FFF",
        fontSize: 12,
        fontWeight: "500",
    },
});

export default React.memo(SocialFeedCard);
