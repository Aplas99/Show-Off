import { useRewardedAd } from "@/api/ads";
import {
  getMagicCardImageUrl,
  getMagicCardPrice,
  searchMagicCardsCacheFirst,
  useCreateMagicCardBatch,
  type MagicCard,
} from "@/api/magic";
import { identifyMagicCardImage } from "@/api/magic/scan";
import { getInstaScanFailureMessage, recognizeTextWithInstaScan } from "@/api/tcg/enhancedOcr";
import { refreshMembershipAccess, useMembership } from "@/api/memberships";
import { formatPrice } from "@/api/pokemon/ocrPostprocessing";
import {
  useGrantBonusScans,
  useRecordScanAttempt,
  useRecordSearchAttempt,
  useScanQuotaStatus,
} from "@/api/scanning";
import SearchQuotaModal from "@/src/components/membership/SearchQuotaModal";
import {
  useCreateShowcase,
  useGetVisibleShowcases,
  type ShowcaseRow,
} from "@/api/showcase";
import { TAB_BAR_HEIGHT } from "@/constants/layoutConfig";
import { useColors, type ThemeColors } from "@/constants/theme";
import { useHaptics } from "@/hooks/useHaptics";
import { useScannerPrefsStore } from "@/hooks/useScannerPrefsStore";
import { useQueryClient } from "@tanstack/react-query";
import { createActionLogger } from "@/lib/actionDebug";
import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Image } from "@/src/components/media/ProtectedImage";
import { TcgScannerTools } from "@/src/features/create/tcg/TcgScannerTools";
import { Stack, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type FlowStep = "destination" | "scan" | "search";

interface QueueEntry {
  id: string;
  card: MagicCard;
}

const magicUiDebug = createActionLogger("MagicTCG");

export default function MagicCreateScreen() {
  const [step, setStep] = useState<FlowStep>("destination");
  const [showcaseId, setShowcaseId] = useState<string | null>(null);
  const [entries, setEntries] = useState<QueueEntry[]>([]);
  const [queueOpen, setQueueOpen] = useState(false);
  const colors = useColors();
  const router = useRouter();
  const haptics = useHaptics();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const { data: showcases = [], isLoading } = useGetVisibleShowcases();
  const createShowcase = useCreateShowcase();
  const createBatch = useCreateMagicCardBatch();

  useEffect(() => {
    if (showcaseId || showcases.length === 0) return;
    setShowcaseId((showcases.find((item) => item.is_default) ?? showcases[0]).id);
  }, [showcaseId, showcases]);

  const selectedShowcase = showcases.find((item) => item.id === showcaseId);

  const handleCreateShowcase = useCallback(
    async (name: string) => {
      const showcase = await createShowcase.mutateAsync({ name });
      magicUiDebug.log("showcase.created", { showcaseId: showcase.id, name });
      setShowcaseId(showcase.id);
      await haptics.success();
    },
    [createShowcase, haptics],
  );

  const handleAddCard = useCallback(
    async (card: MagicCard) => {
      const entry: QueueEntry = {
        id: `${card.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        card,
      };
      magicUiDebug.log("queue.card-added", {
        cardId: card.id,
        name: card.name,
        setCode: card.set ?? null,
      });
      setEntries((current) => [...current, entry]);
      await haptics.success();
    },
    [haptics],
  );

  const handleRemoveEntry = useCallback((id: string) => {
    magicUiDebug.log("queue.card-removed", { entryId: id });
    setEntries((current) => current.filter((entry) => entry.id !== id));
  }, []);

  const handleSave = useCallback(async () => {
    if (!showcaseId || entries.length === 0) return;
    try {
      await createBatch.mutateAsync({
        showcaseId,
        cardIds: entries.map((entry) => entry.card.id),
        prices: entries.map((entry) => getMagicCardPrice(entry.card)),
      });
    } catch (error) {
      magicUiDebug.error("queue.save-failed", error);
      return;
    }
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
        <ScanStep
          showcase={selectedShowcase}
          count={entries.length}
          onBack={() => setStep("destination")}
          onAddCard={handleAddCard}
          onSearch={() => setStep("search")}
          onOpenQueue={() => {
            magicUiDebug.log("queue.review-opened", { count: entries.length });
            setQueueOpen(true);
          }}
          colors={colors}
        />
      )}

      {step === "search" && selectedShowcase && (
        <SearchStep
          showcase={selectedShowcase}
          count={entries.length}
          onBack={() => setStep("scan")}
          onAddCard={handleAddCard}
          onOpenQueue={() => {
            magicUiDebug.log("queue.review-opened", { count: entries.length });
            setQueueOpen(true);
          }}
          colors={colors}
        />
      )}

      <QueueModal
        visible={queueOpen}
        entries={entries}
        isSaving={createBatch.isPending}
        error={createBatch.error ? "Couldn't save your cards. Please try again." : undefined}
        onClose={() => setQueueOpen(false)}
        onRemove={handleRemoveEntry}
        onSave={handleSave}
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

  const bottomOffset =
    TAB_BAR_HEIGHT + insets.bottom + (Platform.OS === "android" ? 8 : 0) + 28;

  return (
    <View style={[styles.page, { paddingTop: insets.top + 8 }]}>
      <FlowHeader
        title="Choose a showcase"
        subtitle="Every card you add will land here."
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
                    placeholder="Magic collection"
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

      <View style={[styles.bottomAction, { paddingBottom: bottomOffset }]}>
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

function ScanStep({
  showcase,
  count,
  onBack,
  onAddCard,
  onSearch,
  onOpenQueue,
  colors,
}: {
  showcase: ShowcaseRow;
  count: number;
  onBack: () => void;
  onAddCard: (card: MagicCard) => Promise<void>;
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
  const [lastAdded, setLastAdded] = useState<MagicCard | null>(null);
  const [matchCandidates, setMatchCandidates] = useState<MagicCard[] | null>(null);
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
  // Standard Magic card ratio (63mm × 88mm), same as Pokémon.
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

      const matches = await identifyMagicCardImage(
        picture.uri,
        mode === "enhanced" ? { recognizeText: recognizeTextWithInstaScan } : {},
      );
      if (matches.length === 0) {
        setScanError(
          mode === "enhanced"
            ? "InstaScan found no matching card. Try another photo or search by name."
            : "Couldn't read that card. Line up the name at the top of the frame, or search by name instead.",
        );
        await haptics.error();
        return;
      }
      setMatchCandidates(matches);
      await haptics.success();
    } catch (caught) {
      magicUiDebug.error("scan.capture-failed", caught);
      setScanError(mode === "enhanced"
        ? getInstaScanFailureMessage(caught)
        : "Couldn't scan that card. Please try again.");
      await haptics.error();
    } finally {
      setIsIdentifying(false);
      captureInProgress.current = false;
    }
  };

  const confirmMatch = async (card: MagicCard) => {
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
          Show Off needs the camera to identify Magic cards.
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
          <Text style={styles.cameraDestinationLabel}>ADDING TO</Text>
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
        <View style={[styles.cardFrame, { width: frameWidth, height: frameHeight }]}>
          <View style={styles.zoneGuideTop} pointerEvents="none">
            <Text style={styles.zoneGuideLabel}>Card name</Text>
          </View>
          {isIdentifying && (
            <View style={styles.identifyingOverlay} pointerEvents="none">
              <View style={styles.identifyingStatus}>
                <ActivityIndicator color="#FFF" size="small" />
                <Text style={styles.identifyingText}>Reading card name...</Text>
              </View>
            </View>
          )}
        </View>
        <Text style={styles.scannerHint}>
          Fill the frame with one card and keep the name at the top sharp.
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
          style={styles.searchControlButton}
          onPress={onSearch}
          accessibilityLabel="Search for a card by name"
        >
          <View style={styles.searchControlIcon}>
            <Ionicons name="search" size={16} color="#000" />
          </View>
          <Text style={styles.searchControlText}>Search</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.shutterOuter, (!isReady || isIdentifying) && styles.disabled]}
          onPress={() => capture("standard")}
          disabled={!isReady || isIdentifying}
          accessibilityLabel="Capture and identify Magic card"
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
            <View style={styles.modalHeader}>
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
              renderItem={({ item }) => {
                const imageUrl = getMagicCardImageUrl(item, "small");
                const price = getMagicCardPrice(item);
                return (
                  <TouchableOpacity style={styles.candidateCard} onPress={() => confirmMatch(item)}>
                    {imageUrl ? (
                      <Image source={{ uri: imageUrl }} style={styles.candidateImage} contentFit="cover" />
                    ) : (
                      <View style={[styles.candidateImage, styles.missingCardImage]}>
                        <Ionicons name="image-outline" size={22} color={colors.grey} />
                      </View>
                    )}
                    <View style={styles.flex}>
                      <Text style={styles.reviewTitle} numberOfLines={1}>{item.name}</Text>
                      <Text style={styles.reviewMeta} numberOfLines={1}>
                        {item.set_name ?? "Unknown set"}
                        {item.collector_number ? ` • #${item.collector_number}` : ""}
                      </Text>
                      {price != null && (
                        <Text style={styles.reviewMeta} numberOfLines={1}>
                          {formatPrice(price)} market
                        </Text>
                      )}
                    </View>
                    <Ionicons name="add-circle" size={25} color={colors.primary} />
                  </TouchableOpacity>
                );
              }}
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

function SearchStep({
  showcase,
  count,
  onBack,
  onAddCard,
  onOpenQueue,
  colors,
}: {
  showcase: ShowcaseRow;
  count: number;
  onBack: () => void;
  onAddCard: (card: MagicCard) => Promise<void>;
  onOpenQueue: () => void;
  colors: ThemeColors;
}) {
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MagicCard[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [searchQuotaExceeded, setSearchQuotaExceeded] = useState(false);
  const { data: membership } = useMembership();
  const isCurator = membership?.isCurator ?? false;
  const recordSearchAttempt = useRecordSearchAttempt();

  const bottomOffset =
    TAB_BAR_HEIGHT + insets.bottom + (Platform.OS === "android" ? 8 : 0) + 28;

  const search = async () => {
    if (!query.trim() || isSearching) return;

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
      const result = await searchMagicCardsCacheFirst({ query, pageSize: 40 });
      setResults(result.cards);
      setHasSearched(true);
    } catch (caught) {
      // The technical error is already console-logged by searchMagicCardsCacheFirst
      // via magicDebug; keep the on-screen message generic and actionable.
      magicUiDebug.error("search.ui-failed", caught);
      setError("Couldn't search for that card. Please try again.");
    } finally {
      setIsSearching(false);
    }
  };

  const addCard = async (card: MagicCard) => {
    setAddingId(card.id);
    try {
      await onAddCard(card);
    } finally {
      setAddingId(null);
    }
  };

  return (
    <View style={[styles.page, { paddingTop: insets.top + 8 }]}>
      <FlowHeader
        title={showcase.name}
        subtitle="Search by card name to add it to your queue."
        onBack={onBack}
        colors={colors}
      />

      <View style={styles.manualSearchFields}>
        <View style={styles.manualSearchRow}>
          <TextInput
            style={[styles.textInput, styles.flex]}
            value={query}
            onChangeText={setQuery}
            placeholder="Card name (e.g. Lightning Bolt)"
            placeholderTextColor={colors.grey}
            autoCapitalize="words"
            returnKeyType="search"
            onSubmitEditing={search}
          />
          <TouchableOpacity
            style={[styles.searchIconButton, (!query.trim() || isSearching) && styles.disabled]}
            onPress={search}
            disabled={!query.trim() || isSearching}
          >
            {isSearching ? (
              <ActivityIndicator color="#000" size="small" />
            ) : (
              <Ionicons name="search" size={19} color="#000" />
            )}
          </TouchableOpacity>
        </View>
        {error && <Text style={styles.errorText}>{error}</Text>}
      </View>

      <FlatList
        data={results}
        keyExtractor={(card) => card.id}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[
          styles.manualResults,
          { paddingBottom: bottomOffset + 90 },
        ]}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => {
          const imageUrl = getMagicCardImageUrl(item, "small");
          const price = getMagicCardPrice(item);
          return (
            <View style={styles.candidateCard}>
              {imageUrl ? (
                <Image source={{ uri: imageUrl }} style={styles.candidateImage} contentFit="cover" />
              ) : (
                <View style={[styles.candidateImage, styles.missingCardImage]}>
                  <Ionicons name="image-outline" size={22} color={colors.grey} />
                </View>
              )}
              <View style={styles.flex}>
                <Text style={styles.reviewTitle} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.reviewMeta} numberOfLines={1}>
                  {item.set_name ?? "Unknown set"}
                  {item.collector_number ? ` • #${item.collector_number}` : ""}
                </Text>
                {price != null ? (
                  <Text style={styles.reviewMeta} numberOfLines={1}>{formatPrice(price)} market</Text>
                ) : item.mana_cost ? (
                  <Text style={styles.reviewMeta} numberOfLines={1}>{item.mana_cost}</Text>
                ) : null}
              </View>
              <TouchableOpacity onPress={() => addCard(item)} disabled={addingId === item.id}>
                {addingId === item.id ? (
                  <ActivityIndicator color={colors.primary} size="small" />
                ) : (
                  <Ionicons name="add-circle" size={25} color={colors.primary} />
                )}
              </TouchableOpacity>
            </View>
          );
        }}
        ListEmptyComponent={
          hasSearched && !isSearching ? (
            <View style={styles.manualEmptyState}>
              <Ionicons name="search-outline" size={40} color={colors.grey} />
              <Text style={styles.emptyTitle}>No matching card found</Text>
              <Text style={styles.emptyDescription}>
                Try the exact card name, or check your spelling.
              </Text>
            </View>
          ) : null
        }
      />

      <View style={[styles.bottomAction, { paddingBottom: bottomOffset }]}>
        <TouchableOpacity
          style={[styles.primaryButton, count === 0 && styles.disabled]}
          onPress={onOpenQueue}
          disabled={count === 0}
        >
          <Text style={styles.primaryButtonText}>
            Review {count} card{count === 1 ? "" : "s"}
          </Text>
          <Ionicons name="arrow-forward" size={20} color="#000" />
        </TouchableOpacity>
      </View>

      <SearchQuotaModal
        visible={searchQuotaExceeded}
        onClose={() => setSearchQuotaExceeded(false)}
      />
    </View>
  );
}

