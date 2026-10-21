import SubscriptionDisclosure from "@/src/components/membership/SubscriptionDisclosure";
import {
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
import { useColors, type ThemeColors } from "@/constants/theme";
import { showMessage } from "@/lib/dialogs";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const MEMBER_PERKS = [
  { icon: "infinite-outline", label: "Unlimited Showcases" },
  { icon: "scan-outline", label: "Unlimited Card Scans" },
  { icon: "stats-chart-outline", label: "Price history" },
  { icon: "extension-puzzle-outline", label: "Set tracking" },
  { icon: "color-palette-outline", label: "Customize" },
  { icon: "ban-outline", label: "No ads" },
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

type MembershipModalProps = {
  visible: boolean;
  onClose: () => void;
  displayName: string;
};

export default function MembershipModal({
  visible,
  onClose,
  displayName,
}: MembershipModalProps) {
  const colors = useColors();
  const styles = getStyles(colors);
  const insets = useSafeAreaInsets();
  const { data: membership, isLoading, isError: membershipError, refetch: refetchMembership } = useMembership();
  const purchase = usePurchaseMembership();
  const manage = useManageMembership();
  const restore = useRestorePurchases();
  const prices = useMembershipPrices(visible);
  const [selectedPlan, setSelectedPlan] =
    useState<MembershipPlanId>("curator_monthly");

  const isPaidUser = membership?.isPaidUser ?? false;
  const selectedPlanDetails = MEMBERSHIP_PLANS.find(
    (plan) => plan.id === selectedPlan,
  );
  const isNativeBilling = getActiveBillingProvider() === "revenuecat";
  const storeName = Platform.OS === "ios" ? "the App Store" : "Google Play";

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
    } catch (error: unknown) {
      showMessage(
        "Purchase unavailable",
        error instanceof Error
          ? error.message
          : "Could not start the purchase. Please try again.",
      );
    }
  };

  const handleManage = async () => {
    try {
      await manage.mutateAsync(membership?.subscription?.provider);
    } catch (error: unknown) {
      showMessage(
        "Subscription management unavailable",
        error instanceof Error
          ? error.message
          : "Could not open subscription management.",
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
          : `No active membership was found on your ${storeName} account.`,
      );
    } catch (error: unknown) {
      showMessage(
        "Restore failed",
        error instanceof Error ? error.message : "Please try again.",
      );
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityLabel="Close membership modal"
        />
        <View
          style={[
            styles.sheet,
            { paddingBottom: Math.max(insets.bottom, 16) },
          ]}
        >
          <View style={styles.header}>
            <View style={styles.headerSpacer} />
            <Text style={styles.headerTitle}>Membership</Text>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close membership modal"
            >
              <Ionicons name="close" size={22} color={colors.text} />
            </TouchableOpacity>
          </View>

          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : (
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.scrollContent}
            >
              <LinearGradient
                colors={[colors.primaryContainer, colors.primary, "#7587FF"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.memberCard}
              >
                <View style={styles.memberIcon}>
                  <Ionicons name="person" size={22} color={colors.primary} />
                </View>
                <View style={styles.memberCopy}>
                  <Text style={styles.memberName} numberOfLines={1}>
                    {displayName}
                  </Text>
                  <Text style={styles.memberType}>
                    {membership?.isFoundingCurator
                      ? "Founding Curator"
                      : isPaidUser
                        ? "Curator Member"
                        : "Collector Member"}
                  </Text>
                </View>
                <View style={styles.badgeIcon}>
                  <Ionicons name="ribbon" size={26} color="#FFFFFF" />
                </View>
              </LinearGradient>


              {membershipError && <Text style={{ color: colors.text }} onPress={() => void refetchMembership()}>Unable to check your membership. Tap to retry before purchasing.</Text>}
              {!isNativeBilling && <Text style={{ color: colors.text }}>{PURCHASE_UNAVAILABLE_MESSAGE}</Text>}
              {isNativeBilling && <TouchableOpacity onPress={() => void prices.refetch()} disabled={prices.isFetching} accessibilityRole="button">
                <Text style={{ color: colors.primary, paddingVertical: 12 }}>{prices.isFetching ? "Loading store prices..." : prices.isError ? "Prices unavailable. Tap to retry." : "Refresh store prices"}</Text>
              </TouchableOpacity>}

              {!isPaidUser && (
                <>
                  <Text style={styles.sectionTitle}>Choose your plan</Text>
                  <View style={styles.planRow}>
                    {MEMBERSHIP_PLANS.map((plan) => {
                      const selected = selectedPlan === plan.id;
                      return (
                        <TouchableOpacity
                          key={plan.id}
                          style={[styles.planCard, selected && styles.selectedPlan]}
                          onPress={() => setSelectedPlan(plan.id)}
                          activeOpacity={0.8}
                        >
                          {plan.id === "curator_monthly" && (
                            <View style={styles.popularPill}>
                              <Text style={styles.popularText}>POPULAR</Text>
                            </View>
                          )}
                          <Ionicons
                            name={selected ? "radio-button-on" : "radio-button-off"}
                            size={18}
                            color={selected ? colors.primary : colors.grey}
                          />
                          <Text style={styles.planName} numberOfLines={2}>
                            {plan.name}
                          </Text>
                          <Text style={styles.planPrice}>{prices.data?.[PLAN_STORE_PRODUCT_IDS[plan.id]] ? `${prices.data[PLAN_STORE_PRODUCT_IDS[plan.id]].price} / ${prices.data[PLAN_STORE_PRODUCT_IDS[plan.id]].interval}` : "Unavailable"}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <View style={styles.selectedPlanFeatures}>
                    <Text style={styles.selectedPlanTitle}>
                      {selectedPlanDetails?.name} features
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
                    activeOpacity={0.85}
                  >
                    {purchase.isPending ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <Text style={styles.primaryButtonText}>{prices.data?.[PLAN_STORE_PRODUCT_IDS[selectedPlan]] ? "Subscribe" : "Purchase unavailable"}</Text>
                    )}
                  </TouchableOpacity>


                </>
              )}

              <Text style={styles.sectionTitle}>Curator features</Text>
              <View style={styles.perksGrid}>
                {MEMBER_PERKS.map((perk) => (
                  <View key={perk.label} style={styles.perkItem}>
                    <View style={styles.perkIcon}>
                      <Ionicons
                        name={perk.icon}
                        size={22}
                        color={colors.primary}
                      />
                    </View>
                    <Text style={styles.perkLabel}>{perk.label}</Text>
                  </View>
                ))}
              </View>

              {isPaidUser && (
                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={handleManage}
                  disabled={manage.isPending}
                  activeOpacity={0.85}
                >
                  {manage.isPending ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.primaryButtonText}>
                      Manage membership
                    </Text>
                  )}
                </TouchableOpacity>
              )}

              {isNativeBilling && (
                <TouchableOpacity
                  style={styles.restoreButton}
                  onPress={handleRestore}
                  disabled={restore.isPending || purchase.isPending}
                >
                  <Text style={styles.restoreText}>
                    {restore.isPending ? "Restoring..." : "Restore purchases"}
                  </Text>
                </TouchableOpacity>
              )}
              <SubscriptionDisclosure onOpenPolicy={onClose} />
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const getStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      justifyContent: "flex-end",
      backgroundColor: "rgba(0,0,0,0.55)",
    },
    sheet: {
      maxHeight: "92%",
      backgroundColor: colors.background,
      borderTopLeftRadius: 30,
      borderTopRightRadius: 30,
      overflow: "hidden",
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 18,
      paddingVertical: 16,
    },
    headerSpacer: {
      width: 38,
    },
    headerTitle: {
      color: colors.text,
      fontSize: 18,
      fontWeight: "800",
    },
    closeButton: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surfaceContainerHigh,
    },
    loadingContainer: {
      height: 360,
      alignItems: "center",
      justifyContent: "center",
    },
    scrollContent: {
      paddingHorizontal: 18,
      paddingBottom: 20,
    },
    memberCard: {
      minHeight: 104,
      borderRadius: 22,
      padding: 18,
      flexDirection: "row",
      alignItems: "center",
    },
    memberIcon: {
      width: 48,
      height: 48,
      borderRadius: 24,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(255,255,255,0.9)",
    },
    memberCopy: {
      flex: 1,
      marginHorizontal: 12,
    },
    memberName: {
      color: "#FFFFFF",
      fontSize: 17,
      fontWeight: "800",
    },
    memberType: {
      color: "rgba(255,255,255,0.82)",
      fontSize: 13,
      marginTop: 3,
    },
    badgeIcon: {
      width: 48,
      height: 48,
      borderRadius: 24,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.65)",
      backgroundColor: "rgba(255,255,255,0.16)",
    },
    sectionTitle: {
      color: colors.text,
      fontSize: 15,
      fontWeight: "800",
      marginTop: 24,
      marginBottom: 12,
    },
    planRow: {
      flexDirection: "row",
      gap: 8,
    },
    planCard: {
      flex: 1,
      minHeight: 120,
      paddingHorizontal: 8,
      paddingVertical: 12,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      alignItems: "center",
      justifyContent: "space-between",
    },
    selectedPlan: {
      borderColor: colors.primary,
      backgroundColor: `${colors.primary}12`,
    },
    popularPill: {
      position: "absolute",
      top: -9,
      borderRadius: 8,
      paddingHorizontal: 7,
      paddingVertical: 3,
      backgroundColor: colors.tertiary,
    },
    popularText: {
      color: "#1A1A1A",
      fontSize: 10,
      fontWeight: "900",
    },
    planName: {
      color: colors.text,
      fontSize: 12,
      lineHeight: 15,
      fontWeight: "700",
      textAlign: "center",
    },
    planPrice: {
      color: colors.primary,
      fontSize: 12,
      fontWeight: "800",
      textAlign: "center",
    },
    selectedPlanFeatures: {
      gap: 8,
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
      minHeight: 52,
      borderRadius: 26,
      marginTop: 22,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.primary,
    },
    primaryButtonText: {
      color: "#FFFFFF",
      fontSize: 16,
      fontWeight: "800",
    },
    perksGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      rowGap: 18,
    },
    perkItem: {
      width: "33.333%",
      alignItems: "center",
    },
    perkIcon: {
      width: 44,
      height: 44,
      borderRadius: 13,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: `${colors.primary}14`,
      borderWidth: 1,
      borderColor: `${colors.primary}35`,
    },
    perkLabel: {
      color: colors.onSurfaceVariant,
      fontSize: 11,
      fontWeight: "600",
      marginTop: 7,
      textAlign: "center",
    },
    refreshButton: {
      alignSelf: "center",
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
      paddingHorizontal: 16,
      paddingVertical: 12,
      marginTop: 8,
    },
    refreshText: {
      color: colors.primary,
      fontSize: 13,
      fontWeight: "700",
    },
    restoreButton: {
      alignSelf: "center",
      paddingHorizontal: 16,
      paddingVertical: 12,
      marginTop: 8,
    },
    restoreText: {
      color: colors.primary,
      fontSize: 14,
      fontWeight: "700",
    },
  });
