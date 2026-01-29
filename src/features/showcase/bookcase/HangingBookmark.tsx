import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// --- Hanging Bookmark Component ---
const HangingBookmark = React.memo(({ onPress }: { onPress?: () => void }) => {
    const insets = useSafeAreaInsets();
    const bounceAnim = useRef(new Animated.Value(0)).current;

    // Gentle idle animation
    useEffect(() => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(bounceAnim, { toValue: 1, duration: 2000, useNativeDriver: true }),
                Animated.timing(bounceAnim, { toValue: 0, duration: 2000, useNativeDriver: true })
            ])
        ).start();
    }, []);

    const translateY = bounceAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 5]
    });

    return (
        <View style={[bookmarkStyles.container, { top: insets.top - 10 }]}>
            <Pressable
                onPress={onPress}
                style={({ pressed }) => [
                    bookmarkStyles.pressable,
                    pressed && { opacity: 0.8, transform: [{ scale: 0.95 }] }
                ]}
            >
                <Animated.View style={[bookmarkStyles.ribbon, { transform: [{ translateY }] }]}>
                    <LinearGradient
                        colors={["#D94848", "#B52B2B"]}
                        style={StyleSheet.absoluteFill}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                    />
                    <View style={bookmarkStyles.stitch} />
                    <View style={bookmarkStyles.cutout} />

                    <View style={bookmarkStyles.iconContainer}>
                        <Ionicons name="search" size={18} color="rgba(255,255,255,0.9)" />
                    </View>
                </Animated.View>
                {/* Shadow for depth */}
                <View style={bookmarkStyles.shadow} />
            </Pressable>
        </View>
    );
});

const bookmarkStyles = StyleSheet.create({
    container: {
        position: "absolute",
        right: 24,
        zIndex: 50,
    },
    pressable: {
        width: 40,
        height: 90,
        alignItems: "center",
    },
    ribbon: {
        width: 36,
        height: 80,
        backgroundColor: "#C93838",
        zIndex: 2,
        alignItems: "center",
        paddingTop: 45, // Position icon lower
        borderBottomLeftRadius: 2,
        borderBottomRightRadius: 2,
    },
    cutout: {
        position: "absolute",
        bottom: -10,
        left: 0,
        right: 0,
        height: 20,
        backgroundColor: "transparent",
        borderLeftWidth: 18,
        borderRightWidth: 18,
        borderTopWidth: 15,
        borderLeftColor: "transparent",
        borderRightColor: "transparent",
        borderTopColor: "#B52B2B",
    },
    stitch: {
        position: "absolute",
        top: 5,
        left: 4,
        right: 4,
        bottom: 15,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.3)",
        borderStyle: "dashed",
        borderRadius: 1,
    },
    iconContainer: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.3,
        shadowRadius: 2,
    },
    shadow: {
        position: "absolute",
        top: 2,
        right: -2,
        width: 36,
        height: 75,
        backgroundColor: "rgba(0,0,0,0.3)",
        zIndex: 1,
    }
});

export default HangingBookmark;
