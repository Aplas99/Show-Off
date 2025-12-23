import { useAuthStore } from "@/hooks/useAuthStore";
import { LinearGradient } from "expo-linear-gradient";
import { Redirect, Slot } from "expo-router";
import React from "react";
import { StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function AuthLayout() {
  const { session } = useAuthStore();

  if (session) {
    return <Redirect href={"/"} />;
  }

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
      <SafeAreaView style={styles.content}>
        {/* Render child routes (e.g., login.tsx) */}
        <Slot />
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
  content: {
    flex: 1,
    backgroundColor: "transparent",
    zIndex: 1,
  },
});
