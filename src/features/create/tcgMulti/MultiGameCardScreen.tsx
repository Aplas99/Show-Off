import { useRewardedAd } from "@/api/ads";
import { useMembership } from "@/api/memberships";
import {
  useGrantBonusScans,
  useRecordScanAttempt,
  useScanQuotaStatus,
} from "@/api/scanning";
import { useCreateShowcase, useGetVisibleShowcases, type ShowcaseRow } from "@/api/showcase";
import {
  TCG_CATEGORIES,
  useCreateTcgCardBatch,
  useHydrateTcgCard,
  useScanTcgCardImage,
  useSearchTcgCardsByName,
  useSearchTcgSets,
  useTcgSetCards,
  type TcgCard,
  type TcgGameKey,
  type TcgScanResult,
  type TcgSet,
} from "@/api/tcg";
import { useColors, type ThemeColors } from "@/constants/theme";
import { TAB_BAR_HEIGHT } from "@/constants/layoutConfig";
import { useHaptics } from "@/hooks/useHaptics";
import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Image } from "expo-image";
import { Stack, useRouter } from "expo-router";
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** Custom tab bar floats over screen content — every bottom-anchored
 * absolute element needs this clearance, not just the safe-area inset. */
function useTabBarBottomOffset() {
  const insets = useSafeAreaInsets();
  return TAB_BAR_HEIGHT + insets.bottom + (Platform.OS === "android" ? 8 : 0) + 28;
}

type Step = "destination" | "game" | "browse";
type BrowseMode = "search" | "scan";
type SearchScope = "name" | "set";

export default function MultiGameCardScreen() {
  const colors = useColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const router = useRouter();
  const haptics = useHaptics();

  const [step, setStep] = useState<Step>("destination");
  const [showcaseId, setShowcaseId] = useState<string | null>(null);
  const [gameKey, setGameKey] = useState<TcgGameKey | null>(null);

  const { data: showcases = [], isLoading: showcasesLoading } = useGetVisibleShowcases();
  const createShowcase = useCreateShowcase();

  const handleCreateShowcase = useCallback(
    async (name: string) => {
      const showcase = await createShowcase.mutateAsync({ name });
      setShowcaseId(showcase.id);
    },
    [createShowcase],
  );

  const handleFinish = useCallback(async () => {
    await haptics.success();
    if (showcaseId) {
      router.replace({ pathname: "/(tabs)/showcase/[id]", params: { id: showcaseId } });
    } else {
      router.back();
    }
  }, [haptics, router, showcaseId]);

  if (step === "destination") {
    return (
      <DestinationStep
        showcases={showcases}
        selectedId={showcaseId}
        isLoading={showcasesLoading}
        isCreating={createShowcase.isPending}
        onBack={() => router.back()}
        onSelect={setShowcaseId}
        onCreate={handleCreateShowcase}
        onContinue={() => setStep("game")}
        colors={colors}
        styles={styles}
      />
    );
  }

  if (step === "game") {
    return (
      <GameStep
        onBack={() => setStep("destination")}
        onSelect={(key) => {
          setGameKey(key);
          setStep("browse");
        }}
        colors={colors}
        styles={styles}
      />
    );
  }

  return (
    <BrowseStep
      showcaseId={showcaseId!}
      gameKey={gameKey!}
      onBack={() => setStep("game")}
      onFinish={handleFinish}
      colors={colors}
      styles={styles}
    />
  );
}

