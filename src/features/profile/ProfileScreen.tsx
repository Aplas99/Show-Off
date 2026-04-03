import { useGetCurrentUserProfile } from "@/api/profile/index";
import { useColors, type ThemeColors } from "@/constants/theme";
import { useThemeStore } from "@/hooks/useThemeStore";
import { supabase } from "@/lib/supabase";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function ProfileScreen() {
  const { data, isLoading, error } = useGetCurrentUserProfile();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const isDark = useThemeStore((s) => s.isDark);
  const styles = getStyles(colors);

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (error || !data) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons
          name="alert-circle-outline"
          size={48}
          color={colors.onSurfaceVariant}
        />
        <Text style={styles.errorText}>Unable to load profile</Text>
      </View>
    );
  }

  const { user, profile, socialStats } = data;

  const handleLogout = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          await supabase.auth.signOut();
          router.replace("/(auth)/signin");
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 20 },
        ]}
      >
        {/* Header with Settings Gear */}
        <Animated.View
          entering={FadeInDown.delay(50).duration(400)}
          style={styles.topBar}
        >
          <View style={{ width: 36 }} />
          <TouchableOpacity
            onPress={() => router.push("/(tabs)/profile/settings" as any)}
            style={styles.settingsButton}
          >
            <Ionicons
              name="settings-outline"
              size={22}
              color={colors.onSurfaceVariant}
            />
          </TouchableOpacity>
        </Animated.View>

        {/* Profile Header Section */}
        <Animated.View
          entering={FadeInDown.delay(100).duration(500)}
          style={styles.header}
        >
          {/* Avatar with Gradient Ring */}
          <View style={styles.avatarOuter}>
            <LinearGradient
              colors={[colors.primary, colors.surfaceVariant]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.avatarGradientRing}
            >
              <View style={styles.avatarContainer}>
                <Ionicons
                  name="person"
                  size={44}
                  color={isDark ? "#FFF" : colors.primary}
                />
              </View>
            </LinearGradient>
            {/* Verified Badge */}
            {!!profile?.is_admin && (
              <View style={styles.verifiedBadge}>
                <Ionicons name="checkmark-circle" size={16} color="#000" />
              </View>
            )}
          </View>

          <Text style={styles.name}>
            {profile?.full_name || profile?.username || "Collector"}
          </Text>
          <Text style={styles.email}>{user?.email}</Text>
        </Animated.View>

        {/* Stats Row */}
        <Animated.View
          entering={FadeInDown.delay(200).duration(500)}
          style={styles.statsRow}
        >
          <StatItem label="Showcases" value="0" colors={colors} />
          <View style={styles.statDivider} />
          <StatItem
            label="Items"
            value={String(socialStats.items)}
            colors={colors}
            glow
          />
          <View style={styles.statDivider} />
          <StatItem
            label="Followers"
            value={String(socialStats.followers)}
            colors={colors}
          />
        </Animated.View>

        {/* Account Details Section */}
        <Animated.View
          entering={FadeInDown.delay(300).duration(500)}
          style={styles.section}
        >
          <View style={styles.sectionHeader}>
            <Ionicons name="id-card" size={14} color={colors.primary} />
            <Text style={styles.sectionTitle}>Account Details</Text>
          </View>
          <View style={styles.detailsList}>
            <DetailItem
              icon="mail-outline"
              label="Email Address"
              value={user?.email || ""}
              trailing={
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color="rgba(255,255,255,0.3)"
                />
              }
              colors={colors}
            />
            <DetailItem
              icon="calendar-outline"
              label="Member Since"
              value={new Date(user?.created_at || "").toLocaleDateString()}
              trailing={
                <Ionicons
                  name="shield-checkmark"
                  size={18}
                  color="rgba(255,255,255,0.3)"
                />
              }
              colors={colors}
            />
          </View>
        </Animated.View>

        {/* Sign Out Button */}
        <Animated.View
          entering={FadeInDown.delay(400).duration(500)}
          style={styles.footer}
        >
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <Ionicons
              name="log-out-outline"
              size={20}
              color={colors.errorDim}
            />
            <Text style={styles.logoutText}>Sign Out</Text>
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const StatItem = ({
  label,
  value,
  colors,
  glow,
}: {
  label: string;
  value: string;
  colors: ThemeColors;
  glow?: boolean;
}) => (
  <View style={{ alignItems: "center", flex: 1 }}>
    <Text
      style={{
        fontSize: 24,
        fontWeight: "800",
        color: colors.text,
        marginBottom: 4,
        ...(glow
          ? {
              textShadowColor: "rgba(200,153,255,0.3)",
              textShadowOffset: { width: 0, height: 0 },
              textShadowRadius: 15,
            }
          : {}),
      }}
    >
      {value}
    </Text>
    <Text
      style={{
        fontSize: 10,
        color: colors.onSurfaceVariant,
        textTransform: "uppercase",
        letterSpacing: 2,
        fontWeight: "700",
      }}
    >
      {label}
    </Text>
  </View>
);

