import { useRequestPasswordReset } from "@/api/auth";
import { emailSchema } from "@/lib/authValidation";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

export default function ForgotPassword() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const { mutateAsync: requestReset, isPending } = useRequestPasswordReset();

  const handleSendReset = async () => {
    const parsed = emailSchema.safeParse(email.trim());
    if (!parsed.success) {
      Alert.alert(
        "Invalid email",
        parsed.error.issues[0]?.message ?? "Please enter a valid email.",
      );
      return;
    }

    try {
      await requestReset(parsed.data);
      setSent(true);
    } catch (error: any) {
      Alert.alert(
        "Could not send reset email",
        error?.message ?? "Please try again later.",
      );
    }
  };

  return (
    <KeyboardAwareScrollView
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      bottomOffset={20}
    >
      <TouchableOpacity
        onPress={() => router.back()}
        style={styles.backButton}
        accessibilityRole="button"
        accessibilityLabel="Go back"
      >
        <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
      </TouchableOpacity>

      <View style={styles.topContainer}>
        <Text style={styles.title}>Reset Password</Text>
        <Text style={styles.subtitle}>
          {sent
            ? `If an account exists for ${email.trim()}, a reset link is on its way. Open it on this device to set a new password.`
            : "Enter the email for your account and we'll send you a reset link."}
        </Text>
      </View>

      {!sent && (
        <View style={styles.formContainer}>
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor="#9CA3AF"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            accessibilityLabel="Email"
            editable={!isPending}
          />
          <TouchableOpacity
            style={[styles.primaryButton, isPending && styles.buttonDisabled]}
            onPress={handleSendReset}
            disabled={isPending}
            accessibilityRole="button"
            accessibilityLabel="Send reset link"
          >
            {isPending ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.primaryButtonText}>Send Reset Link</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {sent && (
        <View style={styles.formContainer}>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => router.replace("/(auth)/signin")}
            accessibilityRole="button"
            accessibilityLabel="Back to sign in"
          >
            <Text style={styles.primaryButtonText}>Back to Sign In</Text>
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
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.1)",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 16,
  },
  topContainer: {
    alignItems: "center",
    paddingTop: 40,
  },
  title: {
    color: "#9333EA",
    fontSize: 28,
    fontWeight: "600",
    marginBottom: 12,
  },
  subtitle: {
    color: "#9CA3AF",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 16,
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
