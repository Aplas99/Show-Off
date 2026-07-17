import {
  useCreatePokemonCardBatch,
  type PokemonTcgCard,
} from "@/api/pokemon";
import { useMembership } from "@/api/memberships";
import {
  identifyPokemonCardImage,
  type PokemonCardIdentifiers,
  type RecognizedPokemonCard,
} from "@/api/pokemon/recognition";
import {
  createManualPokemonCard,
  searchPokemonCardSources,
} from "@/api/pokemon/search";
import {
  cardScanDebug,
  cardScanError,
  summarizePokemonCard,
} from "@/api/pokemon/cardScanDebug";
import {
  extractMarketPrice,
  formatPrice,
} from "@/api/pokemon/ocrPostprocessing";
import {
  useGrantBonusScans,
  useRecordScanAttempt,
  useRecordSearchAttempt,
  useScanQuotaStatus,
} from "@/api/scanning";
import SearchQuotaModal from "@/src/components/membership/SearchQuotaModal";
import { useRewardedAd } from "@/api/ads";
import {
  useCreateShowcase,
  useGetVisibleShowcases,
  type ShowcaseRow,
} from "@/api/showcase";
import { useColors, type ThemeColors } from "@/constants/theme";
import { useHaptics } from "@/hooks/useHaptics";
import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Image } from "expo-image";
import { Stack, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type FlowStep = "destination" | "scan" | "review";

interface ScanEntry {
  id: string;
  card: PokemonTcgCard;
  score: number;
  candidates: RecognizedPokemonCard[];
  confirmed: boolean;
}

const MIN_REVIEW_SCORE = 0.6;
const MIN_CONFIDENT_SCORE = 0.8;

/**
 * Snapshot of the on-screen geometry at capture time, used ONLY to render the
 * freeze-frame so it shows exactly what the live preview showed inside the
 * outline. Recognition never uses this — the OCR crop stays the generous
 * centered region — so a mapping error here is purely cosmetic.
 */
interface FrozenFrameGeometry {
  photoWidth: number;
  photoHeight: number;
  previewX: number;
  previewY: number;
  previewWidth: number;
  previewHeight: number;
  frameX: number;
  frameY: number;
}

function measureViewInWindow(
  ref: React.RefObject<View | null>,
): Promise<{ x: number; y: number; width: number; height: number } | null> {
  return new Promise((resolve) => {
    const node = ref.current;
    if (!node) return resolve(null);
    node.measureInWindow((x, y, width, height) => {
      if (!Number.isFinite(x) || !Number.isFinite(y) || !(width > 0) || !(height > 0)) {
        resolve(null);
        return;
      }
      resolve({ x, y, width, height });
    });
  });
}

/**
 * Position the captured photo inside the frame window the same way the
 * camera preview displayed it: cover-fit the photo to the preview bounds,
 * then shift so the frame's region is what shows through.
 */
function getFreezeFrameStyle(frozen: FrozenFrameGeometry) {
  const scale = Math.max(
    frozen.previewWidth / frozen.photoWidth,
    frozen.previewHeight / frozen.photoHeight,
  );
  const displayedWidth = frozen.photoWidth * scale;
  const displayedHeight = frozen.photoHeight * scale;
  const overflowX = (displayedWidth - frozen.previewWidth) / 2;
  const overflowY = (displayedHeight - frozen.previewHeight) / 2;
  return {
    position: "absolute" as const,
    width: displayedWidth,
    height: displayedHeight,
    left: -(frozen.frameX - frozen.previewX + overflowX),
    top: -(frozen.frameY - frozen.previewY + overflowY),
  };
}

function isConfidentMatch(matches: RecognizedPokemonCard[]) {
  const first = matches[0];
  if (!first) return false;
  return first.score >= MIN_CONFIDENT_SCORE || (first.identifierMatches ?? 0) >= 2;
}

export default function TcgCreateScreen() {
  const [step, setStep] = useState<FlowStep>("destination");
  const [showcaseId, setShowcaseId] = useState<string | null>(null);
  const [entries, setEntries] = useState<ScanEntry[]>([]);
  const [candidateEntryId, setCandidateEntryId] = useState<string | null>(null);
  const colors = useColors();
  const router = useRouter();
  const haptics = useHaptics();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const { data: showcases = [], isLoading } = useGetVisibleShowcases();
  const createShowcase = useCreateShowcase();
  const createBatch = useCreatePokemonCardBatch();

  useEffect(() => {
    if (showcaseId || showcases.length === 0) return;
    setShowcaseId((showcases.find((item) => item.is_default) ?? showcases[0]).id);
  }, [showcaseId, showcases]);

  const selectedShowcase = showcases.find((item) => item.id === showcaseId);
  const candidateEntry = entries.find((entry) => entry.id === candidateEntryId);

  const handleCreateShowcase = useCallback(
    async (name: string) => {
      const showcase = await createShowcase.mutateAsync({ name });
      setShowcaseId(showcase.id);
      await haptics.success();
    },
    [createShowcase, haptics],
  );

  const handleAddEntry = useCallback(
    async (matches: RecognizedPokemonCard[]) => {
      const topMatch = matches[0];
      if (!topMatch) throw new Error("No matching Pokémon card found");

      // Below MIN_REVIEW_SCORE the match is too weak to auto-confirm, but
      // rather than discard it and force a re-scan, surface it (and any
      // other closest matches) in the candidate modal for a manual pick.
      const confirmed = topMatch.score >= MIN_REVIEW_SCORE && isConfidentMatch(matches);
      cardScanDebug("queue.match-evaluated", {
        autoConfirmed: confirmed,
        minimumReviewScore: MIN_REVIEW_SCORE,
        minimumScore: MIN_CONFIDENT_SCORE,
        candidates: matches.map((match) => ({
          score: match.score,
          card: summarizePokemonCard(match.card),
        })),
      });
      const entry: ScanEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        card: topMatch.card,
        score: topMatch.score,
        candidates: matches,
        confirmed,
      };
      setEntries((current) => [...current, entry]);
      if (!confirmed) setCandidateEntryId(entry.id);
      await haptics.success();
    },
    [haptics],
  );

  const handleSelectCandidate = useCallback(
    async (entryId: string, match: RecognizedPokemonCard) => {
      cardScanDebug("queue.candidate-selected", {
        entryId,
        score: match.score,
        card: summarizePokemonCard(match.card),
      });
      setEntries((current) =>
        current.map((entry) =>
          entry.id === entryId
            ? {
                ...entry,
                card: match.card,
                score: match.score,
                confirmed: true,
              }
            : entry,
        ),
      );
      setCandidateEntryId(null);
      await haptics.selection();
    },
    [haptics],
  );

  const handleDismissCandidate = useCallback(() => {
    if (!candidateEntryId) return;

    cardScanDebug("queue.candidate-rejected", { entryId: candidateEntryId });
    setEntries((current) =>
      current.filter(
        (entry) => entry.id !== candidateEntryId || entry.confirmed,
      ),
    );
    setCandidateEntryId(null);
  }, [candidateEntryId]);

  const handleSave = useCallback(async () => {
    if (!showcaseId || entries.length === 0) return;
    if (entries.some((entry) => !entry.confirmed)) {
      setCandidateEntryId(entries.find((entry) => !entry.confirmed)?.id ?? null);
      return;
    }

    const cardIds = entries.map((entry) => entry.card.id);
    const prices = entries.map((entry) =>
      extractMarketPrice(entry.card.tcgplayer?.prices),
    );
    cardScanDebug("queue.save-started", {
      showcaseId,
      cardCount: cardIds.length,
      cardIds,
      prices,
    });
    try {
      await createBatch.mutateAsync({ showcaseId, cardIds, prices });
    } catch (error) {
      cardScanError("queue.save-failed", error);
      return;
    }
    cardScanDebug("queue.save-completed", {
      showcaseId,
      cardCount: cardIds.length,
    });
    await haptics.success();
    router.replace({
      pathname: "/(tabs)/showcase/[id]",
      params: { id: showcaseId },
    });
  }, [createBatch, entries, haptics, router, showcaseId]);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar barStyle={step === "scan" ? "light-content" : "default"} />

      {step === "destination" && (
        <DestinationStep
          showcases={showcases}
          selectedId={showcaseId}
          isLoading={isLoading}
          isCreating={createShowcase.isPending}
          onBack={() => router.replace("/(tabs)/create")}
          onSelect={setShowcaseId}
          onCreate={handleCreateShowcase}
          onContinue={() => setStep("scan")}
          colors={colors}
        />
      )}

      {step === "scan" && selectedShowcase && (
        <ScannerStep
          showcase={selectedShowcase}
          count={entries.length}
          onBack={() => setStep(entries.length > 0 ? "review" : "destination")}
          onRecognized={handleAddEntry}
          onReview={() => setStep("review")}
          colors={colors}
        />
      )}

      {step === "review" && selectedShowcase && (
        <ReviewStep
          entries={entries}
          showcase={selectedShowcase}
          isSaving={createBatch.isPending}
          error={createBatch.error?.message}
          onBack={() => setStep("scan")}
          onRemove={(id) =>
            setEntries((current) => current.filter((entry) => entry.id !== id))
          }
          onReviewCandidates={setCandidateEntryId}
          onSave={handleSave}
          colors={colors}
        />
      )}

      <CandidateModal
        entry={candidateEntry}
        onClose={handleDismissCandidate}
        onSelect={handleSelectCandidate}
        colors={colors}
      />
    </View>
  );
}

