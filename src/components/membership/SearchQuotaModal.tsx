import { useRewardedAd } from "@/api/ads";
import { useGrantBonusSearches } from "@/api/scanning";
import { useColors, type ThemeColors } from "@/constants/theme";
import { useHaptics } from "@/hooks/useHaptics";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useMemo } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
} from "react-native";

/**
 * "Out of free searches" sheet shared by every search surface (product
 * search, Pokémon manual card search, Magic name search). Self-contained:
 * handles the rewarded ad, the bonus grant, and the upgrade navigation.
 */
export default function SearchQuotaModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const colors = useColors();
  const router = useRouter();
  const haptics = useHaptics();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const rewardedAd = useRewardedAd();
  const grantBonusSearches = useGrantBonusSearches();

  const handleWatchAd = async () => {
    const result = await rewardedAd.show();
    if (result === "earned") {
      await grantBonusSearches.mutateAsync(5);
      await haptics.success();
      onClose();
    }
  };

  const isBusy = rewardedAd.isLoading || grantBonusSearches.isPending;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={(event) => event.stopPropagation()}>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close membership popup"
            hitSlop={8}
          >
            <Ionicons name="close" size={20} color={colors.onSurfaceVariant} />
          </TouchableOpacity>
          <Ionicons name="search-outline" size={28} color={colors.tertiary} />
          <Text style={styles.title}>Out of free searches for today</Text>
          <Text style={styles.description}>
            Free accounts get 15 searches a day across the whole app. Watch a
            short ad for 5 more, or upgrade to Curator for unlimited searches.
          </Text>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleWatchAd}
            disabled={isBusy}
          >
            {isBusy ? (
              <ActivityIndicator color="#000" size="small" />
            ) : (
              <Text style={styles.primaryButtonText}>Watch ad for +5 searches</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => {
              onClose();
              router.push("/(tabs)/profile/membership" as any);
            }}
          >
            <Text style={styles.secondaryButtonText}>Upgrade to Curator</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.dismissText}>Not now</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function getStyles(colors: ThemeColors) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.7)",
      justifyContent: "center",
      padding: 24,
    },
    card: {
      alignItems: "center",
      gap: 8,
      padding: 24,
      borderRadius: 20,
      backgroundColor: colors.surfaceContainerHighest,
    },
    closeButton: {
      position: "absolute",
      top: 12,
      right: 12,
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surfaceContainerHigh,
      zIndex: 1,
    },
    title: {
      color: colors.text,
      fontSize: 17,
      fontWeight: "700",
      textAlign: "center",
    },
    description: {
      color: colors.onSurfaceVariant,
      fontSize: 13,
      textAlign: "center",
      lineHeight: 18,
    },
    primaryButton: {
      marginTop: 8,
      backgroundColor: colors.tertiary,
      borderRadius: 999,
      paddingHorizontal: 20,
      paddingVertical: 12,
      minWidth: 200,
      alignItems: "center",
    },
    primaryButtonText: { color: "#000", fontSize: 14, fontWeight: "800" },
    secondaryButton: {
      marginTop: 4,
      backgroundColor: colors.primary,
      borderRadius: 999,
      paddingHorizontal: 20,
      paddingVertical: 12,
      minWidth: 200,
      alignItems: "center",
    },
    secondaryButtonText: { color: "#FFF", fontSize: 14, fontWeight: "800" },
    dismissText: {
      marginTop: 4,
      padding: 8,
      color: colors.grey,
      fontSize: 13,
      fontWeight: "600",
    },
  });
}
