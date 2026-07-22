import { useMembership } from "@/api/memberships";
import { useColors, type ThemeColors } from "@/constants/theme";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
    Modal,
    StyleSheet,
    Text,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from "react-native";
import Animated, {
    Easing,
    FadeIn,
    interpolate,
    useAnimatedStyle,
    useSharedValue,
    withDelay,
    withRepeat,
    withSequence,
    withSpring,
    withTiming,
} from "react-native-reanimated";

/** Stores the subscription id we've already celebrated, so the overlay fires
 *  exactly once per newly acquired membership (and again for a new one). */
const CELEBRATED_KEY = "@showoff/celebrated-subscription";

const CONFETTI_COLORS = [
    "#9B7BFF",
    "#c77dff",
    "#ff94a4",
    "#FFD166",
    "#06D6A0",
    "#FFFFFF",
];

interface PieceConfig {
    startX: number;
    drift: number;
    size: number;
    color: string;
    delay: number;
    duration: number;
    rotations: number;
    rounded: boolean;
}

function ConfettiPiece({
    config,
    height,
}: {
    config: PieceConfig;
    height: number;
}) {
    const progress = useSharedValue(0);

    useEffect(() => {
        progress.value = withDelay(
            config.delay,
            withTiming(1, { duration: config.duration, easing: Easing.linear }),
        );
    }, [config, progress]);

    const style = useAnimatedStyle(() => ({
        transform: [
            { translateY: interpolate(progress.value, [0, 1], [-40, height + 60]) },
            {
                translateX: interpolate(
                    progress.value,
                    [0, 0.5, 1],
                    [0, config.drift, 0],
                ),
            },
            { rotate: `${progress.value * config.rotations * 360}deg` },
        ],
        opacity: interpolate(progress.value, [0, 0.85, 1], [1, 1, 0]),
    }));

    return (
        <Animated.View
            style={[
                {
                    position: "absolute",
                    top: 0,
                    left: config.startX,
                    width: config.size,
                    height: config.size * 1.4,
                    borderRadius: config.rounded ? config.size : 2,
                    backgroundColor: config.color,
                },
                style,
            ]}
        />
    );
}

/**
 * Full-screen celebration shown once when a newly active paid membership is
 * detected (e.g. returning to the app after Stripe checkout). Mounted high in
 * the tab tree so it overlays whatever screen the user lands on.
 */
