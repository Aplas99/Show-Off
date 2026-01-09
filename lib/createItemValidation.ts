import { ITEM_CONDITIONS, ItemCondition } from "@/constants/itemCondition";

export interface CreateItemPayload {
    searchQuery: string;
    condition: ItemCondition;
    userDescription?: string | null;
    forSale: boolean;
    price?: number | null;
    imageUrl?: string | null;
}

export function validateCreateItem(payload: CreateItemPayload) {
    if (!payload.searchQuery || payload.searchQuery.trim().length === 0) {
        throw new Error("Invalid item: Barcode/search query is required.");
    }

    if (!ITEM_CONDITIONS.includes(payload.condition)) {
        throw new Error("Invalid item: Condition is required.");
    }

    if (payload.price !== null && payload.price !== undefined) {
        if (isNaN(payload.price) || payload.price < 0) {
            throw new Error("Invalid item: Price must be a positive number.");
        }
    }

    // Description is optional, no check needed.
    // forSale is boolean, no check needed.
    return true;
}
