import {
    FREE_TIER_LIMITS,
    FREE_TIER_NAME,
    MEMBERSHIP_PLANS,
    useMembership,
    useOpenBillingPortal,
    useStartCheckout,
    type MembershipPlanId,
} from "@/api/memberships";
import { TAB_BAR_HEIGHT } from "@/constants/layoutConfig";
import { useColors, type ThemeColors } from "@/constants/theme";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type IoniconName = keyof typeof Ionicons.glyphMap;

/** How the panel is framed: a full navigation screen, or a bottom-sheet
 *  "cabinet" launched from a button. */
export type MembershipPanelMode = "screen" | "sheet";

/** Per-plan display metadata (period label, sub-line, ribbon badge). Prices
 *  come from the plan's `priceLabel` so there's a single source of truth. */
const PLAN_META: Record<
    MembershipPlanId,
    { period: string; sub: string; badge?: string }
> = {
    founding_curator: { period: "Founder", sub: "", badge: "FOUNDER EARLY ACCESS" },
    curator_monthly: { period: "Monthly", sub: "", badge: "POPULAR" },
    curator_annual: { period: "Annual", sub: "2 months free", badge: "BEST VALUE" },
};

/** The nine Curator privileges, as a short-label grid (see the perk detail
 *  in `MEMBERSHIP_PLANS` descriptions for the full pitch). */
const CURATOR_PERKS: { icon: IoniconName; title: string }[] = [
    { icon: "infinite-outline", title: "Unlimited" },
    { icon: "cloud-upload-outline", title: "200MB uploads" },
    { icon: "flash-outline", title: "Faster scans" },
    { icon: "close-circle-outline", title: "No ads" },
    { icon: "stats-chart-outline", title: "Price history" },
    { icon: "share-social-outline", title: "Public links" },
    { icon: "ribbon-outline", title: "Curator badge" },
    { icon: "list-outline", title: "Set tracking" },
    { icon: "color-wand-outline", title: "Customization" },
];

const FREE_PLAN_LIMITS: { icon: IoniconName; label: string }[] = [
    { icon: "albums-outline", label: `Up to ${FREE_TIER_LIMITS.maxItems} items` },
    { icon: "layers-outline", label: `${FREE_TIER_LIMITS.maxShowcases} showcase` },
    { icon: "scan-outline", label: "10 card scans / day" },
    { icon: "search-outline", label: "15 searches / day" },
];

/** Splits a "$5.99 / month" label into its leading amount ("$5.99"). */
function priceAmount(label: string): string {
    return label.split("/")[0]?.trim() ?? label;
}

interface MembershipPanelProps {
    mode: MembershipPanelMode;
    onClose: () => void;
}

/**
 * The membership UI (hero, plan picker, Buy Now / Manage Billing, privileges
 * grid). Rendered full-screen by the `membership` route and as a bottom-sheet
 * cabinet by `MembershipCabinetModal`.
 */