function DestinationStep({
  showcases,
  selectedId,
  isLoading,
  isCreating,
  onBack,
  onSelect,
  onCreate,
  onContinue,
  colors,
}: {
  showcases: ShowcaseRow[];
  selectedId: string | null;
  isLoading: boolean;
  isCreating: boolean;
  onBack: () => void;
  onSelect: (id: string) => void;
  onCreate: (name: string) => Promise<void>;
  onContinue: () => void;
  colors: ThemeColors;
}) {
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const [isAdding, setIsAdding] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!name.trim()) return;
    try {
      setError(null);
      await onCreate(name);
      setName("");
      setIsAdding(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to create showcase");
    }
  };

  return (
    <View style={[styles.page, { paddingTop: insets.top + 8 }]}>
      <FlowHeader
        title="Choose a showcase"
        subtitle="Every card in this scan session will land here."
        onBack={onBack}
        colors={colors}
      />

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={showcases}
          keyExtractor={(item) => item.id}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={styles.destinationList}
          renderItem={({ item, index }) => {
            const selected = item.id === selectedId;
            return (
              <Animated.View entering={FadeInDown.delay(index * 45)}>
                <Pressable
                  style={[styles.showcaseCard, selected && styles.showcaseCardSelected]}
                  onPress={() => onSelect(item.id)}
                >
                  <View style={styles.showcaseIcon}>
                    <Ionicons name="albums" size={22} color={colors.primary} />
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.showcaseName}>{item.name}</Text>
                    <Text style={styles.showcaseMeta}>
                      {item.is_public ? "Public showcase" : "Private showcase"}
                    </Text>
                  </View>
                  <Ionicons
                    name={selected ? "checkmark-circle" : "ellipse-outline"}
                    size={26}
                    color={selected ? colors.primary : colors.outline}
                  />
                </Pressable>
              </Animated.View>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="albums-outline" size={42} color={colors.grey} />
              <Text style={styles.emptyTitle}>No showcases yet</Text>
              <Text style={styles.emptyDescription}>
                Create one to start your card collection.
              </Text>
            </View>
          }
          ListFooterComponent={
            <View style={styles.createShowcaseArea}>
              {isAdding ? (
                <View style={styles.createShowcaseForm}>
                  <TextInput
                    style={styles.textInput}
                    value={name}
                    onChangeText={setName}
                    placeholder="Pokémon collection"
                    placeholderTextColor={colors.grey}
                    autoFocus
                    returnKeyType="done"
                    onSubmitEditing={submit}
                  />
                  {error && <Text style={styles.errorText}>{error}</Text>}
                  <View style={styles.inlineActions}>
                    <TouchableOpacity
                      style={styles.secondaryButton}
                      onPress={() => setIsAdding(false)}
                    >
                      <Text style={styles.secondaryButtonText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.primarySmallButton, (!name.trim() || isCreating) && styles.disabled]}
                      onPress={submit}
                      disabled={!name.trim() || isCreating}
                    >
                      {isCreating ? (
                        <ActivityIndicator color="#000" size="small" />
                      ) : (
                        <Text style={styles.primaryButtonText}>Create</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.addShowcaseButton}
                  onPress={() => setIsAdding(true)}
                >
                  <Ionicons name="add" size={20} color={colors.primary} />
                  <Text style={styles.addShowcaseText}>Create new showcase</Text>
                </TouchableOpacity>
              )}
            </View>
          }
        />
      )}

      <View style={[styles.bottomAction, { paddingBottom: insets.bottom + 12 }]}>
        <TouchableOpacity
          style={[styles.primaryButton, !selectedId && styles.disabled]}
          onPress={onContinue}
          disabled={!selectedId}
        >
          <Text style={styles.primaryButtonText}>Start scanning</Text>
          <Ionicons name="arrow-forward" size={20} color="#000" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function ScannerStep({
  showcase,
  count,
  onBack,
  onRecognized,
  onReview,
  colors,
}: {
  showcase: ShowcaseRow;
  count: number;
  onBack: () => void;
  onRecognized: (matches: RecognizedPokemonCard[]) => Promise<void>;
  onReview: () => void;
  colors: ThemeColors;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const previewRef = useRef<View>(null);
  const frameRef = useRef<View>(null);
  const [isReady, setIsReady] = useState(false);
  const [isIdentifying, setIsIdentifying] = useState(false);
  const [scanStatus, setScanStatus] = useState("Reading card text...");
  const [error, setError] = useState<string | null>(null);
  const [lastCard, setLastCard] = useState<PokemonTcgCard | null>(null);
  const [manualSearchOpen, setManualSearchOpen] = useState(false);
  const [fromFailedScan, setFromFailedScan] = useState(false);
  const [scanAttempt, setScanAttempt] = useState(1);
  const [borderState, setBorderState] = useState<"idle" | "error" | "success">("idle");
  const [torchOn, setTorchOn] = useState(false);
  const [lastIdentifiers, setLastIdentifiers] = useState<PokemonCardIdentifiers | null>(null);
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [frozenFrame, setFrozenFrame] = useState<FrozenFrameGeometry | null>(null);
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  const { data: membership } = useMembership();
  const isCurator = membership?.isCurator ?? false;
  const { data: quotaStatus } = useScanQuotaStatus();
  const recordScanAttempt = useRecordScanAttempt();
  const grantBonusScans = useGrantBonusScans();
  const rewardedAd = useRewardedAd();
  const router = useRouter();
  const progress = useSharedValue(0);
  const scanLineProgress = useSharedValue(0);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const haptics = useHaptics();
  const styles = useMemo(() => getStyles(colors), [colors]);
  // Compact centered guide — the OCR crop is a generous centered superset of
  // this region, so a card aligned here is always fully inside the crop.
  const frameWidth = Math.min(width * 0.7, 320);
  const frameHeight = frameWidth * (88 / 63);

  const horizontalProgressStyle = useAnimatedStyle(() => ({
    width: frameWidth * progress.value,
  }));
  const verticalProgressStyle = useAnimatedStyle(() => ({
    height: frameHeight * progress.value,
  }));
  const scanLineStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: scanLineProgress.value * frameHeight }],
  }));

  const handleWatchAdForBonusScans = async () => {
    const result = await rewardedAd.show();
    if (result === "earned") {
      await grantBonusScans.mutateAsync(5);
      await haptics.success();
      setQuotaExceeded(false);
    }
  };

  const capture = async () => {
    const attempt = scanAttempt;
    if (!cameraRef.current || !isReady || isIdentifying) return;

    if (!isCurator) {
      try {
        const quota = await recordScanAttempt.mutateAsync();
        if (!quota.allowed) {
          await haptics.error();
          setQuotaExceeded(true);
          return;
        }
      } catch {
        // Fail open on a quota-check error — don't block scanning over
        // a transient network hiccup.
      }
    }

    setIsIdentifying(true);
    setBorderState("idle");
    setError(null);
    setLastCard(null);
    if (attempt === 1) setLastIdentifiers(null);
    setScanStatus("Capturing card...");
    progress.value = 0;
    progress.value = withTiming(0.88, { duration: 5000 });

    const attemptScan = async (attempt: number) => {
      // 0.8 keeps enough detail for foil glare while staying fast to decode —
      // crops are downscaled to the OCR target width anyway.
      const picture = await cameraRef.current!.takePictureAsync({
        quality: 0.8,
      });
      if (!picture?.uri) throw new Error("Camera did not return an image");
      cardScanDebug("camera.captured", {
        attempt,
        width: picture.width,
        height: picture.height,
      });
      const [previewRect, frameRect] = await Promise.all([
        measureViewInWindow(previewRef),
        measureViewInWindow(frameRef),
      ]);
      // Android may report pre-rotation (landscape) dimensions while the
      // image displays upright via EXIF — orient dims to match the preview.
      const swapPhotoDims =
        previewRect &&
        picture.width > picture.height !== previewRect.width > previewRect.height;
      setFrozenFrame(
        previewRect && frameRect && picture.width && picture.height
          ? {
              photoWidth: swapPhotoDims ? picture.height : picture.width,
              photoHeight: swapPhotoDims ? picture.width : picture.height,
              previewX: previewRect.x,
              previewY: previewRect.y,
              previewWidth: previewRect.width,
              previewHeight: previewRect.height,
              frameX: frameRect.x,
              frameY: frameRect.y,
            }
          : null,
      );
      setCapturedUri(picture.uri);
      scanLineProgress.value = 0;
      scanLineProgress.value = withRepeat(
        withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.quad) }),
        -1,
        true,
      );
      setScanStatus("Reading card text...");
      return identifyPokemonCardImage(
        picture.uri,
        // Backup server-side OCR is a Curator perk — free scans are
        // on-device ML Kit only.
        isCurator ? undefined : { fallbackRecognizeText: undefined },
        (identifiers) => {
          setLastIdentifiers(identifiers);
          setScanStatus("Searching card database...");
          cardScanDebug("camera.partial-identifiers", {
            attempt,
            nameCandidates: identifiers.nameCandidates,
            number: identifiers.number,
            printedTotal: identifiers.printedTotal,
            setCode: identifiers.setCode,
          });
        },
      );
    };

    try {
      await haptics.medium();

      const matches = await attemptScan(attempt);
      if (matches.length > 0) {
        progress.value = withTiming(1, { duration: 180 });
        setBorderState("success");
        setScanAttempt(1);
        setLastCard(matches[0].card);
        await onRecognized(matches);
        return;
      }

      cardScanDebug("camera.scan-missed", { attempt });
      progress.value = withTiming(0, { duration: 180 });
      if (attempt === 1) {
        setBorderState("error");
        setScanAttempt(2);
      } else {
        setScanAttempt(1);
        setFromFailedScan(true);
        setManualSearchOpen(true);
      }
      await haptics.error();
    } catch (caught) {
      cardScanError("camera.capture-or-scan-failed", caught);
      progress.value = withTiming(0, { duration: 180 });
      if (attempt === 1) {
        setError(caught instanceof Error ? caught.message : "Unable to identify card");
        setBorderState("error");
        setScanAttempt(2);
      } else {
        setScanAttempt(1);
        setFromFailedScan(true);
        setManualSearchOpen(true);
      }
      await haptics.error();
    } finally {
      cancelAnimation(scanLineProgress);
      scanLineProgress.value = withTiming(0, { duration: 150 });
      // Return to the live preview so the next card can be lined up.
      setCapturedUri(null);
      setFrozenFrame(null);
      setIsIdentifying(false);
    }
  };

  if (!permission?.granted) {
    return (
      <View style={[styles.permissionPage, { paddingTop: insets.top + 20 }]}>
        <Ionicons name="camera-outline" size={56} color={colors.primary} />
        <Text style={styles.permissionTitle}>Camera access required</Text>
        <Text style={styles.permissionDescription}>
          Show Off needs the camera to identify Pokémon cards.
        </Text>
        <TouchableOpacity style={styles.primaryButton} onPress={requestPermission}>
          <Text style={styles.primaryButtonText}>Allow camera</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryButton} onPress={onBack}>
          <Text style={styles.secondaryButtonText}>Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View ref={previewRef} collapsable={false} style={styles.cameraPage}>
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
          <Text style={styles.cameraDestinationLabel}>ADDING TO</Text>
          <Text style={styles.cameraDestinationName} numberOfLines={1}>
            {showcase.name}
          </Text>
        </View>
        <TouchableOpacity style={styles.queueButton} onPress={onReview} disabled={count === 0}>
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
        <View
          ref={frameRef}
          collapsable={false}
          style={[
            styles.cardFrame,
            { width: frameWidth, height: frameHeight },
            borderState === "error" && styles.cardFrameError,
            borderState === "success" && styles.cardFrameSuccess,
          ]}
        >
          {capturedUri && frozenFrame ? (
            // Freeze-frame that matches what the live preview showed here.
            <Image
              source={{ uri: capturedUri }}
              style={getFreezeFrameStyle(frozenFrame)}
              contentFit="fill"
            />
          ) : capturedUri ? (
            <Image source={{ uri: capturedUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
          ) : null}
          <Animated.View style={[styles.progressTop, horizontalProgressStyle, borderState === "success" && styles.progressSuccess]} />
          <Animated.View style={[styles.progressBottom, horizontalProgressStyle, borderState === "success" && styles.progressSuccess]} />
          <Animated.View style={[styles.progressLeft, verticalProgressStyle, borderState === "success" && styles.progressSuccess]} />
          <Animated.View style={[styles.progressRight, verticalProgressStyle, borderState === "success" && styles.progressSuccess]} />

          {/* OCR zone guides — mirror NAME_ZONE / FOOTER_ZONE fractions in
              api/pokemon/recognition.ts so users align the text that matters. */}
          <View style={styles.zoneGuideTop} pointerEvents="none">
            <Text style={styles.zoneGuideLabel}>Card name</Text>
          </View>
          <View style={styles.zoneGuideBottom} pointerEvents="none">
            <Text style={styles.zoneGuideLabel}>Number / set</Text>
          </View>
          {isIdentifying && (
            <View style={styles.identifyingOverlay} pointerEvents="none">
              <Animated.View style={[styles.scanLine, scanLineStyle]} />
              <View style={styles.identifyingStatus}>
                <ActivityIndicator color="#FFF" size="small" />
                <Text style={styles.identifyingText}>{scanStatus}</Text>
              </View>
            </View>
          )}
        </View>
        <View style={styles.distanceNotice}>
          <Ionicons name="resize-outline" size={14} color="#FFF" />
          <Text style={styles.distanceNoticeText}>
            Keep the card at least 2 in (5 cm) from the camera
          </Text>
        </View>
        <Text style={styles.scannerHint}>
          {borderState === "error"
            ? "Please try again — re-center the card and keep the name and number sharp."
            : "Fill the frame with one card and keep the name and number sharp."}
        </Text>
        <View style={styles.scanHintChecks}>
          <TouchableOpacity
            style={[styles.scanHintCheck, torchOn && styles.scanHintCheckActive]}
            onPress={() => setTorchOn((current) => !current)}
            accessibilityRole="switch"
            accessibilityState={{ checked: torchOn }}
            accessibilityLabel={torchOn ? "Turn flashlight off" : "Turn flashlight on"}
          >
            <Ionicons name={torchOn ? "flashlight" : "flashlight-outline"} size={20} color={torchOn ? colors.primary : "#FFF"} />
            <Text style={styles.scanHintCheckText}>Torch</Text>
          </TouchableOpacity>
        </View>
        {borderState === "error" && error && (
          <Animated.View entering={FadeIn} style={styles.scanMessageError}>
            <Ionicons name="alert-circle" size={18} color="#FFF" />
            <Text style={styles.scanMessageText}>{error}</Text>
          </Animated.View>
        )}
        {lastCard && (
          <Animated.View entering={FadeIn} style={styles.scanMessageSuccess}>
            <Ionicons name="checkmark-circle" size={18} color="#FFF" />
            <Text style={styles.scanMessageText} numberOfLines={1}>
              Added {lastCard.name}. Scan the next card.
            </Text>
          </Animated.View>
        )}
      </View>

      <View style={[styles.cameraControls, { paddingBottom: insets.bottom + 18 }]}>
        <TouchableOpacity
          style={styles.searchControlButton}
          onPress={() => { setFromFailedScan(false); setManualSearchOpen(true); }}
          accessibilityLabel="Search for a card manually"
        >
          <View style={styles.searchControlIcon}>
            <Ionicons name="search" size={16} color="#000" />
          </View>
          <Text style={styles.searchControlText}>Search</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.shutterOuter, (!isReady || isIdentifying) && styles.disabled]}
          onPress={() => capture()}
          disabled={!isReady || isIdentifying}
          accessibilityLabel="Capture and identify Pokémon card"
        >
          <View style={styles.shutterInner} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.reviewButton, count === 0 && styles.invisible]}
          onPress={onReview}
          disabled={count === 0}
        >
          <Text style={styles.reviewButtonText}>Review</Text>
          <Ionicons name="arrow-forward" size={18} color="#FFF" />
        </TouchableOpacity>
      </View>

      <ManualCardSearchModal
        visible={manualSearchOpen}
        initialName={lastIdentifiers?.nameCandidates[0] ?? ""}
        initialNumber={lastIdentifiers?.number ?? ""}
        initialSetCode={lastIdentifiers?.setCode ?? ""}
        fromFailedScan={fromFailedScan}
        onClose={() => {
          setManualSearchOpen(false);
          setFromFailedScan(false);
          setLastIdentifiers(null);
        }}
        onSelect={async (card) => {
          cardScanDebug("manual.card-selected", {
            card: summarizePokemonCard(card),
          });
          setManualSearchOpen(false);
          setFromFailedScan(false);
          setLastIdentifiers(null);
          setError(null);
          setLastCard(card);
          await onRecognized([{ card, score: 1 }]);
        }}
        colors={colors}
      />

      <Modal
        visible={quotaExceeded}
        transparent
        animationType="fade"
        onRequestClose={() => setQuotaExceeded(false)}
      >
        <Pressable
          style={styles.quotaBackdrop}
          onPress={() => setQuotaExceeded(false)}
        >
          <Pressable
            style={styles.quotaCard}
            onPress={(event) => event.stopPropagation()}
          >
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
              disabled={rewardedAd.isLoading || grantBonusScans.isPending}
            >
              {rewardedAd.isLoading || grantBonusScans.isPending ? (
                <ActivityIndicator color="#000" size="small" />
              ) : (
                <Text style={styles.quotaPrimaryButtonText}>
                  Watch ad for +5 scans
                </Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.quotaSecondaryButton}
              onPress={() => {
                setQuotaExceeded(false);
                router.push("/(tabs)/profile/membership" as any);
              }}
            >
              <Text style={styles.quotaSecondaryButtonText}>
                Upgrade to Curator
              </Text>
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

function ManualCardSearchModal({
  visible,
  initialName = "",
  initialNumber = "",
  initialSetCode = "",
  fromFailedScan = false,
  onClose,
  onSelect,
  colors,
}: {
  visible: boolean;
  initialName?: string;
  initialNumber?: string;
  initialSetCode?: string;
  fromFailedScan?: boolean;
  onClose: () => void;
  onSelect: (card: PokemonTcgCard) => Promise<void>;
  colors: ThemeColors;
}) {
  const styles = useMemo(() => getStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const [name, setName] = useState(initialName);
  const [collection, setCollection] = useState(initialSetCode);
  const [number, setNumber] = useState(initialNumber);
  const [results, setResults] = useState<PokemonTcgCard[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuotaExceeded, setSearchQuotaExceeded] = useState(false);
  const { data: membership } = useMembership();
  const isCurator = membership?.isCurator ?? false;
  const recordSearchAttempt = useRecordSearchAttempt();

  // Sync initial values when the modal opens with new pre-fill data
  useEffect(() => {
    if (visible) {
      setName(initialName);
      setCollection(initialSetCode);
      setNumber(initialNumber);
      setResults([]);
      setHasSearched(false);
      setError(null);
    }
  }, [visible, initialName, initialNumber, initialSetCode]);

  const search = async () => {
    if (!name.trim() || isSearching) return;

    if (!isCurator) {
      try {
        const quota = await recordSearchAttempt.mutateAsync();
        if (!quota.allowed) {
          setSearchQuotaExceeded(true);
          return;
        }
      } catch {
        // Fail open on a quota-check error — don't block searching over
        // a transient network hiccup.
      }
    }

    try {
      setIsSearching(true);
      setError(null);
      const cards = await searchPokemonCardSources({
        name,
        collection: collection || undefined,
        number: number || undefined,
      });
      setResults(cards);
      setHasSearched(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to search cards");
    } finally {
      setIsSearching(false);
    }
  };

  const addAsEntered = async () => {
    if (!name.trim() || !collection.trim() || isAdding) return;
    try {
      setIsAdding(true);
      setError(null);
      const card = await createManualPokemonCard({ name, collection, number });
      await onSelect(card);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to add card");
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View
        style={[
          styles.manualSearchPage,
          { paddingTop: Math.max(insets.top, 20) },
        ]}
      >
        <View style={styles.modalHeader}>
          <View style={styles.flex}>
            <Text style={styles.modalTitle}>Find a Pokémon card</Text>
            <Text style={styles.modalSubtitle}>
              {fromFailedScan
                ? "We couldn\u2019t identify this card automatically. Please verify or correct the details below."
                : "Search by card name, collection/set, and collector number."}
            </Text>
          </View>
          <TouchableOpacity style={styles.backButton} onPress={onClose}>
            <Ionicons name="close" size={22} color={colors.text} />
          </TouchableOpacity>
        </View>

        <View style={styles.manualSearchFields}>
          {fromFailedScan && (
            <View style={styles.fallbackPrompt}>
              <Ionicons name="sparkles" size={18} color={colors.primary} />
              <Text style={styles.fallbackPromptText}>
                OCR guesses are pre-filled when available. Correct the card name,
                set, or number before searching.
              </Text>
            </View>
          )}
          <TextInput
            style={styles.textInput}
            value={name}
            onChangeText={setName}
            placeholder="Card name (required)"
            placeholderTextColor={colors.grey}
            autoCapitalize="words"
            returnKeyType="search"
            onSubmitEditing={search}
          />
          <View style={styles.manualSearchRow}>
            <TextInput
              style={[styles.textInput, styles.flex]}
              value={collection}
              onChangeText={setCollection}
              placeholder="Collection / set"
              placeholderTextColor={colors.grey}
              autoCapitalize="words"
            />
            <TextInput
              style={[styles.textInput, styles.numberInput]}
              value={number}
              onChangeText={setNumber}
              placeholder="No."
              placeholderTextColor={colors.grey}
              autoCapitalize="characters"
            />
          </View>
          <TouchableOpacity
            style={[styles.primaryButton, (!name.trim() || isSearching) && styles.disabled]}
            onPress={search}
            disabled={!name.trim() || isSearching}
          >
            {isSearching ? (
              <ActivityIndicator color="#000" />
            ) : (
              <>
                <Ionicons name="search" size={19} color="#000" />
                <Text style={styles.primaryButtonText}>Search card sources</Text>
              </>
            )}
          </TouchableOpacity>
          {error && <Text style={styles.errorText}>{error}</Text>}
        </View>

        <FlatList
          data={results}
          keyExtractor={(card) => card.id}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={[
            styles.manualResults,
            { paddingBottom: insets.bottom + 40 },
          ]}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.candidateCard}
              onPress={() => onSelect(item)}
            >
              {item.images.small ? (
                <Image source={item.images.small} style={styles.candidateImage} contentFit="cover" />
              ) : (
                <View style={[styles.candidateImage, styles.missingCardImage]}>
                  <Ionicons name="image-outline" size={22} color={colors.grey} />
                </View>
              )}
              <View style={styles.flex}>
                <Text style={styles.reviewTitle}>{item.name}</Text>
                <Text style={styles.reviewMeta}>Set / collection: {item.set.name}</Text>
                <Text style={styles.reviewMeta}>Number: #{item.number}</Text>
              </View>
              <Ionicons name="add-circle" size={25} color={colors.primary} />
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            hasSearched && !isSearching ? (
              <View style={styles.manualEmptyState}>
                <Ionicons name="search-outline" size={40} color={colors.grey} />
                <Text style={styles.emptyTitle}>No matching card found</Text>
                <Text style={styles.emptyDescription}>
                  Add a collection/set to search TCGTracking, or save the card exactly as entered.
                </Text>
                <TouchableOpacity
                  style={[
                    styles.secondaryButton,
                    (!name.trim() || !collection.trim() || isAdding) && styles.disabled,
                  ]}
                  onPress={addAsEntered}
                  disabled={!name.trim() || !collection.trim() || isAdding}
                >
                  {isAdding ? (
                    <ActivityIndicator color={colors.text} />
                  ) : (
                    <Text style={styles.secondaryButtonText}>Add as entered</Text>
                  )}
                </TouchableOpacity>
              </View>
            ) : null
          }
        />

        <SearchQuotaModal
          visible={searchQuotaExceeded}
          onClose={() => setSearchQuotaExceeded(false)}
        />
      </View>
    </Modal>
  );
}

function ReviewStep({
  entries,
  showcase,
  isSaving,
  error,
  onBack,
  onRemove,
  onReviewCandidates,
  onSave,
  colors,
}: {
  entries: ScanEntry[];
  showcase: ShowcaseRow;
  isSaving: boolean;
  error?: string;
  onBack: () => void;
  onRemove: (id: string) => void;
  onReviewCandidates: (id: string) => void;
  onSave: () => void;
  colors: ThemeColors;
}) {
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const needsReview = entries.filter((entry) => !entry.confirmed).length;

  return (
    <View style={[styles.page, { paddingTop: insets.top + 8 }]}>
      <FlowHeader
        title={`${entries.length} card${entries.length === 1 ? "" : "s"} ready`}
        subtitle={`Review before adding to ${showcase.name}.`}
        onBack={onBack}
        colors={colors}
      />
      <FlatList
        data={entries}
        keyExtractor={(entry) => entry.id}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.reviewList}
        renderItem={({ item, index }) => {
          const price = extractMarketPrice(item.card.tcgplayer?.prices);
          return (
            <Animated.View entering={FadeInDown.delay(index * 35)} style={styles.reviewCard}>
              {item.card.images.small ? (
                <Image
                  source={{ uri: item.card.images.small }}
                  style={styles.reviewImage}
                  contentFit="contain"
                />
              ) : (
                <View style={[styles.reviewImage, styles.missingCardImage]}>
                  <Ionicons name="image-outline" size={22} color={colors.grey} />
                </View>
              )}
              <View style={styles.flex}>
                <Text style={styles.reviewTitle} numberOfLines={1}>{item.card.name}</Text>
                <Text style={styles.reviewMeta} numberOfLines={1}>Set / collection: {item.card.set.name}</Text>
                <Text style={styles.reviewMeta} numberOfLines={1}>Number: #{item.card.number}</Text>
                {price != null ? (
                  <Text style={styles.priceText}>{formatPrice(price)} market</Text>
                ) : (
                  <Text style={styles.priceTextMuted}>No price data</Text>
                )}
                {!item.confirmed && (
                  <TouchableOpacity onPress={() => onReviewCandidates(item.id)}>
                    <Text style={styles.verifyText}>Verify this match</Text>
                  </TouchableOpacity>
                )}
              </View>
              <TouchableOpacity style={styles.removeButton} onPress={() => onRemove(item.id)}>
                <Ionicons name="trash-outline" size={20} color={colors.danger} />
              </TouchableOpacity>
            </Animated.View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No cards scanned</Text>
            <TouchableOpacity style={styles.secondaryButton} onPress={onBack}>
              <Text style={styles.secondaryButtonText}>Return to scanner</Text>
            </TouchableOpacity>
          </View>
        }
      />
      <View style={[styles.bottomAction, { paddingBottom: insets.bottom + 12 }]}>
        {needsReview > 0 && (
          <Text style={styles.reviewWarning}>{needsReview} uncertain match{needsReview === 1 ? "" : "es"} need review.</Text>
        )}
        {error && <Text style={styles.errorText}>{error}</Text>}
        <View style={styles.inlineActions}>
          <TouchableOpacity style={styles.secondaryButton} onPress={onBack} disabled={isSaving}>
            <Ionicons name="scan" size={18} color={colors.text} />
            <Text style={styles.secondaryButtonText}>Scan more</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.primarySmallButton, (entries.length === 0 || isSaving) && styles.disabled]}
            onPress={onSave}
            disabled={entries.length === 0 || isSaving}
          >
            {isSaving ? <ActivityIndicator color="#000" /> : <Text style={styles.primaryButtonText}>Add all</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

function CandidateModal({
  entry,
  onClose,
  onSelect,
  colors,
}: {
  entry?: ScanEntry;
  onClose: () => void;
  onSelect: (entryId: string, match: RecognizedPokemonCard) => void;
  colors: ThemeColors;
}) {
  const styles = useMemo(() => getStyles(colors), [colors]);
  return (
    <Modal visible={!!entry} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.candidateSheet}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalTitle}>Confirm the card</Text>
              <Text style={styles.modalSubtitle}>Pick the closest match, or try another photo.</Text>
            </View>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>
          <FlatList
            data={entry?.candidates ?? []}
            keyExtractor={(match) => match.card.id}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.candidateCard}
                onPress={() => entry && onSelect(entry.id, item)}
              >
                <Image source={{ uri: item.card.images.small }} style={styles.candidateImage} contentFit="contain" />
                <View style={styles.flex}>
                  <Text style={styles.reviewTitle}>{item.card.name}</Text>
                  <Text style={styles.reviewMeta}>Set / collection: {item.card.set.name}</Text>
                  <Text style={styles.reviewMeta}>Number: #{item.card.number}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.grey} />
              </TouchableOpacity>
            )}
          />
        </View>
      </View>
    </Modal>
  );
}

