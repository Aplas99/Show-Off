import { completeAuthCallback } from "@/api/auth";
import { useColors } from "@/constants/theme";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";

export default function AuthCallback() {
  const nativeUrl = Linking.useURL();
  const url = Platform.OS === "web" && typeof window !== "undefined" ? window.location.href : nativeUrl;
  const router = useRouter();
  const colors = useColors();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!url) return;
    let active = true;
    completeAuthCallback(url).then(() => {
      if (active) router.replace("/");
    }).catch((failure: unknown) => {
      if (active) setError(failure instanceof Error ? failure.message : "Sign-in could not finish.");
    });
    return () => { active = false; };
  }, [url, router]);
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {!error && <ActivityIndicator color={colors.primary} accessibilityLabel="Completing sign-in" />}
      <Text accessibilityRole={error ? "alert" : "text"} style={{ color: colors.text }}>{error ?? "Completing sign-in..."}</Text>
      {error && <TouchableOpacity accessibilityRole="button" style={styles.button} onPress={() => router.replace("/(auth)/signin")}>
        <Text style={{ color: colors.primary }}>Return to sign in</Text>
      </TouchableOpacity>}
    </View>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 16 },
  button: { minHeight: 48, padding: 12, justifyContent: "center" },
});
