import { ITEM_CONDITIONS } from "@/constants/itemCondition";
import { z } from "zod";

export const createItemSchema = z.object({
    searchQuery: z
        .string()
        .trim()
        .min(1, "Invalid item: Barcode/search query is required."),
    condition: z.enum([...ITEM_CONDITIONS] as [string, ...string[]], {
        message: "Invalid item: Condition is required.",
    }),
    userDescription: z.string().nullable().optional(),
    forSale: z.boolean(),
    price: z
        .number()
        .nonnegative("Invalid item: Price must be a positive number.")
        .nullable()
        .optional(),
    imageUrl: z.string().nullable().optional(),
});

export type CreateItemPayload = z.infer<typeof createItemSchema>;

export function validateCreateItem(payload: unknown) {
    return createItemSchema.parse(payload);
}
