import { ItemWithProduct } from "@/api/items";
import { useColors } from "@/constants/theme";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import React, { useMemo } from "react";
import {
  Dimensions,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  CATEGORY_COLORS,
  CategoryType,
  getItemCategory,
  WOOD_BASE,
  WOOD_DARK,
  WOOD_LIGHT,
} from "./bookcase/constants";
import WoodGrain from "./bookcase/WoodGrain";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

// --- Condition helpers ---
const CONDITION_LABELS: Record<string, string> = {
  mint: "MINT",
  near_mint: "NR MINT",
  excellent: "EXCEL",
  very_good: "VG",
  good: "GOOD",
  fair: "FAIR",
  poor: "POOR",
};

// --- Section ordering & names ---
const SECTION_ORDER: CategoryType[] = [
  "Books",
  "Toys",
  "Movies",
  "Music",
  "Media",
  "Games",
  "Electronics",
  "Apparel",
  "Home",
  "Garden",
  "Sports",
  "Automotive",
  "Office",
  "Health & Beauty",
  "Food & Beverages",
  "Arts & Crafts",
  "Pet Supplies",
];

const SECTION_NAMES: Record<string, string> = {
  Books: "BOOKS",
  Toys: "FIGURES",
  Movies: "CINEMA",
  Music: "AUDIO ARCHIVE",
  Media: "MEDIA COLLECTION",
  Games: "GAME VAULT",
  Electronics: "TECH ARTIFACTS",
  Apparel: "FASHION ARCHIVE",
  Home: "HOME TREASURES",
  Garden: "GARDEN FINDS",
  Sports: "SPORTS VAULT",
  Automotive: "AUTO ARCHIVE",
  Office: "OFFICE RELICS",
  "Health & Beauty": "BEAUTY VAULT",
  "Food & Beverages": "PANTRY STOCK",
  "Arts & Crafts": "CRAFT CORNER",
  "Pet Supplies": "PET ARCHIVE",
};

interface ShelfSection {
  title: string;
  shelfLabel: string;
  items: ItemWithProduct[];
  category: CategoryType;
}

function groupItemsIntoSections(items: ItemWithProduct[]): ShelfSection[] {
  const grouped = new Map<CategoryType, ItemWithProduct[]>();
  items.forEach((item) => {
    const cat = getItemCategory(item);
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(item);
  });

  const sections: ShelfSection[] = [];
  let shelfIndex = 0;
  SECTION_ORDER.forEach((cat) => {
    const sectionItems = grouped.get(cat);
    if (sectionItems && sectionItems.length > 0) {
      const letter = String.fromCharCode(65 + (shelfIndex % 26));
      sections.push({
        title: SECTION_NAMES[cat] || cat.toUpperCase(),
        shelfLabel: `SHELF ${letter}-${shelfIndex + 1}`,
        items: sectionItems,
        category: cat,
      });
      shelfIndex++;
    }
  });

  // Catch any remaining categories not in SECTION_ORDER
  grouped.forEach((sectionItems, cat) => {
    if (!sections.find((s) => s.category === cat)) {
      const letter = String.fromCharCode(65 + (shelfIndex % 26));
      sections.push({
        title: cat.toUpperCase(),
        shelfLabel: `SHELF ${letter}-${shelfIndex + 1}`,
        items: sectionItems,
        category: cat,
      });
      shelfIndex++;
    }
  });

  return sections;
}

