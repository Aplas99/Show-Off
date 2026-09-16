import { type ItemWithProduct } from "@/api/items";
import { useSetCards, type PokemonTcgCard } from "@/api/pokemon";
import { useColors, type ThemeColors } from "@/constants/theme";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "@/src/components/media/ProtectedImage";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
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
  id: string;
  name: string;
  printedTotal: number | null;
  ownedCardIds: Set<string>;
}

/**
 * Curator set-completion view: for each Pokémon set present in the showcase,
 * shows collected-vs-total progress; drilling in renders the full set roster
 * with missing cards dimmed. Entry point is gated on Curator membership by
 * the caller — this component assumes access is already allowed.
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
  const [selectedSetId, setSelectedSetId] = useState<string | null>(null);

  const sets = useMemo(() => {
    const bySet = new Map<string, SetSummary>();
    for (const item of items) {
      if (!item.pokemon_tcg_card_id || !item.pokemonSetId) continue;
      let entry = bySet.get(item.pokemonSetId);
      if (!entry) {
        entry = {
          id: item.pokemonSetId,
          name:
            item.products?.searchableDescription?.split(" • ")[0] ||
            item.pokemonSetId,
          printedTotal: item.pokemonSetPrintedTotal ?? null,
          ownedCardIds: new Set(),
        };
        bySet.set(item.pokemonSetId, entry);
      }
      entry.ownedCardIds.add(item.pokemon_tcg_card_id);
      if (entry.printedTotal == null && item.pokemonSetPrintedTotal != null) {
        entry.printedTotal = item.pokemonSetPrintedTotal;
      }
    }
    return Array.from(bySet.values()).sort(
      (a, b) => b.ownedCardIds.size - a.ownedCardIds.size,
    );
  }, [items]);

  const selectedSet = sets.find((set) => set.id === selectedSetId) ?? null;

  const handleClose = () => {
    setSelectedSetId(null);
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
              onPress={() => setSelectedSetId(null)}
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
          <FlatList
            data={sets}
            keyExtractor={(set) => set.id}
            contentContainerStyle={styles.setList}
            renderItem={({ item: set }) => {
              const owned = set.ownedCardIds.size;
              const total = set.printedTotal;
              const ratio = total ? Math.min(owned / total, 1) : null;
              return (
                <TouchableOpacity
                  style={styles.setRow}
                  onPress={() => setSelectedSetId(set.id)}
                >
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
                              backgroundColor:
                                ratio >= 1 ? "#22c55e" : colors.primary,
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
            }}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Ionicons name="albums-outline" size={42} color={colors.grey} />
                <Text style={styles.emptyTitle}>No Pokémon sets yet</Text>
                <Text style={styles.emptyDescription}>
                  Scan some cards and their sets will show up here.
                </Text>
              </View>
            }
          />
        )}
      </View>
    </Modal>
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
  const { data: roster, isLoading, error } = useSetCards(set.id);
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
        <Text style={styles.emptyDescription}>Please try again later.</Text>
      </View>
    );
  }

  const ownedCount = roster.filter((card) => set.ownedCardIds.has(card.id)).length;

  return (
    <FlatList
      data={roster}
      keyExtractor={(card: PokemonTcgCard) => card.id}
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
            {card.images.small ? (
              <Image
                source={{ uri: card.images.small }}
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
                <Text style={styles.gridCardFallbackText} numberOfLines={2}>
                  {card.name}
                </Text>
              </View>
            )}
            {!owned && (
              <View style={styles.missingBadge}>
                <Ionicons name="lock-closed" size={10} color="#FFF" />
              </View>
            )}
            <Text style={styles.gridCardNumber} numberOfLines={1}>
              #{card.number}
            </Text>
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
