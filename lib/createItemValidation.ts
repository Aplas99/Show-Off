import { ITEM_CONDITIONS } from "@/constants/itemCondition";
import { z } from "zod";

export const createItemSchema = z
    .object({
        searchQuery: z.string().trim().optional(),
        customTitle: z.string().trim().optional(),
        customBrand: z.string().trim().optional(),
        customPublisher: z.string().trim().optional(),
        customCategory: z.string().trim().optional(),
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
        imageFile: z.string().optional(),
        imageUrl: z.string().nullable().optional(),
    })
    .refine((data) => data.searchQuery || data.customTitle, {
        message: "Either a barcode/search or a custom title is required.",
        path: ["customTitle"], // Attach error to customTitle field
    });

export type CreateItemPayload = z.infer<typeof createItemSchema>;

export function validateCreateItem(payload: unknown) {
    return createItemSchema.parse(payload);
}
