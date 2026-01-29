import { COLORS } from "@/constants/theme";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect } from "react";
import { StyleSheet, Text, View, ViewStyle, DimensionValue } from "react-native";
import Animated, {
    Easing,
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withTiming,
} from "react-native-reanimated";

interface SkeletonLoaderProps {
    width?: DimensionValue;
    height?: number;
    borderRadius?: number;
    style?: ViewStyle;
    shimmerColors?: readonly [string, string, ...string[]];
}

const DEFAULT_SHIMMER_COLORS: readonly [string, string, string] = [
    COLORS.surface,
    COLORS.surfaceLight,
    COLORS.surface,
];

/**
 * Animated shimmer skeleton loader with gradient sweep effect
 */
export function SkeletonLoader({
    width = "100%",
    height = 60,
    borderRadius = 12,
    style,
    shimmerColors = DEFAULT_SHIMMER_COLORS,
}: SkeletonLoaderProps) {
    const translateX = useSharedValue(-300);

    useEffect(() => {
        translateX.value = withRepeat(
            withTiming(300, {
                duration: 1500,
                easing: Easing.ease,
            }),
            -1,
            false
        );
    }, [translateX]);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: translateX.value }],
    }));

    return (
        <View
            style={[
                styles.container,
                {
                    width,
                    height,
                    borderRadius,
                },
                style,
            ]}
        >
            <View style={[StyleSheet.absoluteFill, { overflow: "hidden" }]}>
                <Animated.View style={[StyleSheet.absoluteFill, animatedStyle]}>
                    <LinearGradient
                        colors={shimmerColors}
                        start={{ x: 0, y: 0.5 }}
                        end={{ x: 1, y: 0.5 }}
                        style={StyleSheet.absoluteFill}
                    />
                </Animated.View>
            </View>
        </View>
    );
}

interface SkeletonListProps {
    count?: number;
    itemHeight?: number;
    gap?: number;
}

/**
 * Multiple skeleton loaders arranged as a list
 */
export function SkeletonList({
    count = 5,
    itemHeight = 80,
    gap = 12,
}: SkeletonListProps) {
    return (
        <View style={[styles.listContainer, { gap }]}>
            {Array.from({ length: count }).map((_, index) => (
                <SkeletonLoader
                    key={index}
                    height={itemHeight}
                    borderRadius={12}
                />
            ))}
        </View>
    );
}

interface SkeletonProductCardProps {
    showImage?: boolean;
}

/**
 * Product card style skeleton loader
 */
export function SkeletonProductCard({ showImage = true }: SkeletonProductCardProps) {
    return (
        <View style={styles.productCard}>
            {showImage && (
                <SkeletonLoader
                    width={50}
                    height={50}
                    borderRadius={8}
                    style={styles.productImage}
                />
            )}
            <View style={styles.productInfo}>
                <SkeletonLoader
                    width="70%"
                    height={16}
                    borderRadius={4}
                    style={styles.productTitle}
                />
                <SkeletonLoader
                    width="40%"
                    height={12}
                    borderRadius={4}
                    style={styles.productBrand}
                />
                <View style={styles.productMeta}>
                    <SkeletonLoader
                        width={60}
                        height={10}
                        borderRadius={4}
                    />
                </View>
            </View>
        </View>
    );
}

interface SkeletonSearchResultsProps {
    count?: number;
}

/**
 * Skeleton loader for search results list
 */
export function SkeletonSearchResults({ count = 4 }: SkeletonSearchResultsProps) {
    return (
        <View style={styles.searchResultsContainer}>
            {Array.from({ length: count }).map((_, index) => (
                <SkeletonProductCard key={index} />
            ))}
        </View>
    );
}

/**
 * Pulse loading indicator with animated dots
 */
export function PulseLoader({
    size = "medium",
    text,
}: {
    size?: "small" | "medium" | "large";
    text?: string;
}) {
    const dot1 = useSharedValue(0.4);
    const dot2 = useSharedValue(0.4);
    const dot3 = useSharedValue(0.4);

    const dotSizes = {
        small: 6,
        medium: 8,
        large: 10,
    };

    useEffect(() => {
        const animate = () => {
            dot1.value = withRepeat(
                withTiming(1, { duration: 600 }),
                -1,
                true
            );
            setTimeout(() => {
                dot2.value = withRepeat(
                    withTiming(1, { duration: 600 }),
                    -1,
                    true
                );
            }, 150);
            setTimeout(() => {
                dot3.value = withRepeat(
                    withTiming(1, { duration: 600 }),
                    -1,
                    true
                );
            }, 300);
        };
        animate();
    }, [dot1, dot2, dot3]);

    const animatedStyle1 = useAnimatedStyle(() => ({
        opacity: dot1.value,
        transform: [{ scale: 0.6 + dot1.value * 0.4 }],
    }));

    const animatedStyle2 = useAnimatedStyle(() => ({
        opacity: dot2.value,
        transform: [{ scale: 0.6 + dot2.value * 0.4 }],
    }));

    const animatedStyle3 = useAnimatedStyle(() => ({
        opacity: dot3.value,
        transform: [{ scale: 0.6 + dot3.value * 0.4 }],
    }));

    return (
        <View style={styles.pulseContainer}>
            <View style={styles.dotsContainer}>
                <Animated.View
                    style={[
                        styles.dot,
                        {
                            width: dotSizes[size],
                            height: dotSizes[size],
                            backgroundColor: COLORS.primary,
                        },
                        animatedStyle1,
                    ]}
                />
                <Animated.View
                    style={[
                        styles.dot,
                        {
                            width: dotSizes[size],
                            height: dotSizes[size],
                            backgroundColor: COLORS.primary,
                        },
                        animatedStyle2,
                    ]}
                />
                <Animated.View
                    style={[
                        styles.dot,
                        {
                            width: dotSizes[size],
                            height: dotSizes[size],
                            backgroundColor: COLORS.primary,
                        },
                        animatedStyle3,
                    ]}
                />
            </View>
            {text && <Text style={styles.pulseText}>{text}</Text>}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        backgroundColor: COLORS.surface,
        overflow: "hidden",
    },
    listContainer: {
        width: "100%",
    },
    productCard: {
        flexDirection: "row",
        backgroundColor: COLORS.surface,
        padding: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: COLORS.surfaceLight,
        alignItems: "center",
    },
    productImage: {
        marginRight: 12,
    },
    productInfo: {
        flex: 1,
        justifyContent: "center",
    },
    productTitle: {
        marginBottom: 8,
    },
    productBrand: {
        marginBottom: 6,
    },
    productMeta: {
        flexDirection: "row",
    },
    searchResultsContainer: {
        gap: 12,
        paddingHorizontal: 20,
    },
    pulseContainer: {
        alignItems: "center",
        justifyContent: "center",
    },
    dotsContainer: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },
    dot: {
        borderRadius: 100,
    },
    pulseText: {
        color: COLORS.grey,
        fontSize: 14,
        marginTop: 16,
        fontWeight: "500",
    },
});
