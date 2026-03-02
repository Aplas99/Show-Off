import { ItemWithProduct } from "@/api/items";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import React from "react";
import { Animated, Platform, Pressable, StyleSheet, View } from "react-native";
import {
    BOOK_DEPTH,
    CATEGORY_COLORS,
    getItemCategory,
    ITEM_HEIGHT,
    ITEM_WIDTH,
    PAGE_WIDTH,
    PAGES_COLOR,
    SPINE_WIDTH
} from "./constants";

interface BookItemProps {
    item: ItemWithProduct;
    positionX: number;
    onPress?: (item: ItemWithProduct) => void;
    scrollX: Animated.Value;
    globalIndex: number;
}

/**
 * Optimised BookItem — Android 60fps targets:
 *
 *  - Removed rotateY (3D transforms = GPU layer per book, #1 perf killer on Android)
 *  - Reduced live interpolations: 5 → 2 (scale + opacity only) per book
 *  - Removed Animated.multiply / Animated.add derived nodes
 *  - Replaced LinearGradient spine with plain View + border (same visual)
 *  - Removed all conditional overlay LinearGradients (glass/plastic/tech)
 *  - Removed per-view elevation — single elevation on outer wrapper only
 *  - Replaced JS-thread entry animation with static appearance (no anim system overhead)
 *  - renderToHardwareTextureAndroid on book wrapper to cache the static parts
 */
const BookItem = React.memo(({ item, positionX, onPress, scrollX }: BookItemProps) => {
    const pressScale = React.useRef(new Animated.Value(1)).current;

    const category = getItemCategory(item);
    const colors = CATEGORY_COLORS[category] || CATEGORY_COLORS["Books"];

    const productData = item.products?.data || {};
    const imageUrl = item.image_url || (productData?.images?.[0] ?? null);

    // --- Parallax: 2 interpolations only (scale + opacity) ---
    const relativeInputRange = [
        positionX - PAGE_WIDTH,
        positionX - PAGE_WIDTH / 2,
        positionX,
        positionX + PAGE_WIDTH / 2,
        positionX + PAGE_WIDTH,
    ];

    const animatedScale = scrollX.interpolate({
        inputRange: relativeInputRange,
        outputRange: [0.85, 0.93, 1, 0.93, 0.85],
        extrapolate: "clamp",
    });

    const animatedOpacity = scrollX.interpolate({
        inputRange: relativeInputRange,
        outputRange: [0.55, 0.85, 1, 0.85, 0.55],
        extrapolate: "clamp",
    });

    // --- Press: single scale spring, no Animated.multiply needed ---
    const handlePressIn = () => {
        Animated.spring(pressScale, {
            toValue: 1.06,
            friction: 8,
            tension: 120,
            useNativeDriver: true,
        }).start();
    };

    const handlePressOut = () => {
        Animated.spring(pressScale, {
            toValue: 1,
            friction: 8,
            tension: 120,
            useNativeDriver: true,
        }).start();
    };

    // Category flags (no ternary chains in JSX for perf)
    const isToys = category === "Toys";
    const isMedia = category === "Media" || category === "Movies" || category === "Music";
    const isGames = category === "Games";

    return (
        <Animated.View
            style={[
                bookStyles.container,
                {
                    opacity: animatedOpacity,
                    transform: [
                        { scale: animatedScale },
                        { scale: pressScale },
                    ],
                },
            ]}
            // Cache rendered output as hardware texture — prevents re-draw on scroll
            renderToHardwareTextureAndroid
        >
            <Pressable
                onPress={() => onPress?.(item)}
                onPressIn={handlePressIn}
                onPressOut={handlePressOut}
                style={bookStyles.pressable}
            >
                <View style={bookStyles.bookWrapper}>
                    {/* Drop shadow — single, low elevation */}
                    <View style={bookStyles.shadow} />

                    {/* Spine — plain View, no LinearGradient */}
                    <View
                        style={[
                            bookStyles.spine,
                            { backgroundColor: colors.primary },
                            isGames && bookStyles.spineGame,
                        ]}
                    >
                        <View style={[bookStyles.spineHighlight, { backgroundColor: colors.accent }]} />
                        {isToys && <View style={bookStyles.spineStripe} />}
                    </View>

                    {/* Front Cover */}
                    <View
                        style={[
                            bookStyles.cover,
                            { backgroundColor: colors.primary },
                            isToys && bookStyles.coverGlass,
                            isMedia && bookStyles.coverPlastic,
                        ]}
                    >
                        {imageUrl ? (
                            <Image
                                source={{ uri: imageUrl }}
                                style={bookStyles.coverImage}
                                contentFit="cover"
                                transition={200}
                                cachePolicy="memory-disk"
                                recyclingKey={item.id?.toString()}
                            />
                        ) : (
                            <View style={[bookStyles.placeholder, { backgroundColor: colors.primary }]}>
                                <Ionicons
                                    name={
                                        isToys ? "rocket-outline" :
                                            isMedia ? "film-outline" :
                                                isGames ? "game-controller-outline" :
                                                    "book-outline"
                                    }
                                    size={28}
                                    color={colors.accent}
                                />
                            </View>
                        )}

                        {/* Subtle glass overlay — static View, no gradient */}
                        {isToys && <View style={bookStyles.glassEdge} />}

                        {/* Right edge shadow — static View */}
                        <View style={bookStyles.coverRightEdge} />
                    </View>

                    {/* Pages edge */}
                    <View
                        style={[
                            bookStyles.pages,
                            isMedia && bookStyles.pagesMedia,
                            isToys && bookStyles.pagesToys,
                        ]}
                    >
                        <View style={bookStyles.pagesInner}>
                            {isMedia ? (
                                // 3 lines for media
                                <>
                                    <View style={[bookStyles.pageLine, { top: 5 }]} />
                                    <View style={[bookStyles.pageLine, { top: 13 }]} />
                                    <View style={[bookStyles.pageLine, { top: 21 }]} />
                                </>
                            ) : (
                                // 4 lines for books (was 5, one less)
                                <>
                                    <View style={[bookStyles.pageLine, { top: 3 }]} />
                                    <View style={[bookStyles.pageLine, { top: 8 }]} />
                                    <View style={[bookStyles.pageLine, { top: 13 }]} />
                                    <View style={[bookStyles.pageLine, { top: 18 }]} />
                                </>
                            )}
                        </View>
                    </View>
                </View>
            </Pressable>
        </Animated.View>
    );
});

