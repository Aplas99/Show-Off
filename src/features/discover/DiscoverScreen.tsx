import { useGetPostsFeed } from "@/api/social/posts";
import { TAB_BAR_HEIGHT } from "@/constants/layoutConfig";
import { COLORS } from "@/constants/theme";
import CommentModal from "@/src/components/social/CommentModal";
import PostFeedCard from "@/src/components/social/PostFeedCard";
import { Ionicons } from "@expo/vector-icons";
import { useIsFocused } from "@react-navigation/native";
import { useRouter } from "expo-router";
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    Platform,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    useWindowDimensions,
    View
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function DiscoverScreen() {
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const { height: screenHeight, width: screenWidth } = useWindowDimensions();
    const feedWidth = Math.min(screenWidth, 620);
    const [commentModalVisible, setCommentModalVisible] = useState(false);
    const [selectedPostId, setSelectedPostId] = useState<number | null>(null);
    const [activePostIndex, setActivePostIndex] = useState(0);

    // Calculate total tab bar height including safe area insets and platform-specific padding
    const tabBarHeight = TAB_BAR_HEIGHT + insets.bottom + (Platform.OS === "android" ? 10 : 0);

    const usableHeight = screenHeight;

    const isFocused = useIsFocused();

    const {
        data,
        isLoading,
        isFetchingNextPage,
        hasNextPage,
        fetchNextPage,
        isRefetching,
    } = useGetPostsFeed({ enabled: isFocused });

    const allPosts = useMemo(
        () => data?.pages.flatMap((page) => page.items) ?? [],
        [data]
    );

    const handleLoadMore = useCallback(() => {
        if (hasNextPage && !isFetchingNextPage) {
            fetchNextPage();
        }
    }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

    const handleCommentPress = useCallback((postId: number) => {
        setSelectedPostId(postId);
        setCommentModalVisible(true);
    }, []);

    const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
        if (viewableItems.length > 0) {
            setActivePostIndex(viewableItems[0].index ?? 0);
        }
    }).current;

    if (isLoading && !isRefetching) {
        return (
            <View style={styles.centered}>
                <ActivityIndicator size="large" color={COLORS.primary} />
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

            {/* Black bar to cover phone notification/status bar area */}
            <View style={[styles.statusBarOverlay, { height: insets.top }]} />

            {allPosts.length === 0 ? (
                <View style={styles.centered}>
                    <Text style={styles.emptyText}>
                        No posts yet.{"\n"}
                        Be the first — share something from your collection!
                    </Text>
                    <TouchableOpacity
                        style={styles.emptyCreateButton}
                        onPress={() => router.push("/(tabs)/create-post" as never)}
                    >
                        <Ionicons name="add" size={18} color="#000" />
                        <Text style={styles.emptyCreateButtonText}>Create a post</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <FlatList
                    style={{ width: feedWidth, alignSelf: "center" }}
                    data={allPosts}
                    renderItem={({ item, index }) => (
                        <PostFeedCard
                            post={item}
                            cardHeight={usableHeight}
                            tabBarHeight={tabBarHeight}
                            onCommentPress={handleCommentPress}
                            isActive={index === activePostIndex && isFocused}
                        />
                    )}
                    keyExtractor={(item) => String(item.id)}
                    pagingEnabled
                    showsVerticalScrollIndicator={false}
                    snapToInterval={usableHeight}
                    snapToAlignment="start"
                    decelerationRate="fast"
                    onViewableItemsChanged={onViewableItemsChanged}
                    viewabilityConfig={{
                        itemVisiblePercentThreshold: 50,
                    }}
                    onEndReached={handleLoadMore}
                    onEndReachedThreshold={2}
                    removeClippedSubviews={true}
                    initialNumToRender={1}
                    maxToRenderPerBatch={2}
                    windowSize={3}
                    getItemLayout={(_, index) => ({
                        length: usableHeight,
                        offset: usableHeight * index,
                        index,
                    })}
                />
            )}

            {/* Overlaid Navigation */}
            <View style={[styles.headerOverlay, { paddingTop: insets.top + 10, width: feedWidth, left: (screenWidth - feedWidth) / 2, right: undefined }]}>
                <View style={styles.feedTabs}>
                    <Text style={[styles.feedTab, styles.feedTabActive]}>FOR YOU</Text>
                    <Text style={styles.feedTab}>FOLLOWING</Text>
                </View>
                <TouchableOpacity
                    style={[styles.createButton, { top: insets.top + 4 }]}
                    onPress={() => router.push("/(tabs)/create-post" as never)}
                    accessibilityLabel="Create a post"
                >
                    <Ionicons name="add" size={22} color="#FFF" />
                </TouchableOpacity>
            </View>

            {selectedPostId !== null && (
                <CommentModal
                    visible={commentModalVisible}
                    postId={selectedPostId}
                    onClose={() => {
                        setCommentModalVisible(false);
                        setSelectedPostId(null);
                    }}
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#000",
    },
    centered: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        gap: 16,
        backgroundColor: "#000",
    },
    emptyText: {
        color: "#9CA3AF",
        fontSize: 16,
        textAlign: "center",
    },
    emptyCreateButton: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 18,
        paddingVertical: 12,
        borderRadius: 999,
        backgroundColor: COLORS.primary,
    },
    emptyCreateButtonText: {
        color: "#000",
        fontSize: 14,
        fontWeight: "800",
    },
    headerOverlay: {
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        alignItems: "center",
        zIndex: 10,
    },
    feedTabs: {
        flexDirection: "row",
        alignItems: "center",
        gap: 28,
    },
    feedTab: {
        color: "rgba(255,255,255,0.5)",
        fontSize: 15,
        fontWeight: "700",
        letterSpacing: 2,
        paddingBottom: 6,
        textShadowColor: "rgba(0,0,0,0.5)",
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 4,
    },
    feedTabActive: {
        color: "#FFF",
        borderBottomWidth: 2,
        borderBottomColor: COLORS.primary,
        paddingBottom: 6,
    },
    createButton: {
        position: "absolute",
        right: 16,
        width: 38,
        height: 38,
        borderRadius: 19,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(255,255,255,0.18)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.35)",
    },
    statusBarOverlay: {
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        backgroundColor: "#000",
        zIndex: 20,
    },
});
