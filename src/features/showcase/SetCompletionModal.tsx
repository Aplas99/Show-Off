import { type ItemWithProduct } from "@/api/items";
import { useSetRoster, type RosterCard } from "@/api/sets";
import { useTcgSetRosterCounts } from "@/api/tcg";
import { getRiftboundSet } from "@/constants/riftboundSets";
import { isTcgGameCode } from "@/constants/tcgGames";
import { useColors, type ThemeColors } from "@/constants/theme";
import { ITEM_GAMES, getItemCardId, getItemGame, type ItemGame } from "@/lib/itemCards";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "@/src/components/media/ProtectedImage";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  SectionList,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const GRID_COLUMNS = 3;
const GRID_GAP = 8;
const GRID_PADDING = 16;
const CARD_ASPECT = 63 / 88;

interface SetSummary {
  /** `${game}:${setId}`; set ids are only unique within a game. */
  key: string;
  game: ItemGame;
  /** The id each game's roster loader takes (Pokémon set id, Magic/Riftbound set code, PokéWallet set id). */
  setId: string;
  name: string;
  /** Printed set size when known without loading the roster. */
  printedTotal: number | null;
  ownedCardIds: Set<string>;
}

/** Which set an item's card belongs to, in roster-loader terms. */
function getItemSet(item: ItemWithProduct, game: ItemGame): { setId: string; name: string; printedTotal: number | null } | null {
  if (game === "pokemon") {
    if (!item.pokemonSetId) return null;
    return {
      setId: item.pokemonSetId,
      name: item.products?.searchableDescription?.split(" • ")[0] || item.pokemonSetId,
      printedTotal: item.pokemonSetPrintedTotal ?? null,
    };
  }
  if (game === "magic") {
    if (!item.magicSetCode) return null;
    return { setId: item.magicSetCode, name: item.magicSetName || item.magicSetCode.toUpperCase(), printedTotal: null };
  }
  if (game === "riftbound") {
    if (!item.riftboundSetCode) return null;
    return {
      setId: item.riftboundSetCode,
      name: item.riftboundSetName || item.riftboundSetCode,
      printedTotal: getRiftboundSet(item.riftboundSetCode)?.printedTotal ?? null,
    };
  }
  if (!item.tcgSetId) return null;
  return { setId: item.tcgSetId, name: item.tcgSetName || item.tcgSetCode || "Unknown set", printedTotal: null };
}

/**
 * Curator set-completion view: for each card set present in the showcase
 * (every game), shows collected-vs-total progress; drilling in renders the
 * full set roster with missing cards dimmed. Entry point is gated on Curator
 * membership by the caller — this component assumes access is already allowed.
 */
export default function SetCompletionModal({
  visible,
  items,
  onClose,
}: {
  visible: boolean;
  items: ItemWithProduct[];
  onClose: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const sets = useMemo(() => {
    const byKey = new Map<string, SetSummary>();
    for (const item of items) {
      const game = getItemGame(item);
      const cardId = getItemCardId(item);
      if (!game || !cardId) continue;
      const set = getItemSet(item, game);
      if (!set) continue;
      const key = `${game}:${set.setId}`;
      let entry = byKey.get(key);
      if (!entry) {
        entry = { key, game, ...set, ownedCardIds: new Set() };
        byKey.set(key, entry);
      }
      entry.ownedCardIds.add(cardId);
      if (entry.printedTotal == null && set.printedTotal != null) entry.printedTotal = set.printedTotal;
    }
    return Array.from(byKey.values());
  }, [items]);

  // One section per game, in tab order; sets with the most cards first.
  const sections = useMemo(
    () =>
      ITEM_GAMES.map((game) => ({
        key: game.key,
        title: game.label,
        data: sets
          .filter((set) => set.game === game.key)
          .sort((a, b) => b.ownedCardIds.size - a.ownedCardIds.size),
      })).filter((section) => section.data.length > 0),
    [sets],
  );
  const showSectionHeaders = sections.length > 1;

  const selectedSet = sets.find((set) => set.key === selectedKey) ?? null;

  const handleClose = () => {
    setSelectedKey(null);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View style={[styles.page, { paddingTop: Math.max(insets.top, 20) }]}>
        <View style={styles.header}>
          {selectedSet ? (
            <TouchableOpacity
              style={styles.headerButton}
              onPress={() => setSelectedKey(null)}
            >
              <Ionicons name="arrow-back" size={22} color={colors.text} />
            </TouchableOpacity>
          ) : null}
          <View style={styles.flex}>
            <Text style={styles.title} numberOfLines={1}>
              {selectedSet ? selectedSet.name : "Set completion"}
            </Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              {selectedSet
                ? "Dimmed cards are missing from this showcase."
                : "How close is this showcase to a complete set?"}
            </Text>
          </View>
          <TouchableOpacity style={styles.headerButton} onPress={handleClose}>
            <Ionicons name="close" size={22} color={colors.text} />
          </TouchableOpacity>
        </View>

        {selectedSet ? (
          <SetRosterGrid set={selectedSet} colors={colors} />
        ) : (
          <SectionList
            sections={sections}
            keyExtractor={(set) => set.key}
            contentContainerStyle={styles.setList}
            stickySectionHeadersEnabled={false}
            renderSectionHeader={({ section }) =>
              showSectionHeaders ? <Text style={styles.sectionHeader}>{section.title}</Text> : null
            }
            renderItem={({ item: set }) => (
              <SetRow set={set} onPress={() => setSelectedKey(set.key)} colors={colors} />
            )}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Ionicons name="albums-outline" size={42} color={colors.grey} />
                <Text style={styles.emptyTitle}>No card sets yet</Text>
                <Text style={styles.emptyDescription}>
                  Add some trading cards and their sets will show up here.
                </Text>
              </View>
            }
          />
        )}
      </View>
    </Modal>
  );
}