// ============================================================
//  BOOK CARD — 3D spine effect with left border + page edge
// ============================================================
const BookCard = React.memo(
  ({ item, onPress }: { item: ItemWithProduct; onPress?: (i: ItemWithProduct) => void }) => {
    const colors = useColors();
    const category = getItemCategory(item);
    const catColors = CATEGORY_COLORS[category] || CATEGORY_COLORS["Books"];
    const productData = item.products?.data || {};
    const imageUrl = item.image_url || (productData?.images?.[0] ?? null);
    const title = productData?.title || (item as any).custom_title || "Untitled";
    const condition = (item as any).condition || item.condition || "";
    const condLabel = CONDITION_LABELS[condition] || "";

    // Vary height slightly per item for organic shelf look
    const heightVariant = title.length % 3 === 0 ? 192 : title.length % 3 === 1 ? 208 : 176;

    return (
      <TouchableOpacity
        style={[bookCardStyles.container, { height: heightVariant + 44 }]}
        onPress={() => onPress?.(item)}
        activeOpacity={0.85}
      >
        <View style={[bookCardStyles.bookWrapper, { height: heightVariant }]}>
          {/* Bottom drop shadow for 3D lift */}
          <View style={bookCardStyles.bottomShadow} />

          {/* Spine — thicker for realism */}
          <View style={[bookCardStyles.spine, { backgroundColor: catColors.primary }]}>
            <View style={[bookCardStyles.spineHighlight, { backgroundColor: catColors.accent }]} />
            {/* Spine edge groove */}
            <View style={bookCardStyles.spineGroove} />
          </View>

          {/* Cover */}
          <View style={[bookCardStyles.cover, { backgroundColor: catColors.primary }]}>
            {imageUrl ? (
              <Image
                source={{ uri: imageUrl }}
                style={bookCardStyles.coverImage}
                contentFit="cover"
                transition={200}
                cachePolicy="memory-disk"
                recyclingKey={item.id?.toString()}
              />
            ) : (
              <View style={[bookCardStyles.placeholder, { backgroundColor: catColors.primary }]}>
                <Ionicons name="book-outline" size={28} color={catColors.accent} />
              </View>
            )}
            {/* Top edge highlight — light catch */}
            <View style={bookCardStyles.coverTopEdge} />
            {/* Right edge shadow for 3D depth */}
            <View style={bookCardStyles.coverRightEdge} />
            {/* Bottom edge shadow */}
            <View style={bookCardStyles.coverBottomEdge} />
          </View>

          {/* Pages edge — thicker */}
          <View style={bookCardStyles.pages}>
            <View style={bookCardStyles.pagesInner}>
              <View style={[bookCardStyles.pageLine, { top: 3 }]} />
              <View style={[bookCardStyles.pageLine, { top: 8 }]} />
              <View style={[bookCardStyles.pageLine, { top: 13 }]} />
              <View style={[bookCardStyles.pageLine, { top: 18 }]} />
              <View style={[bookCardStyles.pageLine, { top: 23 }]} />
            </View>
          </View>

          {/* Condition badge */}
          {condLabel ? (
            <View style={[bookCardStyles.badge, { backgroundColor: colors.primary }]}>
              <Text style={bookCardStyles.badgeText}>{condLabel}</Text>
            </View>
          ) : null}
        </View>

        <Text style={bookCardStyles.title} numberOfLines={1}>
          {title}
        </Text>
      </TouchableOpacity>
    );
  }
);

const bookCardStyles = StyleSheet.create({
  container: {
    width: 128,
    marginRight: 16,
    justifyContent: "flex-end",
  },
  bookWrapper: {
    width: 118,
    flexDirection: "row",
    position: "relative",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 3, height: 8 },
        shadowOpacity: 0.6,
        shadowRadius: 12,
      },
      android: { elevation: 12 },
    }),
  },
  bottomShadow: {
    position: "absolute",
    bottom: -5,
    left: 8,
    right: 4,
    height: 10,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 6,
    zIndex: 0,
  },
  spine: {
    width: 10,
    height: "100%",
    borderTopLeftRadius: 3,
    borderBottomLeftRadius: 3,
    position: "relative",
    zIndex: 2,
  },
  spineHighlight: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 3,
    bottom: 0,
    opacity: 0.35,
  },
  spineGroove: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    width: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  cover: {
    flex: 1,
    borderTopRightRadius: 3,
    borderBottomRightRadius: 3,
    overflow: "hidden",
    position: "relative",
    zIndex: 3,
  },
  coverImage: {
    width: "100%",
    height: "100%",
    opacity: 0.85,
  },
  placeholder: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  coverTopEdge: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  coverRightEdge: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: 6,
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  coverBottomEdge: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  pages: {
    width: 10,
    height: "96%",
    backgroundColor: "#f4e8d0",
    alignSelf: "center",
    marginLeft: -1,
    borderTopRightRadius: 2,
    borderBottomRightRadius: 2,
    zIndex: 1,
    borderRightWidth: 1,
    borderRightColor: "rgba(0,0,0,0.15)",
  },
  pagesInner: {
    flex: 1,
    marginVertical: 3,
    marginLeft: 1,
    backgroundColor: "#e8dcc8",
    position: "relative",
  },
  pageLine: {
    position: "absolute",
    left: 0,
    right: 2,
    height: 1,
    backgroundColor: "rgba(0,0,0,0.08)",
  },
  badge: {
    position: "absolute",
    top: -6,
    right: -4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    zIndex: 10,
  },
  badgeText: {
    color: "#000",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  title: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 10,
  },
});

