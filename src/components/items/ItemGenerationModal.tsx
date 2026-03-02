import { COLORS } from "@/constants/theme";
import { useHaptics } from "@/hooks/useHaptics";
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import { Modal, StyleSheet, Text, View } from "react-native";
import Animated, {
    Easing,
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withSequence,
    withSpring,
    withTiming,
} from "react-native-reanimated";

interface ItemGenerationModalProps {
    visible: boolean;
    onClose?: () => void;
    onComplete?: () => void;
}

interface ProgressStep {
    id: string;
    message: string;
    icon: string;
    subMessages: string[];
}

const PROGRESS_STEPS: ProgressStep[] = [
    {
        id: "searching",
        message: "Searching databases...",
        icon: "search",
        subMessages: [
            "Checking product catalogs...",
            "Scanning barcode databases...",
            "Looking up manufacturer info...",
        ],
    },
    {
        id: "analyzing",
        message: "Analyzing data...",
        icon: "library",
        subMessages: [
            "Verifying product details...",
            "Cross-referencing sources...",
            "Extracting key information...",
        ],
    },
    {
        id: "validating",
        message: "Creating your item...",
        icon: "diamond",
        subMessages: [
            "Generating item record...",
            "Uploading to your collection...",
            "Processing images...",
        ],
    },
    {
        id: "linking",
        message: "Finalizing...",
        icon: "link",
        subMessages: [
            "Linking to showcase...",
            "Setting visibility options...",
            "Almost done...",
        ],
    },
];

export default function ItemGenerationModal({
    visible,
    onClose,
    onComplete,
    isFinished = false,
}: ItemGenerationModalProps & { isFinished?: boolean }) {
    const haptics = useHaptics();
    const [currentStep, setCurrentStep] = useState(0);
    const [subMessageIndex, setSubMessageIndex] = useState(0);

    // Animated values
    const progress = useSharedValue(0);
    const iconScale = useSharedValue(1);
    const iconRotate = useSharedValue(0);
    const cardScale = useSharedValue(0.9);
    const cardOpacity = useSharedValue(0);

    // Handle isFinished prop
    useEffect(() => {
        if (visible && isFinished) {
            // Fast forward to end
            setCurrentStep(PROGRESS_STEPS.length - 1);
            progress.value = withTiming(100, { duration: 500 });

            const timer = setTimeout(() => {
                haptics.success();
                onComplete?.();
            }, 800);
            return () => clearTimeout(timer);
        }
    }, [visible, isFinished, haptics, onComplete, progress]);

    useEffect(() => {
        if (visible) {
            if (isFinished) return; // Skip if already finished

            // Entry animation
            cardScale.value = withSpring(1, { damping: 15, stiffness: 200 });
            cardOpacity.value = withTiming(1, { duration: 300 });
            progress.value = withTiming(0, { duration: 0 });

            // Start step progression
            const stepInterval = setInterval(() => {
                setCurrentStep((prev) => {
                    const next = prev + 1;
                    if (next < PROGRESS_STEPS.length - 1) {
                        // Haptic feedback on step change
                        haptics.light();
                        return next;
                    }
                    // Don't auto-complete if we're waiting for isFinished
                    return prev;
                });
            }, 1800);

            // Sub-message rotation
            const subMessageInterval = setInterval(() => {
                setSubMessageIndex((prev) => (prev + 1) % 3);
            }, 600);

            return () => {
                clearInterval(stepInterval);
                clearInterval(subMessageInterval);
            };
        } else {
            // Reset on close
            setCurrentStep(0);
            setSubMessageIndex(0);
            cardScale.value = 0.9;
            cardOpacity.value = 0;
            progress.value = 0;
        }
    }, [visible, haptics, cardScale, cardOpacity, progress, isFinished]);

    useEffect(() => {
        // Animate progress based on current step
        const targetProgress = ((currentStep + 1) / PROGRESS_STEPS.length) * 100;
        progress.value = withTiming(targetProgress, {
            duration: 800,
            easing: Easing.bezier(0.4, 0, 0.2, 1),
        });

        // Icon pulse animation
        iconScale.value = withSequence(
            withTiming(1.3, { duration: 200 }),
            withSpring(1, { damping: 12, stiffness: 200 })
        );

        // Icon rotation
        iconRotate.value = withTiming(currentStep * 90, { duration: 400 });
    }, [currentStep, progress, iconScale, iconRotate]);

    // Continuous spinning for loading
    const spinValue = useSharedValue(0);
    useEffect(() => {
        if (visible) {
            spinValue.value = withRepeat(
                withTiming(360, { duration: 2000, easing: Easing.linear }),
                -1
            );
        }
    }, [visible, spinValue]);

    const progressStyle = useAnimatedStyle(() => ({
        width: `${progress.value}%`,
    }));

    const cardStyle = useAnimatedStyle(() => ({
        transform: [{ scale: cardScale.value }],
        opacity: cardOpacity.value,
    }));

    const iconStyle = useAnimatedStyle(() => ({
        transform: [
            { scale: iconScale.value },
            { rotate: `${iconRotate.value}deg` },
        ],
    }));

    const spinStyle = useAnimatedStyle(() => ({
        transform: [{ rotate: `${spinValue.value}deg` }],
    }));

    const currentStepData = PROGRESS_STEPS[currentStep];
    const subMessage = currentStepData?.subMessages[subMessageIndex] || "";

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onClose}
        >
            <View style={styles.modalBackdrop}>
                <Animated.View style={[styles.modalCard, cardStyle]}>
                    {/* Header with animated icon */}
                    <View style={styles.header}>
                        <Animated.View style={[styles.iconContainer, iconStyle]}>
                            <Ionicons
                                name={currentStepData?.icon as any}
                                size={40}
                                color={COLORS.primary}
                            />
                        </Animated.View>
                        <View style={styles.spinnerContainer}>
                            <Animated.View style={spinStyle}>
                                <Ionicons
                                    name="refresh"
                                    size={24}
                                    color={COLORS.primary}
                                    style={{ opacity: 0.5 }}
                                />
                            </Animated.View>
                        </View>
                        <Text style={styles.title}>{currentStepData?.message}</Text>
                    </View>

                    {/* Progress Bar */}
                    <View style={styles.progressContainer}>
                        <View style={styles.progressTrack}>
                            <Animated.View
                                style={[styles.progressFill, progressStyle]}
                            />
                        </View>
                        <Text style={styles.progressText}>
                            Step {currentStep + 1} of {PROGRESS_STEPS.length}
                        </Text>
                    </View>

                    {/* Sub-message with fade animation */}
                    <View style={styles.subMessageContainer}>
                        <Text style={styles.subMessage}>{subMessage}</Text>
                    </View>

                    {/* Step indicators */}
                    <View style={styles.stepIndicators}>
                        {PROGRESS_STEPS.map((step, index) => (
                            <StepIndicator
                                key={step.id}
                                isActive={index === currentStep}
                                isCompleted={index < currentStep}
                            />
                        ))}
                    </View>
                </Animated.View>
            </View>
        </Modal>
    );
}