/**
 * One set's progress row. The set size comes from the printed total when
 * known, else from the roster: Magic loads it (Scryfall is free); PokéWallet
 * games only use a roster someone already cached, so the list never spends
 * their limited quota.
 */
function SetRow({ set, onPress, colors }: { set: SetSummary; onPress: () => void; colors: ThemeColors }) {
  const styles = useMemo(() => getStyles(colors), [colors]);
  const tcgGame = isTcgGameCode(set.game) ? set.game : null;
  const { data: magicRoster } = useSetRoster(set.game, set.setId, set.game === "magic");
  const { data: tcgCounts } = useTcgSetRosterCounts(tcgGame, tcgGame ? [set.setId] : []);

  const owned = set.ownedCardIds.size;
  const total = set.printedTotal ?? magicRoster?.length ?? tcgCounts?.get(set.setId) ?? null;
  const ratio = total ? Math.min(owned / total, 1) : null;

  return (
    <TouchableOpacity style={styles.setRow} onPress={onPress}>
      <View style={styles.flex}>
        <Text style={styles.setName} numberOfLines={1}>{set.name}</Text>
        <Text style={styles.setMeta}>
          {total
            ? `${owned} of ${total} cards collected`
            : `${owned} card${owned === 1 ? "" : "s"} collected`}
        </Text>
        {ratio != null && (
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                {
                  backgroundColor: ratio >= 1 ? "#22c55e" : colors.primary,
                  width: `${Math.round(ratio * 100)}%`,
                },
              ]}
            />
          </View>
        )}
      </View>
      {ratio != null && ratio >= 1 ? (
        <Ionicons name="trophy" size={22} color="#22c55e" />
      ) : (
        <Ionicons name="chevron-forward" size={20} color={colors.grey} />
      )}
    </TouchableOpacity>
  );
}