// --- Step 1: Destination ---

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
  styles,
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
  styles: ReturnType<typeof getStyles>;
}) {
  const insets = useSafeAreaInsets();
  const tabBarOffset = useTabBarBottomOffset();
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
      <Stack.Screen options={{ headerShown: false }} />
      <FlowHeader title="Choose a showcase" subtitle="Trading cards you add will land here." onBack={onBack} colors={colors} />

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={showcases}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const selected = item.id === selectedId;
            return (
              <Pressable
                style={[styles.rowCard, selected && styles.rowCardSelected]}
                onPress={() => onSelect(item.id)}
              >
                <Ionicons name="albums" size={20} color={colors.primary} />
                <Text style={styles.rowCardText} numberOfLines={1}>{item.name}</Text>
                <Ionicons
                  name={selected ? "checkmark-circle" : "ellipse-outline"}
                  size={22}
                  color={selected ? colors.primary : colors.outline}
                />
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No showcases yet — create one below.</Text>
          }
          ListFooterComponent={
            isAdding ? (
              <View style={styles.inlineForm}>
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
                  <TouchableOpacity style={styles.secondaryButton} onPress={() => setIsAdding(false)}>
                    <Text style={styles.secondaryButtonText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.primarySmallButton, (!name.trim() || isCreating) && styles.disabled]}
                    onPress={submit}
                    disabled={!name.trim() || isCreating}
                  >
                    {isCreating ? <ActivityIndicator color="#000" size="small" /> : <Text style={styles.primaryButtonText}>Create</Text>}
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity style={styles.addRow} onPress={() => setIsAdding(true)}>
                <Ionicons name="add" size={20} color={colors.primary} />
                <Text style={styles.addRowText}>Create new showcase</Text>
              </TouchableOpacity>
            )
          }
        />
      )}

      <View style={[styles.bottomBar, { paddingBottom: tabBarOffset }]}>
        <TouchableOpacity
          style={[styles.primaryButton, !selectedId && styles.disabled]}
          onPress={onContinue}
          disabled={!selectedId}
        >
          <Text style={styles.primaryButtonText}>Continue</Text>
          <Ionicons name="arrow-forward" size={20} color="#000" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// --- Step 2: Game picker ---

