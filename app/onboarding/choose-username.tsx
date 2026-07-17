import { useColors, type ThemeColors } from "@/constants/theme";
import { useAuthStore } from "@/hooks/useAuthStore";
import { useHaptics } from "@/hooks/useHaptics";
import {
  mapReserveUsernameError,
  validateUsername,
} from "@/lib/onboarding";
import { supabase } from "@/lib/supabase";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * Shared "Choose your username" onboarding step. Every signup method (email,
 * Google, Discord) lands here when the session's profile has no username yet
 * — AuthInitializer routes incomplete profiles to this screen instead of
 * Discover. reserve_username() validates and claims atomically server-side.
 */
export default function ChooseUsernameScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const haptics = useHaptics();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const setNeedsUsername = useAuthStore((state) => state.setNeedsUsername);

  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [availability, setAvailability] = useState<"unknown" | "checking" | "available" | "taken">("unknown");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const checkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const validation = validateUsername(username);

  // Debounced live availability probe once the format is valid.
  useEffect(() => {
    if (checkTimer.current) clearTimeout(checkTimer.current);
    if (!validation.valid) {
      setAvailability("unknown");
      return;
    }
    setAvailability("checking");
    checkTimer.current = setTimeout(async () => {
      const { data, error: rpcError } = await supabase.rpc(
        "check_username_available",
        { p_username: username.trim() },
      );
      if (rpcError) {
        setAvailability("unknown");
        return;
      }
      setAvailability(data ? "available" : "taken");
    }, 450);
    return () => {
      if (checkTimer.current) clearTimeout(checkTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username]);

  const submit = async () => {
    const trimmed = username.trim();
    const check = validateUsername(trimmed);
    if (!check.valid) {
      setError(check.reason ?? "Please choose a valid username.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const { error: rpcError } = await supabase.rpc("reserve_username", {
        p_username: trimmed,
      });
      if (rpcError) throw new Error(rpcError.message);
    } catch (caught) {
      setError(mapReserveUsernameError(caught));
      setIsSubmitting(false);
      return;
    }

    await haptics.success();
    setNeedsUsername(false);
    router.replace("/(tabs)/discover");
  };

  const statusIcon =
    availability === "checking" ? (
      <ActivityIndicator size="small" color={colors.grey} />
    ) : availability === "available" ? (
      <Ionicons name="checkmark-circle" size={20} color="#22c55e" />
    ) : availability === "taken" ? (
      <Ionicons name="close-circle" size={20} color={colors.danger} />
    ) : null;

  return (
    <KeyboardAvoidingView
      style={styles.page}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={[styles.content, { paddingTop: insets.top + 48 }]}>
        <View style={styles.iconBadge}>
          <Ionicons name="at" size={30} color="#000" />
        </View>
        <Text style={styles.title}>Choose your username</Text>
        <Text style={styles.subtitle}>
          This is how other collectors will find you. You can&apos;t change it
          later, so pick a good one.
        </Text>

        <View style={styles.inputRow}>
          <Text style={styles.atPrefix}>@</Text>
          <TextInput
            style={styles.input}
            value={username}
            onChangeText={(value) => {
              setUsername(value);
              setError(null);
            }}
            placeholder="username"
            placeholderTextColor={colors.grey}
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            maxLength={20}
            returnKeyType="done"
            onSubmitEditing={submit}
          />
          <View style={styles.statusSlot}>{statusIcon}</View>
        </View>

        <Text style={styles.hint}>
          3-20 characters. Letters, numbers, and underscores.
        </Text>
        {availability === "taken" && !error && (
          <Text style={styles.errorText}>
            That username is already taken. Try another.
          </Text>
        )}
        {error && <Text style={styles.errorText}>{error}</Text>}

        <TouchableOpacity
          style={[
            styles.submitButton,
            (!validation.valid || availability === "taken" || isSubmitting) &&
              styles.disabled,
          ]}
          onPress={submit}
          disabled={!validation.valid || availability === "taken" || isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#000" />
          ) : (
            <>
              <Text style={styles.submitButtonText}>Continue</Text>
              <Ionicons name="arrow-forward" size={19} color="#000" />
            </>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

function getStyles(colors: ThemeColors) {
  return StyleSheet.create({
    page: { flex: 1, backgroundColor: colors.background },
    content: { flex: 1, paddingHorizontal: 28, gap: 12 },
    iconBadge: {
      width: 62,
      height: 62,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.primary,
      marginBottom: 6,
    },
    title: { color: colors.text, fontSize: 28, fontWeight: "800", letterSpacing: -0.6 },
    subtitle: { color: colors.onSurfaceVariant, fontSize: 14, lineHeight: 20 },
    inputRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginTop: 14,
      paddingHorizontal: 16,
      borderRadius: 16,
      borderWidth: 1.5,
      borderColor: colors.outlineVariant,
      backgroundColor: colors.surfaceContainerHighest,
    },
    atPrefix: { color: colors.grey, fontSize: 18, fontWeight: "700" },
    input: {
      flex: 1,
      height: 54,
      color: colors.text,
      fontSize: 17,
      fontWeight: "600",
    },
    statusSlot: { width: 24, alignItems: "center" },
    hint: { color: colors.grey, fontSize: 12 },
    errorText: { color: colors.danger, fontSize: 13, fontWeight: "600" },
    submitButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      height: 54,
      borderRadius: 18,
      marginTop: 10,
      backgroundColor: colors.primary,
    },
    submitButtonText: { color: "#000", fontSize: 16, fontWeight: "800" },
    disabled: { opacity: 0.45 },
  });
}
