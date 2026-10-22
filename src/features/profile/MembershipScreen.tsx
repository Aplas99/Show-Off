import SubscriptionDisclosure from "@/src/components/membership/SubscriptionDisclosure";
import {
    FREE_TIER_LIMITS,
    FREE_TIER_NAME,
    MEMBERSHIP_PLANS,
    getActiveBillingProvider,
  PLAN_STORE_PRODUCT_IDS,
  PURCHASE_UNAVAILABLE_MESSAGE,
  useMembershipPrices,
    useManageMembership,
    useMembership,
    usePurchaseMembership,
    useRestorePurchases,
    type MembershipPlanId,
} from "@/api/memberships";
import { TAB_BAR_HEIGHT } from "@/constants/layoutConfig";
import { useColors, type ThemeColors } from "@/constants/theme";
import { showMessage } from "@/lib/dialogs";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
    ActivityIndicator,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const FREE_PLAN_LIMITS = [
    { icon: "albums-outline", label: `Up to ${FREE_TIER_LIMITS.maxItems} items` },
    { icon: "layers-outline", label: `${FREE_TIER_LIMITS.maxShowcases} showcase` },
    { icon: "scan-outline", label: "10 card scans / day (watch an ad for more)" },
    { icon: "search-outline", label: "15 searches / day (watch an ad for more)" },
    { icon: "share-social-outline", label: "Sharable public showcase links" },
] as const;

const CURATOR_FEATURES = [
    { icon: "infinite-outline", label: "Unlimited items & showcases" },
    {
        icon: "cloud-upload-outline",
        label: "100MB image uploads (10MB for Founding Curator)",
    },
    {
        icon: "flash-outline",
        label:
            "Faster, more accurate card recognition — our upgraded scan pipeline finds cards phones normally struggle with",
    },
    { icon: "infinite-outline", label: "Unlimited daily scans & searches, no ads" },
    { icon: "stats-chart-outline", label: "Price history for your collection" },
    { icon: "ribbon-outline", label: "Curator badge & showcase customization" },
    { icon: "list-outline", label: "Missing-items tracking per set" },
] as const;

const PLAN_FEATURES: Record<MembershipPlanId, readonly string[]> = {
    founding_curator: [
        "10MB uploads per file",
        "Monthly billing through your store",
        "Metallic Founding Curator profile badge",
    ],
    curator_monthly: [
        "100MB uploads per file",
        "Flexible month-to-month billing",
        "Full Curator feature access",
    ],
    curator_annual: [
        "100MB uploads per file",
        "One payment per year",
        "Full Curator feature access",
    ],
};