function FlowHeader({
  title,
  subtitle,
  onBack,
  colors,
}: {
  title: string;
  subtitle: string;
  onBack: () => void;
  colors: ThemeColors;
}) {
  const styles = useMemo(() => getStyles(colors), [colors]);
  return (
    <View style={styles.flowHeader}>
      <TouchableOpacity style={styles.backButton} onPress={onBack}>
        <Ionicons name="arrow-back" size={22} color={colors.text} />
      </TouchableOpacity>
      <View style={styles.flex}>
        <Text style={styles.flowTitle}>{title}</Text>
        <Text style={styles.flowSubtitle}>{subtitle}</Text>
      </View>
    </View>
  );
}

const getStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    page: { flex: 1, backgroundColor: colors.background },
    flex: { flex: 1 },
    centered: { flex: 1, alignItems: "center", justifyContent: "center" },
    flowHeader: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 20, paddingVertical: 14 },
    backButton: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceContainerHigh },
    flowTitle: { color: colors.text, fontSize: 28, fontWeight: "800", letterSpacing: -0.8 },
    flowSubtitle: { color: colors.onSurfaceVariant, fontSize: 13, marginTop: 3 },
    destinationList: { padding: 20, paddingBottom: 150, gap: 10 },
    showcaseCard: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16, borderRadius: 18, borderWidth: 1, borderColor: colors.outlineVariant, backgroundColor: colors.surfaceContainer },
    showcaseCardSelected: { borderColor: colors.primary, backgroundColor: `${colors.primary}18` },
    showcaseIcon: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceContainerHighest },
    showcaseName: { color: colors.text, fontSize: 17, fontWeight: "700" },
    showcaseMeta: { color: colors.onSurfaceVariant, fontSize: 12, marginTop: 3 },
    emptyState: { alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 54, paddingHorizontal: 24 },
    emptyTitle: { color: colors.text, fontSize: 19, fontWeight: "700" },
    emptyDescription: { color: colors.onSurfaceVariant, fontSize: 13, textAlign: "center" },
    createShowcaseArea: { paddingTop: 12 },
    addShowcaseButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 16, borderRadius: 16, borderWidth: 1, borderStyle: "dashed", borderColor: colors.primary },
    addShowcaseText: { color: colors.primary, fontWeight: "700" },
    createShowcaseForm: { gap: 12, padding: 16, borderRadius: 18, backgroundColor: colors.surfaceContainer },
    textInput: { height: 50, borderRadius: 14, paddingHorizontal: 16, color: colors.text, backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.outlineVariant },
    inlineActions: { flexDirection: "row", gap: 10 },
    bottomAction: { gap: 10, paddingHorizontal: 20, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.outlineVariant, backgroundColor: colors.background },
    primaryButton: { minHeight: 54, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, borderRadius: 18, paddingHorizontal: 20, backgroundColor: colors.primary },
    primarySmallButton: { flex: 1, minHeight: 50, flexDirection: "row", alignItems: "center", justifyContent: "center", borderRadius: 16, paddingHorizontal: 18, backgroundColor: colors.primary },
    primaryButtonText: { color: "#000", fontSize: 15, fontWeight: "800" },
    secondaryButton: { flex: 1, minHeight: 50, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 16, paddingHorizontal: 18, backgroundColor: colors.surfaceContainerHigh },
    secondaryButtonText: { color: colors.text, fontSize: 14, fontWeight: "700" },
    disabled: { opacity: 0.42 },
    invisible: { opacity: 0 },
    errorText: { color: colors.danger, fontSize: 13 },
    permissionPage: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16, padding: 28, backgroundColor: colors.background },
    permissionTitle: { color: colors.text, fontSize: 24, fontWeight: "800", textAlign: "center" },
    permissionDescription: { color: colors.onSurfaceVariant, fontSize: 14, lineHeight: 21, textAlign: "center" },
    cameraPage: { flex: 1, backgroundColor: "#000" },
    cameraShade: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.18)" },
    cameraHeader: { position: "absolute", top: 0, left: 0, right: 0, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingBottom: 12 },
    cameraIconButton: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.58)" },
    cameraDestination: { flex: 1, alignItems: "center" },
    cameraDestinationLabel: { color: "rgba(255,255,255,0.65)", fontSize: 9, fontWeight: "800", letterSpacing: 1.4 },
    cameraDestinationName: { color: "#FFF", fontSize: 15, fontWeight: "700", maxWidth: 210 },
    queueButton: { minWidth: 48, height: 44, borderRadius: 22, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingHorizontal: 11, backgroundColor: "rgba(0,0,0,0.58)" },
    queueCount: { color: "#FFF", fontSize: 14, fontWeight: "800", fontVariant: ["tabular-nums"] },
    scannerCenter: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
    cardFrame: { borderRadius: 22, borderWidth: 2, borderColor: "rgba(255,255,255,0.45)", overflow: "hidden" },
    cardFrameError: { borderColor: "#FF3B30", borderWidth: 3 },
    cardFrameSuccess: { borderColor: "#22c55e", borderWidth: 3 },
    progressTop: { position: "absolute", top: -2, left: 0, height: 5, borderRadius: 3, backgroundColor: colors.primary },
    progressBottom: { position: "absolute", bottom: -2, right: 0, height: 5, borderRadius: 3, backgroundColor: colors.primary },
    progressLeft: { position: "absolute", bottom: 0, left: -2, width: 5, borderRadius: 3, backgroundColor: colors.primary },
    progressRight: { position: "absolute", top: 0, right: -2, width: 5, borderRadius: 3, backgroundColor: colors.primary },
    progressSuccess: { backgroundColor: "#22c55e" },
    // OCR zone guides (name zone = top 18%, footer zone = bottom 13%)
    zoneGuideTop: {
      position: "absolute",
      top: 8,
      left: 8,
      right: 8,
      height: "16%",
      borderWidth: 1.5,
      borderColor: "rgba(255,255,255,0.55)",
      borderStyle: "dashed",
      borderRadius: 10,
      padding: 6,
      justifyContent: "flex-start",
      alignItems: "flex-start",
    },
    zoneGuideBottom: {
      position: "absolute",
      bottom: 8,
      left: 8,
      right: 8,
      height: "11%",
      borderWidth: 1.5,
      borderColor: "rgba(255,255,255,0.55)",
      borderStyle: "dashed",
      borderRadius: 10,
      padding: 6,
      justifyContent: "flex-end",
      alignItems: "flex-start",
    },
    zoneGuideLabel: {
      color: "rgba(255,255,255,0.9)",
      fontSize: 10,
      fontWeight: "700",
      letterSpacing: 1.2,
      textTransform: "uppercase",
      backgroundColor: "rgba(0,0,0,0.5)",
      paddingHorizontal: 7,
      paddingVertical: 3,
      borderRadius: 5,
      overflow: "hidden",
    },
    identifyingOverlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "flex-end", paddingBottom: 16, backgroundColor: "rgba(0,0,0,0.15)" },
    scanLine: { position: "absolute", left: 0, right: 0, top: 0, height: 3, backgroundColor: colors.primary, shadowColor: colors.primary, shadowOpacity: 0.9, shadowRadius: 8, shadowOffset: { width: 0, height: 0 }, elevation: 6 },
    identifyingStatus: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: "rgba(0,0,0,0.6)" },
    identifyingText: { color: "#FFF", fontSize: 14, fontWeight: "700" },
    distanceNotice: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 14, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: "rgba(0,0,0,0.55)", borderWidth: 1, borderColor: "rgba(255,255,255,0.22)" },
    distanceNoticeText: { color: "rgba(255,255,255,0.92)", fontSize: 11, fontWeight: "600" },
    scannerHint: { color: "rgba(255,255,255,0.84)", fontSize: 13, textAlign: "center", marginTop: 12 },
    scanHintChecks: { flexDirection: "row", gap: 10, marginTop: 12 },
    scanHintCheck: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.38)", backgroundColor: "rgba(0,0,0,0.52)" },
    scanHintCheckActive: { borderColor: colors.primary, backgroundColor: "rgba(0,0,0,0.72)" },
    scanHintCheckText: { color: "#FFF", fontSize: 13, fontWeight: "700" },
    scanMessageError: { maxWidth: 340, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 10, marginTop: 14, borderRadius: 14, backgroundColor: "rgba(190,30,55,0.88)" },
    scanMessageSuccess: { maxWidth: 340, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 10, marginTop: 14, borderRadius: 14, backgroundColor: "rgba(22,125,70,0.9)" },
    scanMessageText: { flex: 1, color: "#FFF", fontSize: 12, fontWeight: "600" },
    manualFallbackButton: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 10, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, backgroundColor: "rgba(0,0,0,0.62)" },
    manualFallbackText: { color: "#FFF", fontSize: 12, fontWeight: "700" },
    cameraControls: { position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 28, paddingTop: 18, backgroundColor: "rgba(0,0,0,0.32)" },
    manualControlButton: { width: 88, height: 46, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, borderRadius: 23, backgroundColor: "rgba(0,0,0,0.62)" },
    manualControlText: { color: "#FFF", fontSize: 12, fontWeight: "700" },
    // Accent-colored so the manual-search escape hatch reads as a first-class
    // action next to the shutter, not a dim utility button.
    searchControlButton: {
      minWidth: 96,
      height: 46,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 7,
      paddingHorizontal: 13,
      borderRadius: 23,
      backgroundColor: colors.primary,
      borderWidth: 1.5,
      borderColor: "rgba(255,255,255,0.55)",
      shadowColor: colors.primary,
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
    searchControlText: { color: "#000", fontSize: 13, fontWeight: "800" },
    scanQuotaPill: { position: "absolute", top: 108, alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: "rgba(0,0,0,0.55)" },
    scanQuotaPillText: { color: "#FFF", fontSize: 11, fontWeight: "700" },
    quotaBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", padding: 24 },
    quotaCard: { alignItems: "center", gap: 8, padding: 24, borderRadius: 20, backgroundColor: colors.surfaceContainer, borderWidth: 1, borderColor: colors.outlineVariant },
    quotaCloseButton: { position: "absolute", top: 12, right: 12, width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceContainerHigh, zIndex: 1 },
    quotaTitle: { color: colors.text, fontSize: 17, fontWeight: "700", textAlign: "center" },
    quotaDescription: { color: colors.onSurfaceVariant, fontSize: 13, textAlign: "center", lineHeight: 18 },
    quotaPrimaryButton: { marginTop: 8, backgroundColor: colors.tertiary, borderRadius: 999, paddingHorizontal: 20, paddingVertical: 12, minWidth: 200, alignItems: "center" },
    quotaPrimaryButtonText: { color: "#000", fontSize: 14, fontWeight: "800" },
    quotaSecondaryButton: { marginTop: 4, backgroundColor: colors.primary, borderRadius: 999, paddingHorizontal: 20, paddingVertical: 12, minWidth: 200, alignItems: "center" },
    quotaSecondaryButtonText: { color: "#FFF", fontSize: 14, fontWeight: "800" },
    quotaDismissText: { marginTop: 4, padding: 8, color: colors.grey, fontSize: 13, fontWeight: "600" },
    shutterOuter: { width: 78, height: 78, borderRadius: 39, alignItems: "center", justifyContent: "center", borderWidth: 4, borderColor: "#FFF" },
    shutterInner: { width: 62, height: 62, borderRadius: 31, backgroundColor: "#FFF" },
    reviewButton: { width: 88, height: 46, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, borderRadius: 23, backgroundColor: "rgba(0,0,0,0.62)" },
    reviewButtonText: { color: "#FFF", fontSize: 13, fontWeight: "700" },
    reviewList: { padding: 20, paddingBottom: 220, gap: 10 },
    reviewCard: { flexDirection: "row", alignItems: "center", gap: 14, padding: 12, borderRadius: 18, borderWidth: 1, borderColor: colors.outlineVariant, backgroundColor: colors.surfaceContainer },
    reviewImage: { width: 58, height: 82, borderRadius: 7, backgroundColor: colors.surfaceContainerHigh },
    reviewTitle: { color: colors.text, fontSize: 16, fontWeight: "700" },
    reviewMeta: { color: colors.onSurfaceVariant, fontSize: 12, marginTop: 4 },
    priceText: { color: "#22c55e", fontSize: 12, fontWeight: "700", marginTop: 3 },
    priceTextMuted: { color: colors.grey, fontSize: 11, fontStyle: "italic", marginTop: 3 },
    verifyText: { color: colors.tertiary, fontSize: 12, fontWeight: "700", marginTop: 8 },
    removeButton: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: colors.errorContainer },
    reviewWarning: { color: colors.tertiary, fontSize: 12, textAlign: "center" },
    modalBackdrop: { flex: 1, justifyContent: "flex-end", padding: 12, backgroundColor: colors.overlay },
    centeredModalBackdrop: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: colors.overlay },
    retryPromptCard: { width: "100%", maxWidth: 390, gap: 14, padding: 22, borderRadius: 24, backgroundColor: colors.surfaceContainerLow },
    retryPromptButton: { flex: 0, width: "100%" },
    candidateSheet: { maxHeight: "78%", gap: 12, padding: 18, borderRadius: 26, backgroundColor: colors.surfaceContainerLow },
    modalHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 16 },
    modalTitle: { color: colors.text, fontSize: 22, fontWeight: "800" },
    modalSubtitle: { color: colors.onSurfaceVariant, fontSize: 12, marginTop: 3 },
    candidateCard: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.outlineVariant },
    candidateImage: { width: 52, height: 74, borderRadius: 6 },
    manualSearchPage: { flex: 1, paddingTop: 20, backgroundColor: colors.background },
    manualSearchFields: { gap: 10, paddingHorizontal: 20, paddingVertical: 16 },
    fallbackPrompt: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: `${colors.primary}55`, backgroundColor: `${colors.primary}14` },
    fallbackPromptText: { flex: 1, color: colors.onSurfaceVariant, fontSize: 12, lineHeight: 17, fontWeight: "600" },
    manualSearchRow: { flexDirection: "row", gap: 10 },
    numberInput: { flex: 0, width: 92 },
    manualResults: { flexGrow: 1, paddingHorizontal: 20, paddingBottom: 40 },
    manualEmptyState: { alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 24, paddingVertical: 44 },
    missingCardImage: { alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceContainerHigh },
  });