const bookStyles = StyleSheet.create({
    container: {
        height: ITEM_HEIGHT + 10,
        justifyContent: "flex-end",
    },
    pressable: {
        alignItems: "center",
    },
    bookWrapper: {
        width: ITEM_WIDTH * 0.92,
        height: ITEM_HEIGHT,
        flexDirection: "row",
        position: "relative",
        // Single elevation on wrapper — replaces 3 individual elevations
        ...Platform.select({
            android: { elevation: 6 },
            ios: {
                shadowColor: "#000",
                shadowOffset: { width: 1, height: 4 },
                shadowOpacity: 0.35,
                shadowRadius: 5,
            },
        }),
    },
    shadow: {
        position: "absolute",
        bottom: -4,
        left: 6,
        right: 6,
        height: 8,
        backgroundColor: "rgba(0,0,0,0.4)",
        borderRadius: 4,
    },
    spine: {
        width: SPINE_WIDTH,
        height: "100%",
        borderTopLeftRadius: 2,
        borderBottomLeftRadius: 2,
        overflow: "hidden",
        position: "relative",
        zIndex: 2,
    },
    spineHighlight: {
        position: "absolute",
        top: 0,
        left: 0,
        width: 2,
        bottom: 0,
        opacity: 0.25,
    },
    spineGame: {
        width: SPINE_WIDTH + 1,
    },
    spineStripe: {
        position: "absolute",
        top: 0,
        bottom: 0,
        left: 2,
        width: 2,
        backgroundColor: "rgba(255,255,255,0.25)",
    },
    cover: {
        flex: 1,
        borderRadius: 3,
        overflow: "hidden",
        position: "relative",
        zIndex: 3,
    },
    coverGlass: {
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.25)",
        backgroundColor: "rgba(255,255,255,0.05)",
    },
    coverPlastic: {
        backgroundColor: "#1a1a1a",
        borderRadius: 2,
    },
    coverImage: {
        width: "100%",
        height: "100%",
    },
    placeholder: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
    },
    glassEdge: {
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: 2,
        backgroundColor: "rgba(255,255,255,0.35)",
    },
    coverRightEdge: {
        position: "absolute",
        right: 0,
        top: 0,
        bottom: 0,
        width: 5,
        backgroundColor: "rgba(0,0,0,0.22)",
    },
    pages: {
        width: BOOK_DEPTH,
        height: "98%",
        backgroundColor: PAGES_COLOR,
        alignSelf: "center",
        marginLeft: -1,
        borderRadius: 1,
        zIndex: 1,
    },
    pagesMedia: {
        width: BOOK_DEPTH - 2,
        backgroundColor: "#333",
        height: "96%",
    },
    pagesToys: {
        backgroundColor: "#f8bbd9",
    },
    pagesInner: {
        flex: 1,
        marginVertical: 3,
        marginLeft: 1,
        backgroundColor: "#e8dcc8",
        position: "relative",
    },
    pageLine: {
        position: "absolute",
        left: 0,
        right: 2,
        height: 1,
        backgroundColor: "rgba(0,0,0,0.1)",
    },
});

export default BookItem;