// ============================================================
//  FIGURE CARD — Glass-encased box with under-lighting & shine
// ============================================================
const FigureCard = React.memo(
  ({ item, onPress }: { item: ItemWithProduct; onPress?: (i: ItemWithProduct) => void }) => {
    const colors = useColors();
    const productData = item.products?.data || {};
    const imageUrl = item.image_url || (productData?.images?.[0] ?? null);
    const title = productData?.title || (item as any).custom_title || "Untitled";
    const brand = productData?.brand || (item as any).custom_brand || "";
    const condition = (item as any).condition || item.condition || "";
    const condLabel = CONDITION_LABELS[condition] || "";

    return (
      <TouchableOpacity
        style={figureCardStyles.container}
        onPress={() => onPress?.(item)}
        activeOpacity={0.85}
      >
        {/* Condition badge */}
        {condLabel ? (
          <View
            style={[
              figureCardStyles.badge,
              { backgroundColor: colors.secondaryContainer },
            ]}
          >
            <Text style={[figureCardStyles.badgeText, { color: "#FFF" }]}>
              {condLabel}
            </Text>
          </View>
        ) : null}

        <View style={figureCardStyles.glassBox}>
          {/* Under-lighting — purple radial glow from bottom */}
          <LinearGradient
            colors={["transparent", `${colors.primary}50`]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1.2 }}
            style={StyleSheet.absoluteFill}
          />

          {/* Image */}
          <View style={figureCardStyles.imageWrapper}>
            {imageUrl ? (
              <Image
                source={{ uri: imageUrl }}
                style={figureCardStyles.image}
                contentFit="contain"
                transition={200}
                cachePolicy="memory-disk"
                recyclingKey={item.id?.toString()}
              />
            ) : (
              <View style={figureCardStyles.placeholder}>
                <Ionicons name="cube-outline" size={36} color={colors.primary} />
              </View>
            )}
          </View>

          {/* Top edge highlight — glass light catch */}
          <View style={figureCardStyles.topEdge} />

          {/* Glass reflection shine overlay */}
          <LinearGradient
            colors={[
              "rgba(255,255,255,0.15)",
              "transparent",
              "rgba(255,255,255,0.08)",
              "transparent",
              "rgba(255,255,255,0.12)",
            ]}
            locations={[0, 0.3, 0.5, 0.7, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[StyleSheet.absoluteFill, { zIndex: 10, borderRadius: 14 }]}
          />

          {/* Inner glow border */}
          <View style={figureCardStyles.innerGlow} />

          {/* Left edge 3D highlight */}
          <View style={figureCardStyles.leftEdge} />
          {/* Right edge 3D shadow */}
          <View style={figureCardStyles.rightEdge} />
          {/* Bottom edge shadow */}
          <View style={figureCardStyles.bottomEdge} />
        </View>

        {/* Base pedestal shadow */}
        <View style={figureCardStyles.baseShadow} />

        <View style={figureCardStyles.textContainer}>
          <Text style={figureCardStyles.title} numberOfLines={1}>
            {title}
          </Text>
          {brand ? (
            <Text style={figureCardStyles.subtitle} numberOfLines={1}>
              {brand}
            </Text>
          ) : null}
        </View>
      </TouchableOpacity>
    );
  }
);

