import { useGetCurrentUserProfile } from "@/api/profile/index";
import { useColors, type ThemeColors } from "@/constants/theme";
import { useThemeStore } from "@/hooks/useThemeStore";
import { supabase } from "@/lib/supabase";
import { Ionicons } from "@expo/vector-icons";
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
                <Ionicons name="alert-circle-outline" size={48} color={colors.grey} />
                <Text style={styles.errorText}>Unable to load profile</Text>
            </View>
        );
    }

    const { user, profile, socialStats } = data;

    const handleLogout = () => {
        Alert.alert(
            "Sign Out",
            "Are you sure you want to sign out?",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Sign Out",
                    style: "destructive",
                    onPress: async () => {
                        await supabase.auth.signOut();
                        router.replace("/(auth)/signin");
                    },
                },
            ]
        );
    };

    return (
        <View style={styles.container}>
            <ScrollView
                contentContainerStyle={[
                    styles.scrollContent,
                    { paddingTop: insets.top + 20 }
                ]}
            >
                {/* Header with Settings Gear */}
                <Animated.View
                    entering={FadeInDown.delay(50).duration(400)}
                    style={styles.topBar}
                >
                    <View style={{ width: 36 }} />
                    <Text style={styles.screenTitle}>Profile</Text>
                    <TouchableOpacity
                        onPress={() => router.push("/(tabs)/profile/settings" as any)}
                        style={styles.settingsButton}
                    >
                        <Ionicons name="settings-outline" size={24} color={colors.text} />
                    </TouchableOpacity>
                </Animated.View>

                {/* Header Profile Section */}
                <Animated.View
                    entering={FadeInDown.delay(100).duration(500)}
                    style={styles.header}
                >
                    <View style={styles.avatarContainer}>
                        <Ionicons name="person" size={40} color={isDark ? "#FFF" : colors.primary} />
                    </View>
                    <Text style={styles.name}>
                        {profile?.full_name || profile?.username || "Collector"}
                    </Text>
                    <Text style={styles.email}>{user?.email}</Text>
                    {!!profile?.is_admin && (
                        <View style={styles.adminBadge}>
                            <Text style={styles.adminBadgeText}>ADMIN</Text>
                        </View>
                    )}
                </Animated.View>

                {/* Stats Row */}
                <Animated.View
                    entering={FadeInDown.delay(200).duration(500)}
                    style={styles.statsRow}
                >
                    <StatItem label="Showcases" value="0" colors={colors} />
                    <View style={styles.statDivider} />
                    <StatItem label="Items" value={String(socialStats.items)} colors={colors} />
                    <View style={styles.statDivider} />
                    <StatItem label="Followers" value={String(socialStats.followers)} colors={colors} />
                </Animated.View>

                {/* Info Section */}
                <Animated.View
                    entering={FadeInDown.delay(300).duration(500)}
                    style={styles.section}
                >
                    <Text style={styles.sectionTitle}>Account Details</Text>
                    <InfoRow
                        icon="mail-outline"
                        label="Email"
                        value={user?.email || ""}
                        colors={colors}
                    />
                    <InfoRow
                        icon="calendar-outline"
                        label="Joined"
                        value={new Date(user?.created_at || "").toLocaleDateString()}
                        colors={colors}
                    />
                    {profile?.bio && (
                        <InfoRow
                            icon="information-circle-outline"
                            label="Bio"
                            value={profile.bio}
                            colors={colors}
                        />
                    )}
                </Animated.View>

                {/* Logout */}
                <Animated.View
                    entering={FadeInDown.delay(400).duration(500)}
                    style={styles.footer}
                >
                    <TouchableOpacity
                        style={styles.logoutButton}
                        onPress={handleLogout}
                    >
                        <Ionicons name="log-out-outline" size={20} color={colors.danger} />
                        <Text style={styles.logoutText}>Sign Out</Text>
                    </TouchableOpacity>
                </Animated.View>
            </ScrollView>
        </View>
    );
}

const StatItem = ({ label, value, colors }: { label: string, value: string, colors: ThemeColors }) => (
    <View style={{ alignItems: "center", flex: 1 }}>
        <Text style={{ fontSize: 20, fontWeight: "700", color: colors.text, marginBottom: 4 }}>
            {value}
        </Text>
        <Text style={{ fontSize: 12, color: colors.grey, textTransform: "uppercase" }}>
            {label}
        </Text>
    </View>
);

const InfoRow = ({ icon, label, value, colors }: { icon: any, label: string, value: string, colors: ThemeColors }) => {
    const styles = getStyles(colors);
    return (
        <View style={styles.infoRow}>
            <View style={styles.iconBox}>
                <Ionicons name={icon} size={20} color={colors.grey} />
            </View>
            <View style={styles.infoText}>
                <Text style={styles.infoLabel}>{label}</Text>
                <Text style={styles.infoValue}>{value}</Text>
            </View>
        </View>
    );
};

const getStyles = (colors: ThemeColors) => StyleSheet.create({
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
        paddingHorizontal: 20,
        paddingBottom: 40,
    },
    errorText: {
        color: colors.grey,
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
        fontSize: 18,
        fontWeight: "700",
        color: colors.text,
    },
    settingsButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: colors.surface,
        justifyContent: "center",
        alignItems: "center",
    },
    header: {
        alignItems: "center",
        marginBottom: 32,
    },
    avatarContainer: {
        width: 88,
        height: 88,
        borderRadius: 44,
        backgroundColor: colors.surface,
        justifyContent: "center",
        alignItems: "center",
        marginBottom: 16,
        borderWidth: 1,
        borderColor: colors.border,
    },
    name: {
        fontSize: 24,
        fontWeight: "700",
        color: colors.text,
        marginBottom: 4,
    },
    email: {
        fontSize: 14,
        color: colors.grey,
    },
    adminBadge: {
        marginTop: 8,
        backgroundColor: colors.danger,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 4,
    },
    adminBadgeText: {
        color: "#FFF",
        fontWeight: "bold",
        fontSize: 10,
    },
    statsRow: {
        flexDirection: "row",
        justifyContent: "space-around",
        alignItems: "center",
        backgroundColor: colors.surface,
        borderRadius: 16,
        paddingVertical: 20,
        marginBottom: 32,
        borderWidth: 1,
        borderColor: colors.border,
    },
    statDivider: {
        width: 1,
        height: 30,
        backgroundColor: colors.border,
    },
    section: {
        marginBottom: 32,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: "700",
        color: colors.text,
        marginBottom: 16,
    },
    infoRow: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 16,
    },
    iconBox: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: colors.surface,
        justifyContent: "center",
        alignItems: "center",
        marginRight: 16,
    },
    infoText: {
        flex: 1,
    },
    infoLabel: {
        fontSize: 12,
        color: colors.grey,
        marginBottom: 2,
    },
    infoValue: {
        fontSize: 16,
        color: colors.text,
        fontWeight: "500",
    },
    footer: {
        marginTop: 20,
    },
    logoutButton: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 16,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: colors.danger,
        backgroundColor: `${colors.danger}15`,
    },
    logoutText: {
        color: colors.danger,
        fontSize: 16,
        fontWeight: "700",
        marginLeft: 8,
    },
});