function StepIndicator({
    isActive,
    isCompleted,
}: {
    isActive: boolean;
    isCompleted: boolean;
}) {
    const scale = useSharedValue(isActive ? 1.2 : 1);
    const opacity = useSharedValue(isCompleted || isActive ? 1 : 0.3);

    useEffect(() => {
        if (isActive) {
            scale.value = withSpring(1.3, { damping: 12, stiffness: 200 });
            opacity.value = withTiming(1, { duration: 200 });
        } else if (isCompleted) {
            scale.value = withTiming(1, { duration: 200 });
            opacity.value = withTiming(1, { duration: 200 });
        } else {
            scale.value = withTiming(1, { duration: 200 });
            opacity.value = withTiming(0.3, { duration: 200 });
        }
    }, [isActive, isCompleted, scale, opacity]);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
        opacity: opacity.value,
    }));

    return (
        <Animated.View
            style={[
                styles.stepDot,
                isActive && styles.stepDotActive,
                isCompleted && styles.stepDotCompleted,
                animatedStyle,
            ]}
        />
    );
}

const styles = StyleSheet.create({
    modalBackdrop: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.8)",
        justifyContent: "center",
        padding: 24,
    },
    modalCard: {
        backgroundColor: COLORS.surface,
        borderRadius: 24,
        padding: 32,
        alignItems: "center",
        maxWidth: 380,
        alignSelf: "center",
        borderWidth: 1,
        borderColor: COLORS.surfaceLight,
        shadowColor: COLORS.primary,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.2,
        shadowRadius: 20,
        elevation: 10,
    },
    header: {
        alignItems: "center",
        marginBottom: 28,
    },
    iconContainer: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: `${COLORS.primary}20`,
        justifyContent: "center",
        alignItems: "center",
        marginBottom: 16,
    },
    spinnerContainer: {
        position: "absolute",
        top: 0,
        right: 0,
    },
    title: {
        fontSize: 22,
        fontWeight: "700",
        color: COLORS.white,
        textAlign: "center",
    },
    progressContainer: {
        width: "100%",
        marginBottom: 20,
    },
    progressTrack: {
        height: 8,
        backgroundColor: COLORS.slate,
        borderRadius: 4,
        overflow: "hidden",
        marginBottom: 12,
    },
    progressFill: {
        height: "100%",
        backgroundColor: COLORS.primary,
        borderRadius: 4,
        shadowColor: COLORS.primary,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 4,
        elevation: 2,
    },
    progressText: {
        fontSize: 14,
        color: COLORS.grey,
        textAlign: "center",
        fontWeight: "500",
    },
    subMessageContainer: {
        minHeight: 24,
        justifyContent: "center",
        marginBottom: 24,
    },
    subMessage: {
        fontSize: 15,
        color: COLORS.grey,
        textAlign: "center",
        fontStyle: "italic",
    },
    stepIndicators: {
        flexDirection: "row",
        gap: 12,
    },
    stepDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: COLORS.grey,
    },
    stepDotActive: {
        backgroundColor: COLORS.primary,
    },
    stepDotCompleted: {
        backgroundColor: "#4CAF50",
    },
});
