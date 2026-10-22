import BlockedAccounts from "@/src/components/social/BlockedAccounts";
import { useModeratorAccess } from "@/api/safety";
import { openAdPrivacyOptions } from "@/api/ads";
import { useDeleteAccount } from "@/api/auth";
import { CSV_MEMBERSHIP_REQUIRED_MESSAGE, useExportItemsCsv, useImportItemsCsv } from "@/api/items/csv";
import { useMembership } from "@/api/memberships";
import { useColors, type ThemeColors } from "@/constants/theme";
import { useThemeStore, type ThemeMode } from "@/hooks/useThemeStore";
import { confirmAction, showMessage } from "@/lib/dialogs";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from "react-native";
import Animated, {
    FadeInDown,
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    withTiming
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const THEME_OPTIONS: { mode: ThemeMode; label: string; icon: string; description: string }[] = [
    { mode: "light", label: "Light", icon: "sunny", description: "Soft eggshell white" },
    { mode: "dark", label: "Dark", icon: "moon", description: "OLED-friendly dark" },
    { mode: "system", label: "System", icon: "phone-portrait", description: "Follow device setting" },
];

export default function SettingsScreen() {
    const colors = useColors();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const { mode, setMode, isDark } = useThemeStore();
    const styles = getStyles(colors);
    const moderator = useModeratorAccess();
    const deleteAccount = useDeleteAccount();
    const [privacyMessage, setPrivacyMessage] = useState("");
    const [privacyPending, setPrivacyPending] = useState(false);

    const handleDeleteAccount = async () => {
        if (!await confirmAction("Delete Account", "This permanently deletes your account and content. Cancel recurring subscriptions with your billing provider first. Deletion cannot be undone.", "Delete Forever")) return;
        if (!await confirmAction("Are you absolutely sure?", "There is no way to recover your account after this.", "Delete")) return;
        try {
            await deleteAccount.mutateAsync();
            router.replace("/(auth)/signin");
        } catch (error: unknown) {
            showMessage("Could not delete account", error instanceof Error ? error.message : "Please try again later.");
        }
    };

    return (
        <ScrollView style={styles.container} contentContainerStyle={{ width: "100%", maxWidth: 720, alignSelf: "center", paddingTop: insets.top, paddingBottom: insets.bottom + 24 }}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity
                    onPress={() => router.back()}
                    style={styles.backButton}
                    activeOpacity={0.7}
                >
                    <Ionicons name="arrow-back" size={24} color={colors.text} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Settings</Text>
                <View style={{ width: 40 }} />
            </View>

            {/* Theme Section */}
            <Animated.View entering={FadeInDown.delay(100).springify()}>
                <View style={styles.sectionHeader}>
                    <Ionicons name="color-palette-outline" size={20} color={colors.primary} />
                    <Text style={styles.sectionTitle}>Appearance</Text>
                </View>

                <View style={styles.themeCard}>
                    {THEME_OPTIONS.map((option, index) => (
                        <ThemeOptionRow
                            key={option.mode}
                            option={option}
                            isSelected={mode === option.mode}
                            onPress={() => setMode(option.mode)}
                            colors={colors}
                            isLast={index === THEME_OPTIONS.length - 1}
                        />
                    ))}
                </View>

                {/* Preview Strip */}
                <Animated.View entering={FadeInDown.delay(200).springify()}>
                    <View style={styles.previewContainer}>
                        <Text style={styles.previewLabel}>Preview</Text>
                        <View style={styles.previewRow}>
                            <View style={[styles.previewSwatch, { backgroundColor: colors.background }]}>
                                <Text style={[styles.previewSwatchText, { color: colors.text }]}>Bg</Text>
                            </View>
                            <View style={[styles.previewSwatch, { backgroundColor: colors.surface }]}>
                                <Text style={[styles.previewSwatchText, { color: colors.text }]}>Card</Text>
                            </View>
                            <View style={[styles.previewSwatch, { backgroundColor: colors.primary }]}>
                                <Text style={[styles.previewSwatchText, { color: "#FFF" }]}>Accent</Text>
                            </View>
                            <View style={[styles.previewSwatch, { backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.border }]}>
                                <Text style={[styles.previewSwatchText, { color: colors.text }]}>Input</Text>
                            </View>
                        </View>
                    </View>
                </Animated.View>
            </Animated.View>

            {/* App Info */}
            <Animated.View entering={FadeInDown.delay(300).springify()} style={styles.footerSection}>
                <View style={styles.sectionHeader}>
                    <Ionicons name="information-circle-outline" size={20} color={colors.primary} />
                    <Text style={styles.sectionTitle}>About</Text>
                </View>

                <View style={styles.themeCard}>
                    <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>Version</Text>
                        <Text style={styles.infoValue}>1.0.0</Text>
                    </View>
                    <View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
                        <Text style={styles.infoLabel}>Theme Mode</Text>
                        <Text style={styles.infoValue}>{mode.charAt(0).toUpperCase() + mode.slice(1)}{mode === "system" ? (isDark ? " (Dark)" : " (Light)") : ""}</Text>
                    </View>
                </View>
            </Animated.View>

            <View style={styles.themeCard}>
                {([['privacy', 'Privacy Policy'], ['terms', 'Terms of Use'], ['community', 'Community Standards'], ['support', 'Support and Safety'], ['deletion', 'Request Account Deletion']] as const).map(([page, label]) => (
                    <TouchableOpacity key={page} style={styles.infoRow} accessibilityRole="link" onPress={() => router.push({ pathname: "/legal/[page]", params: { page } })}>
                        <Text style={styles.infoLabel}>{label}</Text>
                        <Ionicons name="chevron-forward" size={18} color={colors.text} />
                    </TouchableOpacity>
                ))}
            </View>
            <View style={styles.themeCard}>
                <TouchableOpacity style={styles.infoRow} disabled={privacyPending} accessibilityRole="button" onPress={async () => {
                    setPrivacyPending(true);
                    try { setPrivacyMessage(await openAdPrivacyOptions()); }
                    catch { setPrivacyMessage("Privacy choices could not be loaded. Please try again."); }
                    finally { setPrivacyPending(false); }
                }}>
                    <Text style={styles.infoLabel}>{privacyPending ? "Loading privacy choices..." : "Advertising privacy choices"}</Text>
                </TouchableOpacity>
                {!!privacyMessage && <Text style={styles.infoLabel} accessibilityLiveRegion="polite">{privacyMessage}</Text>}
                <TouchableOpacity style={styles.infoRow} accessibilityRole="link" onPress={() => router.push("/(tabs)/profile/membership")}>
                    <Text style={styles.infoLabel}>Manage or cancel membership</Text>
                </TouchableOpacity>
            </View>
            <CollectionCsvSection colors={colors} />
            <BlockedAccounts />
            {moderator.data && <TouchableOpacity style={styles.infoRow} onPress={() => router.push("/(admin)")}><Text style={styles.infoLabel}>Moderation queue</Text></TouchableOpacity>}
            {/* Danger Zone */}
            <Animated.View entering={FadeInDown.delay(350).springify()}>
                <View style={styles.sectionHeader}>
                    <Ionicons name="warning-outline" size={20} color={colors.danger} />
                    <Text style={styles.sectionTitle}>Danger Zone</Text>
                </View>
                <View style={styles.themeCard}>
                    <TouchableOpacity
                        style={[styles.infoRow, { borderBottomWidth: 0 }]}
                        onPress={handleDeleteAccount}
                        disabled={deleteAccount.isPending}
                        accessibilityRole="button"
                        accessibilityLabel="Delete account"
                    >
                        <Text style={[styles.infoLabel, { color: colors.danger }]}>
                            Delete Account
                        </Text>
                        {deleteAccount.isPending ? (
                            <ActivityIndicator size="small" color={colors.danger} />
                        ) : (
                            <Ionicons name="chevron-forward" size={18} color={colors.danger} />
                        )}
                    </TouchableOpacity>
                </View>
            </Animated.View>
        </ScrollView>
    );
}

/** Curator perk: export the whole collection to CSV, or bulk-add items from one. */
function CollectionCsvSection({ colors }: { colors: ThemeColors }) {
    const styles = getStyles(colors);
    const router = useRouter();
    const { data: membership } = useMembership();
    const isPaidUser = membership?.isPaidUser ?? false;
    const exportCsv = useExportItemsCsv();
    const importCsv = useImportItemsCsv();
    const busy = exportCsv.isPending || importCsv.isPending;

    const showError = (title: string, error: unknown) => {
        const message = error instanceof Error ? error.message : "Please try again.";
        if (message === CSV_MEMBERSHIP_REQUIRED_MESSAGE) {
            router.push("/(tabs)/profile/membership");
            return;
        }
        showMessage(title, message);
    };

    const handleExport = async () => {
        if (!isPaidUser) return router.push("/(tabs)/profile/membership");
        try {
            const result = await exportCsv.mutateAsync();
            if (result) showMessage("Collection exported", `Saved ${result.count} item${result.count === 1 ? "" : "s"} to CSV.`);
        } catch (error) {
            showError("Could not export", error);
        }
    };

    const handleImport = async () => {
        if (!isPaidUser) return router.push("/(tabs)/profile/membership");
        const proceed = await confirmAction(
            "Import from CSV",
            "Each row becomes a new item. Include a \"title\" column; barcode, card id, condition, price and showcases columns are optional. Export first to get a template.",
            "Choose File",
        );
        if (!proceed) return;
        try {
            const result = await importCsv.mutateAsync();
            if (!result) return;
            const lines = [`Imported ${result.imported} item${result.imported === 1 ? "" : "s"}.`];
            if (result.showcasesCreated > 0) lines.push(`Created ${result.showcasesCreated} new private showcase${result.showcasesCreated === 1 ? "" : "s"}.`);
            if (result.unlinked > 0) lines.push(`${result.unlinked} barcode/card id${result.unlinked === 1 ? " was" : "s were"} not recognized; saved as manual items.`);
            if (result.failed.length > 0) {
                const preview = result.failed.slice(0, 10).map((e) => `Row ${e.line}: ${e.message}`).join("\n");
                const more = result.failed.length > 10 ? `\n...and ${result.failed.length - 10} more` : "";
                lines.push(`${result.failed.length} row${result.failed.length === 1 ? "" : "s"} failed and ${result.failed.length === 1 ? "was" : "were"} not imported:\n${preview}${more}`);
            }
            showMessage(result.failed.length > 0 ? "Import finished with errors" : "Import finished", lines.join("\n\n"));
        } catch (error) {
            showError("Could not import", error);
        }
    };

    const rows = [
        { key: "export", label: "Export collection to CSV", icon: "download-outline", pending: exportCsv.isPending, onPress: handleExport },
        { key: "import", label: "Import items from CSV", icon: "cloud-upload-outline", pending: importCsv.isPending, onPress: handleImport },
    ] as const;

    return (
        <Animated.View entering={FadeInDown.delay(320).springify()}>
            <View style={styles.sectionHeader}>
                <Ionicons name="document-text-outline" size={20} color={colors.primary} />
                <Text style={styles.sectionTitle}>Collection Data</Text>
            </View>
            <View style={styles.themeCard}>
                {rows.map((row, index) => (
                    <TouchableOpacity
                        key={row.key}
                        style={[styles.infoRow, index === rows.length - 1 && { borderBottomWidth: 0 }]}
                        onPress={row.onPress}
                        disabled={busy}
                        accessibilityRole="button"
                        accessibilityHint={isPaidUser ? undefined : "Curator feature. Opens membership options."}
                    >
                        <View style={styles.csvLabelRow}>
                            <Ionicons name={row.icon} size={18} color={colors.text} />
                            <Text style={styles.infoLabel}>{row.label}</Text>
                        </View>
                        {row.pending ? (
                            <ActivityIndicator size="small" color={colors.primary} />
                        ) : isPaidUser ? (
                            <Ionicons name="chevron-forward" size={18} color={colors.text} />
                        ) : (
                            <View style={styles.curatorBadge}>
                                <Ionicons name="lock-closed" size={12} color={colors.primary} />
                                <Text style={styles.curatorBadgeText}>Curator</Text>
                            </View>
                        )}
                    </TouchableOpacity>
                ))}
            </View>
        </Animated.View>
    );
}

function ThemeOptionRow({
    option,
    isSelected,
    onPress,
    colors,
    isLast,
}: {
    option: typeof THEME_OPTIONS[0];
    isSelected: boolean;
    onPress: () => void;
    colors: ThemeColors;
    isLast: boolean;
}) {
    const styles = getStyles(colors);
    const scale = useSharedValue(1);
    const checkOpacity = useSharedValue(isSelected ? 1 : 0);
    const checkScale = useSharedValue(isSelected ? 1 : 0);

    useEffect(() => {
        checkOpacity.value = withTiming(isSelected ? 1 : 0, { duration: 200 });
        checkScale.value = withSpring(isSelected ? 1 : 0, { damping: 15 });
    }, [isSelected, checkOpacity, checkScale]);

    const checkStyle = useAnimatedStyle(() => ({
        opacity: checkOpacity.value,
        transform: [{ scale: checkScale.value }],
    }));

    const handlePressIn = () => {
        scale.value = withTiming(0.98, { duration: 100 });
    };

    const handlePressOut = () => {
        scale.value = withSpring(1, { damping: 15 });
    };

    const rowStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
    }));

    return (
        <Animated.View style={rowStyle}>
            <Pressable
                onPress={onPress}
                onPressIn={handlePressIn}
                onPressOut={handlePressOut}
                style={[
                    styles.themeOption,
                    isSelected && styles.themeOptionSelected,
                    isLast && { borderBottomWidth: 0 },
                ]}
            >
                <View style={[styles.themeIconBg, isSelected && { backgroundColor: `${colors.primary}20` }]}>
                    <Ionicons
                        name={option.icon as any}
                        size={22}
                        color={isSelected ? colors.primary : colors.grey}
                    />
                </View>
                <View style={styles.themeTextContainer}>
                    <Text style={[styles.themeLabel, isSelected && { color: colors.text, fontWeight: "700" }]}>
                        {option.label}
                    </Text>
                    <Text style={styles.themeDescription}>{option.description}</Text>
                </View>
                <Animated.View style={[styles.checkContainer, checkStyle]}>
                    <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
                </Animated.View>
            </Pressable>
        </Animated.View>
    );
}

