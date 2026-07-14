import { useMembership } from "@/api/memberships";
import { useColors, type ThemeColors } from "@/constants/theme";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

const MEMBERSHIP_ROUTE = "/(tabs)/profile/membership";

interface CuratorGateContentProps {
  /** Short feature name, e.g. "Price history". Used in the teaser copy. */
  feature: string;
  description?: string;
}

/**
 * Renders its `children` only for Curator members; free/Collector users see
 * an upgrade teaser in the same spot instead. Use in place of passive
 * Curator-only content (e.g. a price graph, a missing-items grid).
 */
export function CuratorInlineGate({
  feature,
  description,
  children,
}: CuratorGateContentProps & { children: React.ReactNode }) {
  const { data: membership, isLoading } = useMembership();
  const router = useRouter();
  const colors = useColors();
  const styles = getStyles(colors);

  if (isLoading) return null;
  if (membership?.isCurator) return <>{children}</>;

  return (
    <View style={styles.teaserCard}>
      <Ionicons name="ribbon" size={22} color={colors.tertiary} />
      <Text style={styles.teaserTitle}>{feature} is a Curator feature</Text>
      {description ? (
        <Text style={styles.teaserDescription}>{description}</Text>
      ) : null}
      <TouchableOpacity
        style={styles.teaserButton}
        onPress={() => router.push(MEMBERSHIP_ROUTE as any)}
        activeOpacity={0.8}
      >
        <Text style={styles.teaserButtonText}>Upgrade to Curator</Text>
      </TouchableOpacity>
    </View>
  );
}

interface CuratorGateModalProps extends CuratorGateContentProps {
  visible: boolean;
  onDismiss: () => void;
}

/**
 * Modal upsell for action-triggered Curator entry points (e.g. tapping
 * "Get shareable link" as a free/Collector user). Caller owns `visible`
 * state and should only show this after confirming `!isCurator`.
 */
export function CuratorGateModal({
  visible,
  feature,
  description,
  onDismiss,
}: CuratorGateModalProps) {
  const router = useRouter();
  const colors = useColors();
  const styles = getStyles(colors);

  const handleUpgrade = () => {
    onDismiss();
    router.push(MEMBERSHIP_ROUTE as any);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <Pressable style={styles.backdrop} onPress={onDismiss}>
        <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
          <View style={styles.modalIconBg}>
            <Ionicons name="ribbon" size={26} color={colors.tertiary} />
          </View>
          <Text style={styles.modalTitle}>{feature} is a Curator feature</Text>
          {description ? (
            <Text style={styles.modalDescription}>{description}</Text>
          ) : null}
          <TouchableOpacity
            style={styles.teaserButton}
            onPress={handleUpgrade}
            activeOpacity={0.8}
          >
            <Text style={styles.teaserButtonText}>Upgrade to Curator</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onDismiss} style={styles.dismissButton}>
            <Text style={styles.dismissButtonText}>Not now</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const getStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    teaserCard: {
      alignItems: "center",
      gap: 8,
      padding: 20,
      borderRadius: 16,
      backgroundColor: colors.surfaceContainer,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
    },
    teaserTitle: {
      color: colors.text,
      fontSize: 15,
      fontWeight: "700",
      textAlign: "center",
    },
    teaserDescription: {
      color: colors.onSurfaceVariant,
      fontSize: 13,
      textAlign: "center",
      lineHeight: 18,
    },
    teaserButton: {
      marginTop: 8,
      backgroundColor: colors.tertiary,
      borderRadius: 999,
      paddingHorizontal: 20,
      paddingVertical: 10,
    },
    teaserButtonText: {
      color: "#000",
      fontSize: 14,
      fontWeight: "800",
    },
    backdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.7)",
      justifyContent: "center",
      padding: 24,
    },
    modalCard: {
      alignItems: "center",
      gap: 8,
      padding: 24,
      borderRadius: 20,
      backgroundColor: colors.surfaceContainer,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
    },
    modalIconBg: {
      width: 52,
      height: 52,
      borderRadius: 16,
      backgroundColor: `${colors.tertiary}22`,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 4,
    },
    modalTitle: {
      color: colors.text,
      fontSize: 17,
      fontWeight: "700",
      textAlign: "center",
    },
    modalDescription: {
      color: colors.onSurfaceVariant,
      fontSize: 13,
      textAlign: "center",
      lineHeight: 18,
    },
    dismissButton: {
      marginTop: 4,
      padding: 8,
    },
    dismissButtonText: {
      color: colors.grey,
      fontSize: 14,
      fontWeight: "600",
    },
  });
