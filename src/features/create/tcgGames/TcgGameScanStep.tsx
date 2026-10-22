import { useRewardedAd } from "@/api/ads";
import { refreshMembershipAccess, useMembership } from "@/api/memberships";
import {
  useGrantBonusScans,
  useRecordScanAttempt,
  useScanQuotaStatus,
} from "@/api/scanning";
import type { ShowcaseRow } from "@/api/showcase";
import type { TcgCard } from "@/api/tcg";
import { getInstaScanFailureMessage, recognizeTextWithInstaScan } from "@/api/tcg/enhancedOcr";
import { identifyTcgCardImage } from "@/api/tcg/scan";
import { getTcgGameName, type TcgGameCode } from "@/constants/tcgGames";
import { GAME_BRAND_COLORS, type ThemeColors } from "@/constants/theme";
import { useHaptics } from "@/hooks/useHaptics";
import { useScannerPrefsStore } from "@/hooks/useScannerPrefsStore";
import { createActionLogger } from "@/lib/actionDebug";
import { Image } from "@/src/components/media/ProtectedImage";
import { TcgScannerTools } from "@/src/features/create/tcg/TcgScannerTools";
import { Ionicons } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useRouter } from "expo-router";
import React, { useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const tcgScanUiDebug = createActionLogger("TcgScan");

/** "Set • #OP01-003 • Leader" line for match candidates. */
function describeCard(card: TcgCard) {
  return [card.set_name ?? card.set_code, card.card_number ? `#${card.card_number}` : null, card.rarity]
    .filter(Boolean)
    .join(" • ");
}

/**
 * Camera scan for the shared-pipeline games: photograph one card, OCR its
 * name and printed code, and confirm the match. Same flow, quota and
 * InstaScan tools as the Riftbound scanner; search is the backup.
 */
export function TcgGameScanStep({
  game,
  showcase,
  count,
  onBack,
  onAddCard,
  onSearch,
  onOpenQueue,
  colors,
}: {
  game: TcgGameCode;
  showcase: ShowcaseRow;
  count: number;
  onBack: () => void;
  onAddCard: (card: TcgCard) => Promise<void>;
  onSearch: () => void;
  onOpenQueue: () => void;
  colors: ThemeColors;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const captureInProgress = useRef(false);
  const [isReady, setIsReady] = useState(false);
  const [isIdentifying, setIsIdentifying] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [lastAdded, setLastAdded] = useState<TcgCard | null>(null);
  const [matchCandidates, setMatchCandidates] = useState<TcgCard[] | null>(null);
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  const torchOn = useScannerPrefsStore((state) => state.torch);
  const toggleScannerPref = useScannerPrefsStore((state) => state.toggle);
  const { data: membership } = useMembership();
  const isCurator = membership?.isCurator ?? false;
  const { data: quotaStatus } = useScanQuotaStatus();
  const recordScanAttempt = useRecordScanAttempt();
  const grantBonusScans = useGrantBonusScans();
  const rewardedAd = useRewardedAd();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const haptics = useHaptics();
  const queryClient = useQueryClient();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const brand = GAME_BRAND_COLORS[game];
  const gameName = getTcgGameName(game);
  // Every supported game uses the standard 63mm × 88mm card size.
  const frameWidth = Math.min(width * 0.7, 320, Math.max(150, (height - 400) * (63 / 88)));
  const frameHeight = frameWidth * (88 / 63);

  const handleWatchAdForBonusScans = async () => {
    const result = await rewardedAd.show();
    if (result === "earned") {
      await grantBonusScans.mutateAsync(5);
      await haptics.success();
      setQuotaExceeded(false);
    }
  };

  const capture = async (mode: "standard" | "enhanced" = "standard") => {
    if (!cameraRef.current || !isReady || captureInProgress.current) return;
    captureInProgress.current = true;

    if (!isCurator) {
      try {
        const quota = await recordScanAttempt.mutateAsync();
        if (!quota.allowed) {
          await haptics.error();
          setQuotaExceeded(true);
          captureInProgress.current = false;
          return;
        }
      } catch {
        // Fail open on a quota-check error — don't block scanning over
        // a transient network hiccup.
      }
    }

    setIsIdentifying(true);
    setScanError(null);
    setLastAdded(null);

    try {
      if (mode === "enhanced") {
        const access = await refreshMembershipAccess(queryClient);
        if (!access.isCurator) throw new Error("InstaScan requires Curator membership.");
      }
      await haptics.medium();
      const picture = await cameraRef.current.takePictureAsync({ quality: 0.8 });
      if (!picture?.uri) throw new Error("Camera did not return an image");

      const matches = await identifyTcgCardImage(
        game,
        picture.uri,
        mode === "enhanced" ? { recognizeText: recognizeTextWithInstaScan } : {},
      );
      if (matches.length === 0) {
        setScanError(
          mode === "enhanced"
            ? "InstaScan found no matching card. Try another photo or search by name."
            : "Couldn't read that card. Keep the name and card number in focus, or search instead.",
        );
        await haptics.error();
        return;
      }
      setMatchCandidates(matches);
      await haptics.success();
    } catch (caught) {
      tcgScanUiDebug.error("scan.capture-failed", caught);
      setScanError(mode === "enhanced"
        ? getInstaScanFailureMessage(caught)
        : caught instanceof Error && /busy|limit|development build/i.test(caught.message)
          ? caught.message
          : "Couldn't scan that card. Please try again.");
      await haptics.error();
    } finally {
      setIsIdentifying(false);
      captureInProgress.current = false;
    }
  };

  const confirmMatch = async (card: TcgCard) => {
    setMatchCandidates(null);
    setLastAdded(card);
    await onAddCard(card);
  };

  if (!permission?.granted) {
    return (
      <View style={[styles.permissionPage, { paddingTop: insets.top + 20 }]}>
        <Ionicons name="camera-outline" size={56} color={colors.primary} />
        <Text style={styles.permissionTitle}>Camera access required</Text>
        <Text style={styles.permissionDescription}>
          Show Off needs the camera to identify {gameName} cards.
        </Text>
        <TouchableOpacity style={styles.primaryButton} onPress={requestPermission}>
          <Text style={styles.primaryButtonText}>Allow camera</Text>
        </TouchableOpacity>
        <View style={styles.inlineActions}>
          <TouchableOpacity style={styles.secondaryButton} onPress={onBack}>
            <Text style={styles.secondaryButtonText}>Back</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={onSearch}>
            <Text style={styles.secondaryButtonText}>Search by name</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.cameraPage}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="back"
        ratio="4:3"
        enableTorch={torchOn}
        onCameraReady={() => setIsReady(true)}
      />
      <View style={styles.cameraShade} pointerEvents="none" />

      <View style={[styles.cameraHeader, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={styles.cameraIconButton} onPress={onBack}>
          <Ionicons name="close" size={24} color="#FFF" />
        </TouchableOpacity>
        <View style={styles.cameraDestination}>
          <Text style={[styles.cameraDestinationLabel, { color: brand.accent }]}>
            {gameName.toUpperCase()} · ADDING TO
          </Text>
          <Text style={styles.cameraDestinationName} numberOfLines={1}>
            {showcase.name}
          </Text>
        </View>
        <TouchableOpacity style={styles.queueButton} onPress={onOpenQueue} disabled={count === 0}>
          <Text style={styles.queueCount}>{count}</Text>
          <Ionicons name="layers" size={18} color="#FFF" />
        </TouchableOpacity>
      </View>

      {!isCurator && quotaStatus?.remaining != null && (
        <View style={styles.scanQuotaPill} pointerEvents="none">
          <Ionicons name="scan-outline" size={12} color="#FFF" />
          <Text style={styles.scanQuotaPillText}>
            {quotaStatus.remaining} scan{quotaStatus.remaining === 1 ? "" : "s"} left today
          </Text>
        </View>
      )}

      <View style={styles.scannerCenter} pointerEvents="box-none">
        <View style={[styles.cardFrame, { width: frameWidth, height: frameHeight, borderColor: brand.accent }]}>
          {isIdentifying && (
            <View style={styles.identifyingOverlay} pointerEvents="none">
              <View style={styles.identifyingStatus}>
                <ActivityIndicator color="#FFF" size="small" />
                <Text style={styles.identifyingText}>Reading card...</Text>
              </View>
            </View>
          )}
        </View>
        <Text style={styles.scannerHint}>
          Fill the frame with one card. Keep its name and card number in focus.
        </Text>
        <TcgScannerTools
          colors={colors}
          torchOn={torchOn}
          onToggleTorch={() => toggleScannerPref("torch")}
          isCurator={isCurator}
          isBusy={!isReady || isIdentifying}
          onInstaScan={() => capture("enhanced")}
        />
        {scanError && (
          <Animated.View entering={FadeIn} style={styles.scanMessageError}>
            <Ionicons name="alert-circle" size={18} color="#FFF" />
            <Text style={styles.scanMessageText}>{scanError}</Text>
          </Animated.View>
        )}
        {lastAdded && (
          <Animated.View entering={FadeIn} style={styles.scanMessageSuccess}>
            <Ionicons name="checkmark-circle" size={18} color="#FFF" />
            <Text style={styles.scanMessageText} numberOfLines={1}>
              Added {lastAdded.name}. Scan the next card.
            </Text>
          </Animated.View>
        )}
      </View>

      <View style={[styles.cameraControls, { paddingBottom: insets.bottom + 18 }]}>
        <TouchableOpacity
          style={[styles.searchControlButton, { backgroundColor: brand.accent, shadowColor: brand.accent }]}
          onPress={onSearch}
          accessibilityLabel="Search for a card by name or number"
        >
          <View style={styles.searchControlIcon}>
            <Ionicons name="search" size={16} color={brand.onAccent} />
          </View>
          <Text style={[styles.searchControlText, { color: brand.onAccent }]}>Search</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.shutterOuter, (!isReady || isIdentifying) && styles.disabled]}
          onPress={() => capture("standard")}
          disabled={!isReady || isIdentifying}
          accessibilityLabel={`Capture and identify ${gameName} card`}
        >
          <View style={styles.shutterInner} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.cameraSideButton, count === 0 && styles.invisible]}
          onPress={onOpenQueue}
          disabled={count === 0}
        >
          <Text style={styles.cameraSideButtonText}>Review</Text>
          <Ionicons name="arrow-forward" size={18} color="#FFF" />
        </TouchableOpacity>
      </View>

      {/* Match confirmation */}
      <Modal
        visible={!!matchCandidates}
        transparent
        animationType="fade"
        onRequestClose={() => setMatchCandidates(null)}
      >
        <View style={[styles.matchBackdrop, { paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.matchSheet}>
            <View style={styles.matchHeader}>
              <View style={styles.flex}>
                <Text style={styles.modalTitle}>Confirm the card</Text>
                <Text style={styles.modalSubtitle}>
                  Pick the closest match, or try another photo.
                </Text>
              </View>
              <TouchableOpacity style={styles.backButton} onPress={() => setMatchCandidates(null)}>
                <Ionicons name="close" size={22} color={colors.text} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={matchCandidates ?? []}
              keyExtractor={(card) => card.id}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.candidateCard} onPress={() => confirmMatch(item)}>
                  {item.image_url ? (
                    <Image source={{ uri: item.image_url }} style={styles.candidateImage} contentFit="cover" />
                  ) : (
                    <View style={[styles.candidateImage, styles.missingCardImage]}>
                      <Ionicons name="image-outline" size={22} color={colors.grey} />
                    </View>
                  )}
                  <View style={styles.flex}>
                    <Text style={styles.reviewTitle} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.reviewMeta} numberOfLines={2}>{describeCard(item)}</Text>
                  </View>
                  <Ionicons name="add-circle" size={25} color={colors.primary} />
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* Free-tier quota exceeded */}
      <Modal
        visible={quotaExceeded}
        transparent
        animationType="fade"
        onRequestClose={() => setQuotaExceeded(false)}
      >
        <Pressable style={styles.quotaBackdrop} onPress={() => setQuotaExceeded(false)}>
          <Pressable style={styles.quotaCard} onPress={(event) => event.stopPropagation()}>
            <TouchableOpacity
              style={styles.quotaCloseButton}
              onPress={() => setQuotaExceeded(false)}
              accessibilityRole="button"
              accessibilityLabel="Close membership popup"
              hitSlop={8}
            >
              <Ionicons name="close" size={20} color={colors.onSurfaceVariant} />
            </TouchableOpacity>
            <Ionicons name="hourglass-outline" size={28} color={colors.tertiary} />
            <Text style={styles.quotaTitle}>Out of free scans for today</Text>
            <Text style={styles.quotaDescription}>
              Free accounts get 10 card scans a day. Watch a short ad for 5
              more, or upgrade to Curator for unlimited scans.
            </Text>
            <TouchableOpacity
              style={styles.quotaPrimaryButton}
              onPress={handleWatchAdForBonusScans}
              disabled={!rewardedAd.isAvailable || rewardedAd.isLoading || grantBonusScans.isPending}
            >
              {rewardedAd.isLoading || grantBonusScans.isPending ? (
                <ActivityIndicator color="#000" size="small" />
              ) : (
                <Text style={styles.quotaPrimaryButtonText}>
                  {rewardedAd.isAvailable ? "Watch ad for +5 scans" : "Rewarded ads unavailable"}
                </Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.quotaSecondaryButton}
              onPress={() => {
                setQuotaExceeded(false);
                router.push("/(tabs)/profile/membership" as never);
              }}
            >
              <Text style={styles.quotaSecondaryButtonText}>Upgrade to Curator</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setQuotaExceeded(false)}>
              <Text style={styles.quotaDismissText}>Not now</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function getStyles(colors: ThemeColors) {
  return StyleSheet.create({
    flex: { flex: 1 },
    disabled: { opacity: 0.45 },
    invisible: { opacity: 0 },
    permissionPage: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: 16,
      padding: 28,
      backgroundColor: colors.background,
    },
    permissionTitle: { color: colors.text, fontSize: 24, fontWeight: "800", textAlign: "center" },
    permissionDescription: {
      color: colors.onSurfaceVariant,
      fontSize: 14,
      lineHeight: 21,
      textAlign: "center",
    },
    primaryButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingVertical: 15,
      paddingHorizontal: 28,
      borderRadius: 14,
      backgroundColor: colors.primary,
    },
    primaryButtonText: { color: "#000", fontWeight: "800", fontSize: 15 },
    inlineActions: { flexDirection: "row", gap: 10 },
    secondaryButton: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderRadius: 12,
      backgroundColor: colors.surfaceContainerHighest,
    },
    secondaryButtonText: { color: colors.text, fontWeight: "700" },
    cameraPage: { flex: 1, backgroundColor: "#000" },
    cameraShade: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.18)" },
    cameraHeader: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      zIndex: 2,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingHorizontal: 16,
      paddingBottom: 12,
    },
    cameraIconButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(0,0,0,0.58)",
    },
    cameraDestination: { flex: 1, alignItems: "center" },
    cameraDestinationLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 1.4 },
    cameraDestinationName: { color: "#FFF", fontSize: 15, fontWeight: "700", maxWidth: 210 },
    queueButton: {
      minWidth: 48,
      height: 44,
      borderRadius: 22,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 5,
      paddingHorizontal: 11,
      backgroundColor: "rgba(0,0,0,0.58)",
    },
    queueCount: { color: "#FFF", fontSize: 14, fontWeight: "800", fontVariant: ["tabular-nums"] },
    scanQuotaPill: {
      position: "absolute",
      top: 108,
      zIndex: 2,
      alignSelf: "center",
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
      backgroundColor: "rgba(0,0,0,0.55)",
    },
    scanQuotaPillText: { color: "#FFF", fontSize: 11, fontWeight: "700" },
    scannerCenter: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 24,
      paddingTop: 88,
      paddingBottom: 115,
    },
    cardFrame: { borderRadius: 22, borderWidth: 2, overflow: "hidden" },
    identifyingOverlay: {
      ...StyleSheet.absoluteFillObject,
      alignItems: "center",
      justifyContent: "flex-end",
      paddingBottom: 16,
      backgroundColor: "rgba(0,0,0,0.15)",
    },
    identifyingStatus: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 20,
      backgroundColor: "rgba(0,0,0,0.6)",
    },
    identifyingText: { color: "#FFF", fontSize: 14, fontWeight: "700" },
    scannerHint: {
      color: "rgba(255,255,255,0.84)",
      fontSize: 13,
      textAlign: "center",
      marginTop: 12,
    },
    scanMessageError: {
      maxWidth: 340,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 14,
      paddingVertical: 10,
      marginTop: 14,
      borderRadius: 14,
      backgroundColor: "rgba(190,30,55,0.88)",
    },
    scanMessageText: { flex: 1, color: "#FFF", fontSize: 12, fontWeight: "600" },
    scanMessageSuccess: {
      maxWidth: 340,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 14,
      paddingVertical: 10,
      marginTop: 14,
      borderRadius: 14,
      backgroundColor: "rgba(22,125,70,0.9)",
    },
    cameraControls: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 28,
      paddingTop: 18,
      backgroundColor: "rgba(0,0,0,0.32)",
    },
    searchControlButton: {
      minWidth: 96,
      height: 46,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 7,
      paddingHorizontal: 13,
      borderRadius: 23,
      borderWidth: 1.5,
      borderColor: "rgba(255,255,255,0.55)",
      shadowOpacity: 0.55,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 0 },
      elevation: 8,
    },
    searchControlIcon: {
      width: 26,
      height: 26,
      borderRadius: 13,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(255,255,255,0.42)",
    },
    searchControlText: { fontSize: 13, fontWeight: "800" },
    shutterOuter: {
      width: 78,
      height: 78,
      borderRadius: 39,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 4,
      borderColor: "#FFF",
    },
    shutterInner: { width: 62, height: 62, borderRadius: 31, backgroundColor: "#FFF" },
    cameraSideButton: {
      width: 88,
      height: 46,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 5,
      borderRadius: 23,
      backgroundColor: "rgba(0,0,0,0.62)",
    },
    cameraSideButtonText: { color: "#FFF", fontSize: 12, fontWeight: "700" },
    matchBackdrop: {
      flex: 1,
      justifyContent: "flex-end",
      padding: 12,
      backgroundColor: "rgba(0,0,0,0.6)",
    },
    matchSheet: {
      maxHeight: "78%",
      gap: 12,
      padding: 18,
      borderRadius: 26,
      backgroundColor: colors.background,
    },
    matchHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
    modalTitle: { color: colors.text, fontSize: 18, fontWeight: "800" },
    modalSubtitle: { color: colors.onSurfaceVariant, fontSize: 13, marginTop: 2 },
    backButton: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surfaceContainerHighest,
    },
    candidateCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      padding: 10,
      marginBottom: 10,
      borderRadius: 14,
      backgroundColor: colors.surfaceContainerHighest,
    },
    candidateImage: { width: 48, height: 67, borderRadius: 6 },
    missingCardImage: { alignItems: "center", justifyContent: "center" },
    reviewTitle: { color: colors.text, fontSize: 14, fontWeight: "700" },
    reviewMeta: { color: colors.onSurfaceVariant, fontSize: 12, marginTop: 1 },
    quotaBackdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.7)",
      justifyContent: "center",
      padding: 24,
    },
    quotaCard: {
      alignItems: "center",
      gap: 8,
      padding: 24,
      borderRadius: 20,
      backgroundColor: colors.surfaceContainerHighest,
    },
    quotaCloseButton: {
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
    quotaTitle: { color: colors.text, fontSize: 17, fontWeight: "700", textAlign: "center" },
    quotaDescription: {
      color: colors.onSurfaceVariant,
      fontSize: 13,
      textAlign: "center",
      lineHeight: 18,
    },
    quotaPrimaryButton: {
      marginTop: 8,
      backgroundColor: colors.tertiary,
      borderRadius: 999,
      paddingHorizontal: 20,
      paddingVertical: 12,
      minWidth: 200,
      alignItems: "center",
    },
    quotaPrimaryButtonText: { color: "#000", fontSize: 14, fontWeight: "800" },
    quotaSecondaryButton: {
      marginTop: 4,
      backgroundColor: colors.primary,
      borderRadius: 999,
      paddingHorizontal: 20,
      paddingVertical: 12,
      minWidth: 200,
      alignItems: "center",
    },
    quotaSecondaryButtonText: { color: "#FFF", fontSize: 14, fontWeight: "800" },
    quotaDismissText: {
      marginTop: 4,
      padding: 8,
      color: colors.grey,
      fontSize: 13,
      fontWeight: "600",
    },
  });
}