function GameStep({
  onBack,
  onSelect,
  colors,
  styles,
}: {
  onBack: () => void;
  onSelect: (key: TcgGameKey) => void;
  colors: ThemeColors;
  styles: ReturnType<typeof getStyles>;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.page, { paddingTop: insets.top + 8 }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <FlowHeader title="Which game?" subtitle="Pick the card game you're adding from." onBack={onBack} colors={colors} />
      <View style={styles.gameGrid}>
        {(Object.keys(TCG_CATEGORIES) as TcgGameKey[]).map((key) => (
          <TouchableOpacity
            key={key}
            style={styles.gameCard}
            onPress={() => onSelect(key)}
          >
            <Ionicons name="albums-outline" size={28} color={colors.primary} />
            <Text style={styles.gameCardText}>{TCG_CATEGORIES[key].label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

// --- Step 3: Browse (search or Curator scan) + confirm/add ---

function BrowseStep({
  showcaseId,
  gameKey,
  onBack,
  onFinish,
  colors,
  styles,
}: {
  showcaseId: string;
  gameKey: TcgGameKey;
  onBack: () => void;
  onFinish: () => void;
  colors: ThemeColors;
  styles: ReturnType<typeof getStyles>;
}) {
  const insets = useSafeAreaInsets();
  const tabBarOffset = useTabBarBottomOffset();
  const router = useRouter();
  const haptics = useHaptics();
  const { data: membership } = useMembership();
  const isCurator = membership?.isCurator ?? false;

  const [mode, setMode] = useState<BrowseMode>("search");
  const [searchScope, setSearchScope] = useState<SearchScope>("name");
  const [nameQuery, setNameQuery] = useState("");
  const [setQuery, setSetQuery] = useState("");
  const [selectedSet, setSelectedSet] = useState<TcgSet | null>(null);
  const [confirmCard, setConfirmCard] = useState<TcgCard | null>(null);
  const [addedCount, setAddedCount] = useState(0);
  const [quotaExceeded, setQuotaExceeded] = useState(false);

  const { data: nameResults = [], isLoading: nameSearchLoading } = useSearchTcgCardsByName(
    gameKey,
    nameQuery,
  );
  const { data: sets = [], isLoading: setsLoading } = useSearchTcgSets(gameKey, setQuery);
  const { data: setCards = [], isLoading: cardsLoading } = useTcgSetCards(
    gameKey,
    selectedSet?.id ?? null,
  );

  const hydrateCard = useHydrateTcgCard();
  const scanImage = useScanTcgCardImage();
  const createBatch = useCreateTcgCardBatch();
  const { data: quotaStatus } = useScanQuotaStatus();
  const recordScanAttempt = useRecordScanAttempt();
  const grantBonusScans = useGrantBonusScans();
  const rewardedAd = useRewardedAd();

  const handlePickMode = (next: BrowseMode) => {
    setMode(next);
  };

  // Camera scanning is available to everyone (Curator = unlimited),
  // drawing from the same shared 10/day free-tier counter as the
  // Pokemon scanner and barcode scanner.
  const handleScan = useCallback(
    async (imageUri: string): Promise<TcgScanResult[] | null> => {
      if (!isCurator) {
        const quota = await recordScanAttempt.mutateAsync();
        if (!quota.allowed) {
          await haptics.error();
          setQuotaExceeded(true);
          // null (not []) signals "blocked", distinct from "scanned but
          // found nothing" — ScanPanel must not show a "no matches"
          // alert on top of the quota-exceeded modal.
          return null;
        }
      }
      return scanImage.mutateAsync({ gameKey, imageUri });
    },
    [isCurator, recordScanAttempt, scanImage, gameKey, haptics],
  );

  const handleWatchAdForBonusScans = useCallback(async () => {
    const result = await rewardedAd.show();
    if (result === "earned") {
      await grantBonusScans.mutateAsync(5);
      await haptics.success();
      setQuotaExceeded(false);
    }
  }, [rewardedAd, grantBonusScans, haptics]);

  const handleSelectBrowsedCard = useCallback(
    async (card: TcgCard) => {
      try {
        const hydrated = await hydrateCard.mutateAsync({
          gameKey,
          productId: card.productId,
          setName: card.setName,
        });
        await haptics.selection();
        setConfirmCard(hydrated);
      } catch (error: any) {
        Alert.alert("Couldn't load card", error?.message ?? "Please try again.");
      }
    },
    [hydrateCard, gameKey, haptics],
  );

  const handleSelectScanResult = useCallback(
    async (result: TcgScanResult) => {
      try {
        const hydrated = await hydrateCard.mutateAsync({
          gameKey,
          productId: result.productId,
        });
        await haptics.selection();
        setConfirmCard(hydrated);
      } catch (error: any) {
        Alert.alert("Couldn't load card", error?.message ?? "Please try again.");
      }
    },
    [hydrateCard, gameKey, haptics],
  );

  const handleConfirmAdd = useCallback(async () => {
    if (!confirmCard) return;
    try {
      await createBatch.mutateAsync({
        showcaseId,
        cardIds: [confirmCard.id],
        prices: [confirmCard.marketPrice],
      });
      await haptics.success();
      setAddedCount((count) => count + 1);
      setConfirmCard(null);
    } catch (error: any) {
      Alert.alert("Couldn't add card", error?.message ?? "Please try again.");
    }
  }, [confirmCard, createBatch, showcaseId, haptics]);

  return (
    <View style={[styles.page, { paddingTop: insets.top + 8 }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <FlowHeader
        title={TCG_CATEGORIES[gameKey].label}
        subtitle={addedCount > 0 ? `${addedCount} card${addedCount === 1 ? "" : "s"} added` : "Search by card name or set, or scan with your camera."}
        onBack={selectedSet ? () => setSelectedSet(null) : onBack}
        colors={colors}
      />

      <View style={styles.modeTabs}>
        <TouchableOpacity
          style={[styles.modeTab, mode === "search" && styles.modeTabActive]}
          onPress={() => handlePickMode("search")}
        >
          <Ionicons name="search" size={16} color={mode === "search" ? "#000" : colors.onSurfaceVariant} />
          <Text style={[styles.modeTabText, mode === "search" && styles.modeTabTextActive]}>Search</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modeTab, mode === "scan" && styles.modeTabActive]}
          onPress={() => handlePickMode("scan")}
        >
          <Ionicons name="camera" size={16} color={mode === "scan" ? "#000" : colors.onSurfaceVariant} />
          <Text style={[styles.modeTabText, mode === "scan" && styles.modeTabTextActive]}>Scan</Text>
        </TouchableOpacity>
      </View>

      {mode === "search" ? (
        !selectedSet ? (
          <>
            <View style={styles.scopeTabs}>
              <TouchableOpacity
                style={[styles.scopeTab, searchScope === "name" && styles.scopeTabActive]}
                onPress={() => setSearchScope("name")}
              >
                <Text style={[styles.scopeTabText, searchScope === "name" && styles.scopeTabTextActive]}>
                  Card name
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.scopeTab, searchScope === "set" && styles.scopeTabActive]}
                onPress={() => setSearchScope("set")}
              >
                <Text style={[styles.scopeTabText, searchScope === "set" && styles.scopeTabTextActive]}>
                  Set
                </Text>
              </TouchableOpacity>
            </View>

            {searchScope === "name" ? (
              <>
                <View style={styles.searchBar}>
                  <Ionicons name="search" size={16} color={colors.onSurfaceVariant} />
                  <TextInput
                    style={styles.searchInput}
                    value={nameQuery}
                    onChangeText={setNameQuery}
                    placeholder="Search by card name"
                    placeholderTextColor={colors.grey}
                    autoCapitalize="words"
                  />
                </View>
                {nameSearchLoading ? (
                  <ActivityIndicator color={colors.primary} style={styles.centered} />
                ) : (
                  <FlatList
                    key="name-results-grid"
                    data={nameResults}
                    keyExtractor={(item) => item.id}
                    numColumns={3}
                    contentContainerStyle={styles.cardGrid}
                    columnWrapperStyle={styles.cardGridRow}
                    renderItem={({ item }) => (
                      <TouchableOpacity style={styles.cardCell} onPress={() => handleSelectBrowsedCard(item)}>
                        {item.imageUrl ? (
                          <Image source={{ uri: item.imageUrl }} style={styles.cardCellImage} contentFit="contain" />
                        ) : (
                          <View style={styles.cardCellPlaceholder}>
                            <Ionicons name="image-outline" size={20} color={colors.onSurfaceVariant} />
                          </View>
                        )}
                        <Text style={styles.cardCellText} numberOfLines={2}>{item.name}</Text>
                      </TouchableOpacity>
                    )}
                    ListEmptyComponent={
                      nameQuery.trim().length > 1 ? (
                        <Text style={styles.emptyText}>
                          No previously-added cards match &quot;{nameQuery}&quot;. Card-name
                          search only covers cards someone has already browsed by set —
                          try Set search to find it and add it for everyone.
                        </Text>
                      ) : (
                        <Text style={styles.emptyText}>Type at least 2 characters to search.</Text>
                      )
                    }
                  />
                )}
              </>
            ) : (
              <>
                <View style={styles.searchBar}>
                  <Ionicons name="search" size={16} color={colors.onSurfaceVariant} />
                  <TextInput
                    style={styles.searchInput}
                    value={setQuery}
                    onChangeText={setSetQuery}
                    placeholder="Search for a set (e.g. Kaladesh)"
                    placeholderTextColor={colors.grey}
                    autoCapitalize="words"
                  />
                </View>
                {setsLoading ? (
                  <ActivityIndicator color={colors.primary} style={styles.centered} />
                ) : (
                  <FlatList
                    key="set-results-list"
                    data={sets}
                    keyExtractor={(item) => String(item.id)}
                    contentContainerStyle={styles.list}
                    renderItem={({ item }) => (
                      <TouchableOpacity style={styles.rowCard} onPress={() => setSelectedSet(item)}>
                        <Ionicons name="layers-outline" size={18} color={colors.primary} />
                        <Text style={styles.rowCardText} numberOfLines={1}>{item.name}</Text>
                        <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceVariant} />
                      </TouchableOpacity>
                    )}
                    ListEmptyComponent={
                      setQuery.trim().length > 1 ? (
                        <Text style={styles.emptyText}>No sets found for &quot;{setQuery}&quot;.</Text>
                      ) : (
                        <Text style={styles.emptyText}>Type at least 2 characters to search sets.</Text>
                      )
                    }
                  />
                )}
              </>
            )}
          </>
        ) : cardsLoading ? (
          <ActivityIndicator color={colors.primary} style={styles.centered} />
        ) : (
          <FlatList
            key="set-cards-grid"
            data={setCards}
            keyExtractor={(item) => item.id}
            numColumns={3}
            contentContainerStyle={styles.cardGrid}
            columnWrapperStyle={styles.cardGridRow}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.cardCell} onPress={() => handleSelectBrowsedCard(item)}>
                {item.imageUrl ? (
                  <Image source={{ uri: item.imageUrl }} style={styles.cardCellImage} contentFit="contain" />
                ) : (
                  <View style={styles.cardCellPlaceholder}>
                    <Ionicons name="image-outline" size={20} color={colors.onSurfaceVariant} />
                  </View>
                )}
                <Text style={styles.cardCellText} numberOfLines={2}>{item.name}</Text>
              </TouchableOpacity>
            )}
          />
        )
      ) : (
        <ScanPanel
          gameKey={gameKey}
          onScan={handleScan}
          isScanning={scanImage.isPending || recordScanAttempt.isPending}
          onSelectResult={handleSelectScanResult}
          scansRemaining={isCurator ? null : quotaStatus?.remaining ?? null}
          colors={colors}
          styles={styles}
        />
      )}

      {addedCount > 0 && (
        <View style={[styles.bottomBar, { paddingBottom: tabBarOffset }]}>
          <TouchableOpacity style={styles.primaryButton} onPress={onFinish}>
            <Text style={styles.primaryButtonText}>Done</Text>
            <Ionicons name="checkmark" size={20} color="#000" />
          </TouchableOpacity>
        </View>
      )}

      <Modal visible={!!confirmCard} transparent animationType="fade" onRequestClose={() => setConfirmCard(null)}>
        <Pressable style={styles.confirmBackdrop} onPress={() => setConfirmCard(null)}>
          <Pressable style={styles.confirmCard} onPress={(e) => e.stopPropagation()}>
            {confirmCard?.imageUrl && (
              <Image source={{ uri: confirmCard.imageUrl }} style={styles.confirmImage} contentFit="contain" />
            )}
            <Text style={styles.confirmTitle} numberOfLines={2}>{confirmCard?.name}</Text>
            <Text style={styles.confirmSubtitle}>
              {[confirmCard?.setName, confirmCard?.number ? `#${confirmCard.number}` : null].filter(Boolean).join(" • ")}
            </Text>
            {confirmCard?.marketPrice != null && (
              <Text style={styles.confirmPrice}>${confirmCard.marketPrice.toFixed(2)}</Text>
            )}
            <View style={styles.confirmActions}>
              <TouchableOpacity style={styles.secondaryButton} onPress={() => setConfirmCard(null)}>
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primarySmallButton, createBatch.isPending && styles.disabled]}
                onPress={handleConfirmAdd}
                disabled={createBatch.isPending}
              >
                {createBatch.isPending ? (
                  <ActivityIndicator color="#000" size="small" />
                ) : (
                  <Text style={styles.primaryButtonText}>Add to Showcase</Text>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={quotaExceeded}
        transparent
        animationType="fade"
        onRequestClose={() => setQuotaExceeded(false)}
      >
        <View style={styles.confirmBackdrop}>
          <View style={styles.confirmCard}>
            <Ionicons name="hourglass-outline" size={28} color={colors.primary} />
            <Text style={styles.confirmTitle}>Out of free scans for today</Text>
            <Text style={styles.confirmSubtitle}>
              Free accounts get 10 scans a day (barcode + card scans
              combined). Watch a short ad for 5 more, or upgrade to
              Curator for unlimited scans.
            </Text>
            <View style={styles.confirmActions}>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => setQuotaExceeded(false)}
              >
                <Text style={styles.secondaryButtonText}>Not now</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.primarySmallButton,
                  (rewardedAd.isLoading || grantBonusScans.isPending) && styles.disabled,
                ]}
                onPress={handleWatchAdForBonusScans}
                disabled={rewardedAd.isLoading || grantBonusScans.isPending}
              >
                {rewardedAd.isLoading || grantBonusScans.isPending ? (
                  <ActivityIndicator color="#000" size="small" />
                ) : (
                  <Text style={styles.primaryButtonText}>Watch ad for +5</Text>
                )}
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              onPress={() => {
                setQuotaExceeded(false);
                router.push("/(tabs)/profile/membership" as any);
              }}
            >
              <Text style={styles.addRowText}>Upgrade to Curator for unlimited scans</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// --- Scan panel (everyone; shares the 10/day free-tier scan quota) ---

