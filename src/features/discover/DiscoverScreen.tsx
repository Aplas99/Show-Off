import { useGetFeed } from "@/api/social/feed";
import { TAB_BAR_HEIGHT } from "@/constants/layoutConfig";
import { COLORS } from "@/constants/theme";
import CommentModal from "@/src/components/social/CommentModal";
import SocialFeedCard from "@/src/components/social/SocialFeedCard";
import { useIsFocused } from "@react-navigation/native";
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    Platform,
    StatusBar,
    StyleSheet,
    Text,
    useWindowDimensions,
    View
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function DiscoverScreen() {
    const insets = useSafeAreaInsets();
    const { height: screenHeight } = useWindowDimensions();
    const [commentModalVisible, setCommentModalVisible] = useState(false);
    const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
    const [activeItemIndex, setActiveItemIndex] = useState(0);

    // Calculate total tab bar height including safe area insets and platform-specific padding
    const tabBarHeight = TAB_BAR_HEIGHT + insets.bottom + (Platform.OS === "android" ? 10 : 0);

    // Use the full height minus tab bar height so cards don't extend behind the tab bar
    const usableHeight = screenHeight;

    const isFocused = useIsFocused();

    const {
        data,
        isLoading,
        isFetchingNextPage,
        hasNextPage,
        fetchNextPage,
        refetch,
        isRefetching,
    } = useGetFeed({ enabled: isFocused });

    const allItems = useMemo(
        () => data?.pages.flatMap((page) => page.items) ?? [],
        [data]
    );

    const handleLoadMore = useCallback(() => {
        if (hasNextPage && !isFetchingNextPage) {
            fetchNextPage();
        }
    }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

    const handleCommentPress = useCallback((itemId: number) => {
        setSelectedItemId(itemId);
        setCommentModalVisible(true);
    }, []);

    const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
        if (viewableItems.length > 0) {
            setActiveItemIndex(viewableItems[0].index ?? 0);
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

            {allItems.length === 0 ? (
                <View style={styles.centered}>
                    <Text style={styles.emptyText}>
                        No items in your feed yet.{"\n"}
                        Follow users to see their items here!
                    </Text>
                </View>
            ) : (
                <FlatList
                    data={allItems}
                    renderItem={({ item, index }) => (
                        <SocialFeedCard
                            item={item}
                            cardHeight={usableHeight}
                            tabBarHeight={tabBarHeight}
                            onCommentPress={handleCommentPress}
                            isActive={index === activeItemIndex}
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
            <View style={[styles.headerOverlay, { paddingTop: insets.top + 10 }]}>
                <View style={styles.feedTabs}>
                    <Text style={[styles.feedTab, styles.feedTabActive]}>FOR YOU</Text>
                    <Text style={styles.feedTab}>FOLLOWING</Text>
                </View>
            </View>

            {selectedItemId !== null && (
                <CommentModal
                    visible={commentModalVisible}
                    itemId={selectedItemId}
                    onClose={() => {
                        setCommentModalVisible(false);
                        setSelectedItemId(null);
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
        backgroundColor: "#000",
    },
    emptyText: {
        color: "#9CA3AF",
        fontSize: 16,
        textAlign: "center",
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
    statusBarOverlay: {
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        backgroundColor: "#000",
        zIndex: 20,
    },
});
