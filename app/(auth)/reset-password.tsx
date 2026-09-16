import { completeAuthCallback, useUpdatePassword } from "@/api/auth";
import { useAuthStore } from "@/hooks/useAuthStore";
import { passwordSchema } from "@/lib/authValidation";
import { supabase } from "@/lib/supabase";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

/**
 * Extracts Supabase auth params from a recovery deep link. Tokens arrive in
 * the URL fragment (implicit flow) but query params are checked too.
 */
function parseAuthParams(url: string) {
  const params = new URLSearchParams();
  const [beforeFragment, fragment] = url.split("#");
  const queryStart = beforeFragment.indexOf("?");
  if (queryStart >= 0) {
    new URLSearchParams(beforeFragment.slice(queryStart + 1)).forEach(
      (value, key) => params.set(key, value),
    );
  }
  if (fragment) {
    new URLSearchParams(fragment).forEach((value, key) =>
      params.set(key, value),
    );
  }
  return {
    accessToken: params.get("access_token"),
    refreshToken: params.get("refresh_token"),
    code: params.get("code"),
    errorDescription: params.get("error_description"),
  };
}

export default function ResetPassword() {
  const router = useRouter();
  const nativeUrl = Linking.useURL();
  const url = Platform.OS === "web" && typeof window !== "undefined" ? window.location.href : nativeUrl;
  const session = useAuthStore((s) => s.session);
  const { mutateAsync: updatePassword, isPending } = useUpdatePassword();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linkReady, setLinkReady] = useState(false);

  // Exchange the recovery link for a session so updateUser can run.
  useEffect(() => {
    if (!url) return;
    setLinkReady(false);

    const { accessToken, refreshToken, code, errorDescription } =
      parseAuthParams(url);

    if (errorDescription) {
      setLinkError(errorDescription.replace(/\+/g, " "));
      return;
    }

    (async () => {
      try {
        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) throw error;
          setLinkReady(true);
        } else if (code) {
          await completeAuthCallback(url);
          setLinkReady(true);
        } else {
          setLinkError("This reset link is missing its code. Request another reset email.");
        }
      } catch (error: any) {
        setLinkError(
          error?.message ?? "This reset link is invalid or has expired.",
        );
      }
    })();
  }, [url]);

  const handleUpdatePassword = async () => {
    if (!linkReady || !session) return;
    const parsed = passwordSchema.safeParse(password);
    if (!parsed.success) {
      Alert.alert(
        "Invalid password",
        parsed.error.issues[0]?.message ?? "Please choose a stronger password.",
      );
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert("Passwords do not match", "Please re-enter your password.");
      return;
    }

    try {
      await updatePassword(password);
      Alert.alert("Password updated", "You are now signed in.", [
        { text: "OK", onPress: () => router.replace("/(tabs)/discover") },
      ]);
    } catch (error: any) {
      Alert.alert(
        "Could not update password",
        error?.message ?? "Please try again.",
      );
    }
  };

  const waitingForSession = (!session || !linkReady) && !linkError;

  return (
    <KeyboardAwareScrollView
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      bottomOffset={20}
    >
      <View style={styles.topContainer}>
        <Text style={styles.title}>Choose a New Password</Text>
        <Text style={styles.subtitle}>
          {linkError
            ? linkError
            : waitingForSession
              ? "Verifying your reset link…"
              : "Enter a new password for your account."}
        </Text>
      </View>

      {waitingForSession && (
        <View style={styles.spinnerContainer}>
          <ActivityIndicator size="large" color="#9333EA" />
        </View>
      )}

      {linkError && (
        <View style={styles.formContainer}>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => router.replace("/(auth)/forgot-password" as any)}
            accessibilityRole="button"
            accessibilityLabel="Request a new reset link"
          >
            <Text style={styles.primaryButtonText}>Request a New Link</Text>
          </TouchableOpacity>
        </View>
      )}

      {!!session && !linkError && (
        <View style={styles.formContainer}>
          <TextInput
            style={styles.input}
            placeholder="New password"
            placeholderTextColor="#9CA3AF"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="password-new"
            accessibilityLabel="New password"
            editable={!isPending}
          />
          <TextInput
            style={styles.input}
            placeholder="Confirm new password"
            placeholderTextColor="#9CA3AF"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            autoComplete="password-new"
            accessibilityLabel="Confirm new password"
            editable={!isPending}
          />
          <TouchableOpacity
            style={[styles.primaryButton, isPending && styles.buttonDisabled]}
            onPress={handleUpdatePassword}
            disabled={isPending}
            accessibilityRole="button"
            accessibilityLabel="Update password"
          >
            {isPending ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.primaryButtonText}>Update Password</Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
  },
  topContainer: {
    alignItems: "center",
    paddingTop: 64,
  },
  title: {
    color: "#9333EA",
    fontSize: 28,
    fontWeight: "600",
    marginBottom: 12,
    textAlign: "center",
  },
  subtitle: {
    color: "#9CA3AF",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 16,
  },
  spinnerContainer: {
    marginTop: 40,
    alignItems: "center",
  },
  formContainer: {
    width: "100%",
    marginTop: 24,
  },
  input: {
    backgroundColor: "#18181B",
    color: "#fff",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    marginBottom: 16,
  },
  primaryButton: {
    backgroundColor: "#9333EA",
    borderRadius: 24,
    height: 48,
    justifyContent: "center",
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
