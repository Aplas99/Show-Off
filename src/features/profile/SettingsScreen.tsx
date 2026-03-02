import { useColors, type ThemeColors } from "@/constants/theme";
import { useThemeStore, type ThemeMode } from "@/hooks/useThemeStore";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect } from "react";
import {
    Pressable,
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

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
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
        </View>
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
    infoValue: {
        fontSize: 15,
        color: colors.grey,
        fontWeight: "500",
    },
});
