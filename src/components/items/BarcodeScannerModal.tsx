import { COLORS } from "@/constants/theme";
import { useHaptics } from "@/hooks/useHaptics";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { CameraView, useCameraPermissions } from "expo-camera";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
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
  const [permission, requestPermission] = useCameraPermissions();
  const [torchOn, setTorchOn] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);

  // Prevent duplicate scans — lock after a successful read
  const scanLockRef = useRef(false);

  // Animated values
  const scanLinePosition = useSharedValue(0);
  const cornerOpacity = useSharedValue(1);
  const pulseScale = useSharedValue(1);

  useEffect(() => {
    if (visible) {
      // Reset state when modal opens
      scanLockRef.current = false;
      setTorchOn(false);
      setIsCameraReady(false);

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

  const handleClose = useCallback(async () => {
    await haptics.light();
    onClose();
  }, [haptics, onClose]);

  const handleBarcodeScanned = useCallback(
    async ({ data }: { data: string; type: string }) => {
      // Prevent duplicate fires
      if (scanLockRef.current) return;
      scanLockRef.current = true;

      await haptics.success();
      onBarcodeScanned(data);
    },
    [haptics, onBarcodeScanned]
  );

  const handleToggleTorch = useCallback(async () => {
    await haptics.light();
    setTorchOn((prev) => !prev);
  }, [haptics]);

  const handleRequestPermission = useCallback(async () => {
    await haptics.light();
    await requestPermission();
  }, [haptics, requestPermission]);

  // ── Permission: still loading ─────────────────────────────────────────
  const renderPermissionLoading = () => (
    <View style={styles.centeredContent}>
      <ActivityIndicator size="large" color={COLORS.primary} />
      <Text style={styles.permissionText}>Initializing camera…</Text>
    </View>
  );

  // ── Permission: not granted ───────────────────────────────────────────
  const renderPermissionRequest = () => (
    <View style={styles.centeredContent}>
      <View style={styles.permissionIconContainer}>
        <Ionicons name="camera-outline" size={56} color={COLORS.primary} />
      </View>
      <Text style={styles.permissionTitle}>Camera Access Required</Text>
      <Text style={styles.permissionText}>
        Show Off needs camera access to scan barcodes and quickly add items to
        your collection.
      </Text>
      <TouchableOpacity
        style={styles.permissionButton}
        onPress={handleRequestPermission}
        activeOpacity={0.8}
      >
        <Ionicons name="lock-open-outline" size={20} color="#000" />
        <Text style={styles.permissionButtonText}>Grant Access</Text>
      </TouchableOpacity>
    </View>
  );

  // ── Main scanner view ─────────────────────────────────────────────────
  const renderScanner = () => (
    <>
      {/* Live camera feed */}
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        enableTorch={torchOn}
        onBarcodeScanned={handleBarcodeScanned}
        barcodeScannerSettings={{
          barcodeTypes: [
            "ean13",
            "ean8",
            "upc_a",
            "upc_e",
            "code128",
            "code39",
            "code93",
            "itf14",
            "codabar",
            "qr",
          ],
        }}
        onCameraReady={() => setIsCameraReady(true)}
      />

      {/* Semi-transparent overlay with cut-out illusion */}
      <View style={styles.overlay}>
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
            <Animated.View style={[styles.scanLine, scanLineStyle]} />
          </Animated.View>

          {/* Instructions */}
          <Text style={styles.instructions}>
            {!isCameraReady
              ? "Starting camera…"
              : "Position barcode within the frame"}
          </Text>
        </View>
      </View>
    </>
  );

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={handleClose}
    >
      <View style={styles.container}>
        {/* Camera or permission content */}
        {!permission
          ? renderPermissionLoading()
          : !permission.granted
            ? renderPermissionRequest()
            : renderScanner()}

        {/* Header — always visible */}
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

        {/* Bottom Controls — only when camera is active */}
        {permission?.granted && (
          <BlurView intensity={80} style={styles.bottomContainer} tint="dark">
            <TouchableOpacity
              style={[
                styles.flashButton,
                torchOn && styles.flashButtonActive,
              ]}
              onPress={handleToggleTorch}
              activeOpacity={0.7}
            >
              <Ionicons
                name={torchOn ? "flashlight" : "flashlight-outline"}
                size={24}
                color={torchOn ? COLORS.primary : COLORS.white}
              />
              <Text
                style={[
                  styles.buttonText,
                  torchOn && { color: COLORS.primary },
                ]}
              >
                {torchOn ? "Flash On" : "Flash"}
              </Text>
            </TouchableOpacity>
          </BlurView>
        )}
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
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "ios" ? 50 : 20,
    paddingBottom: 16,
    zIndex: 10,
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
  // ── Camera overlay ──────────────────────────────────────────
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
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
    backgroundColor: "transparent",
    position: "relative",
    // "cut-out" effect — the frame area is see-through
    overflow: "hidden",
  },
  corner: {
    position: "absolute",
    width: CORNER_SIZE,
    height: CORNER_SIZE,
    borderColor: COLORS.primary,
    zIndex: 2,
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
    zIndex: 1,
  },
  instructions: {
    marginTop: 24,
    fontSize: 16,
    color: COLORS.grey,
    textAlign: "center",
  },
  // ── Bottom controls ─────────────────────────────────────────
  bottomContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    paddingHorizontal: 32,
    paddingVertical: 24,
    paddingBottom: Platform.OS === "ios" ? 40 : 24,
    zIndex: 10,
  },
  flashButton: {
    alignItems: "center",
    padding: 12,
    borderRadius: 12,
    minWidth: 80,
  },
  flashButtonActive: {
    backgroundColor: "rgba(155, 93, 229, 0.15)",
  },
  buttonText: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: "600",
    marginTop: 4,
  },
  // ── Permission states ───────────────────────────────────────
  centeredContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
  },
  permissionIconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: `${COLORS.primary}20`,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
  },
  permissionTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: COLORS.white,
    textAlign: "center",
    marginBottom: 12,
  },
  permissionText: {
    fontSize: 15,
    color: COLORS.grey,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 28,
  },
  permissionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 14,
  },
  permissionButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#000",
  },
});