export function MembershipCelebration() {
    const colors = useColors();
    const styles = getStyles(colors);
    const { width, height } = useWindowDimensions();

    const { data: membership } = useMembership();
    const subId = membership?.subscription?.id ?? null;
    const isPaid = membership?.isPaidUser ?? false;
    const isCurator = membership?.isCurator ?? false;

    const [visible, setVisible] = useState(false);
    const lastCheckedRef = useRef<string | null>(null);

    useEffect(() => {
        if (!isPaid || !subId) return;
        if (lastCheckedRef.current === subId) return;
        lastCheckedRef.current = subId;

        let active = true;
        (async () => {
            try {
                const seen = await AsyncStorage.getItem(CELEBRATED_KEY);
                if (active && seen !== subId) setVisible(true);
            } catch {
                // Storage unavailable — skip rather than risk a loop.
            }
        })();
        return () => {
            active = false;
        };
    }, [isPaid, subId]);

    const badgeScale = useSharedValue(0);
    const glow = useSharedValue(0);

    useEffect(() => {
        if (!visible) return;
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
            () => {},
        );
        badgeScale.value = withDelay(
            120,
            withSpring(1, { damping: 9, stiffness: 120 }),
        );
        glow.value = withRepeat(
            withSequence(
                withTiming(1, { duration: 900 }),
                withTiming(0.4, { duration: 900 }),
            ),
            -1,
            true,
        );
    }, [visible, badgeScale, glow]);

    const badgeStyle = useAnimatedStyle(() => ({
        transform: [{ scale: badgeScale.value }],
    }));
    const glowStyle = useAnimatedStyle(() => ({
        opacity: 0.2 + glow.value * 0.4,
        transform: [{ scale: 1 + glow.value * 0.2 }],
    }));

    const pieces = useMemo<PieceConfig[]>(() => {
        if (!visible) return [];
        return Array.from({ length: 16 }).map(() => ({
            startX: Math.random() * width,
            drift: (Math.random() - 0.5) * 80,
            size: 7 + Math.random() * 6,
            color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
            delay: Math.random() * 400,
            duration: 2200 + Math.random() * 1400,
            rotations: 1 + Math.random() * 3,
            rounded: Math.random() > 0.6,
        }));
    }, [visible, width]);

    const dismiss = async () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        try {
            if (subId) await AsyncStorage.setItem(CELEBRATED_KEY, subId);
        } catch {
            // Ignore — worst case it shows again next launch.
        }
        badgeScale.value = 0;
        setVisible(false);
    };

    if (!visible) return null;

    const tierName = isCurator ? "Curator" : "Member";

    return (
        <Modal
            visible
            transparent
            animationType="fade"
            statusBarTranslucent
            onRequestClose={dismiss}
        >
            <View style={styles.backdrop}>
                {pieces.map((p, i) => (
                    <ConfettiPiece key={i} config={p} height={height} />
                ))}

                <Animated.View entering={FadeIn.duration(250)} style={styles.card}>
                    <View style={styles.badgeWrap}>
                        <Animated.View style={[styles.glow, glowStyle]} />
                        <Animated.View style={badgeStyle}>
                            <LinearGradient
                                colors={[colors.primary, colors.secondary]}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={styles.badge}
                            >
                                <Ionicons name="diamond" size={44} color="#FFF" />
                            </LinearGradient>
                        </Animated.View>
                    </View>

                    <Text style={styles.title}>You&apos;re a {tierName}!</Text>
                    <Text style={styles.subtitle}>
                        Your membership is active. Enjoy unlimited items, price history,
                        sharable showcases, faster scans and more.
                    </Text>

                    <TouchableOpacity
                        onPress={dismiss}
                        activeOpacity={0.85}
                        style={styles.button}
                        accessibilityRole="button"
                        accessibilityLabel="Continue"
                    >
                        <LinearGradient
                            colors={[colors.primary, colors.secondary]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.buttonInner}
                        >
                            <Text style={styles.buttonText}>Let&apos;s go</Text>
                        </LinearGradient>
                    </TouchableOpacity>
                </Animated.View>
            </View>
        </Modal>
    );
}

const getStyles = (colors: ThemeColors) =>
    StyleSheet.create({
        backdrop: {
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.75)",
            justifyContent: "center",
            alignItems: "center",
            padding: 28,
        },
        card: {
            width: "100%",
            maxWidth: 360,
            alignItems: "center",
            paddingHorizontal: 24,
            paddingTop: 36,
            paddingBottom: 24,
            borderRadius: 28,
            backgroundColor: colors.surfaceContainer,
            borderWidth: 1,
            borderColor: colors.outlineVariant,
        },
        badgeWrap: {
            width: 120,
            height: 120,
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 20,
        },
        glow: {
            position: "absolute",
            width: 120,
            height: 120,
            borderRadius: 60,
            backgroundColor: colors.primary,
        },
        badge: {
            width: 92,
            height: 92,
            borderRadius: 30,
            alignItems: "center",
            justifyContent: "center",
            shadowColor: colors.primary,
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.5,
            shadowRadius: 16,
            elevation: 10,
        },
        title: {
            fontSize: 24,
            fontWeight: "900",
            color: colors.text,
            textAlign: "center",
            marginBottom: 8,
        },
        subtitle: {
            fontSize: 14,
            lineHeight: 20,
            color: colors.onSurfaceVariant,
            textAlign: "center",
            marginBottom: 24,
        },
        button: {
            width: "100%",
            borderRadius: 999,
            overflow: "hidden",
        },
        buttonInner: {
            height: 52,
            alignItems: "center",
            justifyContent: "center",
        },
        buttonText: {
            color: "#FFF",
            fontSize: 16,
            fontWeight: "800",
        },
    });
