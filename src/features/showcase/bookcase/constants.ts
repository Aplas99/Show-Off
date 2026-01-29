import { ItemWithProduct } from "@/api/items";
import { Dimensions } from "react-native";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

// Categories constant
export const CATEGORIES = [
    "Electronics",
    "Media",
    "Toys",
    "Games",
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
    "Books",
    "Music",
    "Movies",
] as const;

export type CategoryType = typeof CATEGORIES[number];

// Wood palette for authentic bookshelf look
export const WOOD_DARK = "#1a0f08";
export const WOOD_BASE = "#2d1f16";
export const WOOD_MID = "#4a3728";
export const WOOD_LIGHT = "#6b4e3d";
export const WOOD_HIGHLIGHT = "#8b6b5c";
export const PAGES_COLOR = "#f4e8d0";

// Category-specific color accents (for spines/edges)
export const CATEGORY_COLORS: Record<CategoryType, { primary: string; secondary: string; accent: string }> = {
    "Books": { primary: "#8B4513", secondary: "#654321", accent: "#D2691E" },
    "Movies": { primary: "#2C3E50", secondary: "#1A252F", accent: "#E74C3C" }, // VHS style
    "Music": { primary: "#34495E", secondary: "#2C3E50", accent: "#3498DB" }, // CD/Vinyl style
    "Media": { primary: "#1B2631", secondary: "#17202A", accent: "#F39C12" }, // VHS
    "Toys": { primary: "#E91E63", secondary: "#C2185B", accent: "#F8BBD9" }, // Toy box colors
    "Games": { primary: "#6C3483", secondary: "#512E5F", accent: "#F4D03F" }, // Cartridge gold
    "Electronics": { primary: "#2C3E50", secondary: "#212F3D", accent: "#5DADE2" }, // Tech blue glow
    "Apparel": { primary: "#E67E22", secondary: "#D35400", accent: "#FAD7A0" }, // Soft fabric
    "Home": { primary: "#7DCEA0", secondary: "#27AE60", accent: "#D5F5E3" }, // Sage green
    "Garden": { primary: "#52BE80", secondary: "#27AE60", accent: "#ABEBC6" }, // Natural green
    "Sports": { primary: "#E74C3C", secondary: "#922B21", accent: "#F5B7B1" }, // Energy red
    "Automotive": { primary: "#5D6D7E", secondary: "#34495E", accent: "#AEB6BF" }, // Metal grey
    "Office": { primary: "#5D4037", secondary: "#3E2723", accent: "#BCAAA4" }, // Professional brown
    "Health & Beauty": { primary: "#F8C471", secondary: "#D68910", accent: "#FDEBD0" }, // Gold/rose
    "Food & Beverages": { primary: "#82E0AA", secondary: "#27AE60", accent: "#ABEBC6" }, // Fresh green
    "Arts & Crafts": { primary: "#AF7AC5", secondary: "#7D3C98", accent: "#E8DAEF" }, // Creative purple
    "Pet Supplies": { primary: "#F5B041", secondary: "#D68910", accent: "#FDEBD0" }, // Warm yellow
};

// Responsive configuration
export const getItemsPerShelf = () => {
    const width = Dimensions.get("window").width;
    if (width >= 800) return 5; // Tablets landscape
    if (width >= 600) return 4; // Tablets portrait / Foldables
    return 3; // Phones
};

export const ITEMS_PER_SHELF = getItemsPerShelf();
export const SHELF_ROWS = 3;
export const ITEMS_PER_PAGE = ITEMS_PER_SHELF * SHELF_ROWS;
export const PAGE_WIDTH = SCREEN_WIDTH;
export const SHELF_PADDING = 20;
export const ITEM_SPACING = 16;
export const ITEM_WIDTH = (PAGE_WIDTH - (SHELF_PADDING * 2) - (ITEM_SPACING * (ITEMS_PER_SHELF - 1))) / ITEMS_PER_SHELF;
// Maintain a consistent aspect ratio (approx 1:1.6) for books
export const ITEM_HEIGHT = ITEM_WIDTH * 1.55;
export const SHELF_THICKNESS = 20;
export const BOOK_DEPTH = 10;
export const SPINE_WIDTH = 6;

// --- Helper: Get Category from Item ---
// --- Helper: Get Category from Item ---
export const getItemCategory = (item: ItemWithProduct): CategoryType => {
    // Try to get category from various possible locations
    // We check `products.category` (if available from API) or custom `category` field
    // Note: The `item` object passed might vary depending on whether it's from search or DB
    const rawCategory = (
        // explicit cast if needed, though 'as any' is safer for flexible property access
        (item as any).category ||
        item.products?.data?.category ||
        "Books"
    ).toString();

    // 1. Exact match check
    if (CATEGORIES.includes(rawCategory as CategoryType)) {
        return rawCategory as CategoryType;
    }

    // 2. Fuzzy Keyword Matching
    const lowerCat = rawCategory.toLowerCase();

    // Map keywords to our supported categories
    if (lowerCat.match(/toy|doll|figure|lego|puzzle|action|plush/)) return "Toys";
    if (lowerCat.match(/game|console|nintendo|xbox|playstation|wii|switch|controller/)) return "Games";
    if (lowerCat.match(/movie|dvd|bluray|blu-ray|film|series|season/)) return "Movies";
    if (lowerCat.match(/music|cd|vinyl|record|album|song|audio/)) return "Music";
    if (lowerCat.match(/tech|computer|phone|tablet|laptop|screen|monitor|cable|usb|electronic/)) return "Electronics";
    if (lowerCat.match(/shirt|clothing|wear|shoe|pant|dress|apparel|fashion/)) return "Apparel";
    if (lowerCat.match(/food|snack|drink|beverage|candy|chocolate/)) return "Food & Beverages";
    if (lowerCat.match(/pet|dog|cat|animal|fish/)) return "Pet Supplies";
    if (lowerCat.match(/health|beauty|soap|shampoo|vitamin|makeup/)) return "Health & Beauty";
    if (lowerCat.match(/art|craft|paint|draw|paper/)) return "Arts & Crafts";
    if (lowerCat.match(/garden|plant|flower|tool/)) return "Garden";
    if (lowerCat.match(/sport|ball|bat|gym|fitness/)) return "Sports";
    if (lowerCat.match(/car|auto|tire|oil/)) return "Automotive";

    // Default fallback
    return "Books";
};
