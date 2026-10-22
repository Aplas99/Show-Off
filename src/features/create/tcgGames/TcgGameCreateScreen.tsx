import { useMembership } from "@/api/memberships";
import { useRecordSearchAttempt } from "@/api/scanning";
import {
  useCreateShowcase,
  useGetVisibleShowcases,
  type ShowcaseRow,
} from "@/api/showcase";
import {
  searchTcgCardsCacheFirst,
  useCreateTcgCardBatch,
  type TcgCard,
  type TcgCardSearchResult,
} from "@/api/tcg";
import { TAB_BAR_HEIGHT } from "@/constants/layoutConfig";
import { TCG_GAMES, getTcgGameName, isTcgGameCode, type TcgGameCode } from "@/constants/tcgGames";
import { useColors, type ThemeColors } from "@/constants/theme";
import { useHaptics } from "@/hooks/useHaptics";
import { createActionLogger } from "@/lib/actionDebug";
import { Image } from "@/src/components/media/ProtectedImage";
import SearchQuotaModal from "@/src/components/membership/SearchQuotaModal";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
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
  View,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// Shared create flow for every card game in constants/tcgGames.ts. Search
// only for now: PokéWallet has no scanner support here, and its plan limits
// make the shared cache the first stop for every search.
type FlowStep = "game" | "destination" | "search";

interface QueueEntry {
  id: string;
  card: TcgCard;
}

const tcgUiDebug = createActionLogger("TcgCards");

/** "Set • #LOB-005 • Ultra Rare" line shared by search results and the review queue. */
function describeCard(card: TcgCard) {
  return [
    card.set_name ?? card.set_code,
    card.card_number ? `#${card.card_number}` : null,
    card.rarity,
  ].filter(Boolean).join(" • ");
}

