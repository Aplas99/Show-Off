import {
    FREE_TIER_LIMITS,
    FREE_TIER_NAME,
    MEMBERSHIP_PLANS,
    useMembership,
    useOpenBillingPortal,
    useStartCheckout,
    type MembershipPlanId,
} from "@/api/memberships";
import { useColors, type ThemeColors } from "@/constants/theme";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
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

const FREE_PLAN_LIMITS = [
    { icon: "albums-outline", label: `Up to ${FREE_TIER_LIMITS.maxItems} items` },
    { icon: "layers-outline", label: `${FREE_TIER_LIMITS.maxShowcases} showcase` },
    { icon: "scan-outline", label: "10 card scans / day (watch an ad for more)" },
] as const;

const CURATOR_PERKS = [
    { icon: "infinite-outline", label: "Unlimited items & showcases" },
    { icon: "cloud-upload-outline", label: "200MB image uploads (vs 5MB free)" },
    {
        icon: "flash-outline",
        label:
            "Faster, more accurate card recognition — our upgraded scan pipeline finds cards phones normally struggle with",
    },
    { icon: "infinite-outline", label: "Unlimited daily scans, no ads" },
    { icon: "stats-chart-outline", label: "Price history for your collection" },
    { icon: "share-social-outline", label: "Sharable public showcase links" },
    { icon: "ribbon-outline", label: "Curator badge & showcase customization" },
    { icon: "list-outline", label: "Missing-items tracking per set" },
] as const;

export default function MembershipScreen() {
    const colors = useColors();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const styles = getStyles(colors);

    const { data: membership, isLoading } = useMembership();
    const startCheckout = useStartCheckout();
    const openPortal = useOpenBillingPortal();
    const [selectedPlan, setSelectedPlan] =
        useState<MembershipPlanId>("curator_monthly");

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
            await startCheckout.mutateAsync(selectedPlan);
        } catch (error: any) {
            Alert.alert(
                "Checkout unavailable",
                error?.message ?? "Could not start checkout. Please try again.",
            );
        }
    };

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
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                >
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
                            <Text style={styles.sectionTitle}>Curator Perks</Text>
                        </View>
                        <View style={styles.card}>
                            {CURATOR_PERKS.map((perk, index) => (
                                <View
                                    key={perk.label}
                                    style={[
                                        styles.perkRow,
                                        index === CURATOR_PERKS.length - 1 && {
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
                                disabled={openPortal.isPending}
                                activeOpacity={0.8}
                            >
                                {openPortal.isPending ? (
                                    <ActivityIndicator color="#FFF" />
                                ) : (
                                    <Text style={styles.primaryButtonText}>Manage Billing</Text>
                                )}
                            </TouchableOpacity>
                            <Text style={styles.footnote}>
                                Update your payment method, switch plans, or cancel via the
                                Stripe billing portal.
                            </Text>
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
                                            <Text style={styles.planPrice}>{plan.priceLabel}</Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>

                            <TouchableOpacity
                                style={styles.primaryButton}
                                onPress={handleUpgrade}
                                disabled={startCheckout.isPending}
                                activeOpacity={0.8}
                            >
                                {startCheckout.isPending ? (
                                    <ActivityIndicator color="#FFF" />
                                ) : (
                                    <Text style={styles.primaryButtonText}>Upgrade</Text>
                                )}
                            </TouchableOpacity>
                            <Text style={styles.footnote}>
                                Secure checkout powered by Stripe. Membership renews
                                automatically and can be cancelled anytime.
                            </Text>
                        </Animated.View>
                    )}
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
    });
