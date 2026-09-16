import { ItemWithProduct } from "@/api/items";
import { useColors } from "@/constants/theme";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "@/src/components/media/ProtectedImage";
import React, { useCallback, useMemo } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// TCG Pocket-style collection palette
const POCKET_DOODLE = "rgba(0,0,0,0.07)";

const NUM_COLUMNS = 3;
const GRID_GAP = 7;
const GRID_PADDING = 10;
// Standard Pokémon card ratio (63mm × 88mm)
const CARD_ASPECT = 63 / 88;

/** Prefer the official card render over the user's photo for the collection grid. */
export function getPokemonCardImage(item: ItemWithProduct): string | null {
  const images = item.products?.data?.images;
  if (Array.isArray(images) && images.length > 0) return images[0];
  return item.image_url || null;
}

type DoodleSpec = {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  top: `${number}%`;
  left: `${number}%`;
  size: number;
  rotate: string;
};

// Faint scattered doodles echoing the TCG Pocket background pattern
const DOODLES: DoodleSpec[] = [
  { icon: "game-controller-outline", top: "6%", left: "4%", size: 46, rotate: "-18deg" },
  { icon: "star-outline", top: "14%", left: "78%", size: 34, rotate: "12deg" },
  { icon: "sparkles-outline", top: "30%", left: "8%", size: 38, rotate: "8deg" },
  { icon: "flash-outline", top: "44%", left: "84%", size: 42, rotate: "-10deg" },
  { icon: "planet-outline", top: "58%", left: "6%", size: 44, rotate: "15deg" },
  { icon: "star-outline", top: "70%", left: "80%", size: 30, rotate: "-14deg" },
  { icon: "sparkles-outline", top: "84%", left: "12%", size: 36, rotate: "-6deg" },
  { icon: "game-controller-outline", top: "90%", left: "70%", size: 40, rotate: "10deg" },
];

const CardCell = React.memo(
  ({
    item,
    width,
    onPress,
    duplicateCount,
  }: {
    item: ItemWithProduct;
    width: number;
    onPress?: (item: ItemWithProduct) => void;
    duplicateCount?: number;
  }) => {
    const colors = useColors();
    const imageUrl = getPokemonCardImage(item);
    const title = item.products?.searchableTitle || item.custom_title || "Unknown card";

    return (
      <Pressable
        style={({ pressed }) => [
          styles.cell,
          { width, height: width / CARD_ASPECT },
          pressed && styles.cellPressed,
        ]}
        onPress={() => onPress?.(item)}
      >
        {imageUrl ? (
          <View style={styles.cardImageStack}>
            <Image
              source={{ uri: imageUrl }}
              style={styles.cardImage}
              contentFit="contain"
              transition={150}
              cachePolicy="memory-disk"
              recyclingKey={String(item.id)}
            />
            {/* Self-blend pass: soft-light boosts saturation and contrast. */}
            <Image
              source={{ uri: imageUrl }}
              style={[styles.cardImage, styles.saturationBoost]}
              contentFit="contain"
              transition={0}
              cachePolicy="memory-disk"
              recyclingKey={`${item.id}-boost`}
            />
          </View>
        ) : (
          <View style={styles.cardPlaceholder}>
            <Ionicons name="image-outline" size={24} color="rgba(255,255,255,0.7)" />
            <Text style={styles.cardPlaceholderText} numberOfLines={2}>
              {title}
            </Text>
          </View>
        )}

        {duplicateCount != null && duplicateCount > 1 && (
          <View
            style={[styles.duplicateBadge, { backgroundColor: colors.tertiary }]}
          >
            <Text style={styles.duplicateBadgeText}>×{duplicateCount}</Text>
          </View>
        )}
      </Pressable>
    );
  },
);
CardCell.displayName = "CardCell";

interface PokemonCardGridViewProps {
  items: ItemWithProduct[];
  onItemPress?: (item: ItemWithProduct) => void;
  bottomPadding?: number;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Total card count for the showcase, shown in the header pill. Defaults to `items.length` (i.e. the unfiltered count when the caller passes the full list, or the currently-displayed count otherwise). */
  totalCount?: number;
  /** Maps a card id (`pokemon_tcg_card_id` or `magic_card_id`) -> how many times that card appears in the showcase, for the "×N" corner badge. Omit or leave a card's id out to render no badge. */
  duplicateCounts?: Map<string, number>;
  /** Rendered above the count pill in the list header (e.g. game filter tabs). */
  headerAccessory?: React.ReactNode;
}

