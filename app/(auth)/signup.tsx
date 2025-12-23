import { signUpWithEmail } from "@/lib/auth";
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

export default function SignUp() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSignUp = async () => {
    // TODO: Implement sign-up logic
    setLoading(true);
    const { error } = await signUpWithEmail(email, password, username);
    if (error) Alert.alert(error.message);
    console.log(error);

    setLoading(false);
    router.push("/");
  };

  const handleGoogleSignIn = async () => {
    // TODO: Implement Google sign-in logic
    router.push("/");
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
          <Text style={styles.subtitle}>Collect Em All</Text>
        </View>
        {/* Auth Provider Buttons */}
        <View style={styles.providerIconsRow}>
          <TouchableOpacity
            style={styles.providerButton}
            onPress={handleGoogleSignIn}
          >
            <Image
              source={require("@/assets/images/google-icon.png")}
              style={styles.providerIcon}
              resizeMode="contain"
            />
          </TouchableOpacity>
          {/* Add more provider buttons here if needed */}
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
            placeholder="Username"
            placeholderTextColor="#9CA3AF"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
          />
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
          <TouchableOpacity style={styles.signUpButton} onPress={handleSignUp}>
            <Text style={styles.signUpButtonText}>Sign Up</Text>
          </TouchableOpacity>
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
