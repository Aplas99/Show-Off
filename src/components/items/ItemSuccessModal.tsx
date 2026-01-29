import { COLORS } from "@/constants/theme";
import { useHaptics } from "@/hooks/useHaptics";
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect } from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Animated, {
    Easing,
    useAnimatedStyle,
    useSharedValue,
    withDelay,
    withSequence,
    withSpring,
    withTiming,
} from "react-native-reanimated";

interface ItemSuccessModalProps {
    visible: boolean;
    onClose: () => void;
    onCreateAnother: () => void;
    onViewShowcase?: () => void;
    itemTitle?: string;
    showcaseCount?: number;
}

// Pre-defined confetti particle configuration
const PARTICLE_COUNT = 12;
const PARTICLE_COLORS = [COLORS.primary, COLORS.secondary, "#4CAF50", "#FFD700"];

export default function ItemSuccessModal({
    visible,
    onClose,
    onCreateAnother,
    onViewShowcase,
    itemTitle,
    showcaseCount = 0,
}: ItemSuccessModalProps) {
    const haptics = useHaptics();

    // Animated values
    const cardScale = useSharedValue(0.8);
    const cardOpacity = useSharedValue(0);
    const iconScale = useSharedValue(0);
    const iconRotate = useSharedValue(0);
    const checkmarkScale = useSharedValue(0);
    const buttonTranslateY = useSharedValue(50);
    const buttonOpacity = useSharedValue(0);

    // Individual particle animated values (declared at top level)
    const p0 = useSharedValue(0), p0y = useSharedValue(0), p0s = useSharedValue(0), p0r = useSharedValue(0);
    const p1 = useSharedValue(0), p1y = useSharedValue(0), p1s = useSharedValue(0), p1r = useSharedValue(0);
    const p2 = useSharedValue(0), p2y = useSharedValue(0), p2s = useSharedValue(0), p2r = useSharedValue(0);
    const p3 = useSharedValue(0), p3y = useSharedValue(0), p3s = useSharedValue(0), p3r = useSharedValue(0);
    const p4 = useSharedValue(0), p4y = useSharedValue(0), p4s = useSharedValue(0), p4r = useSharedValue(0);
    const p5 = useSharedValue(0), p5y = useSharedValue(0), p5s = useSharedValue(0), p5r = useSharedValue(0);
    const p6 = useSharedValue(0), p6y = useSharedValue(0), p6s = useSharedValue(0), p6r = useSharedValue(0);
    const p7 = useSharedValue(0), p7y = useSharedValue(0), p7s = useSharedValue(0), p7r = useSharedValue(0);
    const p8 = useSharedValue(0), p8y = useSharedValue(0), p8s = useSharedValue(0), p8r = useSharedValue(0);
    const p9 = useSharedValue(0), p9y = useSharedValue(0), p9s = useSharedValue(0), p9r = useSharedValue(0);
    const p10 = useSharedValue(0), p10y = useSharedValue(0), p10s = useSharedValue(0), p10r = useSharedValue(0);
    const p11 = useSharedValue(0), p11y = useSharedValue(0), p11s = useSharedValue(0), p11r = useSharedValue(0);

    const particleValues = [
        { x: p0, y: p0y, scale: p0s, rotate: p0r },
        { x: p1, y: p1y, scale: p1s, rotate: p1r },
        { x: p2, y: p2y, scale: p2s, rotate: p2r },
        { x: p3, y: p3y, scale: p3s, rotate: p3r },
        { x: p4, y: p4y, scale: p4s, rotate: p4r },
        { x: p5, y: p5y, scale: p5s, rotate: p5r },
        { x: p6, y: p6y, scale: p6s, rotate: p6r },
        { x: p7, y: p7y, scale: p7s, rotate: p7r },
        { x: p8, y: p8y, scale: p8s, rotate: p8r },
        { x: p9, y: p9y, scale: p9s, rotate: p9r },
        { x: p10, y: p10y, scale: p10s, rotate: p10r },
        { x: p11, y: p11y, scale: p11s, rotate: p11r },
    ];

    useEffect(() => {
        if (visible) {
            // Card entry animation
            cardScale.value = withSpring(1, { damping: 15, stiffness: 200 });
            cardOpacity.value = withTiming(1, { duration: 300 });

            // Icon bounce animation
            iconScale.value = withDelay(
                200,
                withSequence(
                    withTiming(0, { duration: 0 }),
                    withSpring(1.2, { damping: 10, stiffness: 200 }),
                    withTiming(1, { duration: 200 })
                )
            );

            // Checkmark animation
            checkmarkScale.value = withDelay(
                400,
                withSpring(1, { damping: 12, stiffness: 200 })
            );

            iconRotate.value = withDelay(
                200,
                withTiming(360, { duration: 600, easing: Easing.ease })
            );

            // Buttons slide up
            buttonTranslateY.value = withDelay(
                500,
                withSpring(0, { damping: 15, stiffness: 200 })
            );
            buttonOpacity.value = withDelay(500, withTiming(1, { duration: 300 }));

            // Confetti explosion
            particleValues.forEach((particle, index) => {
                const angle = (index / PARTICLE_COUNT) * Math.PI * 2;
                const distance = 100 + Math.random() * 50;
                const delay = 300 + index * 30;

                particle.x.value = withDelay(
                    delay,
                    withSequence(
                        withTiming(0, { duration: 0 }),
                        withSpring(Math.cos(angle) * distance, {
                            damping: 20,
                            stiffness: 100,
                        })
                    )
                );
                particle.y.value = withDelay(
                    delay,
                    withSequence(
                        withTiming(0, { duration: 0 }),
                        withSpring(Math.sin(angle) * distance - 50, {
                            damping: 20,
                            stiffness: 100,
                        })
                    )
                );
                particle.scale.value = withDelay(
                    delay,
                    withSequence(
                        withTiming(1, { duration: 200 }),
                        withTiming(0, { duration: 600, easing: Easing.ease })
                    )
                );
                particle.rotate.value = withDelay(
                    delay,
                    withTiming(Math.random() * 360, { duration: 800 })
                );
            });

            // Success haptic
            haptics.success();
        } else {
            // Reset
            cardScale.value = 0.8;
            cardOpacity.value = 0;
            iconScale.value = 0;
            checkmarkScale.value = 0;
            iconRotate.value = 0;
            buttonTranslateY.value = 50;
            buttonOpacity.value = 0;
            particleValues.forEach((p) => {
                p.x.value = 0;
                p.y.value = 0;
                p.scale.value = 0;
                p.rotate.value = 0;
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible, haptics]);

    const cardStyle = useAnimatedStyle(() => ({
        transform: [{ scale: cardScale.value }],
        opacity: cardOpacity.value,
    }));

    const iconContainerStyle = useAnimatedStyle(() => ({
        transform: [
            { scale: iconScale.value },
            { rotate: `${iconRotate.value}deg` },
        ],
    }));

    const checkmarkStyle = useAnimatedStyle(() => ({
        transform: [{ scale: checkmarkScale.value }],
    }));

    const buttonContainerStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: buttonTranslateY.value }],
        opacity: buttonOpacity.value,
    }));

    const handleCreateAnother = async () => {
        await haptics.light();
        onCreateAnother();
    };

    const handleViewShowcase = async () => {
        await haptics.medium();
        onViewShowcase?.();
    };

    const handleClose = async () => {
        await haptics.light();
        onClose();
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={handleClose}
        >
            <View style={styles.modalBackdrop}>
                {/* Confetti particles */}
                <View style={styles.confettiContainer} pointerEvents="none">
                    {particleValues.map((particle, index) => (
                        <ConfettiParticle 
                            key={index} 
                            particle={particle} 
                            color={PARTICLE_COLORS[index % PARTICLE_COLORS.length]}
                            isCircle={index % 2 === 0}
                        />
                    ))}
                </View>

                <Animated.View style={[styles.modalCard, cardStyle]}>
                    {/* Success Icon */}
                    <Animated.View
                        style={[styles.iconContainer, iconContainerStyle]}
                    >
                        <View style={styles.iconBackground}>
                            <Ionicons
                                name="trophy"
                                size={48}
                                color={COLORS.primary}
                            />
                        </View>
                        <Animated.View
                            style={[styles.checkmarkContainer, checkmarkStyle]}
                        >
                            <View style={styles.checkmarkBackground}>
                                <Ionicons
                                    name="checkmark"
                                    size={20}
                                    color={COLORS.white}
                                />
                            </View>
                        </Animated.View>
                    </Animated.View>

                    {/* Success Message */}
                    <Text style={styles.title}>Success!</Text>
                    <Text style={styles.subtitle}>Item Created</Text>

                    {itemTitle && (
                        <View style={styles.itemTitleContainer}>
                            <Ionicons
                                name="cube-outline"
                                size={16}
                                color={COLORS.grey}
                            />
                            <Text style={styles.itemTitle} numberOfLines={1}>
                                {itemTitle}
                            </Text>
                        </View>
                    )}

                    {showcaseCount > 0 && (
                        <View style={styles.showcaseBadge}>
                            <Ionicons
                                name="albums-outline"
                                size={14}
                                color={COLORS.white}
                            />
                            <Text style={styles.showcaseText}>
                                Added to {showcaseCount} showcase
                                {showcaseCount > 1 ? "s" : ""}
                            </Text>
                        </View>
                    )}

                    {/* Action Buttons */}
                    <Animated.View
                        style={[styles.buttonContainer, buttonContainerStyle]}
                    >
                        <TouchableOpacity
                            style={[styles.button, styles.primaryButton]}
                            onPress={handleCreateAnother}
                            activeOpacity={0.8}
                        >
                            <Ionicons
                                name="add-circle-outline"
                                size={20}
                                color={COLORS.white}
                            />
                            <Text style={styles.primaryButtonText}>
                                Create Another
                            </Text>
                        </TouchableOpacity>

                        {onViewShowcase && (
                            <TouchableOpacity
                                style={[styles.button, styles.secondaryButton]}
                                onPress={handleViewShowcase}
                                activeOpacity={0.8}
                            >
                                <Ionicons
                                    name="albums-outline"
                                    size={20}
                                    color={COLORS.primary}
                                />
                                <Text style={styles.secondaryButtonText}>
                                    View Showcase
                                </Text>
                            </TouchableOpacity>
                        )}

                        <TouchableOpacity
                            style={styles.closeButton}
                            onPress={handleClose}
                            activeOpacity={0.7}
                        >
                            <Text style={styles.closeButtonText}>Close</Text>
                        </TouchableOpacity>
                    </Animated.View>
                </Animated.View>
            </View>
        </Modal>
    );
}