const figureCardStyles = StyleSheet.create({
  container: {
    width: 170,
    marginRight: 20,
  },
  badge: {
    position: "absolute",
    top: -8,
    left: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    zIndex: 30,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  badgeText: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1,
  },
  glassBox: {
    aspectRatio: 3 / 4,
    width: "100%",
    backgroundColor: "#1a1a1a",
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.12)",
    overflow: "hidden",
    position: "relative",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 2, height: 12 },
        shadowOpacity: 0.6,
        shadowRadius: 20,
      },
      android: { elevation: 14 },
    }),
  },
  topEdge: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: "rgba(255,255,255,0.2)",
    zIndex: 12,
  },
  leftEdge: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: "rgba(255,255,255,0.08)",
    zIndex: 12,
  },
  rightEdge: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: 3,
    backgroundColor: "rgba(0,0,0,0.35)",
    zIndex: 12,
  },
  bottomEdge: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: "rgba(0,0,0,0.4)",
    zIndex: 12,
  },
  imageWrapper: {
    ...StyleSheet.absoluteFillObject,
    padding: 20,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 5,
  },
  image: {
    width: "100%",
    height: "100%",
  },
  placeholder: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  innerGlow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    zIndex: 11,
  },
  baseShadow: {
    marginTop: 4,
    marginHorizontal: 16,
    height: 8,
    backgroundColor: "rgba(0,0,0,0.4)",
    borderRadius: 999,
  },
  textContainer: {
    marginTop: 10,
    paddingHorizontal: 4,
  },
  title: {
    color: "#FFF",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: -0.2,
  },
  subtitle: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 10,
    marginTop: 2,
  },
});

// ============================================================
//  GENERIC CARD — With glass shine effect (non-books)
// ============================================================
const ShineCard = React.memo(
  ({ item, onPress }: { item: ItemWithProduct; onPress?: (i: ItemWithProduct) => void }) => {
    const colors = useColors();
    const productData = item.products?.data || {};
    const imageUrl = item.image_url || (productData?.images?.[0] ?? null);
    const title = productData?.title || (item as any).custom_title || "Untitled";
    const brand = productData?.brand || (item as any).custom_brand || "";
    const condition = (item as any).condition || item.condition || "";
    const condLabel = CONDITION_LABELS[condition] || "";
    const category = getItemCategory(item);

    return (
      <TouchableOpacity
        style={shineCardStyles.container}
        onPress={() => onPress?.(item)}
        activeOpacity={0.85}
      >
        <View style={shineCardStyles.imageBox}>
          {/* Under-lighting glow */}
          <LinearGradient
            colors={["transparent", `${colors.primary}35`]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1.2 }}
            style={[StyleSheet.absoluteFill, { zIndex: 1 }]}
          />

          {imageUrl ? (
            <Image
              source={{ uri: imageUrl }}
              style={shineCardStyles.image}
              contentFit="cover"
              transition={200}
              cachePolicy="memory-disk"
              recyclingKey={item.id?.toString()}
            />
          ) : (
            <View style={[shineCardStyles.placeholder, { backgroundColor: colors.surfaceContainerHigh }]}>
              <Ionicons name="cube-outline" size={28} color={colors.primary} />
            </View>
          )}

          {/* Top edge highlight */}
          <View style={shineCardStyles.topHighlight} />
          {/* Left edge light catch */}
          <View style={shineCardStyles.leftHighlight} />
          {/* Right edge shadow */}
          <View style={shineCardStyles.rightShadow} />
          {/* Bottom edge shadow */}
          <View style={shineCardStyles.bottomShadow} />

          {/* Glass shine overlay */}
          <LinearGradient
            colors={[
              "rgba(255,255,255,0.15)",
              "transparent",
              "rgba(255,255,255,0.08)",
              "transparent",
              "rgba(255,255,255,0.1)",
            ]}
            locations={[0, 0.25, 0.5, 0.75, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[StyleSheet.absoluteFill, { zIndex: 10, borderRadius: 14 }]}
          />

          {/* Condition badge */}
          {condLabel ? (
            <View style={[shineCardStyles.badge, { backgroundColor: colors.primary }]}>
              <Text style={shineCardStyles.badgeText}>{condLabel}</Text>
            </View>
          ) : null}
        </View>

        {/* Base shadow for 3D lift */}
        <View style={shineCardStyles.baseShadow} />

        {/* Category label */}
        <Text style={[shineCardStyles.categoryLabel, { color: colors.primary }]}>
          {category.toUpperCase()}
        </Text>
        <Text style={shineCardStyles.title} numberOfLines={1}>
          {title}
        </Text>
      </TouchableOpacity>
    );
  }
);