const getStyles = (colors: ThemeColors) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    header: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    backButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: colors.surface,
        justifyContent: "center",
        alignItems: "center",
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: "700",
        color: colors.text,
    },
    sectionHeader: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingHorizontal: 20,
        paddingTop: 24,
        paddingBottom: 12,
    },
    sectionTitle: {
        fontSize: 14,
        fontWeight: "700",
        color: colors.grey,
        textTransform: "uppercase",
        letterSpacing: 1,
    },
    themeCard: {
        marginHorizontal: 16,
        backgroundColor: colors.card,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: colors.border,
        overflow: "hidden",
    },
    themeOption: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 16,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    themeOptionSelected: {
        backgroundColor: `${colors.primary}08`,
    },
    themeIconBg: {
        width: 44,
        height: 44,
        borderRadius: 12,
        backgroundColor: colors.surface,
        justifyContent: "center",
        alignItems: "center",
        marginRight: 14,
    },
    themeTextContainer: {
        flex: 1,
    },
    themeLabel: {
        fontSize: 16,
        fontWeight: "600",
        color: colors.textDim,
        marginBottom: 2,
    },
    themeDescription: {
        fontSize: 13,
        color: colors.grey,
    },
    checkContainer: {
        width: 28,
        height: 28,
        justifyContent: "center",
        alignItems: "center",
    },
    previewContainer: {
        marginHorizontal: 16,
        marginTop: 16,
    },
    previewLabel: {
        fontSize: 12,
        fontWeight: "600",
        color: colors.grey,
        marginBottom: 8,
        textTransform: "uppercase",
        letterSpacing: 0.5,
    },
    previewRow: {
        flexDirection: "row",
        gap: 8,
    },
    previewSwatch: {
        flex: 1,
        height: 56,
        borderRadius: 12,
        justifyContent: "center",
        alignItems: "center",
    },
    previewSwatchText: {
        fontSize: 11,
        fontWeight: "600",
    },
    footerSection: {
        marginTop: 8,
    },
    infoRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    infoLabel: {
        fontSize: 15,
        color: colors.text,
    },
    csvLabelRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
    },
    curatorBadge: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 999,
        backgroundColor: `${colors.primary}1A`,
    },
    curatorBadgeText: {
        fontSize: 12,
        fontWeight: "700",
        color: colors.primary,
    },
    infoValue: {
        fontSize: 15,
        color: colors.grey,
        fontWeight: "500",
    },
});