function SetRosterGrid({
  set,
  colors,
}: {
  set: SetSummary;
  colors: ThemeColors;
}) {
  const styles = useMemo(() => getStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { data: roster, isLoading, error } = useSetRoster(set.game, set.setId);
  const cardWidth =
    (width - GRID_PADDING * 2 - GRID_GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS;

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
        <Text style={styles.loadingText}>Loading the full set...</Text>
      </View>
    );
  }

  if (error || !roster) {
    return (
      <View style={styles.centered}>
        <Ionicons name="cloud-offline-outline" size={40} color={colors.grey} />
        <Text style={styles.emptyTitle}>Couldn&apos;t load this set</Text>
        <Text style={styles.emptyDescription}>
          {error instanceof Error && /busy|limit/i.test(error.message) ? error.message : "Please try again later."}
        </Text>
      </View>
    );
  }

  const ownedCount = roster.filter((card) => set.ownedCardIds.has(card.id)).length;

  return (
    <FlatList
      data={roster}
      keyExtractor={(card: RosterCard) => card.id}
      numColumns={GRID_COLUMNS}
      columnWrapperStyle={styles.gridRow}
      contentContainerStyle={[
        styles.gridContent,
        { paddingBottom: insets.bottom + 30 },
      ]}
      ListHeaderComponent={
        <View style={styles.rosterSummary}>
          <Text style={styles.rosterSummaryText}>
            {ownedCount} of {roster.length} collected —{" "}
            {roster.length - ownedCount} missing
          </Text>
        </View>
      }
      renderItem={({ item: card }) => {
        const owned = set.ownedCardIds.has(card.id);
        return (
          <View style={[styles.gridCell, { width: cardWidth }]}>
            {card.imageUrl ? (
              <Image
                source={{ uri: card.imageUrl }}
                style={[
                  styles.gridCardImage,
                  { height: cardWidth / CARD_ASPECT },
                  !owned && styles.missingCard,
                ]}
                contentFit="contain"
                recyclingKey={card.id}
                cachePolicy="memory-disk"
              />
            ) : (
              <View
                style={[
                  styles.gridCardFallback,
                  { height: cardWidth / CARD_ASPECT },
                  !owned && styles.missingCard,
                ]}
              >
                <Text style={styles.gridCardFallbackText} numberOfLines={3}>
                  {card.name}
                </Text>
              </View>
            )}
            {!owned && (
              <View style={styles.missingBadge}>
                <Ionicons name="lock-closed" size={10} color="#FFF" />
              </View>
            )}
            {card.number && (
              <Text style={styles.gridCardNumber} numberOfLines={1}>
                #{card.number}
              </Text>
            )}
          </View>
        );
      }}
    />
  );
}

function getStyles(colors: ThemeColors) {
  return StyleSheet.create({
    page: { flex: 1, backgroundColor: colors.background },
    flex: { flex: 1 },
    centered: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      padding: 24,
    },
    loadingText: { color: colors.onSurfaceVariant, fontSize: 13 },
    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingHorizontal: 20,
      paddingBottom: 14,
    },
    headerButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surfaceContainerHighest,
    },
    title: { color: colors.text, fontSize: 20, fontWeight: "800" },
    subtitle: { color: colors.onSurfaceVariant, fontSize: 12, marginTop: 2 },
    setList: { paddingHorizontal: 20, gap: 10, paddingBottom: 30 },
    sectionHeader: {
      color: colors.onSurfaceVariant,
      fontSize: 12,
      fontWeight: "800",
      letterSpacing: 0.6,
      textTransform: "uppercase",
      marginTop: 8,
    },
    setRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      padding: 16,
      borderRadius: 16,
      backgroundColor: colors.surfaceContainerHighest,
    },
    setName: { color: colors.text, fontSize: 15, fontWeight: "700" },
    setMeta: { color: colors.onSurfaceVariant, fontSize: 12, marginTop: 3 },
    progressTrack: {
      height: 6,
      borderRadius: 3,
      marginTop: 9,
      backgroundColor: `${colors.outline}44`,
      overflow: "hidden",
    },
    progressFill: { height: "100%", borderRadius: 3 },
    emptyState: { alignItems: "center", gap: 8, paddingVertical: 50, paddingHorizontal: 30 },
    emptyTitle: { color: colors.text, fontSize: 16, fontWeight: "700" },
    emptyDescription: {
      color: colors.onSurfaceVariant,
      fontSize: 13,
      textAlign: "center",
    },
    gridRow: { gap: GRID_GAP },
    gridContent: { paddingHorizontal: GRID_PADDING, gap: GRID_GAP },
    rosterSummary: {
      alignSelf: "flex-start",
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: colors.surfaceContainerHighest,
      marginBottom: 4,
    },
    rosterSummaryText: { color: colors.text, fontSize: 12, fontWeight: "700" },
    gridCell: { alignItems: "center" },
    gridCardImage: { width: "100%", borderRadius: 6 },
    gridCardFallback: {
      width: "100%",
      borderRadius: 6,
      alignItems: "center",
      justifyContent: "center",
      padding: 6,
      backgroundColor: colors.surfaceContainerHighest,
    },
    gridCardFallbackText: {
      color: colors.onSurfaceVariant,
      fontSize: 10,
      fontWeight: "600",
      textAlign: "center",
    },
    missingCard: { opacity: 0.28 },
    missingBadge: {
      position: "absolute",
      top: 4,
      right: 4,
      width: 18,
      height: 18,
      borderRadius: 9,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(0,0,0,0.65)",
    },
    gridCardNumber: {
      color: colors.onSurfaceVariant,
      fontSize: 10,
      fontWeight: "600",
      marginTop: 3,
    },
  });
}
