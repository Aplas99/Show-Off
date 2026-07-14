import { ItemWithProduct } from "@/api/items";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import React, { useCallback, useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import Animated, {
  cancelAnimation,
  Easing,
  FadeIn,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";
import { getPokemonCardImage } from "./PokemonCardGridView";

// Standard Pokémon card ratio (63mm × 88mm)
const CARD_ASPECT = 63 / 88;
const MAX_TILT_DEG = 22;
const PERSPECTIVE = 800;
const SPRING = { damping: 24, stiffness: 380, mass: 0.7 };

// One-time "press to tilt" hint. MMKV needs a dev build; fall back to
// in-memory so Expo Go just shows the hint once per session.
const HINT_KEY = "card-tilt-hint-seen";
const hintStorage = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- optional native module, must not crash Expo Go
    const { MMKV } = require("react-native-mmkv");
    const mmkv = new MMKV({ id: "card-tilt-hints" });
    return {
      getString: (key: string): string | undefined => mmkv.getString(key),
      set: (key: string, value: string) => mmkv.set(key, value),
    };
  } catch {
    const mem = new Map<string, string>();
    return {
      getString: (key: string) => mem.get(key),
      set: (key: string, value: string) => mem.set(key, value),
    };
  }
})();

type Props = {
  visible: boolean;
  item: ItemWithProduct | null;
  onClose: () => void;
};

