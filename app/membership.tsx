import {
  membershipKeys,
  syncMembershipFromBilling,
} from "@/api/memberships";
import { useColors, type ThemeColors } from "@/constants/theme";
import { Ionicons } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const SUCCESS_GREEN = "#35C96F";
const REDIRECT_DELAY_MS = 2400;

/** Checkout callback and payment-complete animation. */
export default function MembershipCheckoutCallback() {
  const params = useLocalSearchParams<{ checkout?: string }>();
  const colors = useColors();
  const styles = getStyles(colors);
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const ringScale = useSharedValue(0.7);
  const ringOpacity = useSharedValue(0);
  const pulse = useSharedValue(0);

  const checkout = Array.isArray(params.checkout)
    ? params.checkout[0]
    : params.checkout;
  const succeeded = checkout === "success";
  const cancelled = checkout === "cancelled";

  useEffect(() => {
    if (succeeded) {
      void syncMembershipFromBilling()
        .catch(() => false)
        .finally(() => {
          queryClient.invalidateQueries({ queryKey: membershipKeys.all() });
        });
      ringOpacity.value = withTiming(1, { duration: 260 });
      ringScale.value = withSpring(1, { damping: 13, stiffness: 180 });
      pulse.value = withDelay(
        350,
        withRepeat(
          withTiming(1, {
            duration: 900,
            easing: Easing.out(Easing.quad),
          }),
          -1,
          false,
        ),
      );
    }

    const timer = setTimeout(
      () => router.replace("/(tabs)/profile/membership"),
      succeeded ? REDIRECT_DELAY_MS : cancelled ? 1200 : 100,
    );
    return () => clearTimeout(timer);
  }, [
    succeeded,
    cancelled,
    queryClient,
    ringOpacity,
    ringScale,
    pulse,
  ]);

  const ringStyle = useAnimatedStyle(() => ({
    opacity: ringOpacity.value,
    transform: [{ scale: ringScale.value }],
  }));
  const pulseStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pulse.value, [0, 1], [0.38, 0]),
    transform: [{ scale: interpolate(pulse.value, [0, 1], [1, 1.65]) }],
  }));

  if (!succeeded && !cancelled) {
    return <View style={styles.container} />;
  }

  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top, paddingBottom: insets.bottom },
      ]}
    >
      <LinearGradient
        colors={
          succeeded
            ? ["rgba(53,201,111,0.22)", "transparent"]
            : [`${colors.primary}20`, "transparent"]
        }
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.75 }}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.content}>
        {succeeded ? (
          <Animated.View style={[styles.successWrap, ringStyle]}>
            <Animated.View style={[styles.pulseRing, pulseStyle]} />
            <View style={styles.successCircle}>
              <Animated.View entering={FadeIn.delay(220).duration(220)}>
                <Ionicons name="checkmark" size={72} color="#FFFFFF" />
              </Animated.View>
            </View>
          </Animated.View>
        ) : (
          <Animated.View entering={FadeIn.duration(200)} style={styles.cancelCircle}>
            <Ionicons name="close" size={58} color={colors.onSurfaceVariant} />
          </Animated.View>
        )}

        <Animated.Text
          entering={FadeInDown.delay(350).duration(380)}
          style={styles.title}
        >
          {succeeded ? "Payment complete!" : "Payment cancelled"}
        </Animated.Text>
        <Animated.Text
          entering={FadeInDown.delay(480).duration(380)}
          style={styles.subtitle}
        >
          {succeeded
            ? "Welcome to Curator. Your membership is being activated."
            : "No charge was made. Returning to membership options."}
        </Animated.Text>

        {succeeded && (
          <Animated.View
            entering={FadeIn.delay(700).duration(300)}
            style={styles.redirectRow}
          >
            <View style={styles.loadingDot} />
            <Text style={styles.redirectText}>Opening your membership</Text>
          </Animated.View>
        )}
      </View>
    </View>
  );
}

const getStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 32,
    },
    successWrap: {
      width: 148,
      height: 148,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 34,
    },
    pulseRing: {
      position: "absolute",
      width: 118,
      height: 118,
      borderRadius: 59,
      backgroundColor: SUCCESS_GREEN,
    },
    successCircle: {
      width: 118,
      height: 118,
      borderRadius: 59,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: SUCCESS_GREEN,
      borderWidth: 5,
      borderColor: "rgba(255,255,255,0.82)",
      shadowColor: SUCCESS_GREEN,
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.45,
      shadowRadius: 22,
      elevation: 14,
    },
    cancelCircle: {
      width: 112,
      height: 112,
      borderRadius: 56,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 34,
      backgroundColor: colors.surfaceContainerHigh,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
    },
    title: {
      color: colors.text,
      fontSize: 30,
      fontWeight: "900",
      textAlign: "center",
      letterSpacing: -0.7,
    },
    subtitle: {
      maxWidth: 330,
      color: colors.onSurfaceVariant,
      fontSize: 15,
      lineHeight: 22,
      textAlign: "center",
      marginTop: 10,
    },
    redirectRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 9,
      marginTop: 34,
      paddingHorizontal: 15,
      paddingVertical: 9,
      borderRadius: 999,
      backgroundColor: colors.surfaceContainerLow,
    },
    loadingDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: SUCCESS_GREEN,
    },
    redirectText: {
      color: colors.onSurfaceVariant,
      fontSize: 12,
      fontWeight: "700",
    },
  });