const shineCardStyles = StyleSheet.create({
  container: {
    width: (SCREEN_WIDTH - 52) / 2,
    marginBottom: 16,
  },
  imageBox: {
    width: "100%",
    aspectRatio: 1,
    backgroundColor: "#20201f",
    borderRadius: 14,
    overflow: "hidden",
    position: "relative",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.08)",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 2, height: 8 },
        shadowOpacity: 0.5,
        shadowRadius: 16,
      },
      android: { elevation: 10 },
    }),
  },
  topHighlight: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: "rgba(255,255,255,0.18)",
    zIndex: 12,
  },
  leftHighlight: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: "rgba(255,255,255,0.06)",
    zIndex: 12,
  },
  rightShadow: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: 3,
    backgroundColor: "rgba(0,0,0,0.3)",
    zIndex: 12,
  },
  bottomShadow: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: "rgba(0,0,0,0.35)",
    zIndex: 12,
  },
  baseShadow: {
    marginTop: 3,
    marginHorizontal: 12,
    height: 6,
    backgroundColor: "rgba(0,0,0,0.35)",
    borderRadius: 999,
  },
  image: {
    width: "100%",
    height: "100%",
    opacity: 0.8,
    zIndex: 2,
  },
  placeholder: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 2,
  },
  badge: {
    position: "absolute",
    top: 8,
    left: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    zIndex: 20,
  },
  badgeText: {
    color: "#000",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  categoryLabel: {
    fontSize: 9,
    fontWeight: "800",
    marginTop: 8,
    letterSpacing: 0.5,
  },
  title: {
    color: "#FFF",
    fontSize: 13,
    fontWeight: "600",
    marginTop: 2,
  },
});

// ============================================================
//  Mahogany Shelf Divider
// ============================================================
const MahoganyShelf = React.memo(({ tall }: { tall?: boolean }) => (
  <View style={[shelfStyles.container, tall && shelfStyles.containerTall]}>
    <View style={[shelfStyles.board, tall && shelfStyles.boardTall]}>
      <WoodGrain />
      {/* Mahogany sheen — top highlight + bottom shadow */}
      <LinearGradient
        colors={["rgba(255,255,255,0.12)", "rgba(255,255,255,0)", "rgba(0,0,0,0.4)"]}
        locations={[0, 0.3, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={shelfStyles.edge}>
        <LinearGradient
          colors={[WOOD_DARK, WOOD_BASE]}
          style={StyleSheet.absoluteFill}
        />
      </View>
    </View>
    <View style={shelfStyles.shadow} />
  </View>
));

const shelfStyles = StyleSheet.create({
  container: {
    marginVertical: 4,
    marginHorizontal: 16,
  },
  containerTall: {
    marginVertical: 6,
  },
  board: {
    height: 16,
    borderRadius: 3,
    overflow: "visible",
    position: "relative",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.5,
        shadowRadius: 10,
      },
      android: { elevation: 8 },
    }),
  },
  boardTall: {
    height: 22,
    borderRadius: 6,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.12)",
  },
  edge: {
    position: "absolute",
    bottom: -4,
    left: 0,
    right: 0,
    height: 4,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
  },
  shadow: {
    marginTop: 2,
    marginHorizontal: 28,
    height: 6,
    backgroundColor: "rgba(0,0,0,0.25)",
    borderRadius: 4,
  },
});

