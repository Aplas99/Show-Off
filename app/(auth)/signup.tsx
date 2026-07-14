import { useSignUp, useSignInWithOAuth } from "@/api/auth";
import { signUpSchema } from "@/lib/authValidation";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Link, useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { z } from "zod";

export default function SignUp() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { mutateAsync: signUp, isPending } = useSignUp();
  const signInWithOAuth = useSignInWithOAuth();

  const handleOAuthSignIn = async (provider: "google" | "discord") => {
    try {
      await signInWithOAuth.mutateAsync(provider);
    } catch (err: any) {
      Alert.alert(
        "Sign in failed",
        err?.message || `Could not sign in with ${provider}.`
      );
    }
  };

  const handleSignUp = async () => {
    try {
      // Validate inputs using Zod
      signUpSchema.parse({ email, password, username });

      const { session } = await signUp({ email, password, username });

      if (!session) {
        // Email confirmation is enabled — no session until the user verifies.
        Alert.alert(
          "Confirm your email",
          `We sent a confirmation link to ${email}. Please verify your email, then sign in.`,
          [{ text: "OK", onPress: () => router.replace("/(auth)/signin") }],
        );
        return;
      }

      router.replace("/");
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        Alert.alert("Invalid Input", error.issues[0]?.message || "Validation failed");
      } else {
        Alert.alert("Sign up failed", error.message);
      }
    }
  };

  return (
    <View style={styles.container}>
      {/* Background Gradient */}
      <LinearGradient
        colors={["#000000", "#9333EA"]}
        dither
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1.5 }}
        style={styles.gradient}
      />
      {/* Content Layer */}
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAwareScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bottomOffset={20}
        >
          {/* Top branding + illustration */}
          <View style={styles.topContainer}>
            <View style={styles.iconContainer}>
              <Image
                source={require("@/assets/images/NewIconImage.png")}
                style={styles.icon}
                resizeMode="contain"
              />
            </View>
            <Text style={styles.title}>Show Off</Text>
            <Text style={styles.subtitle}>Collect Em All</Text>
          </View>
          {/* Form Inputs */}
          <View style={styles.formContainer}>
            <TextInput
              style={styles.input}
              placeholder="Username"
              placeholderTextColor="#9CA3AF"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoComplete="username-new"
              accessibilityLabel="Username"
              editable={!isPending}
            />
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
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor="#9CA3AF"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="password-new"
              accessibilityLabel="Password"
              editable={!isPending}
            />
            <TouchableOpacity
              style={[styles.signUpButton, isPending && styles.buttonDisabled]}
              onPress={handleSignUp}
              disabled={isPending}
              accessibilityRole="button"
              accessibilityLabel="Sign Up"
            >
              {isPending ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.signUpButtonText}>Sign Up</Text>
              )}
            </TouchableOpacity>

            <View style={styles.separatorContainer}>
              <View style={styles.separator} />
              <Text style={styles.orText}>OR</Text>
              <View style={styles.separator} />
            </View>

            <View style={styles.providerIconsRow}>
              <TouchableOpacity
                style={styles.providerButton}
                onPress={() => handleOAuthSignIn("google")}
                disabled={signInWithOAuth.isPending}
                accessibilityRole="button"
                accessibilityLabel="Continue with Google"
              >
                <Image
                  source={require("@/assets/images/google-icon.png")}
                  style={styles.providerIcon}
                  resizeMode="contain"
                />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.providerButton}
                onPress={() => handleOAuthSignIn("discord")}
                disabled={signInWithOAuth.isPending}
                accessibilityRole="button"
                accessibilityLabel="Continue with Discord"
              >
                <Ionicons name="logo-discord" size={26} color="#5865F2" />
              </TouchableOpacity>
            </View>

            {/* Already have an account? */}
            <Link href="/signin" asChild>
              <TouchableOpacity style={styles.haveAccountButton}>
                <Text style={styles.haveAccountText}>
                  Already have an account?
                  <Text style={styles.signinLink}> Sign In</Text>
                </Text>
              </TouchableOpacity>
            </Link>
          </View>
        </KeyboardAwareScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: "relative",
    backgroundColor: "transparent",
  },
  gradient: {
    ...StyleSheet.absoluteFillObject,
    zIndex: -1,
  },
  safeArea: {
    flex: 1,
    backgroundColor: "transparent",
    zIndex: 1,
  },
  scrollContent: {
    alignItems: "center",
    flexGrow: 1,
  },
  topContainer: {
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: 40,
    paddingHorizontal: 16,
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: "#0D0D0D",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    marginBottom: 8,
  },
  icon: {
    width: 42,
    height: 42,
    borderRadius: 6,
  },
  title: {
    color: "#9333EA",
    fontSize: 30,
    fontWeight: "600",
    marginBottom: 4,
  },
  subtitle: {
    color: "#9CA3AF",
    fontSize: 14,
    marginBottom: 16,
  },
  providerIconsRow: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    paddingHorizontal: 24,
    marginTop: 16,
    marginBottom: 8,
  },
  providerButton: {
    width: 48,
    height: 48,
    backgroundColor: "#000000",
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12, // space between icons
  },
  providerIcon: {
    width: 28,
    height: 28,
  },
  separatorContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    marginTop: 10,
    paddingHorizontal: 24,
  },
  separator: {
    flex: 1,
    height: 1,
    backgroundColor: "#2D2D2D",
  },
  orText: {
    color: "#9CA3AF",
    fontSize: 14,
    marginHorizontal: 12,
    fontWeight: "600",
  },
  formContainer: {
    width: "100%",
    paddingHorizontal: 24,
    marginTop: 16,
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
  signUpButton: {
    backgroundColor: "#9333EA",
    borderRadius: 24,
    height: 48,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  signUpButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  haveAccountButton: {
    alignItems: "center",
  },
  haveAccountText: {
    paddingTop: 16,
    color: "#9CA3AF",
    fontSize: 18,
  },
  signinLink: {
    color: "#9333EA",
    fontSize: 18,
  },
});
