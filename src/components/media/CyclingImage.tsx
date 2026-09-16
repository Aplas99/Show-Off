import { Image } from "@/src/components/media/ProtectedImage";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

const DEFAULT_INTERVAL_MS = 3500;
const FADE_MS = 600;

/**
 * Cross-fades through a list of image URLs. Auto-advances on a timer; a tap
 * advances immediately (and resets the timer). Two stacked images animate
 * opacity for a smooth fade — no re-mount flicker.
 */
export default function CyclingImage({
  urls,
  style,
  contentFit = "cover",
  autoCycle = true,
  intervalMs = DEFAULT_INTERVAL_MS,
  onSingleImagePress,
  showDots = true,
}: {
  urls: string[];
  style?: StyleProp<ViewStyle>;
  contentFit?: "cover" | "contain";
  autoCycle?: boolean;
  intervalMs?: number;
  /** Optional press handler used when there's only one image (no cycling). */
  onSingleImagePress?: () => void;
  showDots?: boolean;
}) {
  const [index, setIndex] = useState(0);
  const [previousIndex, setPreviousIndex] = useState<number | null>(null);
  const fade = useRef(new Animated.Value(1)).current;
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const count = urls.length;

  const advance = useCallback(() => {
    if (count < 2) return;
    setIndex((current) => {
      setPreviousIndex(current);
      return (current + 1) % count;
    });
    fade.setValue(0);
    Animated.timing(fade, {
      toValue: 1,
      duration: FADE_MS,
      useNativeDriver: true,
    }).start(() => setPreviousIndex(null));
  }, [count, fade]);

  const restartTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (autoCycle && count > 1) {
      timerRef.current = setInterval(advance, intervalMs);
    }
  }, [advance, autoCycle, count, intervalMs]);

  useEffect(() => {
    restartTimer();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [restartTimer]);

  // Reset when the url list itself changes (different item/post).
  const urlsKey = urls.join("|");
  useEffect(() => {
    setIndex(0);
    setPreviousIndex(null);
    fade.setValue(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlsKey]);

  if (count === 0) return null;

  const handlePress = () => {
    if (count > 1) {
      advance();
      restartTimer();
    } else {
      onSingleImagePress?.();
    }
  };

  return (
    <Pressable style={[styles.container, style]} onPress={handlePress}>
      {previousIndex != null && (
        <Image
          source={{ uri: urls[previousIndex] }}
          style={StyleSheet.absoluteFill}
          contentFit={contentFit}
          cachePolicy="memory-disk"
        />
      )}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: fade }]}>
        <Image
          source={{ uri: urls[index] }}
          style={StyleSheet.absoluteFill}
          contentFit={contentFit}
          cachePolicy="memory-disk"
          transition={0}
        />
      </Animated.View>

      {showDots && count > 1 && (
        <View style={styles.dots} pointerEvents="none">
          {urls.map((_, dotIndex) => (
            <View
              key={dotIndex}
              style={[styles.dot, dotIndex === index && styles.dotActive]}
            />
          ))}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: "hidden",
  },
  dots: {
    position: "absolute",
    bottom: 8,
    alignSelf: "center",
    flexDirection: "row",
    gap: 5,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.45)",
  },
  dotActive: {
    backgroundColor: "#FFF",
  },
});
