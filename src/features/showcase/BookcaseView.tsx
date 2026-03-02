import { ItemWithProduct } from "@/api/items";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  Animated,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  StyleSheet,
  Text,
  View
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import BookItem from "./bookcase/BookItem";
import {
  ITEM_HEIGHT,
  ITEM_SPACING,
  ITEM_WIDTH,
  ITEMS_PER_PAGE,
  ITEMS_PER_SHELF,
  PAGE_WIDTH,
  SHELF_PADDING,
  SHELF_THICKNESS,
  WOOD_BASE,
  WOOD_DARK,
  WOOD_LIGHT,
  WOOD_MID
} from "./bookcase/constants";
import HangingBookmark from "./bookcase/HangingBookmark";
import WoodGrain from "./bookcase/WoodGrain";

interface BookcaseViewProps {
  items: ItemWithProduct[];
  onItemPress?: (item: ItemWithProduct) => void;
  showcaseName?: string;
  emptyStateText?: string;
  onBookmarkPress?: () => void;
}

// --- Main Bookcase View Component ---
export const BookcaseView: React.FC<BookcaseViewProps> = ({
  items,
  onItemPress,
  showcaseName = "My Collection",
  emptyStateText = "Start building your collection",
  onBookmarkPress
}) => {
  const scrollX = useRef(new Animated.Value(0)).current;
  const [currentPage, setCurrentPage] = useState(0);
  const insets = useSafeAreaInsets();

  // Organize items into pages (each page has SHELF_ROWS shelves with 3 items each = 9 items per page)
  const pages = useMemo(() => {
    const result: ItemWithProduct[][] = [];
    for (let i = 0; i < items.length; i += ITEMS_PER_PAGE) {
      result.push(items.slice(i, i + ITEMS_PER_PAGE));
    }
    return result;
  }, [items]);

  // Native-driver scroll — no JS listener on every tick (was causing jank)
  const handleScroll = useCallback(
    Animated.event(
      [{ nativeEvent: { contentOffset: { x: scrollX } } }],
      { useNativeDriver: true }
    ),
    []
  );

  // Page tracking runs only on settled scroll end — JS thread stays idle during scroll
  const handleMomentumEnd = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const page = Math.round(event.nativeEvent.contentOffset.x / PAGE_WIDTH);
    setCurrentPage(page);
  }, []);

  // Render empty state
  if (items.length === 0) {
    return (
      <View style={[styles.container, styles.emptyContainer]}>
        <WoodGrain intensity={0.5} />
        <View style={styles.emptyContent}>
          <Ionicons name="library-outline" size={64} color={WOOD_LIGHT} />
          <Text style={styles.emptyTitle}>Your Bookshelf Awaits</Text>
          <Text style={styles.emptySubtitle}>{emptyStateText}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Ambient background gradient */}
      <LinearGradient
        colors={["#0f0906", "#1f1510", "#0f0906"]}
        style={StyleSheet.absoluteFill}
      />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Text style={styles.headerTitle}>{showcaseName}</Text>
        <Text style={styles.headerCount}>{items.length} items</Text>
      </View>

      {/* Hanging Bookmark Control */}
      <HangingBookmark onPress={onBookmarkPress} />

      {/* Main FlatList with Virtualization */}
      <Animated.FlatList
        data={pages}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={PAGE_WIDTH}
        snapToAlignment="center"
        scrollEventThrottle={16}
        onScroll={handleScroll}
        onMomentumScrollEnd={handleMomentumEnd}
        keyExtractor={(_, index) => `page-${index}`}
        getItemLayout={(_, index) => ({
          length: PAGE_WIDTH,
          offset: PAGE_WIDTH * index,
          index,
        })}
        initialNumToRender={1}
        maxToRenderPerBatch={1}
        windowSize={3}
        removeClippedSubviews
        contentContainerStyle={[
          styles.scrollContent,
          { paddingHorizontal: 0 }
        ]}
        renderItem={({ item: pageItems, index: pageIndex }) => (
          <View style={styles.page}>
            {[0, 1, 2].map((rowIndex) => {
              const rowItems = pageItems.slice(
                rowIndex * ITEMS_PER_SHELF,
                (rowIndex + 1) * ITEMS_PER_SHELF
              );
              const pageBaseX = pageIndex * PAGE_WIDTH;

              return (
                <View key={rowIndex} style={styles.shelfRow}>
                  {/* Shelf backing — plain View, WoodGrain removed (was 40% opacity, wasted render) */}
                  <View style={styles.shelfBacking} />

                  {/* Books */}
                  <View style={styles.booksContainer}>
                    {rowItems.map((item, colIndex) => {
                      const globalIndex = pageIndex * ITEMS_PER_PAGE + rowIndex * ITEMS_PER_SHELF + colIndex;
                      const positionX = pageBaseX + SHELF_PADDING + (colIndex * (ITEM_WIDTH + ITEM_SPACING));
                      return (
                        <View
                          key={item.id || globalIndex}
                          style={[styles.bookContainer, { width: ITEM_WIDTH, marginRight: ITEM_SPACING }]}
                        >
                          <BookItem
                            item={item}
                            positionX={positionX}
                            onPress={onItemPress}
                            scrollX={scrollX}
                            globalIndex={globalIndex}
                          />
                        </View>
                      );
                    })}
                    {rowItems.length < ITEMS_PER_SHELF &&
                      [...Array(ITEMS_PER_SHELF - rowItems.length)].map((_, i) => (
                        <View key={`empty-${i}`} style={{ width: ITEM_WIDTH, marginRight: ITEM_SPACING }} />
                      ))
                    }
                  </View>

                  {/* Shelf Board — WoodGrain only here */}
                  <View style={styles.shelfBoard}>
                    <WoodGrain />
                    <View style={styles.shelfEdge}>
                      <LinearGradient
                        colors={[WOOD_DARK, WOOD_BASE]}
                        style={StyleSheet.absoluteFill}
                      />
                    </View>
                    <View style={styles.shelfShadow} />
                  </View>
                </View>
              );
            })}
          </View>
        )}
      />

      {/* Page Indicators */}
      <View style={[styles.pagination, { bottom: insets.bottom + 20 }]}>
        {pages.length > 1 && pages.map((_, index) => (
          <View
            key={index}
            style={[
              styles.pageDot,
              index === currentPage && styles.pageDotActive
            ]}
          />
        ))}
      </View>
    </View>
  );
};

