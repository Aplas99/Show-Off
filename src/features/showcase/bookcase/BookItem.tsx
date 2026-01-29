import { ItemWithProduct } from "@/api/items";
import { COLORS } from "@/constants/theme";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useRef } from "react";
import { Animated, Platform, Pressable, StyleSheet, View } from "react-native";
import {
    BOOK_DEPTH,
    CATEGORY_COLORS,
    getItemCategory,
    ITEM_HEIGHT,
    ITEM_WIDTH,
    ITEMS_PER_PAGE,
    PAGE_WIDTH,
    PAGES_COLOR,
    SPINE_WIDTH,
    WOOD_LIGHT
} from "./constants";

interface BookItemProps {
    item: ItemWithProduct;
    positionX: number; // Absolute X position in scroll view for parallax
    onPress?: (item: ItemWithProduct) => void;
    scrollX: Animated.Value;
    globalIndex: number; // For entry animation staggering
}

// --- Book Item Component ---
const BookItem = React.memo(({ item, positionX, onPress, scrollX, globalIndex }: BookItemProps) => {
    const scaleAnim = useRef(new Animated.Value(1)).current;
    const translateYAnim = useRef(new Animated.Value(0)).current;
    const entryAnim = useRef(new Animated.Value(0)).current;

    const category = getItemCategory(item);
    const colors = CATEGORY_COLORS[category] || CATEGORY_COLORS["Books"];

    // Entry animation on mount
    useEffect(() => {
        Animated.timing(entryAnim, {
            toValue: 1,
            duration: 600,
            delay: (globalIndex % ITEMS_PER_PAGE) * 100,
            useNativeDriver: true,
        }).start();
    }, []);

    const productData = item.products?.data || {};
    const imageUrl = item.image_url || (productData?.images?.[0] ?? null);

    // Parallax calculations based on absolute positionX relative to scroll position
    const relativeInputRange = [
        positionX - PAGE_WIDTH,
        positionX - PAGE_WIDTH / 2,
        positionX,
        positionX + PAGE_WIDTH / 2,
        positionX + PAGE_WIDTH,
    ];

    const animatedScale = scrollX.interpolate({
        inputRange: relativeInputRange,
        outputRange: [0.88, 0.95, 1, 0.95, 0.88],
        extrapolate: "clamp",
    });

    const animatedTranslateY = scrollX.interpolate({
        inputRange: relativeInputRange,
        outputRange: [10, 4, 0, 4, 10],
        extrapolate: "clamp",
    });

    const animatedRotateZ = scrollX.interpolate({
        inputRange: relativeInputRange,
        outputRange: ["-3deg", "-1.5deg", "0deg", "1.5deg", "3deg"],
        extrapolate: "clamp",
    });

    const animatedRotateY = scrollX.interpolate({
        inputRange: relativeInputRange,
        outputRange: ["-8deg", "-4deg", "0deg", "4deg", "8deg"],
        extrapolate: "clamp",
    });

    const opacity = scrollX.interpolate({
        inputRange: relativeInputRange,
        outputRange: [0.65, 0.9, 1, 0.9, 0.65],
        extrapolate: "clamp",
    });

    const handlePressIn = () => {
        Animated.parallel([
            Animated.spring(scaleAnim, { toValue: 1.05, friction: 8, tension: 100, useNativeDriver: true }),
            Animated.spring(translateYAnim, { toValue: -12, friction: 8, useNativeDriver: true }),
        ]).start();
    };

    const handlePressOut = () => {
        Animated.parallel([
            Animated.spring(scaleAnim, { toValue: 1, friction: 8, useNativeDriver: true }),
            Animated.spring(translateYAnim, { toValue: 0, friction: 8, useNativeDriver: true }),
        ]).start();
    };

    const combinedScale = Animated.multiply(animatedScale, scaleAnim);
    const combinedTranslateY = Animated.add(animatedTranslateY, translateYAnim);

    // Category-specific styling logic
    const isMedia = ["Media", "Movies", "Music"].includes(category);
    const isToys = category === "Toys";
    const isElectronics = category === "Electronics";
    const isGames = category === "Games";
    const isApparel = category === "Apparel";
    const isSporty = ["Sports", "Automotive"].includes(category);

    return (
        <Animated.View
            style={[
                bookStyles.container,
                {
                    opacity: entryAnim,
                    transform: [{ translateY: entryAnim.interpolate({ inputRange: [0, 1], outputRange: [25, 0] }) }],
                },
            ]}
        >
            <Pressable
                onPress={() => onPress?.(item)}
                onPressIn={handlePressIn}
                onPressOut={handlePressOut}
                style={bookStyles.pressable}
            >
                <Animated.View
                    style={[
                        bookStyles.bookWrapper,
                        {
                            opacity,
                            transform: [
                                { scale: combinedScale },
                                { translateY: combinedTranslateY },
                                { rotateZ: animatedRotateZ },
                                { rotateY: animatedRotateY },
                                { perspective: 1000 },
                            ],
                        },
                    ]}
                >
                    {/* Drop Shadow underneath */}
                    <View style={[
                        bookStyles.shadow,
                        isToys && bookStyles.shadowGlass,
                        isMedia && bookStyles.shadowPlastic
                    ]} />

                    {/* Spine - Category Styled */}
                    <LinearGradient
                        colors={[colors.secondary, colors.primary, colors.secondary]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={[
                            bookStyles.spine,
                            isMedia && bookStyles.spineMedia,
                            isElectronics && bookStyles.spineTech,
                            isGames && bookStyles.spineGame,
                        ]}
                    >
                        <View style={[bookStyles.spineHighlight, { backgroundColor: colors.accent }]} />

                        {/* Category icon on spine for some categories */}
                        {isGames && <View style={[bookStyles.spineLabel, { backgroundColor: colors.accent }]} />}
                        {isSporty && <View style={bookStyles.spineStripe} />}
                    </LinearGradient>

                    {/* Front Cover - Category Styled */}
                    <View style={[
                        bookStyles.cover,
                        isToys && bookStyles.coverGlass,
                        isMedia && bookStyles.coverPlastic,
                        isElectronics && bookStyles.coverTech,
                        isApparel && bookStyles.coverSoft,
                    ]}>
                        {imageUrl ? (
                            <Image
                                source={{ uri: imageUrl }}
                                style={bookStyles.coverImage}
                                contentFit="cover"
                                transition={200}
                                cachePolicy="memory-disk"
                            />
                        ) : (
                            <View style={[bookStyles.placeholder, { backgroundColor: colors.primary }]}>
                                <Ionicons
                                    name={
                                        isToys ? "rocket-outline" :
                                            isMedia ? "film-outline" :
                                                isElectronics ? "hardware-chip-outline" :
                                                    isGames ? "game-controller-outline" :
                                                        isApparel ? "shirt-outline" :
                                                            "book-outline"
                                    }
                                    size={32}
                                    color={colors.accent}
                                />
                            </View>
                        )}

                        {/* Glass case reflection for Toys */}
                        {isToys && (
                            <>
                                <LinearGradient
                                    colors={["rgba(255,255,255,0.4)", "rgba(255,255,255,0.1)", "transparent"]}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 1 }}
                                    style={bookStyles.glassShine}
                                />
                                <View style={bookStyles.glassEdge} />
                            </>
                        )}

                        {/* Plastic shine for Media */}
                        {isMedia && (
                            <LinearGradient
                                colors={["rgba(255,255,255,0.2)", "transparent"]}
                                start={{ x: 0.5, y: 0 }}
                                end={{ x: 0.5, y: 0.3 }}
                                style={bookStyles.plasticShine}
                            />
                        )}

                        {/* Tech glow for Electronics */}
                        {isElectronics && (
                            <View style={[bookStyles.techGlow, { shadowColor: colors.accent }]} />
                        )}

                        {/* Standard right edge shadow */}
                        <LinearGradient
                            colors={["transparent", "rgba(0,0,0,0.3)"]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={bookStyles.coverRightEdge}
                        />
                    </View>

                    {/* Pages/Edge - Category Styled */}
                    <View style={[
                        bookStyles.pages,
                        isMedia && bookStyles.pagesMedia,
                        isToys && bookStyles.pagesToys,
                    ]}>
                        <View style={bookStyles.pagesInner}>
                            {[...Array(isMedia ? 3 : 5)].map((_, i) => (
                                <View
                                    key={i}
                                    style={[
                                        bookStyles.pageLine,
                                        { top: isMedia ? 5 + i * 8 : 3 + i * 5 },
                                        isMedia && { backgroundColor: "rgba(0,0,0,0.2)" }
                                    ]}
                                />
                            ))}
                        </View>
                        {isToys && <View style={bookStyles.toyBoxFold} />}
                    </View>
                </Animated.View>
            </Pressable>
        </Animated.View>
    );
});