export default function MembershipPanel({ mode, onClose }: MembershipPanelProps) {
    const colors = useColors();
    const insets = useSafeAreaInsets();
    const styles = getStyles(colors);
    const isSheet = mode === "sheet";

    const { data: membership, isLoading } = useMembership();
    const startCheckout = useStartCheckout();
    const openPortal = useOpenBillingPortal();
    const [selectedPlan, setSelectedPlan] =
        useState<MembershipPlanId>("curator_monthly");

    const isPaidUser = membership?.isPaidUser ?? false;
    const isCurator = membership?.isCurator ?? false;
    const subscription = membership?.subscription ?? null;
    const currentPlan = membership?.plan ?? null;

    // Default the picker to the subscriber's own plan once it resolves, so an
    // existing member lands on their current tier (and every other card reads
    // as an upgrade). Runs once per plan value; user taps still win.
    const syncedPlanRef = useRef<MembershipPlanId | null>(null);
    useEffect(() => {
        if (currentPlan && syncedPlanRef.current !== currentPlan) {
            syncedPlanRef.current = currentPlan;
            setSelectedPlan(currentPlan);
        }
    }, [currentPlan]);

    const renewalLabel = subscription?.current_period_end
        ? new Date(subscription.current_period_end).toLocaleDateString()
        : null;

    const isCurrentPlanSelected = isPaidUser && selectedPlan === currentPlan;
    const ctaPending = startCheckout.isPending || openPortal.isPending;
    // Free → Buy Now (checkout). Paid on current plan → Manage Billing.
    // Paid viewing another plan → Upgrade Now (plan change via the portal).
    const ctaLabel = !isPaidUser
        ? "Buy Now"
        : isCurrentPlanSelected
          ? "Manage Billing"
          : "Upgrade Now";

    const handleManageBilling = async () => {
        try {
            await openPortal.mutateAsync();
        } catch (error: any) {
            Alert.alert(
                "Billing portal unavailable",
                error?.message ?? "Could not open the billing portal.",
            );
        }
    };

    const handleCtaPress = async () => {
        // Existing subscribers change plans through the Stripe billing portal
        // (a fresh Checkout would open a second subscription); only brand-new
        // members go through Checkout.
        if (isPaidUser) {
            await handleManageBilling();
            return;
        }
        try {
            await startCheckout.mutateAsync(selectedPlan);
        } catch (error: any) {
            Alert.alert(
                "Checkout unavailable",
                error?.message ?? "Could not start checkout. Please try again.",
            );
        }
    };

    const bottomPadding = isSheet
        ? insets.bottom + 28
        : TAB_BAR_HEIGHT +
        insets.bottom +
        (Platform.OS === "android" ? 8 : 0) +
        48;

    return (
        <View
            style={[
                isSheet ? styles.sheetContainer : styles.screenContainer,
                !isSheet && { paddingTop: insets.top },
            ]}
        >
            {isSheet && <View style={styles.grabber} />}

            {/* Header */}
            <View style={styles.header}>
                {isSheet ? <View style={{ width: 40 }} /> : (
                    <TouchableOpacity
                        onPress={onClose}
                        style={styles.headerButton}
                        activeOpacity={0.7}
                    >
                        <Ionicons name="arrow-back" size={24} color={colors.text} />
                    </TouchableOpacity>
                )}
                <Text style={styles.headerTitle}>Membership</Text>
                {isSheet ? (
                    <TouchableOpacity
                        onPress={onClose}
                        style={styles.headerButton}
                        activeOpacity={0.7}
                        accessibilityRole="button"
                        accessibilityLabel="Close membership"
                    >
                        <Ionicons name="close" size={24} color={colors.text} />
                    </TouchableOpacity>
                ) : (
                    <View style={{ width: 40 }} />
                )}
            </View>

            {isLoading ? (
                <View style={styles.centerContainer}>
                    <ActivityIndicator size="large" color={colors.primary} />
                </View>
            ) : (
                <ScrollView
                    contentContainerStyle={[
                        styles.scrollContent,
                        { paddingBottom: bottomPadding },
                    ]}
                    showsVerticalScrollIndicator={false}
                >
                    {/* Hero member card */}
                    <Animated.View entering={FadeInDown.delay(80).springify()}>
                        <LinearGradient
                            colors={[colors.primary, colors.secondary]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.heroCard}
                        >
                            <View style={styles.heroAvatar}>
                                <Ionicons
                                    name={isCurator ? "diamond" : "diamond-outline"}
                                    size={28}
                                    color="#FFF"
                                />
                            </View>
                            <View style={styles.heroText}>
                                <Text style={styles.heroTitle}>
                                    {isCurator ? "Curator Member" : `${FREE_TIER_NAME} Plan`}
                                </Text>
                                <Text style={styles.heroSubtitle}>
                                    {isPaidUser
                                        ? subscription?.cancel_at_period_end
                                            ? renewalLabel
                                                ? `Cancels on ${renewalLabel}`
                                                : "Cancels at period end"
                                            : renewalLabel
                                                ? `Renews ${renewalLabel}`
                                                : "Your membership is active"
                                        : "Unlock the full collection toolkit with Curator"}
                                </Text>
                            </View>
                            <View style={styles.heroPill}>
                                <Text style={styles.heroPillText}>
                                    {isPaidUser ? "ACTIVE" : "FREE"}
                                </Text>
                            </View>
                        </LinearGradient>
                    </Animated.View>

                    {/* Free-tier limits, for free users only */}
                    {!isPaidUser && (
                        <Animated.View entering={FadeInDown.delay(130).springify()}>
                            <Text style={styles.sectionTitle}>What you have now</Text>
                            <View style={styles.limitsCard}>
                                {FREE_PLAN_LIMITS.map((limit) => (
                                    <View key={limit.label} style={styles.limitChip}>
                                        <Ionicons
                                            name={limit.icon}
                                            size={16}
                                            color={colors.onSurfaceVariant}
                                        />
                                        <Text style={styles.limitChipText}>{limit.label}</Text>
                                    </View>
                                ))}
                            </View>
                        </Animated.View>
                    )}

                    {/* Plan picker + context-aware CTA (all users) */}
                    <Animated.View entering={FadeInDown.delay(180).springify()}>
                        <Text style={styles.sectionTitle}>
                            {isPaidUser ? "Your plan" : "Choose your plan"}
                        </Text>
                        <View style={styles.planRow}>
                            {MEMBERSHIP_PLANS.map((plan) => {
                                const meta = PLAN_META[plan.id];
                                const isSelected = selectedPlan === plan.id;
                                const isCurrent = isPaidUser && currentPlan === plan.id;
                                return (
                                    <Pressable
                                        key={plan.id}
                                        onPress={() => setSelectedPlan(plan.id)}
                                        style={[
                                            styles.planCard,
                                            isSelected && styles.planCardSelected,
                                        ]}
                                    >
                                        {isCurrent || meta.badge ? (
                                            <View
                                                style={[
                                                    styles.planBadge,
                                                    (isSelected || isCurrent) &&
                                                        styles.planBadgeSelected,
                                                ]}
                                            >
                                                <Text
                                                    style={[
                                                        styles.planBadgeText,
                                                        (isSelected || isCurrent) &&
                                                            styles.planBadgeTextSelected,
                                                    ]}
                                                >
                                                    {isCurrent ? "CURRENT" : meta.badge}
                                                </Text>
                                            </View>
                                        ) : null}
                                        <Text
                                            style={[
                                                styles.planPeriod,
                                                isSelected && { color: colors.primary },
                                            ]}
                                        >
                                            {meta.period}
                                        </Text>
                                        <Text style={styles.planPrice}>
                                            {priceAmount(plan.priceLabel)}
                                        </Text>
                                        {meta.sub ? (
                                            <Text style={styles.planSub}>{meta.sub}</Text>
                                        ) : null}
                                    </Pressable>
                                );
                            })}
                        </View>

                        <TouchableOpacity
                            onPress={handleCtaPress}
                            disabled={ctaPending}
                            activeOpacity={0.85}
                            style={styles.ctaWrapper}
                        >
                            <LinearGradient
                                colors={[colors.primary, colors.secondary]}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                                style={styles.ctaButton}
                            >
                                {ctaPending ? (
                                    <ActivityIndicator color="#FFF" />
                                ) : (
                                    <Text style={styles.ctaButtonText}>{ctaLabel}</Text>
                                )}
                            </LinearGradient>
                        </TouchableOpacity>
                        <Text style={styles.footnote}>
                            {isPaidUser
                                ? isCurrentPlanSelected
                                    ? "Update your payment method, switch plans, or cancel via the Stripe billing portal."
                                    : "Switch to this plan securely in the Stripe billing portal — your remaining balance is prorated."
                                : "Secure checkout by Stripe. Renews automatically — cancel anytime."}
                        </Text>
                    </Animated.View>

                    {/* Privileges grid */}
                    <Animated.View entering={FadeInDown.delay(230).springify()}>
                        <View style={styles.perksHeader}>
                            <Text style={styles.sectionTitle}>
                                {CURATOR_PERKS.length} Curator privileges
                            </Text>
                            {isCurator ? (
                                <View style={styles.includedPill}>
                                    <Ionicons name="checkmark" size={12} color={colors.primary} />
                                    <Text style={styles.includedPillText}>Included</Text>
                                </View>
                            ) : null}
                        </View>
                        <View style={styles.perksGrid}>
                            {CURATOR_PERKS.map((perk) => (
                                <View key={perk.title} style={styles.perkCell}>
                                    <View style={styles.perkIconBg}>
                                        <Ionicons
                                            name={perk.icon}
                                            size={22}
                                            color={colors.primary}
                                        />
                                    </View>
                                    <Text style={styles.perkTitle}>{perk.title}</Text>
                                </View>
                            ))}
                        </View>
                    </Animated.View>
                </ScrollView>
            )}
        </View>
    );
}

