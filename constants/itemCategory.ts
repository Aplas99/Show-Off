import type { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";

/**
 * Top-level item categories, stored in `items.category`. Anything that fits
 * none of the dedicated buckets lands in `general`; finer distinctions live in
 * the free-text type (`custom_category`).
 */
export const ITEM_CATEGORIES = [
    "tcg",
    "books",
    "video_games",
    "board_games",
    "figures",
    "music",
    "movies",
    "general",
] as const;

export type ItemCategory = (typeof ITEM_CATEGORIES)[number];

export const ITEM_CATEGORY_LABELS: Record<ItemCategory, string> = {
    tcg: "TCG",
    books: "Books",
    video_games: "Video Games",
    board_games: "Board Games",
    figures: "Figures",
    music: "Music",
    movies: "Movies",
    general: "General",
};

export const ITEM_CATEGORY_ICONS: Record<ItemCategory, ComponentProps<typeof Ionicons>["name"]> = {
    tcg: "albums-outline",
    books: "book-outline",
    video_games: "game-controller-outline",
    board_games: "dice-outline",
    figures: "body-outline",
    music: "musical-notes-outline",
    movies: "film-outline",
    general: "cube-outline",
};

export function isItemCategory(value: unknown): value is ItemCategory {
    return typeof value === "string" && (ITEM_CATEGORIES as readonly string[]).includes(value);
}
