import { ItemWithProduct, useGetItemsWithProductData } from "@/api/items";
import { useGetShowcase } from "@/api/showcase";
import { COLORS } from "@/constants/theme";
import ItemDetailModal from "@/src/features/showcase/ItemDetailModal";
import ShowcaseCarousel from "@/src/features/showcase/ShowcaseCarousel";
import ShowcaseListItem from "@/src/features/showcase/ShowcaseListItem";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  LayoutAnimation,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  UIManager,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function ShowcaseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [selectedItem, setSelectedItem] = useState<ItemWithProduct | null>(
    null
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "carousel">("carousel"); // Default to carousel per user request context? Or stick to grid? User implies carousel focus. Let's toggle default.

  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  // Fetch showcase details
  const { data: showcase, isLoading: isShowcaseLoading } = useGetShowcase(id!);

  // Fetch items in the showcase
  const { data: items, isLoading: isItemsLoading } = useGetItemsWithProductData(
    id!
  );

  const isLoading = isShowcaseLoading || isItemsLoading;
  const itemsData = items || [];

  // Filter items
  const filteredItems = useMemo(() => {
    if (!searchQuery) return itemsData;
    const lowerQuery = searchQuery.toLowerCase();
    return itemsData.filter((item) => {
      const title = item.products?.searchableTitle?.toLowerCase() || "";
      const brand = item.products?.searchableBrand?.toLowerCase() || "";
      const description = item.user_description?.toLowerCase() || "";
      return (
        title.includes(lowerQuery) ||
        brand.includes(lowerQuery) ||
        description.includes(lowerQuery)
      );
    });
  }, [itemsData, searchQuery]);

  const toggleViewMode = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setViewMode((prev) => (prev === "grid" ? "carousel" : "grid"));
  };

  // Responsive Grid Calculation
  const numColumns = Math.floor(width / 170) || 2;
  const gap = 12;

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerTitle: showcase?.name || "Showcase",
          headerTintColor: COLORS.white,
          headerStyle: { backgroundColor: COLORS.background },
          headerTransparent: viewMode === "carousel", // Transparent header for immersive carousel
          headerBlurEffect: viewMode === "carousel" ? "dark" : undefined,
        }}
      />

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <View style={styles.contentContainer}>
          <View style={styles.listContainer}>
            {viewMode === "grid" ? (
              <FlatList
                key={`grid-${numColumns}`}
                data={filteredItems}
                keyExtractor={(item) => item.id.toString()}
                renderItem={({ item }) => (
                  <View style={{ flex: 1 / numColumns }}>
                    <ShowcaseListItem
                      item={item}
                      onPress={(item) => setSelectedItem(item)}
                      style={{ margin: gap / 2 }}
                    />
                  </View>
                )}
                numColumns={numColumns}
                contentContainerStyle={[
                  styles.listContent,
                  {
                    paddingHorizontal: gap / 2,
                    paddingTop: 100, // Space for header
                    paddingBottom: 120, // Space for bottom controls
                  },
                ]}
                columnWrapperStyle={
                  numColumns > 1 ? { justifyContent: "flex-start" } : undefined
                }
                ListEmptyComponent={
                  <View style={styles.emptyContainer}>
                    <Text style={styles.emptyText}>
                      {searchQuery
                        ? "No items match your search."
                        : "No items in this showcase yet."}
                    </Text>
                  </View>
                }
              />
            ) : (
              <ShowcaseCarousel
                data={filteredItems}
                onItemPress={(item) => setSelectedItem(item)}
              />
            )}
          </View>

          {/* Bottom Controls */}
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={[
              styles.bottomControls,
              { paddingBottom: Math.max(insets.bottom, 16) },
            ]}
          >
            <View style={styles.controlsRow}>
              <View style={styles.searchContainer}>
                <Ionicons
                  name="search"
                  size={20}
                  color={COLORS.textDim}
                  style={styles.searchIcon}
                />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search items..."
                  placeholderTextColor={COLORS.textDim}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                />
              </View>

              <Pressable onPress={toggleViewMode} style={styles.toggleButton}>
                <Ionicons
                  name={viewMode === "grid" ? "albums-outline" : "grid-outline"}
                  size={24}
                  color={COLORS.white}
                />
              </Pressable>
            </View>

            <Text style={styles.stats}>
              {itemsData.length} Items •{" "}
              {showcase?.is_public ? "Public" : "Private"}
            </Text>
          </KeyboardAvoidingView>
        </View>
      )}

      <ItemDetailModal
        visible={!!selectedItem}
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background || "#000",
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  contentContainer: {
    flex: 1,
  },
  listContainer: {
    flex: 1,
  },
  listContent: {
    // Padding handled dynamically
  },
  bottomControls: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(20, 20, 20, 0.95)", // Semi-transparent black
    borderTopWidth: 1,
    borderTopColor: "#333",
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  controlsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  searchContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#2A2A2A",
    borderRadius: 8,
    paddingHorizontal: 12,
    marginRight: 12,
    height: 44,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: COLORS.white,
    fontSize: 14,
    height: "100%",
  },
  toggleButton: {
    padding: 10,
    backgroundColor: "#333",
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    width: 44,
    height: 44,
  },
  stats: {
    color: COLORS.textDim || "#888",
    fontSize: 12,
    textAlign: "center",
    marginTop: 4,
  },
  emptyContainer: {
    padding: 32,
    alignItems: "center",
    marginTop: 60,
  },
  emptyText: {
    color: COLORS.textDim || "#888",
    fontSize: 16,
    textAlign: "center",
  },
});
