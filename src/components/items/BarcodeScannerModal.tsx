import { COLORS } from "@/constants/theme";
import { useHaptics } from "@/hooks/useHaptics";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import React, { useEffect } from "react";
import {
    Modal,
    Platform,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import Animated, {
    Easing,
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withTiming,
} from "react-native-reanimated";

interface BarcodeScannerModalProps {
    visible: boolean;
    onClose: () => void;
    onBarcodeScanned: (barcode: string) => void;
}

const SCANNER_FRAME_SIZE = 280;

export default function BarcodeScannerModal({
    visible,
    onClose,
    onBarcodeScanned,
}: BarcodeScannerModalProps) {
    const haptics = useHaptics();

    // Animated values
    const scanLinePosition = useSharedValue(0);
    const cornerOpacity = useSharedValue(1);
    const pulseScale = useSharedValue(1);

    useEffect(() => {
        if (visible) {
            // Start scanning animation
            scanLinePosition.value = withRepeat(
                withTiming(1, { duration: 2000, easing: Easing.ease }),
                -1,
                true
            );
            cornerOpacity.value = withRepeat(
                withTiming(0.5, { duration: 800 }),
                -1,
                true
            );
            pulseScale.value = withRepeat(
                withTiming(1.1, { duration: 1000, easing: Easing.ease }),
                -1,
                true
            );
        } else {
            scanLinePosition.value = 0;
            cornerOpacity.value = 1;
            pulseScale.value = 1;
        }
    }, [visible, scanLinePosition, cornerOpacity, pulseScale]);

    const scanLineStyle = useAnimatedStyle(() => ({
        transform: [
            {
                translateY: scanLinePosition.value * SCANNER_FRAME_SIZE,
            },
        ],
    }));

    const cornerStyle = useAnimatedStyle(() => ({
        opacity: cornerOpacity.value,
    }));

    const pulseStyle = useAnimatedStyle(() => ({
        transform: [{ scale: pulseScale.value }],
    }));

    const handleClose = async () => {
        await haptics.light();
        onClose();
    };

    const handleSimulateScan = async () => {
        await haptics.success();
        onBarcodeScanned("1234567890123");
    };

    return (
        <Modal
            visible={visible}
            animationType="fade"
            transparent
            onRequestClose={handleClose}
        >
            <View style={styles.container}>
                {/* Header */}
                <BlurView intensity={80} style={styles.header} tint="dark">
                    <TouchableOpacity
                        onPress={handleClose}
                        style={styles.closeButton}
                        activeOpacity={0.7}
                    >
                        <Ionicons name="close" size={28} color={COLORS.white} />
                    </TouchableOpacity>
                    <Text style={styles.title}>Scan Barcode</Text>
                    <View style={styles.placeholder} />
                </BlurView>

                {/* Scanner Frame */}
                <View style={styles.scannerContainer}>
                    <Animated.View style={[styles.scannerFrame, pulseStyle]}>
                        {/* Corner markers */}
                        <Animated.View
                            style={[styles.corner, styles.cornerTL, cornerStyle]}
                        />
                        <Animated.View
                            style={[styles.corner, styles.cornerTR, cornerStyle]}
                        />
                        <Animated.View
                            style={[styles.corner, styles.cornerBL, cornerStyle]}
                        />
                        <Animated.View
                            style={[styles.corner, styles.cornerBR, cornerStyle]}
                        />

                        {/* Scan line */}
                        <Animated.View
                            style={[styles.scanLine, scanLineStyle]}
                        />
                    </Animated.View>

                    {/* Instructions */}
                    <Text style={styles.instructions}>
                        Position barcode within the frame
                    </Text>
                </View>

                {/* Bottom Controls */}
                <BlurView intensity={80} style={styles.bottomContainer} tint="dark">
                    <TouchableOpacity
                        style={styles.flashButton}
                        onPress={async () => await haptics.light()}
                        activeOpacity={0.7}
                    >
                        <Ionicons
                            name="flashlight-outline"
                            size={24}
                            color={COLORS.white}
                        />
                        <Text style={styles.buttonText}>Flash</Text>
                    </TouchableOpacity>

                    {/* Mock scan button for testing */}
                    <TouchableOpacity
                        style={styles.mockButton}
                        onPress={handleSimulateScan}
                        activeOpacity={0.7}
                    >
                        <Ionicons
                            name="barcode-outline"
                            size={24}
                            color={COLORS.white}
                        />
                        <Text style={styles.buttonText}>Simulate Scan</Text>
                    </TouchableOpacity>
                </BlurView>
            </View>
        </Modal>
    );
}

const CORNER_SIZE = 24;
const CORNER_THICKNESS = 4;

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.background,
    },
    header: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingHorizontal: 16,
        paddingTop: Platform.OS === "ios" ? 50 : 20,
        paddingBottom: 16,
    },
    title: {
        fontSize: 18,
        fontWeight: "700",
        color: COLORS.white,
    },
    closeButton: {
        padding: 8,
        borderRadius: 20,
        backgroundColor: "rgba(255,255,255,0.1)",
    },
    placeholder: {
        width: 44,
    },
    scannerContainer: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
    },
    scannerFrame: {
        width: SCANNER_FRAME_SIZE,
        height: SCANNER_FRAME_SIZE,
        borderRadius: 16,
        backgroundColor: "rgba(155, 93, 229, 0.05)",
        position: "relative",
    },
    corner: {
        position: "absolute",
        width: CORNER_SIZE,
        height: CORNER_SIZE,
        borderColor: COLORS.primary,
    },
    cornerTL: {
        top: 0,
        left: 0,
        borderTopWidth: CORNER_THICKNESS,
        borderLeftWidth: CORNER_THICKNESS,
        borderTopLeftRadius: 12,
    },
    cornerTR: {
        top: 0,
        right: 0,
        borderTopWidth: CORNER_THICKNESS,
        borderRightWidth: CORNER_THICKNESS,
        borderTopRightRadius: 12,
    },
    cornerBL: {
        bottom: 0,
        left: 0,
        borderBottomWidth: CORNER_THICKNESS,
        borderLeftWidth: CORNER_THICKNESS,
        borderBottomLeftRadius: 12,
    },
    cornerBR: {
        bottom: 0,
        right: 0,
        borderBottomWidth: CORNER_THICKNESS,
        borderRightWidth: CORNER_THICKNESS,
        borderBottomRightRadius: 12,
    },
    scanLine: {
        position: "absolute",
        left: 0,
        right: 0,
        height: 2,
        backgroundColor: COLORS.primary,
        shadowColor: COLORS.primary,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8,
        shadowRadius: 4,
        elevation: 4,
    },
    instructions: {
        marginTop: 24,
        fontSize: 16,
        color: COLORS.grey,
        textAlign: "center",
    },
    bottomContainer: {
        flexDirection: "row",
        justifyContent: "space-around",
        paddingHorizontal: 32,
        paddingVertical: 24,
        paddingBottom: Platform.OS === "ios" ? 40 : 24,
    },
    flashButton: {
        alignItems: "center",
        padding: 12,
    },
    mockButton: {
        alignItems: "center",
        padding: 12,
        backgroundColor: COLORS.primary,
        borderRadius: 12,
        flexDirection: "row",
        gap: 8,
        paddingHorizontal: 20,
    },
    buttonText: {
        color: COLORS.white,
        fontSize: 14,
        fontWeight: "600",
    },
});