// ============================================================
//  Section Header
// ============================================================
const SectionHeader = React.memo(
  ({
    title,
    shelfLabel,
    titleColor,
  }: {
    title: string;
    shelfLabel: string;
    titleColor?: string;
  }) => (
    <View style={headerStyles.container}>
      <Text style={[headerStyles.title, titleColor ? { color: titleColor } : null]}>
        {title}
      </Text>
      <Text style={headerStyles.shelfLabel}>{shelfLabel}</Text>
    </View>
  )
);

const headerStyles = StyleSheet.create({
  container: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    paddingHorizontal: 20,
    paddingTop: 32,
    paddingBottom: 16,
  },
  title: {
    color: "#FFF",
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  shelfLabel: {
    color: "rgba(255,255,255,0.35)",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
});

// ============================================================
//  MAIN BOOKCASE VIEW
// ============================================================
interface BookcaseViewProps {
  items: ItemWithProduct[];
  onItemPress?: (item: ItemWithProduct) => void;
  showcaseName?: string;
  emptyStateText?: string;
  onBookmarkPress?: () => void;
}

export const BookcaseView: React.FC<BookcaseViewProps> = ({
  items,
  onItemPress,
  emptyStateText = "Start building your collection",
}) => {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const sections = useMemo(() => groupItemsIntoSections(items), [items]);

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

  const isBooks = (cat: CategoryType) => cat === "Books";
  const isFigures = (cat: CategoryType) => cat === "Toys";

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={["#0a0a0a", "#111111", "#0a0a0a"]}
        style={StyleSheet.absoluteFill}
      />

      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 8,
          paddingBottom: insets.bottom + 140,
        }}
        showsVerticalScrollIndicator={false}
      >
        {sections.map((section) => {
          const sectionIsBooks = isBooks(section.category);
          const sectionIsFigures = isFigures(section.category);

          // Header title color: primary for books, secondary for figures, white for rest
          const titleColor = sectionIsBooks
            ? colors.primary
            : sectionIsFigures
              ? colors.secondary
              : "rgba(255,255,255,0.9)";

          return (
            <View key={section.category}>
              <SectionHeader
                title={section.title}
                shelfLabel={section.shelfLabel}
                titleColor={titleColor}
              />

              {/* Books — horizontal scroll with 3D book items */}
              {sectionIsBooks && (
                <>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.bookRow}
                  >
                    {section.items.map((item) => (
                      <BookCard
                        key={item.id || Math.random().toString()}
                        item={item}
                        onPress={onItemPress}
                      />
                    ))}
                  </ScrollView>
                  <MahoganyShelf />
                </>
              )}

              {/* Figures — horizontal scroll with glass-encased cards */}
              {sectionIsFigures && (
                <>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.figureRow}
                  >
                    {section.items.map((item) => (
                      <FigureCard
                        key={item.id || Math.random().toString()}
                        item={item}
                        onPress={onItemPress}
                      />
                    ))}
                  </ScrollView>
                  <MahoganyShelf tall />
                </>
              )}

              {/* Other categories — 2-column grid with shine effect */}
              {!sectionIsBooks && !sectionIsFigures && (
                <>
                  <View style={styles.gridContainer}>
                    {section.items.map((item) => (
                      <ShineCard
                        key={item.id || Math.random().toString()}
                        item={item}
                        onPress={onItemPress}
                      />
                    ))}
                  </View>
                  <MahoganyShelf />
                </>
              )}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a0a0a",
  },
  bookRow: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    alignItems: "flex-end",
  },
  figureRow: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  gridContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 20,
    gap: 12,
    paddingBottom: 12,
  },
  // Empty state
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