// --- Styles ---
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: WOOD_DARK,
  },
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    paddingHorizontal: 24,
    paddingBottom: 10,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "800",
    color: "#fff",
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  headerCount: {
    fontSize: 14,
    color: "rgba(255,255,255,0.7)",
    marginTop: 4,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  scrollContent: {
    paddingTop: 110, // Adjusted for header
    paddingBottom: 120, // Increased to clear tab bar on tall devices
  },
  page: {
    width: PAGE_WIDTH,
    paddingHorizontal: SHELF_PADDING,
    justifyContent: "center",
    gap: 24, // More vertical space between shelves for larger books
  },
  shelfRow: {
    marginBottom: 8,
  },
  shelfBacking: {
    height: ITEM_HEIGHT + 24,
    backgroundColor: WOOD_MID,
    borderRadius: 4,
    marginBottom: -ITEM_HEIGHT - 24,
    overflow: "hidden",
    opacity: 0.4,
  },
  booksContainer: {
    flexDirection: "row",
    paddingHorizontal: 12,
    height: ITEM_HEIGHT + 24,
    alignItems: "flex-end",
    paddingBottom: 12,
  },
  bookContainer: {
    height: ITEM_HEIGHT + 10, // Minimal extra space
    justifyContent: "flex-end",
  },
  shelfBoard: {
    height: SHELF_THICKNESS,
    borderRadius: 3,
    overflow: "visible",
    position: "relative",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 6 },
      android: { elevation: 8 }
    }),
  },
  shelfEdge: {
    position: "absolute",
    bottom: -5,
    left: 0,
    right: 0,
    height: 5,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
  },
  shelfShadow: {
    position: "absolute",
    bottom: -10,
    left: 20,
    right: 20,
    height: 8,
    backgroundColor: "rgba(0,0,0,0.3)",
    borderRadius: 4,
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 3 }
    }),
  },
  pagination: {
    position: "absolute",
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  pageDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.3)",
  },
  pageDotActive: {
    backgroundColor: "#fff",
    width: 24,
    borderRadius: 4,
  },
  // Empty state styles
  emptyContainer: {
    justifyContent: "center",
    alignItems: "center",
  },
  emptyContent: {
    alignItems: "center",
    zIndex: 1,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#fff",
    marginTop: 20,
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  emptySubtitle: {
    fontSize: 16,
    color: "rgba(255,255,255,0.6)",
    marginTop: 8,
  },
});

export default BookcaseView;