const getStyles = (colors: ThemeColors) =>
    StyleSheet.create({
        screenContainer: {
            flex: 1,
            backgroundColor: colors.background,
        },
        sheetContainer: {
            maxHeight: "92%",
            backgroundColor: colors.background,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            paddingTop: 8,
            overflow: "hidden",
        },
        grabber: {
            alignSelf: "center",
            width: 40,
            height: 5,
            borderRadius: 3,
            backgroundColor: colors.outlineVariant,
            marginBottom: 4,
        },
        centerContainer: {
            paddingVertical: 80,
            justifyContent: "center",
            alignItems: "center",
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
        headerButton: {
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
        scrollContent: {
            paddingBottom: 48,
        },
        // --- Hero card ---
        heroCard: {
            flexDirection: "row",
            alignItems: "center",
            marginHorizontal: 16,
            marginTop: 20,
            padding: 18,
            borderRadius: 24,
            shadowColor: colors.primary,
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.35,
            shadowRadius: 16,
            elevation: 8,
        },
        heroAvatar: {
            width: 52,
            height: 52,
            borderRadius: 18,
            backgroundColor: "rgba(255,255,255,0.2)",
            justifyContent: "center",
            alignItems: "center",
            marginRight: 14,
        },
        heroText: {
            flex: 1,
        },
        heroTitle: {
            fontSize: 18,
            fontWeight: "800",
            color: "#FFF",
            marginBottom: 3,
        },
        heroSubtitle: {
            fontSize: 13,
            color: "rgba(255,255,255,0.85)",
            fontWeight: "500",
        },
        heroPill: {
            paddingHorizontal: 12,
            paddingVertical: 5,
            borderRadius: 999,
            backgroundColor: "rgba(255,255,255,0.22)",
        },
        heroPillText: {
            fontSize: 11,
            fontWeight: "800",
            letterSpacing: 1,
            color: "#FFF",
        },
        // --- Section headings ---
        sectionTitle: {
            fontSize: 15,
            fontWeight: "700",
            color: colors.text,
            marginHorizontal: 20,
            marginTop: 28,
            marginBottom: 14,
        },
        // --- Free-tier limits ---
        limitsCard: {
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 8,
            marginHorizontal: 16,
        },
        limitChip: {
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            paddingHorizontal: 12,
            paddingVertical: 9,
            borderRadius: 999,
            backgroundColor: colors.surfaceContainer,
            borderWidth: 1,
            borderColor: colors.border,
        },
        limitChipText: {
            fontSize: 13,
            color: colors.onSurfaceVariant,
            fontWeight: "500",
        },
        // --- Plan picker ---
        planRow: {
            flexDirection: "row",
            gap: 10,
            marginHorizontal: 16,
            marginTop: 4,
        },
        planCard: {
            flex: 1,
            alignItems: "center",
            paddingVertical: 18,
            paddingHorizontal: 4,
            borderRadius: 18,
            borderWidth: 1.5,
            borderColor: colors.border,
            backgroundColor: colors.surfaceContainer,
        },
        planCardSelected: {
            borderColor: colors.primary,
            backgroundColor: `${colors.primary}12`,
        },
        planBadge: {
            position: "absolute",
            top: -9,
            paddingHorizontal: 8,
            paddingVertical: 2,
            borderRadius: 999,
            backgroundColor: colors.surfaceContainerHighest,
        },
        planBadgeSelected: {
            backgroundColor: colors.primary,
        },
        planBadgeText: {
            fontSize: 8,
            fontWeight: "800",
            letterSpacing: 0.5,
            color: colors.onSurfaceVariant,
        },
        planBadgeTextSelected: {
            color: "#FFF",
        },
        planPeriod: {
            fontSize: 12,
            fontWeight: "700",
            color: colors.onSurfaceVariant,
            textTransform: "uppercase",
            letterSpacing: 0.5,
            marginTop: 4,
            marginBottom: 8,
        },
        planPrice: {
            fontSize: 20,
            fontWeight: "800",
            color: colors.text,
        },
        planSub: {
            fontSize: 11,
            color: colors.grey,
            marginTop: 6,
            textAlign: "center",
        },
        // --- CTA ---
        ctaWrapper: {
            marginHorizontal: 16,
            marginTop: 24,
            borderRadius: 999,
            overflow: "hidden",
        },
        ctaButton: {
            height: 54,
            justifyContent: "center",
            alignItems: "center",
        },
        ctaButtonText: {
            color: "#FFF",
            fontSize: 16,
            fontWeight: "800",
        },
        footnote: {
            marginTop: 12,
            marginHorizontal: 24,
            fontSize: 12,
            color: colors.grey,
            textAlign: "center",
            lineHeight: 17,
        },
        // --- Privileges grid ---
        perksHeader: {
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginRight: 20,
        },
        includedPill: {
            flexDirection: "row",
            alignItems: "center",
            gap: 3,
            paddingHorizontal: 10,
            paddingVertical: 4,
            borderRadius: 999,
            backgroundColor: `${colors.primary}18`,
        },
        includedPillText: {
            fontSize: 11,
            fontWeight: "700",
            color: colors.primary,
        },
        perksGrid: {
            flexDirection: "row",
            flexWrap: "wrap",
            justifyContent: "space-between",
            marginHorizontal: 16,
            rowGap: 18,
        },
        perkCell: {
            width: "31%",
            alignItems: "center",
        },
        perkIconBg: {
            width: 56,
            height: 56,
            borderRadius: 18,
            backgroundColor: colors.surfaceContainer,
            borderWidth: 1,
            borderColor: colors.border,
            justifyContent: "center",
            alignItems: "center",
            marginBottom: 8,
        },
        perkTitle: {
            fontSize: 12,
            fontWeight: "600",
            color: colors.onSurfaceVariant,
            textAlign: "center",
        },
    });