export const PokemonCardGridView: React.FC<PokemonCardGridViewProps> = ({
  items,
  onItemPress,
  bottomPadding = 120,
  refreshing = false,
  onRefresh,
  totalCount,
  duplicateCounts,
  headerAccessory,
}) => {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const cardWidth =
    (width - GRID_PADDING * 2 - GRID_GAP * (NUM_COLUMNS - 1)) / NUM_COLUMNS;
  const resolvedTotalCount = totalCount ?? items.length;

  const doodles = useMemo(
    () =>
      DOODLES.map((d, i) => (
        <Ionicons
          key={i}
          name={d.icon}
          size={d.size}
          color={POCKET_DOODLE}
          style={{
            position: "absolute",
            top: d.top,
            left: d.left,
            transform: [{ rotate: d.rotate }],
          }}
        />
      )),
    [],
  );

  const renderItem = useCallback(
    ({ item }: { item: ItemWithProduct }) => {
      const cardId = item.pokemon_tcg_card_id || item.magic_card_id;
      return (
        <CardCell
          item={item}
          width={cardWidth}
          onPress={onItemPress}
          duplicateCount={cardId ? duplicateCounts?.get(cardId) : undefined}
        />
      );
    },
    [cardWidth, onItemPress, duplicateCounts],
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.primary }]}>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {doodles}
      </View>

      <FlatList
        data={items}
        renderItem={renderItem}
        keyExtractor={(item) => String(item.id)}
        numColumns={NUM_COLUMNS}
        columnWrapperStyle={styles.columnWrapper}
        contentContainerStyle={{
          paddingTop: insets.top + 12,
          paddingHorizontal: GRID_PADDING,
          paddingBottom: bottomPadding,
          gap: GRID_GAP,
        }}
        initialNumToRender={12}
        maxToRenderPerBatch={9}
        windowSize={7}
        removeClippedSubviews={process.env.EXPO_OS === "android"}
        showsVerticalScrollIndicator={false}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#FFF"
            />
          ) : undefined
        }
        ListHeaderComponent={
          headerAccessory || resolvedTotalCount > 0 ? (
            <View>
              {headerAccessory}
              {resolvedTotalCount > 0 && (
                <View style={styles.countPill}>
                  <Ionicons name="albums" size={12} color="#FFF" />
                  <Text style={styles.countPillText}>
                    {resolvedTotalCount} {resolvedTotalCount === 1 ? "card" : "cards"}
                  </Text>
                </View>
              )}
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="albums-outline" size={56} color="rgba(255,255,255,0.8)" />
            <Text style={styles.emptyTitle}>No cards yet</Text>
            <Text style={styles.emptySubtitle}>Scan a card to start your collection</Text>
          </View>
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  columnWrapper: {
    gap: GRID_GAP,
  },
  cell: {
    borderRadius: 6,
    overflow: "hidden",
  },
  cellPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.97 }],
  },
  cardImageStack: {
    flex: 1,
  },
  cardImage: {
    width: "100%",
    height: "100%",
  },
  saturationBoost: {
    ...StyleSheet.absoluteFillObject,
    mixBlendMode: "soft-light",
    opacity: 0.85,
  },
  cardPlaceholder: {
    flex: 1,
    borderRadius: 6,
    backgroundColor: "rgba(0,0,0,0.25)",
    justifyContent: "center",
    alignItems: "center",
    padding: 8,
    gap: 6,
  },
  cardPlaceholderText: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 10,
    fontWeight: "600",
    textAlign: "center",
  },
  duplicateBadge: {
    position: "absolute",
    top: 4,
    right: 4,
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  duplicateBadgeText: {
    color: "#FFF",
    fontSize: 10,
    fontWeight: "800",
  },
  countPill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
    marginBottom: GRID_GAP,
  },
  countPillText: {
    color: "#FFF",
    fontSize: 12,
    fontWeight: "700",
  },
  emptyContainer: {
    alignItems: "center",
    marginTop: 120,
    gap: 8,
  },
  emptyTitle: {
    color: "#FFF",
    fontSize: 18,
    fontWeight: "800",
  },
  emptySubtitle: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 13,
  },
});

export default PokemonCardGridView;