function QueueModal({
  visible,
  entries,
  isSaving,
  error,
  onClose,
  onRemove,
  onSave,
  colors,
}: {
  visible: boolean;
  entries: QueueEntry[];
  isSaving: boolean;
  error?: string;
  onClose: () => void;
  onRemove: (id: string) => void;
  onSave: () => void;
  colors: ThemeColors;
}) {
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => getStyles(colors), [colors]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.manualSearchPage, { paddingTop: Math.max(insets.top, 20) }]}>
        <View style={styles.modalHeader}>
          <View style={styles.flex}>
            <Text style={styles.modalTitle}>
              {entries.length} card{entries.length === 1 ? "" : "s"} ready
            </Text>
            <Text style={styles.modalSubtitle}>Review before adding to your showcase.</Text>
          </View>
          <TouchableOpacity style={styles.backButton} onPress={onClose}>
            <Ionicons name="close" size={22} color={colors.text} />
          </TouchableOpacity>
        </View>

        <FlatList
          data={entries}
          keyExtractor={(entry) => entry.id}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={styles.reviewList}
          renderItem={({ item, index }) => {
            const imageUrl = getMagicCardImageUrl(item.card, "small");
            const price = getMagicCardPrice(item.card);
            return (
              <Animated.View entering={FadeInDown.delay(index * 35)} style={styles.reviewCard}>
                {imageUrl ? (
                  <Image source={{ uri: imageUrl }} style={styles.reviewImage} contentFit="contain" />
                ) : (
                  <View style={[styles.reviewImage, styles.missingCardImage]}>
                    <Ionicons name="image-outline" size={22} color={colors.grey} />
                  </View>
                )}
                <View style={styles.flex}>
                  <Text style={styles.reviewTitle} numberOfLines={1}>{item.card.name}</Text>
                  <Text style={styles.reviewMeta} numberOfLines={1}>
                    {item.card.set_name ?? "Unknown set"}
                  </Text>
                  {price != null ? (
                    <Text style={styles.reviewMeta} numberOfLines={1}>{formatPrice(price)} market</Text>
                  ) : (
                    <Text style={styles.reviewMeta} numberOfLines={1}>No price data</Text>
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
              <Text style={styles.emptyTitle}>No cards added yet</Text>
            </View>
          }
        />

        <View style={[styles.bottomAction, { paddingBottom: insets.bottom + 12 }]}>
          {error && <Text style={styles.errorText}>{error}</Text>}
          <TouchableOpacity
            style={[styles.primaryButton, (entries.length === 0 || isSaving) && styles.disabled]}
            onPress={onSave}
            disabled={entries.length === 0 || isSaving}
          >
            {isSaving ? <ActivityIndicator color="#000" /> : <Text style={styles.primaryButtonText}>Add all</Text>}
          </TouchableOpacity>
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
        <Text style={styles.flowTitle} numberOfLines={1}>{title}</Text>
        <Text style={styles.flowSubtitle} numberOfLines={2}>{subtitle}</Text>
      </View>
    </View>
  );
}

function getStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    page: { flex: 1 },
    centered: { flex: 1, alignItems: "center", justifyContent: "center" },
    flex: { flex: 1 },
    flowHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 12,
      paddingHorizontal: 20,
      paddingBottom: 16,
    },
    backButton: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surfaceContainerHighest,
    },
    flowTitle: { color: colors.text, fontSize: 20, fontWeight: "800" },
    flowSubtitle: { color: colors.onSurfaceVariant, fontSize: 13, marginTop: 2 },
    destinationList: { paddingHorizontal: 20, gap: 10, paddingBottom: 20 },
    showcaseCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      padding: 14,
      borderRadius: 16,
      backgroundColor: colors.surfaceContainerHighest,
      borderWidth: 1.5,
      borderColor: "transparent",
    },
    showcaseCardSelected: { borderColor: colors.primary },
    showcaseIcon: {
      width: 42,
      height: 42,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: `${colors.primary}22`,
    },
    showcaseName: { color: colors.text, fontSize: 15, fontWeight: "700" },
    showcaseMeta: { color: colors.onSurfaceVariant, fontSize: 12, marginTop: 2 },
    emptyState: { alignItems: "center", gap: 6, paddingVertical: 40, paddingHorizontal: 30 },
    emptyTitle: { color: colors.text, fontSize: 16, fontWeight: "700" },
    emptyDescription: { color: colors.onSurfaceVariant, fontSize: 13, textAlign: "center" },
    manualEmptyState: { alignItems: "center", gap: 6, paddingVertical: 40, paddingHorizontal: 30 },
    createShowcaseArea: { marginTop: 6 },
    createShowcaseForm: { gap: 10 },
    addShowcaseButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      justifyContent: "center",
      paddingVertical: 14,
      borderRadius: 14,
      borderWidth: 1.5,
      borderColor: colors.outlineVariant,
      borderStyle: "dashed",
    },
    addShowcaseText: { color: colors.primary, fontWeight: "700", fontSize: 14 },
    textInput: {
      backgroundColor: colors.surfaceContainerHighest,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      color: colors.text,
      fontSize: 15,
    },
    inlineActions: { flexDirection: "row", gap: 10 },
    errorText: { color: colors.danger, fontSize: 12 },
    secondaryButton: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 12,
      borderRadius: 12,
      backgroundColor: colors.surfaceContainerHighest,
    },
    secondaryButtonText: { color: colors.text, fontWeight: "700" },
    primarySmallButton: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 12,
      borderRadius: 12,
      backgroundColor: colors.primary,
    },
    primaryButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingVertical: 15,
      borderRadius: 14,
      backgroundColor: colors.primary,
    },
    primaryButtonText: { color: "#000", fontWeight: "800", fontSize: 15 },
    disabled: { opacity: 0.45 },
    bottomAction: {
      paddingHorizontal: 20,
      paddingTop: 10,
      gap: 8,
    },
    manualSearchFields: { paddingHorizontal: 20, gap: 8, marginBottom: 8 },
    manualSearchRow: { flexDirection: "row", gap: 8, alignItems: "center" },
    searchIconButton: {
      width: 48,
      height: 48,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.primary,
    },
    manualResults: { paddingHorizontal: 20, gap: 10 },
    candidateCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      padding: 10,
      borderRadius: 14,
      backgroundColor: colors.surfaceContainerHighest,
    },
    candidateImage: { width: 48, height: 67, borderRadius: 6 },
    missingCardImage: { alignItems: "center", justifyContent: "center" },
    reviewTitle: { color: colors.text, fontSize: 14, fontWeight: "700" },
    reviewMeta: { color: colors.onSurfaceVariant, fontSize: 12, marginTop: 1 },
    manualSearchPage: { flex: 1, backgroundColor: colors.background },
    modalHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 12,
      paddingHorizontal: 20,
      paddingBottom: 16,
    },
    modalTitle: { color: colors.text, fontSize: 18, fontWeight: "800" },
    modalSubtitle: { color: colors.onSurfaceVariant, fontSize: 13, marginTop: 2 },
    reviewList: { paddingHorizontal: 20, gap: 10, paddingBottom: 20 },
    reviewCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      padding: 10,
      borderRadius: 14,
      backgroundColor: colors.surfaceContainerHighest,
    },
    reviewImage: { width: 48, height: 67, borderRadius: 6 },
    removeButton: { padding: 6 },
    permissionPage: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: 16,
      padding: 28,
      backgroundColor: colors.background,
    },
    permissionTitle: {
      color: colors.text,
      fontSize: 24,
      fontWeight: "800",
      textAlign: "center",
    },
    permissionDescription: {
      color: colors.onSurfaceVariant,
      fontSize: 14,
      lineHeight: 21,
      textAlign: "center",
    },
    cameraPage: { flex: 1, backgroundColor: "#000" },
    cameraShade: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(0,0,0,0.18)",
    },
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
    cameraDestinationLabel: {
      color: "rgba(255,255,255,0.65)",
      fontSize: 10,
      fontWeight: "800",
      letterSpacing: 1.4,
    },
    cameraDestinationName: {
      color: "#FFF",
      fontSize: 15,
      fontWeight: "700",
      maxWidth: 210,
    },
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
    queueCount: {
      color: "#FFF",
      fontSize: 14,
      fontWeight: "800",
      fontVariant: ["tabular-nums"],
    },
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
    cardFrame: {
      borderRadius: 22,
      borderWidth: 2,
      borderColor: "rgba(255,255,255,0.45)",
      overflow: "hidden",
    },
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
    scanMessageText: { flex: 1, color: "#FFF", fontSize: 12, fontWeight: "600" },
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
    // Accent-colored so the name-search escape hatch reads as a first-class
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
    shutterOuter: {
      width: 78,
      height: 78,
      borderRadius: 39,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 4,
      borderColor: "#FFF",
    },
    shutterInner: {
      width: 62,
      height: 62,
      borderRadius: 31,
      backgroundColor: "#FFF",
    },
    invisible: { opacity: 0 },
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
    quotaTitle: {
      color: colors.text,
      fontSize: 17,
      fontWeight: "700",
      textAlign: "center",
    },
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