export default function PokemonCardTiltModal({ visible, item, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  const cardWidth = Math.min(width * 0.88, 400);
  const cardHeight = cardWidth / CARD_ASPECT;

  // Tilt angles in degrees; positive rotateY brings the right edge toward
  // the viewer, positive rotateX brings the bottom edge toward the viewer.
  const rotX = useSharedValue(0);
  const rotY = useSharedValue(0);
  const pressed = useSharedValue(0);

  // Pick-up intro: 0 = card resting on the table, 1 = held up flat.
  const intro = useSharedValue(0);

  // Touch hint shown until the user tilts a card for the first time.
  const [hintActive, setHintActive] = useState(false);
  const hintOpacity = useSharedValue(0);
  const hintPulse = useSharedValue(0);

  useEffect(() => {
    if (!visible) return;
    intro.value = 0;
    intro.value = withTiming(1, {
      duration: 520,
      easing: Easing.out(Easing.cubic),
    });

    const seen = hintStorage.getString(HINT_KEY) === "true";
    setHintActive(!seen);
    if (!seen) {
      hintOpacity.value = 0;
      // Let the pick-up intro finish before inviting a touch.
      hintOpacity.value = withDelay(900, withTiming(1, { duration: 350 }));
      hintPulse.value = 0;
      hintPulse.value = withRepeat(
        withTiming(1, { duration: 700, easing: Easing.inOut(Easing.quad) }),
        -1,
        true,
      );
    }
  }, [visible, intro, hintOpacity, hintPulse]);

  const dismissHint = useCallback(() => {
    hintStorage.set(HINT_KEY, "true");
    cancelAnimation(hintPulse);
  }, [hintPulse]);

  const applyTilt = (absX: number, absY: number) => {
    "worklet";
    const nx = Math.max(-1, Math.min(1, (absX - width / 2) / (width / 2)));
    const ny = Math.max(-1, Math.min(1, (absY - height / 2) / (height / 2)));
    rotY.value = withSpring(nx * MAX_TILT_DEG, SPRING);
    rotX.value = withSpring(ny * MAX_TILT_DEG, SPRING);
  };

  const tiltGesture = Gesture.Pan()
    .minDistance(0)
    .onBegin((e) => {
      pressed.value = withSpring(1, SPRING);
      hintOpacity.value = withTiming(0, { duration: 200 });
      runOnJS(dismissHint)();
      applyTilt(e.absoluteX, e.absoluteY);
    })
    .onUpdate((e) => {
      applyTilt(e.absoluteX, e.absoluteY);
    })
    .onFinalize(() => {
      pressed.value = withSpring(0, SPRING);
      rotX.value = withSpring(0, SPRING);
      rotY.value = withSpring(0, SPRING);
    });

  const cardStyle = useAnimatedStyle(() => {
    // Starts lying back on a table, slightly askew, then rises and
    // straightens as if lifted to eye level.
    const liftY = interpolate(intro.value, [0, 1], [110, 0]);
    const layingTilt = interpolate(intro.value, [0, 1], [38, 0]);
    const twist = interpolate(intro.value, [0, 1], [-9, 0]);
    const introScale = interpolate(intro.value, [0, 1], [0.62, 1]);

    return {
      opacity: interpolate(intro.value, [0, 0.25, 1], [0, 1, 1]),
      transform: [
        { perspective: PERSPECTIVE },
        { translateY: liftY },
        { rotateX: `${rotX.value + layingTilt}deg` },
        { rotateY: `${rotY.value}deg` },
        { rotateZ: `${twist}deg` },
        { scale: introScale * interpolate(pressed.value, [0, 1], [1, 1.06]) },
      ],
    };
  });

  // Light reflection drifts toward the raised (finger) side of the card.
  const glareStyle = useAnimatedStyle(() => ({
    opacity: pressed.value * 0.4,
    transform: [
      { translateX: (rotY.value / MAX_TILT_DEG) * cardWidth * 0.5 },
      { translateY: (rotX.value / MAX_TILT_DEG) * cardHeight * 0.5 },
    ],
  }));

  const hintStyle = useAnimatedStyle(() => ({
    opacity: hintOpacity.value,
    transform: [{ scale: 1 + hintPulse.value * 0.08 }],
  }));

  if (!item) return null;

  const imageUrl = getPokemonCardImage(item);
  const title = item.products?.searchableTitle || item.custom_title || "";
  const subtitle = item.products?.searchableDescription || "";
  const formattedPrice =
    item.price != null
      ? new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: item.currency_code || "USD",
        }).format(item.price)
      : null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <GestureHandlerRootView style={styles.root}>
        <GestureDetector gesture={tiltGesture}>
          <Animated.View entering={FadeIn.duration(200)} style={styles.stage}>
            <Animated.View
              style={[
                styles.cardWrapper,
                { width: cardWidth, height: cardHeight },
                cardStyle,
              ]}
            >
              {imageUrl ? (
                <Image
                  source={{ uri: imageUrl }}
                  style={styles.cardImage}
                  contentFit="contain"
                  cachePolicy="memory-disk"
                  transition={150}
                />
              ) : (
                <View style={styles.cardPlaceholder}>
                  <Ionicons name="image-outline" size={48} color="rgba(255,255,255,0.5)" />
                </View>
              )}

              <Animated.View
                pointerEvents="none"
                style={[
                  styles.glareContainer,
                  {
                    width: cardWidth * 1.1,
                    height: cardWidth * 1.1,
                    left: (cardWidth - cardWidth * 1.1) / 2,
                    top: (cardHeight - cardWidth * 1.1) / 2,
                  },
                  glareStyle,
                ]}
              >
                <Svg width="100%" height="100%">
                  <Defs>
                    <RadialGradient id="cardGlare" cx="50%" cy="50%" r="50%">
                      <Stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.55" />
                      <Stop offset="55%" stopColor="#FFFFFF" stopOpacity="0.18" />
                      <Stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
                    </RadialGradient>
                  </Defs>
                  <Rect width="100%" height="100%" fill="url(#cardGlare)" />
                </Svg>
              </Animated.View>
            </Animated.View>

            {hintActive && (
              <Animated.View
                pointerEvents="none"
                style={[styles.hint, hintStyle]}
              >
                <MaterialCommunityIcons
                  name="gesture-tap"
                  size={26}
                  color="#FFF"
                />
                <Text style={styles.hintText}>
                  Press and move to tilt the card
                </Text>
              </Animated.View>
            )}
          </Animated.View>
        </GestureDetector>

        {(title || subtitle) && (
          <View
            pointerEvents="none"
            style={[styles.footer, { bottom: insets.bottom + 28 }]}
          >
            {title ? (
              <Text style={styles.footerTitle} numberOfLines={1}>
                {title}
              </Text>
            ) : null}
            {subtitle ? (
              <Text style={styles.footerSubtitle} numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
            {formattedPrice ? (
              <>
                <Text style={styles.footerPrice}>{formattedPrice} market</Text>
                <Text style={styles.footerDisclaimer}>
                  Market price estimate — may not be 100% accurate and varies
                  with grading, style, and condition.
                </Text>
              </>
            ) : null}
          </View>
        )}

        <Pressable
          onPress={onClose}
          hitSlop={12}
          style={[styles.closeButton, { top: insets.top + 12 }]}
        >
          <Ionicons name="close" size={26} color="#FFF" />
        </Pressable>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "rgba(5,5,8,0.98)",
  },
  stage: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  cardWrapper: {
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "transparent",
  },
  cardImage: {
    width: "100%",
    height: "100%",
  },
  cardPlaceholder: {
    flex: 1,
    borderRadius: 18,
    backgroundColor: "#1a1a1f",
    justifyContent: "center",
    alignItems: "center",
  },
  glareContainer: {
    position: "absolute",
  },
  hint: {
    position: "absolute",
    bottom: "24%",
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  hintText: {
    color: "#FFF",
    fontSize: 13,
    fontWeight: "600",
  },
  footer: {
    position: "absolute",
    left: 24,
    right: 24,
    alignItems: "center",
    gap: 4,
  },
  footerTitle: {
    color: "#FFF",
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  footerSubtitle: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 12,
    fontWeight: "600",
  },
  footerPrice: {
    color: "#FFF",
    fontSize: 15,
    fontWeight: "700",
    marginTop: 6,
  },
  footerDisclaimer: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 10,
    textAlign: "center",
    lineHeight: 14,
    marginTop: 2,
  },
  closeButton: {
    position: "absolute",
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.12)",
    justifyContent: "center",
    alignItems: "center",
  },
});
