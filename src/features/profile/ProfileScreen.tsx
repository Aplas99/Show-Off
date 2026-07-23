import { useSignOut } from "@/api/auth";
import { useMembership } from "@/api/memberships";
import { useGetCurrentUserProfile } from "@/api/profile/index";
import { useColors, type ThemeColors } from "@/constants/theme";
import { useThemeStore } from "@/hooks/useThemeStore";
import MembershipModal from "@/src/features/profile/MembershipModal";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const GOLD_RIM_COLORS = [
  "#7A4F00",
  "#FFF1A8",
  "#C89419",
  "#FFE789",
  "#8A5A00",
] as const;
const CLEAR_RIM_COLORS = ["transparent", "transparent"] as const;

export default function ProfileScreen() {
  const { data, isLoading, error } = useGetCurrentUserProfile();
  const { data: membership } = useMembership();
  const { mutateAsync: signOut } = useSignOut();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const isDark = useThemeStore((s) => s.isDark);
  const [isMembershipVisible, setIsMembershipVisible] = useState(false);
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
  const displayName =
    profile?.full_name || profile?.username || "Collector";
  const membershipType = membership?.isFoundingCurator
    ? "Founding Curator"
    : membership?.isCurator
      ? "Curator Member"
      : "Collector Member";
  const hasGoldMembershipRim =
    membership?.isCurator || membership?.isFoundingCurator;

  const handleLogout = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          try {
            // Clears the TanStack Query cache so the next user
            // doesn't see this user's data.
            await signOut();
          } catch {
            // Even if the network call fails, fall through to the
            // auth screen; the local session is cleared regardless.
          }
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

        {/* Member badge card — opens membership details and plans. */}
        <Animated.View entering={FadeInDown.delay(100).duration(500)}>
          <TouchableOpacity
            onPress={() => setIsMembershipVisible(true)}
            activeOpacity={0.88}
            accessibilityRole="button"
            accessibilityLabel="Open membership"
          >
            <LinearGradient
              colors={hasGoldMembershipRim ? GOLD_RIM_COLORS : CLEAR_RIM_COLORS}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[
                styles.memberBadgeRim,
                hasGoldMembershipRim && styles.curatorGoldRim,
              ]}
            >
              <LinearGradient
                colors={[colors.primaryContainer, colors.primary, "#7587FF"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.memberBadgeCard}
              >
                <View style={styles.badgeAvatarOuter}>
                <View style={styles.badgeAvatar}>
                  {profile?.avatar_url ? (
                    <Image
                      source={{ uri: profile.avatar_url }}
                      style={styles.avatarImage}
                    />
                  ) : (
                    <Ionicons
                      name="person"
                      size={34}
                      color={isDark ? "#FFF" : colors.primary}
                    />
                  )}
                </View>
                {!!profile?.is_admin && (
                  <View style={styles.verifiedBadge}>
                    <Ionicons name="checkmark" size={13} color="#000" />
                  </View>
                )}
              </View>

              <View style={styles.badgeIdentity}>
                <Text style={styles.badgeName} numberOfLines={1}>
                  {displayName}
                </Text>
                <Text style={styles.badgeMembershipType}>{membershipType}</Text>
                <Text style={styles.badgeEmail} numberOfLines={1}>
                  {user?.email}
                </Text>
              </View>

              <View style={styles.memberBadgeIcon}>
                <Ionicons name="ribbon" size={27} color="#FFFFFF" />
              </View>

                <View style={styles.membershipAction}>
                  <Text style={styles.membershipActionText}>
                    {membership?.isCurator
                      ? "Manage membership"
                      : "View membership"}
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color="#FFFFFF" />
                </View>
              </LinearGradient>
            </LinearGradient>
          </TouchableOpacity>
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

      <MembershipModal
        visible={isMembershipVisible}
        onClose={() => setIsMembershipVisible(false)}
        displayName={displayName}
      />
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
    memberBadgeRim: {
      borderRadius: 28,
      marginBottom: 32,
    },
    curatorGoldRim: {
      padding: 3,
      shadowColor: "#E7BC45",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.55,
      shadowRadius: 8,
      elevation: 7,
    },
    memberBadgeCard: {
      minHeight: 168,
      borderRadius: 25,
      padding: 18,
      paddingBottom: 52,
      flexDirection: "row",
      alignItems: "center",
      overflow: "hidden",
    },
    badgeAvatarOuter: {
      position: "relative",
    },
    badgeAvatar: {
      width: 70,
      height: 70,
      borderRadius: 35,
      backgroundColor: colors.surfaceContainer,
      borderWidth: 3,
      borderColor: "rgba(255,255,255,0.85)",
      justifyContent: "center",
      alignItems: "center",
      overflow: "hidden",
    },
    avatarImage: {
      width: "100%",
      height: "100%",
    },
    verifiedBadge: {
      position: "absolute",
      bottom: -1,
      right: -1,
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: colors.tertiary,
      justifyContent: "center",
      alignItems: "center",
      borderWidth: 2,
      borderColor: "#FFFFFF",
    },
    badgeIdentity: {
      flex: 1,
      marginLeft: 14,
      marginRight: 8,
    },
    badgeName: {
      fontSize: 20,
      fontWeight: "800",
      color: "#FFFFFF",
      letterSpacing: -0.3,
    },
    badgeMembershipType: {
      marginTop: 3,
      fontSize: 13,
      fontWeight: "700",
      color: "rgba(255,255,255,0.9)",
    },
    badgeEmail: {
      marginTop: 4,
      fontSize: 11,
      color: "rgba(255,255,255,0.7)",
    },
    memberBadgeIcon: {
      width: 50,
      height: 50,
      borderRadius: 25,
      justifyContent: "center",
      alignItems: "center",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.65)",
      backgroundColor: "rgba(255,255,255,0.16)",
    },
    membershipAction: {
      position: "absolute",
      left: 18,
      right: 18,
      bottom: 0,
      height: 42,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      borderTopWidth: 1,
      borderTopColor: "rgba(255,255,255,0.22)",
    },
    membershipActionText: {
      color: "#FFFFFF",
      fontSize: 12,
      fontWeight: "800",
      textTransform: "uppercase",
      letterSpacing: 0.7,
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