export default function TcgGameCreateScreen() {
  const params = useLocalSearchParams<{ game?: string }>();
  const initialGame = isTcgGameCode(params.game) ? params.game : null;
  const [game, setGame] = useState<TcgGameCode | null>(initialGame);
  const [step, setStep] = useState<FlowStep>(initialGame ? "destination" : "game");
  const [showcaseId, setShowcaseId] = useState<string | null>(null);
  const [entries, setEntries] = useState<QueueEntry[]>([]);
  const [queueOpen, setQueueOpen] = useState(false);
  const colors = useColors();
  const router = useRouter();
  const haptics = useHaptics();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const { data: showcases = [], isLoading } = useGetVisibleShowcases();
  const createShowcase = useCreateShowcase();
  const createBatch = useCreateTcgCardBatch();

  useEffect(() => {
    if (showcaseId || showcases.length === 0) return;
    setShowcaseId((showcases.find((item) => item.is_default) ?? showcases[0]).id);
  }, [showcaseId, showcases]);

  const selectedShowcase = showcases.find((item) => item.id === showcaseId);

  const handleCreateShowcase = useCallback(
    async (name: string) => {
      const showcase = await createShowcase.mutateAsync({ name });
      tcgUiDebug.log("showcase.created", { showcaseId: showcase.id, name });
      setShowcaseId(showcase.id);
      await haptics.success();
    },
    [createShowcase, haptics],
  );

  const handleAddCard = useCallback(
    async (card: TcgCard) => {
      const entry: QueueEntry = {
        id: `${card.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        card,
      };
      tcgUiDebug.log("queue.card-added", { cardId: card.id, game: card.game });
      setEntries((current) => [...current, entry]);
      await haptics.success();
    },
    [haptics],
  );

  const handleRemoveEntry = useCallback((id: string) => {
    tcgUiDebug.log("queue.card-removed", { entryId: id });
    setEntries((current) => current.filter((entry) => entry.id !== id));
  }, []);

  const handleSave = useCallback(async () => {
    if (!showcaseId || entries.length === 0) return;
    try {
      await createBatch.mutateAsync({
        showcaseId,
        cardIds: entries.map((entry) => entry.card.id),
      });
    } catch (error) {
      tcgUiDebug.error("queue.save-failed", error);
      return;
    }
    await haptics.success();
    setQueueOpen(false);
    router.replace({
      pathname: "/(tabs)/showcase/[id]",
      params: { id: showcaseId },
    });
  }, [createBatch, entries, haptics, router, showcaseId]);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar barStyle="default" />

      {step === "game" && (
        <GameStep
          selected={game}
          onBack={() => router.replace("/(tabs)/create")}
          onSelect={(code) => {
            // A queue can only hold one game's cards at a time.
            if (code !== game) setEntries([]);
            setGame(code);
            setStep("destination");
          }}
          colors={colors}
        />
      )}

      {step === "destination" && game && (
        <DestinationStep
          gameName={getTcgGameName(game)}
          showcases={showcases}
          selectedId={showcaseId}
          isLoading={isLoading}
          isCreating={createShowcase.isPending}
          onBack={() => (initialGame ? router.replace("/(tabs)/create") : setStep("game"))}
          onSelect={setShowcaseId}
          onCreate={handleCreateShowcase}
          onContinue={() => setStep("search")}
          colors={colors}
        />
      )}

      {step === "search" && game && selectedShowcase && (
        <SearchStep
          game={game}
          showcase={selectedShowcase}
          count={entries.length}
          onBack={() => setStep("destination")}
          onAddCard={handleAddCard}
          onOpenQueue={() => {
            tcgUiDebug.log("queue.review-opened", { count: entries.length });
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

function GameStep({
  selected,
  onBack,
  onSelect,
  colors,
}: {
  selected: TcgGameCode | null;
  onBack: () => void;
  onSelect: (code: TcgGameCode) => void;
  colors: ThemeColors;
}) {
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const bottomOffset = TAB_BAR_HEIGHT + insets.bottom + (Platform.OS === "android" ? 8 : 0) + 28;

  return (
    <View style={[styles.page, { paddingTop: insets.top + 8 }]}>
      <FlowHeader
        title="Choose a game"
        subtitle="Search any of these games by card name or number."
        onBack={onBack}
        colors={colors}
      />
      <FlatList
        data={TCG_GAMES}
        keyExtractor={(item) => item.code}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[styles.destinationList, { paddingBottom: bottomOffset }]}
        renderItem={({ item, index }) => (
          <Animated.View entering={FadeInDown.delay(index * 35)}>
            <Pressable
              style={[styles.showcaseCard, item.code === selected && styles.showcaseCardSelected]}
              onPress={() => onSelect(item.code)}
            >
              <View style={styles.showcaseIcon}>
                <Ionicons name="layers" size={22} color={colors.primary} />
              </View>
              <Text style={[styles.showcaseName, styles.flex]}>{item.name}</Text>
              <Ionicons name="chevron-forward" size={20} color={colors.onSurfaceVariant} />
            </Pressable>
          </Animated.View>
        )}
      />
    </View>
  );
}

function DestinationStep({
  gameName,
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
  gameName: string;
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
        subtitle={`Every ${gameName} card you add will land here.`}
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
                    placeholder={`${gameName} collection`}
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
          <Text style={styles.primaryButtonText}>Start searching</Text>
          <Ionicons name="arrow-forward" size={20} color="#000" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function SearchStep({
  game,
  showcase,
  count,
  onBack,
  onAddCard,
  onOpenQueue,
  colors,
}: {
  game: TcgGameCode;
  showcase: ShowcaseRow;
  count: number;
  onBack: () => void;
  onAddCard: (card: TcgCard) => Promise<void>;
  onOpenQueue: () => void;
  colors: ThemeColors;
}) {
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const [query, setQuery] = useState("");
  // The query the results belong to, so "load more" pages stay consistent.
  const [searchedQuery, setSearchedQuery] = useState("");
  const [results, setResults] = useState<TcgCard[]>([]);
  const [lastPage, setLastPage] = useState<TcgCardSearchResult | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [searchQuotaExceeded, setSearchQuotaExceeded] = useState(false);
  const { data: membership } = useMembership();
  const isCurator = membership?.isCurator ?? false;
  const recordSearchAttempt = useRecordSearchAttempt();

  const bottomOffset =
    TAB_BAR_HEIGHT + insets.bottom + (Platform.OS === "android" ? 8 : 0) + 28;

  const runSearch = async (text: string, options: { page?: number; bypassCache?: boolean; append?: boolean } = {}) => {
    const trimmed = text.trim();
    if (trimmed.length < 2 || isSearching) return;

    // Free-tier search quota also protects the shared PokéWallet budget.
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
      const result = await searchTcgCardsCacheFirst({
        game,
        query: trimmed,
        page: options.page,
        bypassCache: options.bypassCache,
      });
      setResults((current) => {
        if (!options.append) return result.cards;
        const seen = new Set(current.map((card) => card.id));
        return [...current, ...result.cards.filter((card) => !seen.has(card.id))];
      });
      setLastPage(result);
      setSearchedQuery(trimmed);
    } catch (caught) {
      tcgUiDebug.error("search.ui-failed", caught);
      setError(caught instanceof Error && /busy|limit/i.test(caught.message)
        ? caught.message
        : "Couldn't search for that card. Please try again.");
    } finally {
      setIsSearching(false);
    }
  };

  const addCard = async (card: TcgCard) => {
    setAddingId(card.id);
    try {
      await onAddCard(card);
    } finally {
      setAddingId(null);
    }
  };

  const canLoadMore = lastPage?.source === "api" && lastPage.totalPages != null && lastPage.page < lastPage.totalPages;
  const fromCache = lastPage?.source === "cache";

  return (
    <View style={[styles.page, { paddingTop: insets.top + 8 }]}>
      <FlowHeader
        title={showcase.name}
        subtitle={`Search ${getTcgGameName(game)} cards by name or number to add them to your queue.`}
        onBack={onBack}
        colors={colors}
      />

      <View style={styles.manualSearchFields}>
        <View style={styles.manualSearchRow}>
          <TextInput
            style={[styles.textInput, styles.flex]}
            value={query}
            onChangeText={setQuery}
            placeholder="Card name or number"
            placeholderTextColor={colors.grey}
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={() => runSearch(query)}
          />
          <TouchableOpacity
            style={[styles.searchIconButton, (query.trim().length < 2 || isSearching) && styles.disabled]}
            onPress={() => runSearch(query)}
            disabled={query.trim().length < 2 || isSearching}
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
        renderItem={({ item }) => (
          <View style={styles.candidateCard}>
            <CardThumb card={item} colors={colors} />
            <View style={styles.flex}>
              <Text style={styles.reviewTitle} numberOfLines={1}>{item.name}</Text>
              <Text style={styles.reviewMeta} numberOfLines={2}>{describeCard(item)}</Text>
              {item.market_price != null && (
                <Text style={styles.reviewMeta}>${item.market_price.toFixed(2)}</Text>
              )}
            </View>
            <TouchableOpacity onPress={() => addCard(item)} disabled={addingId === item.id}>
              {addingId === item.id ? (
                <ActivityIndicator color={colors.primary} size="small" />
              ) : (
                <Ionicons name="add-circle" size={25} color={colors.primary} />
              )}
            </TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={
          lastPage && !isSearching ? (
            <View style={styles.emptyState}>
              <Ionicons name="search-outline" size={40} color={colors.grey} />
              <Text style={styles.emptyTitle}>No matching card found</Text>
              <Text style={styles.emptyDescription}>
                Try the card name, or the number printed on the card.
              </Text>
            </View>
          ) : null
        }
        ListFooterComponent={
          fromCache && results.length > 0 ? (
            <TouchableOpacity
              style={styles.addShowcaseButton}
              onPress={() => runSearch(searchedQuery, { bypassCache: true })}
              disabled={isSearching}
            >
              <Ionicons name="globe-outline" size={18} color={colors.primary} />
              <Text style={styles.addShowcaseText}>Not here? Search the full catalog</Text>
            </TouchableOpacity>
          ) : canLoadMore ? (
            <TouchableOpacity
              style={styles.addShowcaseButton}
              onPress={() => runSearch(searchedQuery, { page: (lastPage?.page ?? 1) + 1, bypassCache: true, append: true })}
              disabled={isSearching}
            >
              {isSearching ? (
                <ActivityIndicator color={colors.primary} size="small" />
              ) : (
                <Text style={styles.addShowcaseText}>Load more</Text>
              )}
            </TouchableOpacity>
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

function CardThumb({ card, colors, fit = "cover" }: { card: TcgCard; colors: ThemeColors; fit?: "cover" | "contain" }) {
  const styles = useMemo(() => getStyles(colors), [colors]);
  return card.image_url ? (
    <Image source={{ uri: card.image_url }} style={styles.candidateImage} contentFit={fit} />
  ) : (
    <View style={[styles.candidateImage, styles.missingCardImage]}>
      <Ionicons name="image-outline" size={22} color={colors.grey} />
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
      <View style={[styles.modalPage, { paddingTop: Math.max(insets.top, 20) }]}>
        <View style={styles.flowHeader}>
          <View style={styles.flex}>
            <Text style={styles.modalTitle}>
              {entries.length} card{entries.length === 1 ? "" : "s"} ready
            </Text>
            <Text style={styles.flowSubtitle}>Review before adding to your showcase.</Text>
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
          renderItem={({ item, index }) => (
            <Animated.View entering={FadeInDown.delay(index * 35)} style={styles.candidateCard}>
              <CardThumb card={item.card} colors={colors} fit="contain" />
              <View style={styles.flex}>
                <Text style={styles.reviewTitle} numberOfLines={1}>{item.card.name}</Text>
                <Text style={styles.reviewMeta} numberOfLines={1}>{describeCard(item.card)}</Text>
              </View>
              <TouchableOpacity style={styles.removeButton} onPress={() => onRemove(item.id)}>
                <Ionicons name="trash-outline" size={20} color={colors.danger} />
              </TouchableOpacity>
            </Animated.View>
          )}
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
    modalPage: { flex: 1, backgroundColor: colors.background },
    centered: { flex: 1, alignItems: "center", justifyContent: "center" },
    flex: { flex: 1 },
    flowHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 12,
      paddingHorizontal: 20,
      paddingBottom: 16,
    },
    flowTitle: { color: colors.text, fontSize: 20, fontWeight: "800" },
    flowSubtitle: { color: colors.onSurfaceVariant, fontSize: 13, marginTop: 2 },
    modalTitle: { color: colors.text, fontSize: 18, fontWeight: "800" },
    backButton: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surfaceContainerHighest,
    },
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
    errorText: { color: colors.danger, fontSize: 12 },
    inlineActions: { flexDirection: "row", gap: 10 },
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
    reviewList: { paddingHorizontal: 20, gap: 10, paddingBottom: 20 },
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
    removeButton: { padding: 6 },
  });
}
