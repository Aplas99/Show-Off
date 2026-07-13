import { useGetCurrentUserProfile } from "@/api/profile";
import { COLORS } from "@/constants/theme";
import { Redirect, Slot } from "expo-router";
import React from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

/**
 * Gates every (admin) route on profile.is_admin. Non-admins (and signed-out
 * users, via AuthInitializer) are sent back to the main tabs.
 */
export default function AdminLayout() {
  const { data, isLoading } = useGetCurrentUserProfile();

  if (isLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (!data?.profile?.is_admin) {
    return <Redirect href="/(tabs)/discover" />;
  }

  return <Slot />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: COLORS.background,
  },
});
