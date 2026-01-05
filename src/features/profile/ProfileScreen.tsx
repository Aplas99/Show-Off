import { useGetCurrentUserProfile } from "@/api/profile/index";
import { COLORS } from "@/constants/theme";
import { supabase } from "@/lib/supabase";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import {
    ActivityIndicator,
    Alert,
    ScrollView,
    StatusBar,
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

    if (isLoading) {
        return (
            <View style={styles.centerContainer}>
                <ActivityIndicator size="large" color={COLORS.primary} />
            </View>
        );
    }

    if (error || !data) {
        return (
            <View style={styles.centerContainer}>
                <Ionicons name="alert-circle-outline" size={48} color={COLORS.grey} />
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
            <StatusBar barStyle="light-content" />
            <ScrollView
                contentContainerStyle={[
                    styles.scrollContent,
                    { paddingTop: insets.top + 20 }
                ]}
            >
                {/* Header Profile Section */}
                <Animated.View
                    entering={FadeInDown.delay(100).duration(500)}
                    style={styles.header}
                >
                    <View style={styles.avatarContainer}>
                        {profile?.avatar_url ? (
                            // In a real app use <Image /> or Expo Image here
                            <Ionicons name="person" size={40} color="#FFF" />
                        ) : (
                            <Ionicons name="person" size={40} color="#FFF" />
                        )}
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
                    <StatItem label="Showcases" value="0" />
                    <View style={styles.statDivider} />
                    <StatItem label="Items" value={String(socialStats.items)} />
                    <View style={styles.statDivider} />
                    <StatItem label="Followers" value={String(socialStats.followers)} />
                </Animated.View>

                {/* Admin Dashboard Link - Only visible if admin
                {!!profile?.is_admin && (
                    <Animated.View
                        entering={FadeInDown.delay(250).duration(500)}
                        style={styles.adminSection}
                    >
                        <Link href="/(admin)/menu" asChild>
                            <TouchableOpacity style={styles.adminButton}>
                                <Ionicons name="shield-checkmark" size={20} color="#FFF" />
                                <Text style={styles.adminButtonText}>Admin Dashboard</Text>
                                <Ionicons name="chevron-forward" size={20} color="#FFF" />
                            </TouchableOpacity>
                        </Link>
                    </Animated.View>
                )} */}

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
                    />
                    <InfoRow
                        icon="calendar-outline"
                        label="Joined"
                        value={new Date(user?.created_at || "").toLocaleDateString()}
                    />
                    {profile?.bio && (
                        <InfoRow
                            icon="information-circle-outline"
                            label="Bio"
                            value={profile.bio}
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
                        <Ionicons name="log-out-outline" size={20} color="#EF4444" />
                        <Text style={styles.logoutText}>Sign Out</Text>
                    </TouchableOpacity>
                </Animated.View>
            </ScrollView>
        </View>
    );
}

const StatItem = ({ label, value }: { label: string, value: string }) => (
    <View style={styles.statItem}>
        <Text style={styles.statValue}>{value}</Text>
        <Text style={styles.statLabel}>{label}</Text>
    </View>
);

const InfoRow = ({ icon, label, value }: { icon: any, label: string, value: string }) => (
    <View style={styles.infoRow}>
        <View style={styles.iconBox}>
            <Ionicons name={icon} size={20} color={COLORS.grey} />
        </View>
        <View style={styles.infoText}>
            <Text style={styles.infoLabel}>{label}</Text>
            <Text style={styles.infoValue}>{value}</Text>
        </View>
    </View>
);

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.background,
    },
    centerContainer: {
        flex: 1,
        backgroundColor: COLORS.background,
        justifyContent: "center",
        alignItems: "center",
    },
    scrollContent: {
        paddingHorizontal: 20,
        paddingBottom: 40,
    },
    errorText: {
        color: COLORS.grey,
        marginTop: 12,
        fontSize: 16,
    },
    header: {
        alignItems: "center",
        marginBottom: 32,
    },
    avatarContainer: {
        width: 88,
        height: 88,
        borderRadius: 44,
        backgroundColor: COLORS.surface, // Dark grey
        justifyContent: "center",
        alignItems: "center",
        marginBottom: 16,
        borderWidth: 1,
        borderColor: "#333",
    },
    name: {
        fontSize: 24,
        fontWeight: "700",
        color: "#FFF",
        marginBottom: 4,
    },
    email: {
        fontSize: 14,
        color: COLORS.grey,
    },
    adminBadge: {
        marginTop: 8,
        backgroundColor: "#EF4444",
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
        backgroundColor: COLORS.surface,
        borderRadius: 16,
        paddingVertical: 20,
        marginBottom: 32,
        borderWidth: 1,
        borderColor: "#333",
    },
    statItem: {
        alignItems: "center",
        flex: 1,
    },
    statValue: {
        fontSize: 20,
        fontWeight: "700",
        color: "#FFF",
        marginBottom: 4,
    },
    statLabel: {
        fontSize: 12,
        color: COLORS.grey,
        textTransform: "uppercase",
    },
    statDivider: {
        width: 1,
        height: 30,
        backgroundColor: "#333",
    },
    section: {
        marginBottom: 32,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: "700",
        color: "#FFF",
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
        backgroundColor: COLORS.surface,
        justifyContent: "center",
        alignItems: "center",
        marginRight: 16,
    },
    infoText: {
        flex: 1,
    },
    infoLabel: {
        fontSize: 12,
        color: COLORS.grey,
        marginBottom: 2,
    },
    infoValue: {
        fontSize: 16,
        color: "#FFF",
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
        borderColor: "#EF4444",
        backgroundColor: "rgba(239, 68, 68, 0.1)",
    },
    logoutText: {
        color: "#EF4444",
        fontSize: 16,
        fontWeight: "700",
        marginLeft: 8,
    },
    adminSection: {
        marginBottom: 32,
    },
    adminButton: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#EF4444",
        padding: 16,
        borderRadius: 16,
        justifyContent: "space-between",
    },
    adminButtonText: {
        color: "#FFF",
        fontWeight: "700",
        fontSize: 16,
        marginLeft: 8,
        flex: 1,
    },
});
