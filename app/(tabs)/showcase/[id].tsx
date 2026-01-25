import { ItemWithProduct, useGetItemsWithProductData } from "@/api/items";
import { TAB_BAR_HEIGHT } from "@/constants/layoutConfig";
import ItemDetailModal from "@/src/features/showcase/ItemDetailModal";
import ShowcaseCarousel from "@/src/features/showcase/ShowcaseCarousel";
import ShowcaseListItem from "@/src/features/showcase/ShowcaseListItem";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  FlatList,
  Modal,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// Animated wrapper for grid items with bounce effect
const AnimatedGridItem = ({
  item,
  onPress,
  index,
  shouldAnimate,
}: {
  item: ItemWithProduct;
  onPress: (item: ItemWithProduct) => void;
  index: number;
  shouldAnimate: boolean;
}) => {
  const scaleAnim = useRef(new Animated.Value(shouldAnimate ? 0.3 : 1)).current;

  useEffect(() => {
    if (shouldAnimate) {
      Animated.spring(scaleAnim, {
        toValue: 1,
        delay: index * 50,
        useNativeDriver: true,
        ...(Platform.OS === "ios"
          ? { bounciness: 8, speed: 12 }
          : { tension: 40, friction: 4 }),
      }).start();
    } else {
      scaleAnim.setValue(1);
    }
  }, [shouldAnimate, index]);

  return (
    <Animated.View style={{ flex: 1, transform: [{ scale: scaleAnim }] }}>
      <ShowcaseListItem item={item} onPress={onPress} />
    </Animated.View>
  );
};

export default function ShowcaseDetail() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const showcaseId = typeof params.id === "string" ? params.id : params.id?.[0];

  // Search and filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [selectedCondition, setSelectedCondition] = useState<string>("");
  const [priceRange, setPriceRange] = useState({ min: "", max: "" });
  const [sortBy, setSortBy] = useState<"name" | "price" | "date">("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // View mode state
  const [viewMode, setViewMode] = useState<"grid" | "carousel">("carousel");

  // Modal state
  const [selectedItem, setSelectedItem] = useState<ItemWithProduct | null>(
    null,
  );
  const [modalVisible, setModalVisible] = useState(false);

  // Animation values
  const [shouldAnimateGrid, setShouldAnimateGrid] = useState(false);
  const gridOpacity = useRef(new Animated.Value(0)).current;
  const carouselOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (viewMode === "grid") {
      Animated.parallel([
        Animated.timing(gridOpacity, {
          toValue: 1,
          duration: 250,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(carouselOpacity, {
          toValue: 0,
          duration: 250,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(gridOpacity, {
          toValue: 0,
          duration: 250,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(carouselOpacity, {
          toValue: 1,
          duration: 250,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [viewMode]);

  const handleToggleView = useCallback(() => {
    setViewMode((prev) => {
      const newMode = prev === "grid" ? "carousel" : "grid";
      if (newMode === "grid") {
        setShouldAnimateGrid(true);
        setTimeout(() => setShouldAnimateGrid(false), 1000);
      }
      return newMode;
    });
  }, []);

  const handleItemPress = useCallback((item: ItemWithProduct) => {
    setSelectedItem(item);
    setModalVisible(true);
  }, []);

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

      if (selectedCondition && item.condition !== selectedCondition)
        return false;

      if (priceRange.min && item.price) {
        const minPrice = parseFloat(priceRange.min);
        if (!isNaN(minPrice) && item.price < minPrice) return false;
      }
      if (priceRange.max && item.price) {
        const maxPrice = parseFloat(priceRange.max);
        if (!isNaN(maxPrice) && item.price > maxPrice) return false;
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
  }, [items, searchQuery, selectedCondition, priceRange, sortBy, sortOrder]);

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

  // Calculate bottom offset for filter bar
  const bottomOffset =
    TAB_BAR_HEIGHT + insets.bottom + (Platform.OS === "android" ? 10 : 0);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Content Area */}
      <View style={styles.contentWrapper}>
        {/* Grid View */}
        <Animated.View
          style={[styles.viewContainer, { opacity: gridOpacity }]}
          pointerEvents={viewMode === "grid" ? "auto" : "none"}
        >
          <FlatList
            data={filteredItems}
            keyExtractor={(item) => String(item.id)}
            renderItem={({ item, index }) => (
              <AnimatedGridItem
                item={item}
                onPress={handleItemPress}
                index={index}
                shouldAnimate={shouldAnimateGrid}
              />
            )}
            numColumns={2}
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
        </Animated.View>

        {/* Carousel View */}
        <Animated.View
          style={[
            styles.viewContainer,
            styles.absoluteView,
            { opacity: carouselOpacity },
          ]}
          pointerEvents={viewMode === "carousel" ? "auto" : "none"}
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
        </Animated.View>
      </View>

      {/* Search and Filter Controls - Positioned above Tab Bar */}
      <View style={[styles.searchContainer, { bottom: bottomOffset }]}>
        <View style={styles.searchInputContainer}>
          <Ionicons
            name="search"
            size={20}
            color="#666"
            style={styles.searchIcon}
          />
          <TextInput
            style={styles.searchInput}
            placeholder="Search items..."
            placeholderTextColor="#666"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery("")}>
              <Ionicons name="close-circle" size={20} color="#666" />
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity
          style={styles.viewToggleButton}
          onPress={handleToggleView}
        >
          <Ionicons
            name={viewMode === "grid" ? "albums" : "grid"}
            size={20}
            color="#9B5DE5"
          />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.filterButton}
          onPress={() => setFilterModalOpen(true)}
        >
          <Ionicons name="options" size={20} color="#9B5DE5" />
        </TouchableOpacity>
      </View>

      <ItemDetailModal
        visible={modalVisible}
        item={selectedItem}
        onClose={handleCloseModal}
      />

      {/* Filter Modal */}
      <Modal
        visible={filterModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setFilterModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Filter & Sort</Text>

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
                >
                  Descending
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalActions}>
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
    left: 0,
    right: 0,
    flexDirection: "row",
    paddingHorizontal: 10,
    paddingVertical: 12,
    backgroundColor: "rgba(0,0,0,0.9)",
    borderTopWidth: 1,
    borderTopColor: "#1a1a1a",
    gap: 10,
    zIndex: 100,
  },
  searchInputContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1a1a1a",
    borderRadius: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#333",
  },
  searchIcon: { marginRight: 8 },
  searchInput: {
    flex: 1,
    color: "#FFF",
    fontSize: 16,
    paddingVertical: 10,
  },
  viewToggleButton: {
    backgroundColor: "#1a1a1a",
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: "#333",
  },
  filterButton: {
    backgroundColor: "#1a1a1a",
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: "#333",
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
  sortOptions: { flexDirection: "row", gap: 8, marginBottom: 20 },
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

  modalActions: { flexDirection: "row", justifyContent: "flex-end" },
  cancelButton: { padding: 10 },
  cancelButtonText: { color: "#9B5DE5", fontSize: 16, fontWeight: "600" },
});