const bookStyles = StyleSheet.create({
    container: {
        height: ITEM_HEIGHT + 10, // Minimal extra space
        justifyContent: "flex-end",
    },
    pressable: {
        alignItems: "center",
    },
    bookWrapper: {
        width: ITEM_WIDTH * 0.92, // Use more of the available width (92% vs previous 85%)
        height: ITEM_HEIGHT,
        flexDirection: "row",
        position: "relative",
    },
    shadow: {
        position: "absolute",
        bottom: -6,
        left: 4,
        right: 4,
        height: 10,
        backgroundColor: "rgba(0,0,0,0.5)",
        borderRadius: 5,
        ...Platform.select({
            ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 6 },
            android: { elevation: 6 }
        }),
        transform: [{ translateY: 6 }],
    },
    shadowGlass: {
        backgroundColor: "rgba(0,0,0,0.3)",
        height: 8,
        blurRadius: 10,
    },
    shadowPlastic: {
        backgroundColor: "rgba(0,0,0,0.4)",
        height: 6,
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
        right: 0,
        height: "100%",
        backgroundColor: "rgba(255,255,255,0.2)",
        width: 2,
    },
    spineMedia: {
        width: SPINE_WIDTH + 2,
        borderLeftWidth: 1,
        borderLeftColor: "rgba(255,255,255,0.1)",
    },
    spineTech: {
        shadowColor: "#5DADE2",
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 4,
    },
    spineGame: {
        width: SPINE_WIDTH + 1,
    },
    spineLabel: {
        position: "absolute",
        top: "40%",
        left: 1,
        right: 1,
        height: 8,
        borderRadius: 1,
    },
    spineStripe: {
        position: "absolute",
        top: 0,
        bottom: 0,
        left: 2,
        width: 2,
        backgroundColor: "rgba(255,255,255,0.3)",
    },
    cover: {
        flex: 1,
        backgroundColor: COLORS.surface,
        borderRadius: 3,
        overflow: "hidden",
        position: "relative",
        zIndex: 3,
        ...Platform.select({
            ios: { shadowColor: "#000", shadowOffset: { width: 1, height: 1 }, shadowOpacity: 0.2, shadowRadius: 2 },
            android: { elevation: 3 }
        }),
    },
    coverGlass: {
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.3)",
        backgroundColor: "rgba(255,255,255,0.05)",
    },
    coverPlastic: {
        backgroundColor: "#1a1a1a",
        borderRadius: 2,
    },
    coverTech: {
        borderWidth: 1,
        borderColor: "rgba(93,173,226,0.3)",
        shadowColor: "#5DADE2",
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
    },
    coverSoft: {
        borderRadius: 4,
    },
    coverImage: {
        width: "100%",
        height: "100%",
    },
    placeholder: {
        flex: 1,
        backgroundColor: WOOD_LIGHT,
        justifyContent: "center",
        alignItems: "center",
    },
    shine: {
        ...StyleSheet.absoluteFillObject,
        opacity: 0.25,
        pointerEvents: "none",
    },
    glassShine: {
        ...StyleSheet.absoluteFillObject,
        opacity: 0.4,
        pointerEvents: "none",
    },
    glassEdge: {
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: 2,
        backgroundColor: "rgba(255,255,255,0.4)",
    },
    plasticShine: {
        ...StyleSheet.absoluteFillObject,
        opacity: 0.3,
        pointerEvents: "none",
    },
    techGlow: {
        position: "absolute",
        top: -2,
        left: -2,
        right: -2,
        bottom: -2,
        borderRadius: 4,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.6,
        shadowRadius: 6,
        opacity: 0.4,
    },
    coverRightEdge: {
        position: "absolute",
        right: 0,
        top: 0,
        bottom: 0,
        width: 6,
    },
    pages: {
        width: BOOK_DEPTH,
        height: "98%",
        backgroundColor: PAGES_COLOR,
        alignSelf: "center",
        marginLeft: -1,
        borderRadius: 1,
        zIndex: 1,
        ...Platform.select({
            ios: { shadowColor: "#000", shadowOffset: { width: 1, height: 0 }, shadowOpacity: 0.15, shadowRadius: 1 },
            android: { elevation: 2 }
        }),
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
        backgroundColor: "rgba(0,0,0,0.12)",
    },
    toyBoxFold: {
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        height: 4,
        backgroundColor: "rgba(0,0,0,0.1)",
        borderTopLeftRadius: 2,
        borderTopRightRadius: 2,
    },
});

export default BookItem;
