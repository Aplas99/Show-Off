import { isItemCategory, type ItemCategory } from "@/constants/itemCategory";

// First match wins. Keep these patterns and their order in sync with
// public.infer_item_category() in supabase/migrations/20261022100000_item_categories.sql.
const CATEGORY_RULES: [ItemCategory, RegExp][] = [
    ["tcg", /\b(tcg|ccg|trading cards?|(pok[eé]mon|magic|yu-?gi-?oh|lorcana) cards?|magic: the gathering|mtg)\b/i],
    ["books", /\b(books?|novels?|manga|comics?|graphic novels?|magazines?|textbooks?|literature|fiction|paperbacks?|hardcovers?)\b/i],
    // Before music so "Vinyl Figure" is a figure, not a record.
    ["figures", /\b(action figures?|figures?|figurines?|statues?|statuettes?|funko|nendoroids?|amiibo)\b/i],
    ["video_games", /\b(video ?games?|gaming|consoles?|nintendo|playstation|ps[1-5]|xbox|switch|sega|game ?boy|gamecube|wii)\b/i],
    // Toys that share "Toys & Games" catalog paths stay General.
    ["general", /\b(plush|dolls?|lego)\b/i],
    ["board_games", /\b(board ?games?|tabletop|card games?|dice|puzzles?|jigsaw)\b/i],
    ["music", /\b(music|vinyl|records?|lps?|albums?|cds?|cassettes?)\b/i],
    ["movies", /\b(movies?|films?|dvds?|blu-?rays?|vhs|4k uhd)\b/i],
    // Platform-less "games" (e.g. "Toys & Games > Games") are tabletop; this
    // runs after movies so "The Hunger Games Blu-ray" stays a movie.
    ["board_games", /\bgames?\b/i],
];
// EAN-13 with the Bookland prefix is an ISBN.
const ISBN_EAN_PATTERN = /^97[89]\d{10}$/;

export interface ItemCategorySignals {
    category?: string | null;
    pokemonTcgCardId?: string | null;
    magicCardId?: string | null;
    riftboundCardId?: string | null;
    productEan?: string | number | null;
    /** Free-text hints: the item's type label, the catalog product category, etc. */
    hints?: (string | null | undefined)[];
}

/** Guess a category from an item's catalog links and descriptive text. */
export function inferItemCategory({
    pokemonTcgCardId,
    magicCardId,
    riftboundCardId,
    productEan,
    hints = [],
}: ItemCategorySignals): ItemCategory {
    if (pokemonTcgCardId || magicCardId || riftboundCardId) return "tcg";
    if (productEan != null && ISBN_EAN_PATTERN.test(String(productEan))) return "books";

    const text = hints.filter(Boolean).join(" ");
    if (!text) return "general";
    return CATEGORY_RULES.find(([, pattern]) => pattern.test(text))?.[0] ?? "general";
}

/**
 * The category to show for an item: card links always mean TCG, then the
 * stored category, falling back to inference for rows that predate it.
 */
export function resolveItemCategory(signals: ItemCategorySignals): ItemCategory {
    if (signals.pokemonTcgCardId || signals.magicCardId || signals.riftboundCardId) return "tcg";
    if (isItemCategory(signals.category)) return signals.category;
    return inferItemCategory(signals);
}

/** Item row fields the category depends on (a structural subset of ItemWithProduct). */
export interface CategorizableItem {
    category?: string | null;
    pokemon_tcg_card_id?: string | null;
    magic_card_id?: string | null;
    riftbound_card_id?: string | null;
    product_ean?: string | number | null;
    custom_category?: string | null;
    products?: { data?: { category?: unknown } | null } | null;
}

export function getItemCategory(item: CategorizableItem): ItemCategory {
    const productCategory = item.products?.data?.category;
    return resolveItemCategory({
        category: item.category,
        pokemonTcgCardId: item.pokemon_tcg_card_id,
        magicCardId: item.magic_card_id,
        riftboundCardId: item.riftbound_card_id,
        productEan: item.product_ean,
        hints: [item.custom_category, typeof productCategory === "string" ? productCategory : null],
    });
}
