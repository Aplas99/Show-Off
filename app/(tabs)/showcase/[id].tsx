import { ItemWithProduct, useGetItemsWithProductData } from "@/api/items";
import { useMembership } from "@/api/memberships";
import { useSetShowcasePublic } from "@/api/showcase";
import { TAB_BAR_HEIGHT } from "@/constants/layoutConfig";
import { CuratorGateModal } from "@/src/features/membership/CuratorGate";
import ItemDetailModal from "@/src/features/showcase/ItemDetailModal";
import { PokemonCardGridView } from "@/src/features/showcase/PokemonCardGridView";
import PokemonCardTiltModal from "@/src/features/showcase/PokemonCardTiltModal";
import ShowcaseCarousel from "@/src/features/showcase/ShowcaseCarousel";
import ShowcaseListItem from "@/src/features/showcase/ShowcaseListItem";
import { useShowcaseFilters } from "@/src/features/showcase/useShowcaseFilters";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams } from "expo-router";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Keyboard,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View
} from "react-native";
import Reanimated, { FadeIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function ShowcaseDetail() {
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const showcaseId = typeof params.id === "string" ? params.id : params.id?.[0];

  // Search and filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const {
    sortBy,
    sortOrder,
    selectedTypes,
    selectedSetIds,
    setSortBy,
    setSortOrder,
    toggleType,
    toggleSet,
    reset: resetFilters,
    activeFilterCount,
  } = useShowcaseFilters();

  // View mode state
  const [viewMode, setViewMode] = useState<"grid" | "carousel">("grid");

  // Sharable public link (Curator feature)
  const { data: membership } = useMembership();
  const isCurator = membership?.isCurator ?? false;
  const setShowcasePublic = useSetShowcasePublic();
  const [sharePaywallVisible, setSharePaywallVisible] = useState(false);

  const handleShare = useCallback(async () => {
    if (!showcaseId) return;
    if (!isCurator) {
      setSharePaywallVisible(true);
      return;
    }
    try {
      await setShowcasePublic.mutateAsync({ showcaseId, isPublic: true });
      await Share.share({
        message: `Check out my showcase on Show-Off: showoff://s/${showcaseId}`,
        url: `showoff://s/${showcaseId}`,
      });
    } catch (error: any) {
      Alert.alert(
        "Couldn't share",
        error?.message ?? "Please try again.",
      );
    }
  }, [showcaseId, isCurator, setShowcasePublic]);

  // Modal state
  const [selectedItem, setSelectedItem] = useState<ItemWithProduct | null>(
    null,
  );
  const [modalVisible, setModalVisible] = useState(false);

  // Pokémon card 3D tilt viewer state
  const [tiltItem, setTiltItem] = useState<ItemWithProduct | null>(null);
  const [tiltVisible, setTiltVisible] = useState(false);

  // Keyboard-aware positioning for search bar
  const keyboardOffset = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      (e) => {
        Animated.spring(keyboardOffset, {
          toValue: -e.endCoordinates.height,
          damping: 20,
          stiffness: 150,
          useNativeDriver: true,
        }).start();
      }
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      () => {
        Animated.spring(keyboardOffset, {
          toValue: 0,
          damping: 20,
          stiffness: 150,
          useNativeDriver: true,
        }).start();
      }
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [keyboardOffset]);

  const handleItemPress = useCallback((item: ItemWithProduct) => {
    if (item.pokemon_tcg_card_id || item.tcg_card_id) {
      setTiltItem(item);
      setTiltVisible(true);
      return;
    }
    setSelectedItem(item);
    setModalVisible(true);
  }, []);

  const handleCloseTilt = useCallback(() => {
    setTiltVisible(false);
    setTimeout(() => setTiltItem(null), 300);
  }, []);

  const renderGridItem = useCallback(
    ({ item }: { item: ItemWithProduct }) => (
      <ShowcaseListItem item={item} onPress={handleItemPress} />
    ),
    [handleItemPress],
  );

  const handleCloseModal = useCallback(() => {
    setModalVisible(false);
    setTimeout(() => setSelectedItem(null), 300);
  }, []);

  const {
    data: items,
    error,
    isLoading,
    refetch,
    isRefetching,
  } = useGetItemsWithProductData(showcaseId!);


  // Distinct type/set options actually present in this showcase — narrower
  // than the full catalog so a filter never yields an empty grid.
  const availableTypes = useMemo(() => {
    const types = new Set<string>();
    for (const item of items ?? []) {
      for (const type of item.pokemonTypes ?? []) types.add(type);
    }
    return Array.from(types).sort();
  }, [items]);

  const availableSets = useMemo(() => {
    const sets = new Map<string, string>();
    for (const item of items ?? []) {
      if (item.pokemonSetId) {
        sets.set(
          item.pokemonSetId,
          item.products?.searchableDescription?.split(" • ")[0] ||
            item.pokemonSetId,
        );
      }
    }
    return Array.from(sets.entries()).map(([id, name]) => ({ id, name }));
  }, [items]);

  // Duplicate count per card, computed off the unfiltered list so the badge
  // always reflects true showcase-wide duplication regardless of active filters.
  const duplicateCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of items ?? []) {
      const cardId = item.pokemon_tcg_card_id || item.tcg_card_id;
      if (!cardId) continue;
      counts.set(cardId, (counts.get(cardId) ?? 0) + 1);
    }
    return counts;
  }, [items]);

  // Filter and sort
  const filteredItems = useMemo(() => {
    if (!items) return [];

    let filtered = items.filter((item) => {
      if (searchQuery) {
        const searchLower = searchQuery.toLowerCase();
        const matchesSearch =
          item.products?.searchableTitle?.toLowerCase().includes(searchLower) ||
          item.products?.searchableDescription
            ?.toLowerCase()
            .includes(searchLower) ||
          item.user_description?.toLowerCase().includes(searchLower);
        if (!matchesSearch) return false;
      }

      if (selectedTypes.length > 0) {
        const itemTypes = item.pokemonTypes ?? [];
        if (!selectedTypes.some((type) => itemTypes.includes(type))) {
          return false;
        }
      }

      if (selectedSetIds.length > 0) {
        if (!item.pokemonSetId || !selectedSetIds.includes(item.pokemonSetId)) {
          return false;
        }
      }

      return true;
    });

    filtered.sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case "name":
          comparison = (a.products?.searchableTitle || "").localeCompare(
            b.products?.searchableTitle || "",
          );
          break;
        case "price":
          comparison = (a.price || 0) - (b.price || 0);
          break;
        case "date":
        default:
          comparison =
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          break;
      }
      return sortOrder === "asc" ? comparison : -comparison;
    });

    return filtered;
  }, [items, searchQuery, sortBy, sortOrder, selectedTypes, selectedSetIds]);

  // A showcase made entirely of trading cards (Pokémon or a multi-game
  // card via api/tcg) renders as a TCG Pocket-style collection grid
  // instead of the generic item grid — every game shares the same
  // physical card aspect ratio.
  const isTradingCardShowcase = useMemo(
    () =>
      (items?.length ?? 0) > 0 &&
      (items ?? []).every(
        (item) => !!item.pokemon_tcg_card_id || !!item.tcg_card_id,
      ),
    [items],
  );

  const handleToggleView = useCallback(() => {
    setViewMode((prev) => (prev === "grid" ? "carousel" : "grid"));
  }, []);

  if (!showcaseId) {
    return (
      <View style={styles.centerWrap}>
        <Text style={styles.errorText}>Missing showcase id</Text>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.centerWrap}>
        <ActivityIndicator size="large" color="#9B5DE5" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerWrap}>
        <Text style={styles.errorText}>Failed to load showcase items</Text>
      </View>
    );
  }

  // Calculate bottom offset — sits just above the custom tab bar
  const bottomOffset =
    TAB_BAR_HEIGHT + insets.bottom + (Platform.OS === "android" ? 8 : 0) + 24;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Content Area */}
      <View style={styles.contentWrapper}>
        {viewMode === "grid" && isTradingCardShowcase && (
          <Reanimated.View
            entering={FadeIn.duration(150)}
            style={styles.viewContainer}
          >
            <PokemonCardGridView
              items={filteredItems}
              onItemPress={handleItemPress}
              bottomPadding={bottomOffset + 80}
              refreshing={isRefetching}
              onRefresh={refetch}
              totalCount={items?.length ?? 0}
              duplicateCounts={duplicateCounts}
            />
          </Reanimated.View>
        )}

        {viewMode === "grid" && !isTradingCardShowcase && (
          <Reanimated.View
            entering={FadeIn.duration(150)}
            style={styles.viewContainer}
          >
          <FlatList
            data={filteredItems}
            keyExtractor={(item) => String(item.id)}
            renderItem={renderGridItem}
            numColumns={2}
            initialNumToRender={8}
            maxToRenderPerBatch={6}
            updateCellsBatchingPeriod={50}
            windowSize={7}
            removeClippedSubviews={process.env.EXPO_OS === "android"}
            contentInsetAdjustmentBehavior="automatic"
            contentContainerStyle={[
              styles.listContent,
              { paddingBottom: bottomOffset + 80 }, // Add extra padding for bottom bar
            ]}
            columnWrapperStyle={styles.row}
            refreshControl={
              <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
            }
            ListHeaderComponent={
              filteredItems.length !== (items?.length || 0) ? (
                <Text style={styles.resultsText}>
                  Showing {filteredItems.length} of {items?.length || 0} items
                </Text>
              ) : null
            }
            ListEmptyComponent={
              <Text style={styles.emptyText}>
                {searchQuery
                  ? "No items match your filters"
                  : "No items in this showcase yet."}
              </Text>
            }
          />
          </Reanimated.View>
        )}

        {viewMode === "carousel" && (
          <Reanimated.View
            entering={FadeIn.duration(150)}
            style={styles.viewContainer}
          >
            <View style={styles.carouselContainer}>
              {filteredItems.length === 0 ? (
                <View style={styles.emptyCarouselContainer}>
                  <Text style={styles.emptyText}>No items to display</Text>
                </View>
              ) : (
                <ShowcaseCarousel
                  data={filteredItems}
                  onItemPress={handleItemPress}
                />
              )}
            </View>
          </Reanimated.View>
        )}

      </View>

      {/* Search and Filter Controls - Positioned above Tab Bar */}
      <Animated.View
        style={[
          styles.searchContainer,
          {
            bottom: bottomOffset,
            transform: [{ translateY: keyboardOffset }],
          },
        ]}
      >
        <View style={styles.searchInputContainer}>
          <Ionicons
            name="search"
            size={18}
            color="rgba(255,255,255,0.35)"
            style={styles.searchIcon}
          />
          <TextInput
            style={styles.searchInput}
            placeholder="Search items..."
            placeholderTextColor="rgba(255,255,255,0.3)"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery("")}>
              <Ionicons name="close-circle" size={18} color="rgba(255,255,255,0.35)" />
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity
          style={styles.viewToggleButton}
          onPress={handleToggleView}
        >
          <Ionicons
            name={viewMode === "grid" ? "albums" : "grid"}
            size={18}
            color="#9B5DE5"
          />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.viewToggleButton}
          onPress={handleShare}
          disabled={setShowcasePublic.isPending}
        >
          <Ionicons name="share-social-outline" size={18} color="#9B5DE5" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.filterButton}
          onPress={() => setFilterModalOpen(true)}
        >
          <Ionicons name="options" size={18} color="#9B5DE5" />
          {activeFilterCount > 0 && (
            <View style={styles.filterCountBadge}>
              <Text style={styles.filterCountBadgeText}>{activeFilterCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </Animated.View>

      <ItemDetailModal
        visible={modalVisible}
        item={selectedItem}
        onClose={handleCloseModal}
      />

      <PokemonCardTiltModal
        visible={tiltVisible}
        item={tiltItem}
        onClose={handleCloseTilt}
      />

      {/* Filter Modal */}
      <Modal
        visible={filterModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setFilterModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[styles.modalCard, { maxHeight: windowHeight * 0.8 }]}
          >
            <Text style={styles.modalTitle}>Filter & Sort</Text>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.modalScrollContent}
            >
              <Text style={styles.sectionLabel}>Sort by</Text>
              <View style={styles.sortOptions}>
                {[
                  { key: "date", label: "Date Added" },
                  { key: "name", label: "Name" },
                  { key: "price", label: "Price" },
                ].map((option) => (
                  <TouchableOpacity
                    key={option.key}
                    style={[
                      styles.sortOption,
                      sortBy === option.key && styles.sortOptionSelected,
                    ]}
                    onPress={() => setSortBy(option.key as any)}
                  >
                    <Text
                      style={[
                        styles.sortOptionText,
                        sortBy === option.key && styles.sortOptionTextSelected,
                      ]}
                      numberOfLines={1}
                    >
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.sectionLabel}>Sort order</Text>
              <View style={styles.sortOrderContainer}>
                <TouchableOpacity
                  style={[
                    styles.sortOrderOption,
                    sortOrder === "asc" && styles.sortOrderOptionSelected,
                  ]}
                  onPress={() => setSortOrder("asc")}
                >
                  <Ionicons
                    name="arrow-up"
                    size={16}
                    color={sortOrder === "asc" ? "#FFF" : "#666"}
                  />
                  <Text
                    style={[
                      styles.sortOrderText,
                      sortOrder === "asc" && styles.sortOrderTextSelected,
                    ]}
                    numberOfLines={1}
                  >
                    Ascending
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.sortOrderOption,
                    sortOrder === "desc" && styles.sortOrderOptionSelected,
                  ]}
                  onPress={() => setSortOrder("desc")}
                >
                  <Ionicons
                    name="arrow-down"
                    size={16}
                    color={sortOrder === "desc" ? "#FFF" : "#666"}
                  />
                  <Text
                    style={[
                      styles.sortOrderText,
                      sortOrder === "desc" && styles.sortOrderTextSelected,
                    ]}
                    numberOfLines={1}
                  >
                    Descending
                  </Text>
                </TouchableOpacity>
              </View>

              {availableTypes.length > 0 && (
                <>
                  <Text style={styles.sectionLabel}>Type</Text>
                  <View style={styles.sortOptions}>
                    {availableTypes.map((type) => (
                      <TouchableOpacity
                        key={type}
                        style={[
                          styles.sortOption,
                          selectedTypes.includes(type) && styles.sortOptionSelected,
                        ]}
                        onPress={() => toggleType(type)}
                      >
                        <Text
                          style={[
                            styles.sortOptionText,
                            selectedTypes.includes(type) &&
                              styles.sortOptionTextSelected,
                          ]}
                          numberOfLines={1}
                        >
                          {type}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              {availableSets.length > 0 && (
                <>
                  <Text style={styles.sectionLabel}>Set</Text>
                  <View style={styles.sortOptions}>
                    {availableSets.map((set) => (
                      <TouchableOpacity
                        key={set.id}
                        style={[
                          styles.sortOption,
                          selectedSetIds.includes(set.id) &&
                            styles.sortOptionSelected,
                        ]}
                        onPress={() => toggleSet(set.id)}
                      >
                        <Text
                          style={[
                            styles.sortOptionText,
                            selectedSetIds.includes(set.id) &&
                              styles.sortOptionTextSelected,
                          ]}
                          numberOfLines={1}
                        >
                          {set.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}
            </ScrollView>

            <View style={styles.modalActions}>
              {activeFilterCount > 0 && (
                <TouchableOpacity style={styles.resetButton} onPress={resetFilters}>
                  <Text style={styles.resetButtonText}>Reset</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setFilterModalOpen(false)}
              >
                <Text style={styles.cancelButtonText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <CuratorGateModal
        visible={sharePaywallVisible}
        feature="Sharable showcase links"
        description="Let anyone view this showcase with a link, no account required, with Curator."
        onDismiss={() => setSharePaywallVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  contentWrapper: {
    flex: 1,
  },
  viewContainer: {
    flex: 1,
  },
  absoluteView: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  centerWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  errorText: { color: "#FCA5A5" },
  listContent: { paddingHorizontal: 10, gap: 10, paddingTop: 100 }, // Top padding for header space
  row: { justifyContent: "space-between", gap: 10 },
  resultsText: { color: "#666", fontSize: 14, marginBottom: 8, marginTop: 10 },
  emptyText: { color: "#9CA3AF", textAlign: "center", marginTop: 20 },
  carouselContainer: { flex: 1 },
  emptyCarouselContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },

  // Bottom Search Bar
  searchContainer: {
    position: "absolute",
    left: 12,
    right: 12,
    flexDirection: "row",
    paddingHorizontal: 6,
    paddingVertical: 8,
    backgroundColor: "rgba(18,18,18,0.92)",
    borderRadius: 16,
    gap: 8,
    zIndex: 100,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  searchInputContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  searchIcon: { marginRight: 8 },
  searchInput: {
    flex: 1,
    color: "#FFF",
    fontSize: 14,
    paddingVertical: 10,
  },
  viewToggleButton: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 12,
    padding: 10,
  },
  filterButton: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 12,
    padding: 10,
  },

  // Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    backgroundColor: "#1a1a1a",
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: "#333",
  },
  modalScrollContent: {
    flexGrow: 1,
  },
  modalTitle: {
    color: "#FFF",
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 20,
  },
  sectionLabel: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 12,
  },
  sortOptions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 20 },
  sortOption: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#333",
    backgroundColor: "#2a2a2a",
  },
  sortOptionSelected: {
    backgroundColor: "#9B5DE5",
    borderColor: "#9B5DE5",
  },
  sortOptionText: { color: "#FFF", fontSize: 14 },
  sortOptionTextSelected: { fontWeight: "600" },

  sortOrderContainer: { flexDirection: "row", gap: 8, marginBottom: 20 },
  sortOrderOption: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#333",
    backgroundColor: "#2a2a2a",
  },
  sortOrderOptionSelected: {
    backgroundColor: "#9B5DE5",
    borderColor: "#9B5DE5",
  },
  sortOrderText: { color: "#666", fontSize: 14, fontWeight: "500" },
  sortOrderTextSelected: { color: "#FFF", fontWeight: "600" },

  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 12,
    marginTop: 12,
  },
  cancelButton: { padding: 10 },
  cancelButtonText: { color: "#9B5DE5", fontSize: 16, fontWeight: "600" },
  resetButton: { padding: 10 },
  resetButtonText: { color: "#999", fontSize: 16, fontWeight: "600" },
  filterCountBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    backgroundColor: "#9B5DE5",
    borderRadius: 999,
    minWidth: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  filterCountBadgeText: {
    color: "#FFF",
    fontSize: 10,
    fontWeight: "800",
  },
});
