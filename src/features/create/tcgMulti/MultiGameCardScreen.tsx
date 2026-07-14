import { useMembership } from "@/api/memberships";
import { useCreateShowcase, useGetVisibleShowcases, type ShowcaseRow } from "@/api/showcase";
import {
  TCG_CATEGORIES,
  useCreateTcgCardBatch,
  useHydrateTcgCard,
  useScanTcgCardImage,
  useSearchTcgSets,
  useTcgSetCards,
  type TcgCard,
  type TcgGameKey,
  type TcgScanResult,
  type TcgSet,
} from "@/api/tcg";
import { useColors, type ThemeColors } from "@/constants/theme";
import { useHaptics } from "@/hooks/useHaptics";
import { CuratorGateModal } from "@/src/features/membership/CuratorGate";
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
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Step = "destination" | "game" | "browse";
type BrowseMode = "search" | "scan";

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

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
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
  const haptics = useHaptics();
  const { data: membership } = useMembership();
  const isCurator = membership?.isCurator ?? false;

  const [mode, setMode] = useState<BrowseMode>("search");
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [setQuery, setSetQuery] = useState("");
  const [selectedSet, setSelectedSet] = useState<TcgSet | null>(null);
  const [confirmCard, setConfirmCard] = useState<TcgCard | null>(null);
  const [addedCount, setAddedCount] = useState(0);

  const { data: sets = [], isLoading: setsLoading } = useSearchTcgSets(gameKey, setQuery);
  const { data: setCards = [], isLoading: cardsLoading } = useTcgSetCards(
    gameKey,
    selectedSet?.id ?? null,
  );

  const hydrateCard = useHydrateTcgCard();
  const scanImage = useScanTcgCardImage();
  const createBatch = useCreateTcgCardBatch();

  const handlePickMode = (next: BrowseMode) => {
    if (next === "scan" && !isCurator) {
      setPaywallVisible(true);
      return;
    }
    setMode(next);
  };

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
        subtitle={addedCount > 0 ? `${addedCount} card${addedCount === 1 ? "" : "s"} added` : "Search a set, or scan with Curator."}
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
          <Ionicons name={isCurator ? "camera" : "lock-closed"} size={16} color={mode === "scan" ? "#000" : colors.onSurfaceVariant} />
          <Text style={[styles.modeTabText, mode === "scan" && styles.modeTabTextActive]}>Scan</Text>
        </TouchableOpacity>
      </View>

      {mode === "search" ? (
        !selectedSet ? (
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
        ) : cardsLoading ? (
          <ActivityIndicator color={colors.primary} style={styles.centered} />
        ) : (
          <FlatList
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
          onScan={async (uri) => {
            const results = await scanImage.mutateAsync({ gameKey, imageUri: uri });
            return results;
          }}
          isScanning={scanImage.isPending}
          onSelectResult={handleSelectScanResult}
          colors={colors}
          styles={styles}
        />
      )}

      {addedCount > 0 && (
        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
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

      <CuratorGateModal
        visible={paywallVisible}
        feature="Camera card scanning"
        description="Point your camera at any Magic or Yu-Gi-Oh card and let Curator match it automatically."
        onDismiss={() => setPaywallVisible(false)}
      />
    </View>
  );
}

// --- Scan panel (Curator) ---

function ScanPanel({
  gameKey: _gameKey,
  onScan,
  isScanning,
  onSelectResult,
  colors,
  styles,
}: {
  gameKey: TcgGameKey;
  onScan: (imageUri: string) => Promise<TcgScanResult[]>;
  isScanning: boolean;
  onSelectResult: (result: TcgScanResult) => void;
  colors: ThemeColors;
  styles: ReturnType<typeof getStyles>;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [results, setResults] = useState<TcgScanResult[] | null>(null);
  const haptics = useHaptics();

  const handleCapture = async () => {
    if (!cameraRef.current) return;
    try {
      const picture = await cameraRef.current.takePictureAsync({ quality: 0.8 });
      if (!picture?.uri) return;
      await haptics.medium();
      const scanResults = await onScan(picture.uri);
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
    list: { paddingHorizontal: 20, paddingBottom: 120, gap: 10 },
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
    cardGrid: { paddingHorizontal: 16, paddingBottom: 120, gap: 10 },
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