interface ParticleValues {
    x: { value: number };
    y: { value: number };
    scale: { value: number };
    rotate: { value: number };
}

interface ParticleProps {
    particle: ParticleValues;
    color: string;
    isCircle: boolean;
}

function ConfettiParticle({ particle, color, isCircle }: ParticleProps) {
    const animatedStyle = useAnimatedStyle(() => ({
        transform: [
            { translateX: particle.x.value },
            { translateY: particle.y.value },
            { scale: particle.scale.value },
            { rotate: `${particle.rotate.value}deg` },
        ],
        opacity: particle.scale.value,
    }));

    return (
        <Animated.View
            style={[
                styles.confetti,
                isCircle && styles.confettiCircle,
                { backgroundColor: color },
                animatedStyle,
            ]}
        />
    );
}

const styles = StyleSheet.create({
    modalBackdrop: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.75)",
        justifyContent: "center",
        padding: 24,
    },
    confettiContainer: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: "center",
        alignItems: "center",
        pointerEvents: "none",
    },
    confetti: {
        position: "absolute",
        width: 10,
        height: 10,
        borderRadius: 2,
    },
    confettiCircle: {
        borderRadius: 5,
    },
    modalCard: {
        backgroundColor: COLORS.surface,
        borderRadius: 24,
        padding: 32,
        alignItems: "center",
        maxWidth: 360,
        alignSelf: "center",
        borderWidth: 1,
        borderColor: COLORS.surfaceLight,
        shadowColor: COLORS.primary,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.15,
        shadowRadius: 30,
        elevation: 10,
    },
    iconContainer: {
        marginBottom: 20,
        position: "relative",
    },
    iconBackground: {
        width: 100,
        height: 100,
        borderRadius: 50,
        backgroundColor: `${COLORS.primary}20`,
        justifyContent: "center",
        alignItems: "center",
    },
    checkmarkContainer: {
        position: "absolute",
        bottom: 0,
        right: 0,
    },
    checkmarkBackground: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: "#4CAF50",
        justifyContent: "center",
        alignItems: "center",
        borderWidth: 3,
        borderColor: COLORS.surface,
    },
    title: {
        fontSize: 28,
        fontWeight: "800",
        color: COLORS.white,
        textAlign: "center",
    },
    subtitle: {
        fontSize: 16,
        color: COLORS.grey,
        textAlign: "center",
        marginBottom: 16,
    },
    itemTitleContainer: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: COLORS.surfaceLight,
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 12,
        marginBottom: 12,
        gap: 8,
        maxWidth: "100%",
    },
    itemTitle: {
        fontSize: 15,
        color: COLORS.white,
        fontWeight: "600",
        flexShrink: 1,
    },
    showcaseBadge: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: COLORS.primary,
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 20,
        gap: 6,
        marginBottom: 24,
    },
    showcaseText: {
        fontSize: 13,
        color: COLORS.white,
        fontWeight: "600",
    },
    buttonContainer: {
        width: "100%",
        gap: 12,
    },
    button: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 14,
        paddingHorizontal: 20,
        borderRadius: 12,
        gap: 8,
    },
    primaryButton: {
        backgroundColor: COLORS.primary,
        shadowColor: COLORS.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
    },
    secondaryButton: {
        backgroundColor: "transparent",
        borderWidth: 1.5,
        borderColor: COLORS.primary,
    },
    closeButton: {
        paddingVertical: 12,
        alignItems: "center",
    },
    primaryButtonText: {
        color: COLORS.white,
        fontSize: 16,
        fontWeight: "700",
    },
    secondaryButtonText: {
        color: COLORS.primary,
        fontSize: 16,
        fontWeight: "600",
    },
    closeButtonText: {
        color: COLORS.grey,
        fontSize: 15,
        fontWeight: "500",
    },
});
