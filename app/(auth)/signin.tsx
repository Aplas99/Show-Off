import { signInWithEmail } from "@/api/auth/index";
import { LinearGradient } from "expo-linear-gradient";
import { Link, useRouter } from "expo-router";
import React, { useState } from "react";
import {
    Alert,
    Image,
    SafeAreaView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

export default function SignIn() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSignIn = async () => {
    setLoading(true);
    try {
      const { error } = await signInWithEmail(email, password);
      // router.push("/(user)");
      if (error) {
        Alert.alert(error.message);
        console.log(error);
      }
    } catch (err: any) {
      // Handles unexpected errors (network, thrown exceptions, etc.)
      Alert.alert(
        "Sign in failed",
        err?.message || "An unexpected error occurred."
      );
    } finally {
      setLoading(false);
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
        <StatusBar
          translucent
          backgroundColor="transparent"
          barStyle="light-content"
        />
        {/* Top branding + illustration */}
        <View style={styles.topContainer}>
          <View style={styles.iconContainer}>
            <Image
              source={require("@/assets/images/NewIconImage.png")}
              style={styles.icon}
              resizeMode="contain"
            />
          </View>
          <Text style={styles.title}>AuctionAlley</Text>
          <Text style={styles.subtitle}>Welcome Back</Text>
        </View>
        {/* Service Provider Icons Row */}
        <View style={styles.providerIconsRow}>
          <TouchableOpacity style={styles.providerButton}>
            <Image
              source={require("@/assets/images/google-icon.png")}
              style={styles.providerIcon}
              resizeMode="contain"
            />
          </TouchableOpacity>
          {/* Example for future providers:
          <TouchableOpacity style={styles.providerButton}>
            <Image
              source={require("@/assets/images/apple-icon.png")}
              style={styles.providerIcon}
              resizeMode="contain"
            />
          </TouchableOpacity>
          <TouchableOpacity style={styles.providerButton}>
            <Image
              source={require("@/assets/images/facebook-icon.png")}
              style={styles.providerIcon}
              resizeMode="contain"
            />
          </TouchableOpacity>
          */}
        </View>
        {/* Separator with OR */}
        <View style={styles.separatorContainer}>
          <View style={styles.separator} />
          <Text style={styles.orText}>OR</Text>
          <View style={styles.separator} />
        </View>
        {/* Form Inputs */}
        <View style={styles.formContainer}>
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor="#9CA3AF"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor="#9CA3AF"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
          <TouchableOpacity style={styles.signInButton} onPress={handleSignIn}>
            <Text style={styles.signInButtonText}>Sign In</Text>
          </TouchableOpacity>

          <Link href="/signup" asChild>
            <TouchableOpacity style={styles.dontHaveAccountButton}>
              <Text style={styles.dontHaveAccountText}>
                Don't have an account?
                <Text style={styles.signupLink}> Sign Up</Text>
              </Text>
            </TouchableOpacity>
          </Link>

          {/* Separator between account and forgot password */}
          <View style={styles.formSeparator} />

          <TouchableOpacity
            style={styles.forgotPasswordButton}
            onPress={() => {}}
          >
            <Text style={styles.forgotPasswordButtonText}>
              Forgot Password?
            </Text>
          </TouchableOpacity>
        </View>
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
    alignItems: "center",
    zIndex: 1,
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
  formContainer: {
    width: "100%",
    paddingHorizontal: 24,
    marginTop: 32,
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
  signInButton: {
    backgroundColor: "#9333EA",
    borderRadius: 24,
    height: 48,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  signInButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  dontHaveAccountButton: {
    alignItems: "center",
  },
  dontHaveAccountText: {
    paddingTop: 16,
    color: "#9CA3AF",
    fontSize: 18,
  },
  signupLink: {
    color: "#9333EA",
    fontSize: 18,
  },
  forgotPasswordButton: {
    alignItems: "center",
  },
  forgotPasswordButtonText: {
    color: "#9CA3AF",
    fontSize: 18,
  },
  footer: {
    alignItems: "center",
    paddingHorizontal: 24,
    paddingBottom: 24,
    marginTop: 32,
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
  formSeparator: {
    width: "100%",
    height: 1,
    backgroundColor: "#2D2D2D",
    marginVertical: 16,
  },
});