const DetailItem = ({
  icon,
  label,
  value,
  trailing,
  colors,
}: {
  icon: any;
  label: string;
  value: string;
  trailing?: React.ReactNode;
  colors: ThemeColors;
}) => (
  <View style={detailStyles(colors).row}>
    <View style={detailStyles(colors).iconBox}>
      <Ionicons name={icon} size={20} color={colors.onSurfaceVariant} />
    </View>
    <View style={{ flex: 1 }}>
      <Text style={detailStyles(colors).label}>{label}</Text>
      <Text style={detailStyles(colors).value}>{value}</Text>
    </View>
    {trailing}
  </View>
);

const detailStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      padding: 16,
      backgroundColor: `${colors.surfaceContainerHigh}66`,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: `${colors.outlineVariant}1A`,
    },
    iconBox: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: colors.surfaceVariant,
      justifyContent: "center",
      alignItems: "center",
      marginRight: 16,
    },
    label: {
      fontSize: 10,
      fontWeight: "700",
      color: colors.onSurfaceVariant,
      textTransform: "uppercase",
      letterSpacing: 2,
      marginBottom: 2,
    },
    value: {
      fontSize: 14,
      fontWeight: "500",
      color: colors.text,
    },
  });

const getStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    centerContainer: {
      flex: 1,
      backgroundColor: colors.background,
      justifyContent: "center",
      alignItems: "center",
    },
    scrollContent: {
      paddingHorizontal: 24,
      paddingBottom: 120,
    },
    errorText: {
      color: colors.onSurfaceVariant,
      marginTop: 12,
      fontSize: 16,
    },
    topBar: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 24,
    },
    screenTitle: {
      fontSize: 20,
      fontWeight: "700",
      color: colors.text,
      letterSpacing: -0.5,
    },
    settingsButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      justifyContent: "center",
      alignItems: "center",
    },
    header: {
      alignItems: "center",
      marginBottom: 32,
    },
    avatarOuter: {
      position: "relative",
      marginBottom: 24,
    },
    avatarGradientRing: {
      width: 116,
      height: 116,
      borderRadius: 58,
      padding: 2,
    },
    avatarContainer: {
      flex: 1,
      borderRadius: 56,
      backgroundColor: colors.surfaceContainer,
      borderWidth: 4,
      borderColor: colors.background,
      justifyContent: "center",
      alignItems: "center",
      overflow: "hidden",
    },
    verifiedBadge: {
      position: "absolute",
      bottom: 0,
      right: 0,
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.primary,
      justifyContent: "center",
      alignItems: "center",
      borderWidth: 2,
      borderColor: colors.background,
    },
    name: {
      fontSize: 28,
      fontWeight: "800",
      color: colors.text,
      letterSpacing: -0.5,
      marginBottom: 4,
    },
    email: {
      fontSize: 14,
      color: colors.onSurfaceVariant,
      fontWeight: "500",
    },
    statsRow: {
      flexDirection: "row",
      justifyContent: "space-around",
      alignItems: "center",
      backgroundColor: colors.surfaceContainerLow,
      borderRadius: 32,
      paddingVertical: 24,
      marginBottom: 40,
    },
    statDivider: {
      width: 1,
      height: 32,
      backgroundColor: `${colors.outlineVariant}4D`,
    },
    section: {
      marginBottom: 48,
    },
    sectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 24,
      paddingHorizontal: 8,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: "700",
      color: colors.text,
    },
    detailsList: {
      gap: 16,
    },
    footer: {
      marginTop: 8,
    },
    logoutButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 16,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: `${colors.errorContainer}66`,
      gap: 12,
    },
    logoutText: {
      color: colors.errorDim,
      fontSize: 16,
      fontWeight: "700",
    },
  });