function ScanPanel({
  gameKey: _gameKey,
  onScan,
  isScanning,
  onSelectResult,
  scansRemaining,
  colors,
  styles,
}: {
  gameKey: TcgGameKey;
  onScan: (imageUri: string) => Promise<TcgScanResult[] | null>;
  isScanning: boolean;
  onSelectResult: (result: TcgScanResult) => void;
  /** null = unlimited (Curator). */
  scansRemaining: number | null;
  colors: ThemeColors;
  styles: ReturnType<typeof getStyles>;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [results, setResults] = useState<TcgScanResult[] | null>(null);
  const haptics = useHaptics();
  const { width } = useWindowDimensions();
  // Matches calculateCardCrop's assumption in api/tcg/catalog.ts (centered,
  // ~90% width, standard card aspect ratio) — without a guide the user has
  // no idea where to hold the card, so the crop almost never lands on it.
  const frameWidth = Math.min(width * 0.7, 320);
  const frameHeight = frameWidth * (88 / 63);

  const handleCapture = async () => {
    if (!cameraRef.current) return;
    try {
      const picture = await cameraRef.current.takePictureAsync({ quality: 0.8 });
      if (!picture?.uri) return;
      await haptics.medium();
      const scanResults = await onScan(picture.uri);
      if (scanResults === null) return; // blocked by quota — parent shows its own modal
      setResults(scanResults);
      if (scanResults.length === 0) {
        Alert.alert("No matches found", "Try again with better lighting and the card filling the frame.");
      }
    } catch (error: any) {
      Alert.alert("Scan failed", error?.message ?? "Please try again.");
    }
  };

  if (!permission) return <ActivityIndicator color={colors.primary} style={styles.centered} />;

  if (!permission.granted) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>Camera access is needed to scan cards.</Text>
        <TouchableOpacity style={styles.primarySmallButton} onPress={requestPermission}>
          <Text style={styles.primaryButtonText}>Grant Access</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (results) {
    return (
      <FlatList
        key="scan-results"
        data={results}
        keyExtractor={(item) => String(item.productId)}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <TouchableOpacity style={styles.addRow} onPress={() => setResults(null)}>
            <Ionicons name="camera-reverse-outline" size={18} color={colors.primary} />
            <Text style={styles.addRowText}>Scan again</Text>
          </TouchableOpacity>
        }
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.rowCard} onPress={() => onSelectResult(item)}>
            <Ionicons name="pricetag-outline" size={18} color={colors.primary} />
            <Text style={styles.rowCardText} numberOfLines={1}>{item.name}</Text>
            <Text style={styles.scoreText}>{item.score}</Text>
          </TouchableOpacity>
        )}
      />
    );
  }

  return (
    <View style={styles.cameraWrap}>
      <CameraView ref={cameraRef} style={styles.camera} facing="back" ratio="4:3" />
      <View style={styles.scannerCenter} pointerEvents="none">
        <View style={[styles.scanCardFrame, { width: frameWidth, height: frameHeight }]} />
        <Text style={styles.scanFrameHint}>Fill the frame with the card</Text>
      </View>
      {scansRemaining != null && (
        <View style={styles.scanQuotaPill} pointerEvents="none">
          <Ionicons name="scan-outline" size={12} color="#FFF" />
          <Text style={styles.scanQuotaPillText}>
            {scansRemaining} scan{scansRemaining === 1 ? "" : "s"} left today
          </Text>
        </View>
      )}
      <TouchableOpacity
        style={[styles.shutterButton, isScanning && styles.disabled]}
        onPress={handleCapture}
        disabled={isScanning}
      >
        {isScanning ? <ActivityIndicator color="#000" /> : <View style={styles.shutterInner} />}
      </TouchableOpacity>
    </View>
  );
}