export default function MembershipScreen() {
    const colors = useColors();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const styles = getStyles(colors);

    const { data: membership, isLoading, isError: membershipError, refetch: refetchMembership } = useMembership();
    const purchase = usePurchaseMembership();
    const manage = useManageMembership();
    const restore = useRestorePurchases();
    const prices = useMembershipPrices();
    const [selectedPlan, setSelectedPlan] =
        useState<MembershipPlanId>("curator_monthly");

    // New purchases use native store billing only.
    const isNativeBilling = getActiveBillingProvider() === "revenuecat";
    const storeName =
        Platform.OS === "ios" ? "the App Store" : "Google Play";

    // There is only one paid tier (Curator, at three price points), so
    // isPaidUser and isCurator are equivalent in normal operation —
    // isCurator only differs in the unlikely case of a subscription on
    // an unseeded price_id (see subscriptions_with_tier's fail-safe
    // default to 'collector' in that case).
    const isPaidUser = membership?.isPaidUser ?? false;
    const isCurator = membership?.isCurator ?? false;
    const subscription = membership?.subscription ?? null;

    const handleUpgrade = async () => {
        try {
            const result = await purchase.mutateAsync(selectedPlan);
            if (result.success) {
                showMessage(
                    selectedPlan === "founding_curator"
                        ? "Welcome, Founding Curator"
                        : "Welcome to Curator",
                    "Your purchase was confirmed by the store. Membership access will update when the receipt is synchronized.",
                );
            }
        } catch (error: any) {
            showMessage(
                "Purchase unavailable",
                error?.message ?? "Could not start the purchase. Please try again.",
            );
        }
    };

    const handleManageBilling = async () => {
        try {
            // Manage on the rail the subscription was actually bought on.
            await manage.mutateAsync(subscription?.provider);
        } catch (error: any) {
            showMessage(
                "Subscription management unavailable",
                error?.message ?? "Could not open subscription management.",
            );
        }
    };

    const handleRestore = async () => {
        try {
            const active = await restore.mutateAsync();
            showMessage(
                active ? "Purchases restored" : "Nothing to restore",
                active
                    ? "The store found your membership. Access will update when the receipt is synchronized."
                    : `We couldn't find an active membership on your ${storeName} account.`,
            );
        } catch (error: any) {
            showMessage(
                "Restore failed",
                error?.message ?? "Could not restore purchases. Please try again.",
            );
        }
    };

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
                <Text style={styles.headerTitle}>Membership</Text>
                <View style={{ width: 40 }} />
            </View>

            {isLoading ? (
                <View style={styles.centerContainer}>
                    <ActivityIndicator size="large" color={colors.primary} />
                </View>
            ) : (
                <ScrollView
                    contentContainerStyle={[
                        styles.scrollContent,
                        // Clear the floating tab bar so the Upgrade button and
                        // footnote are never hidden underneath it.
                        {
                            paddingBottom:
                                TAB_BAR_HEIGHT +
                                insets.bottom +
                                (Platform.OS === "android" ? 8 : 0) +
                                48,
                        },
                    ]}
                    showsVerticalScrollIndicator={false}
                >

              {membershipError && <Text style={{ color: colors.text }} onPress={() => void refetchMembership()}>Unable to check your membership. Tap to retry before purchasing.</Text>}
              {!isNativeBilling && <Text style={{ color: colors.text }}>{PURCHASE_UNAVAILABLE_MESSAGE}</Text>}
              {isNativeBilling && <TouchableOpacity onPress={() => void prices.refetch()} disabled={prices.isFetching} accessibilityRole="button">
                <Text style={{ color: colors.primary, paddingVertical: 12 }}>{prices.isFetching ? "Loading store prices..." : prices.isError ? "Prices unavailable. Tap to retry." : "Refresh store prices"}</Text>
              </TouchableOpacity>}

                    {/* Current status */}
                    <Animated.View entering={FadeInDown.delay(100).springify()}>
                        <View style={styles.statusCard}>
                            <View
                                style={[
                                    styles.statusIconBg,
                                    isPaidUser && { backgroundColor: `${colors.primary}20` },
                                ]}
                            >
                                <Ionicons
                                    name={isPaidUser ? "diamond" : "diamond-outline"}
                                    size={26}
                                    color={isPaidUser ? colors.primary : colors.grey}
                                />
                            </View>
                            <View style={styles.statusTextContainer}>
                                <Text style={styles.statusTitle}>
                                    {isCurator ? "Curator Member" : `${FREE_TIER_NAME} (Free)`}
                                </Text>
                                <Text style={styles.statusSubtitle}>
                                    {isPaidUser
                                        ? subscription?.cancel_at_period_end
                                            ? "Cancels at the end of the current period"
                                            : "Your membership is active"
                                        : "Upgrade to unlock the full collection toolkit"}
                                </Text>
                            </View>
                        </View>
                    </Animated.View>

                    {/* Free plan limits — only relevant to free users */}
                    {!isPaidUser && (
                        <Animated.View entering={FadeInDown.delay(150).springify()}>
                            <View style={styles.sectionHeader}>
                                <Ionicons name="gift-outline" size={20} color={colors.primary} />
                                <Text style={styles.sectionTitle}>{FREE_TIER_NAME} Plan</Text>
                            </View>
                            <View style={styles.card}>
                                {FREE_PLAN_LIMITS.map((perk, index) => (
                                    <View
                                        key={perk.label}
                                        style={[
                                            styles.perkRow,
                                            index === FREE_PLAN_LIMITS.length - 1 && {
                                                borderBottomWidth: 0,
                                            },
                                        ]}
                                    >
                                        <Ionicons
                                            name={perk.icon as any}
                                            size={20}
                                            color={colors.primary}
                                        />
                                        <Text style={styles.perkText}>{perk.label}</Text>
                                    </View>
                                ))}
                            </View>
                        </Animated.View>
                    )}

                    <Animated.View entering={FadeInDown.delay(175).springify()}>
                        <View style={styles.sectionHeader}>
                            <Ionicons name="ribbon-outline" size={20} color={colors.tertiary} />
                            <Text style={styles.sectionTitle}>Curator Features</Text>
                        </View>
                        <View style={styles.card}>
                            {CURATOR_FEATURES.map((perk, index) => (
                                <View
                                    key={perk.label}
                                    style={[
                                        styles.perkRow,
                                        index === CURATOR_FEATURES.length - 1 && {
                                            borderBottomWidth: 0,
                                        },
                                    ]}
                                >
                                    <Ionicons
                                        name={perk.icon as any}
                                        size={20}
                                        color={colors.tertiary}
                                    />
                                    <Text style={styles.perkText}>{perk.label}</Text>
                                </View>
                            ))}
                        </View>
                    </Animated.View>

                    {/* Plans + actions */}
                    {isPaidUser && (
                        <Animated.View entering={FadeInDown.delay(200).springify()}>
                            <TouchableOpacity
                                style={styles.primaryButton}
                                onPress={handleManageBilling}
                                disabled={manage.isPending}
                                activeOpacity={0.8}
                            >
                                {manage.isPending ? (
                                    <ActivityIndicator color="#FFF" />
                                ) : (
                                    <Text style={styles.primaryButtonText}>
                                        Manage Subscription
                                    </Text>
                                )}
                            </TouchableOpacity>
                            <Text style={styles.footnote}>
                                {subscription?.provider === "revenuecat"
                                    ? `Billed through your ${storeName} account. Switch plans or cancel there anytime.`
                                    : "Update your payment method, switch plans, or cancel via the Stripe billing portal."}
                            </Text>
                            {isNativeBilling && (
                                <TouchableOpacity
                                    onPress={handleRestore}
                                    disabled={restore.isPending || purchase.isPending}
                                    style={styles.restoreButton}
                                    activeOpacity={0.7}
                                >
                                    <Text style={styles.restoreText}>
                                        {restore.isPending
                                            ? "Restoring…"
                                            : "Restore purchases"}
                                    </Text>
                                </TouchableOpacity>
                            )}
                        </Animated.View>
                    )}

                    {!isPaidUser && (
                        <Animated.View entering={FadeInDown.delay(220).springify()}>
                            <View style={styles.sectionHeader}>
                                <Ionicons
                                    name="pricetag-outline"
                                    size={20}
                                    color={colors.primary}
                                />
                                <Text style={styles.sectionTitle}>Choose a Plan</Text>
                            </View>
                            <View style={styles.card}>
                                {MEMBERSHIP_PLANS.map((plan, index) => {
                                    const isSelected = selectedPlan === plan.id;
                                    return (
                                        <TouchableOpacity
                                            key={plan.id}
                                            style={[
                                                styles.planRow,
                                                index === MEMBERSHIP_PLANS.length - 1 && {
                                                    borderBottomWidth: 0,
                                                },
                                                isSelected && {
                                                    backgroundColor: `${colors.primary}08`,
                                                },
                                            ]}
                                            onPress={() => setSelectedPlan(plan.id)}
                                            activeOpacity={0.7}
                                        >
                                            <Ionicons
                                                name={
                                                    isSelected
                                                        ? "radio-button-on"
                                                        : "radio-button-off"
                                                }
                                                size={22}
                                                color={isSelected ? colors.primary : colors.grey}
                                            />
                                            <View style={styles.planTextContainer}>
                                                <Text style={styles.planName}>{plan.name}</Text>
                                                <Text style={styles.planDescription}>
                                                    {plan.description}
                                                </Text>
                                            </View>
                                            <Text style={styles.planPrice}>{prices.data?.[PLAN_STORE_PRODUCT_IDS[plan.id]] ? `${prices.data[PLAN_STORE_PRODUCT_IDS[plan.id]].price} / ${prices.data[PLAN_STORE_PRODUCT_IDS[plan.id]].interval}` : "Unavailable"}</Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>

                            <View style={styles.selectedPlanFeatures}>
                                <Text style={styles.selectedPlanTitle}>
                                    {MEMBERSHIP_PLANS.find((plan) => plan.id === selectedPlan)?.name} features
                                </Text>
                                {PLAN_FEATURES[selectedPlan].map((feature) => (
                                    <View key={feature} style={styles.selectedFeatureRow}>
                                        <Ionicons
                                            name="checkmark-circle"
                                            size={17}
                                            color={colors.primary}
                                        />
                                        <Text style={styles.selectedFeatureText}>{feature}</Text>
                                    </View>
                                ))}
                            </View>

<TouchableOpacity
                                style={styles.primaryButton}
                                onPress={handleUpgrade}
                                disabled={purchase.isPending || restore.isPending || membershipError || !prices.data?.[PLAN_STORE_PRODUCT_IDS[selectedPlan]]}
                                activeOpacity={0.8}
                            >
                                {purchase.isPending ? (
                                    <ActivityIndicator color="#FFF" />
                                ) : (
                                    <Text style={styles.primaryButtonText}>{prices.data?.[PLAN_STORE_PRODUCT_IDS[selectedPlan]] ? "Subscribe" : "Purchase unavailable"}</Text>
                                )}
                            </TouchableOpacity>
                            <Text style={styles.footnote}>
                                {isNativeBilling
                                    ? `Billed through your ${storeName} account. Renews automatically — cancel anytime in ${storeName}.`
                                    : PURCHASE_UNAVAILABLE_MESSAGE}
                            </Text>
                            {isNativeBilling && (
                                <TouchableOpacity
                                    onPress={handleRestore}
                                    disabled={restore.isPending || purchase.isPending}
                                    style={styles.restoreButton}
                                    activeOpacity={0.7}
                                >
                                    <Text style={styles.restoreText}>
                                        {restore.isPending
                                            ? "Restoring…"
                                            : "Restore purchases"}
                                    </Text>
                                </TouchableOpacity>
                            )}
                        </Animated.View>
                    )}
                    <SubscriptionDisclosure />
                </ScrollView>
            )}
        </View>
    );
}

const getStyles = (colors: ThemeColors) =>
    StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: colors.background,
        },
        centerContainer: {
            flex: 1,
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
        scrollContent: {
            width: "100%",
            maxWidth: 720,
            alignSelf: "center",
            paddingBottom: 48,
        },
        statusCard: {
            flexDirection: "row",
            alignItems: "center",
            marginHorizontal: 16,
            marginTop: 20,
            padding: 16,
            backgroundColor: colors.card,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: colors.border,
        },
        statusIconBg: {
            width: 48,
            height: 48,
            borderRadius: 14,
            backgroundColor: colors.surfaceVariant,
            justifyContent: "center",
            alignItems: "center",
            marginRight: 14,
        },
        statusTextContainer: {
            flex: 1,
        },
        statusTitle: {
            fontSize: 17,
            fontWeight: "700",
            color: colors.text,
            marginBottom: 2,
        },
        statusSubtitle: {
            fontSize: 13,
            color: colors.grey,
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
        card: {
            marginHorizontal: 16,
            backgroundColor: colors.card,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: colors.border,
            overflow: "hidden",
        },
        perkRow: {
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            paddingVertical: 14,
            paddingHorizontal: 16,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
        },
        perkText: {
            flex: 1,
            fontSize: 15,
            color: colors.text,
        },
        planRow: {
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            paddingVertical: 16,
            paddingHorizontal: 16,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
        },
        planTextContainer: {
            flex: 1,
        },
        planName: {
            fontSize: 16,
            fontWeight: "600",
            color: colors.text,
            marginBottom: 2,
        },
        planDescription: {
            fontSize: 13,
            color: colors.grey,
        },
        planPrice: {
            fontSize: 14,
            fontWeight: "700",
            color: colors.primary,
        },
        selectedPlanFeatures: {
            gap: 8,
            marginHorizontal: 16,
            marginTop: 16,
            padding: 14,
            borderRadius: 15,
            backgroundColor: colors.surfaceContainerLow,
            borderWidth: 1,
            borderColor: colors.outlineVariant,
        },
        selectedPlanTitle: {
            color: colors.text,
            fontSize: 14,
            fontWeight: "800",
            marginBottom: 2,
        },
        selectedFeatureRow: {
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
        },
        selectedFeatureText: {
            flex: 1,
            color: colors.onSurfaceVariant,
            fontSize: 12,
            lineHeight: 17,
            fontWeight: "600",
        },
        earlyAccessNotice: {
            flexDirection: "row",
            alignItems: "flex-start",
            gap: 9,
            marginHorizontal: 16,
            marginTop: 16,
            padding: 12,
            borderRadius: 13,
            backgroundColor: `${colors.tertiary}12`,
            borderWidth: 1,
            borderColor: `${colors.tertiary}40`,
        },
        earlyAccessText: {
            flex: 1,
            color: colors.onSurfaceVariant,
            fontSize: 12,
            lineHeight: 17,
            fontWeight: "600",
        },
        primaryButton: {
            marginHorizontal: 16,
            marginTop: 24,
            height: 50,
            borderRadius: 25,
            backgroundColor: colors.primary,
            justifyContent: "center",
            alignItems: "center",
        },
        primaryButtonText: {
            color: "#FFF",
            fontSize: 16,
            fontWeight: "700",
        },
        footnote: {
            marginTop: 12,
            marginHorizontal: 24,
            fontSize: 12,
            color: colors.grey,
            textAlign: "center",
            lineHeight: 17,
        },
        restoreButton: {
            marginTop: 16,
            alignSelf: "center",
            paddingVertical: 6,
            paddingHorizontal: 12,
        },
        restoreText: {
            fontSize: 14,
            fontWeight: "600",
            color: colors.primary,
        },
    });