// --- Shared header ---

function FlowHeader({
  title,
  subtitle,
  onBack,
  colors,
}: {
  title: string;
  subtitle?: string;
  onBack: () => void;
  colors: ThemeColors;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingBottom: 16 }}>
      <TouchableOpacity onPress={onBack} style={{ padding: 6 }}>
        <Ionicons name="arrow-back" size={22} color={colors.text} />
      </TouchableOpacity>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.text, fontSize: 18, fontWeight: "800" }}>{title}</Text>
        {subtitle && <Text style={{ color: colors.onSurfaceVariant, fontSize: 12, marginTop: 2 }}>{subtitle}</Text>}
      </View>
    </View>
  );
}

const getStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    page: { flex: 1, backgroundColor: colors.background },
    centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
    list: { paddingHorizontal: 20, paddingBottom: 160, gap: 10 },
    rowCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      padding: 14,
      borderRadius: 14,
      backgroundColor: colors.surfaceContainer,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
    },
    rowCardSelected: { borderColor: colors.primary },
    rowCardText: { flex: 1, color: colors.text, fontSize: 15, fontWeight: "600" },
    scoreText: { color: colors.onSurfaceVariant, fontSize: 12, fontWeight: "700" },
    emptyText: { color: colors.onSurfaceVariant, fontSize: 13, textAlign: "center", padding: 20 },
    inlineForm: { padding: 14, borderRadius: 14, backgroundColor: colors.surfaceContainer, gap: 10 },
    textInput: {
      backgroundColor: colors.surfaceContainerHigh,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: colors.text,
      fontSize: 15,
    },
    errorText: { color: colors.danger, fontSize: 12 },
    inlineActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10 },
    addRow: { flexDirection: "row", alignItems: "center", gap: 8, padding: 14 },
    addRowText: { color: colors.primary, fontSize: 14, fontWeight: "700" },
    bottomBar: { position: "absolute", left: 0, right: 0, bottom: 0, padding: 16 },
    primaryButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      backgroundColor: colors.primary,
      height: 52,
      borderRadius: 999,
    },
    primarySmallButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      backgroundColor: colors.primary,
      paddingHorizontal: 18,
      paddingVertical: 10,
      borderRadius: 999,
    },
    primaryButtonText: { color: "#000", fontSize: 14, fontWeight: "800" },
    secondaryButton: { paddingHorizontal: 14, paddingVertical: 10 },
    secondaryButtonText: { color: colors.grey, fontSize: 14, fontWeight: "600" },
    disabled: { opacity: 0.5 },
    gameGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12, paddingHorizontal: 20 },
    gameCard: {
      flex: 1,
      minWidth: "45%",
      alignItems: "center",
      gap: 10,
      padding: 24,
      borderRadius: 18,
      backgroundColor: colors.surfaceContainer,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
    },
    gameCardText: { color: colors.text, fontSize: 15, fontWeight: "700", textAlign: "center" },
    modeTabs: {
      flexDirection: "row",
      gap: 8,
      paddingHorizontal: 20,
      marginBottom: 14,
    },
    modeTab: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: colors.surfaceContainer,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
    },
    modeTabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    modeTabText: { color: colors.onSurfaceVariant, fontSize: 13, fontWeight: "700" },
    modeTabTextActive: { color: "#000" },
    scopeTabs: {
      flexDirection: "row",
      gap: 16,
      paddingHorizontal: 20,
      marginBottom: 10,
    },
    scopeTab: {
      paddingVertical: 6,
      borderBottomWidth: 2,
      borderBottomColor: "transparent",
    },
    scopeTabActive: { borderBottomColor: colors.primary },
    scopeTabText: { color: colors.onSurfaceVariant, fontSize: 13, fontWeight: "600" },
    scopeTabTextActive: { color: colors.text, fontWeight: "800" },
    searchBar: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginHorizontal: 20,
      marginBottom: 14,
      paddingHorizontal: 12,
      height: 44,
      borderRadius: 12,
      backgroundColor: colors.surfaceContainerHigh,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
    },
    searchInput: { flex: 1, color: colors.text, fontSize: 14 },
    cardGrid: { paddingHorizontal: 16, paddingBottom: 160, gap: 10 },
    cardGridRow: { gap: 10 },
    cardCell: { flex: 1, alignItems: "center", gap: 6, padding: 6 },
    cardCellImage: { width: "100%", aspectRatio: 63 / 88, borderRadius: 6 },
    cardCellPlaceholder: {
      width: "100%",
      aspectRatio: 63 / 88,
      borderRadius: 6,
      backgroundColor: colors.surfaceContainerHigh,
      alignItems: "center",
      justifyContent: "center",
    },
    cardCellText: { color: colors.onSurfaceVariant, fontSize: 10, textAlign: "center" },
    cameraWrap: { flex: 1, marginHorizontal: 20, borderRadius: 18, overflow: "hidden" },
    camera: { flex: 1 },
    scannerCenter: {
      ...StyleSheet.absoluteFillObject,
      alignItems: "center",
      justifyContent: "center",
      gap: 12,
    },
    scanCardFrame: {
      borderRadius: 16,
      borderWidth: 2,
      borderColor: "rgba(255,255,255,0.7)",
    },
    scanFrameHint: {
      color: "#FFF",
      fontSize: 12,
      fontWeight: "700",
      backgroundColor: "rgba(0,0,0,0.5)",
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
    },
    scanQuotaPill: {
      position: "absolute",
      top: 12,
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
    shutterButton: {
      position: "absolute",
      bottom: 20,
      alignSelf: "center",
      width: 70,
      height: 70,
      borderRadius: 35,
      borderWidth: 4,
      borderColor: "#FFF",
      alignItems: "center",
      justifyContent: "center",
    },
    shutterInner: { width: 54, height: 54, borderRadius: 27, backgroundColor: "#FFF" },
    confirmBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", padding: 24 },
    confirmCard: {
      alignItems: "center",
      gap: 8,
      padding: 20,
      borderRadius: 20,
      backgroundColor: colors.surfaceContainer,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
    },
    confirmImage: { width: 140, aspectRatio: 63 / 88, borderRadius: 10 },
    confirmTitle: { color: colors.text, fontSize: 17, fontWeight: "800", textAlign: "center" },
    confirmSubtitle: { color: colors.onSurfaceVariant, fontSize: 12, textAlign: "center" },
    confirmPrice: { color: colors.primary, fontSize: 18, fontWeight: "800" },
    confirmActions: { flexDirection: "row", gap: 10, marginTop: 8 },
  });
