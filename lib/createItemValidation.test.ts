import { createItemSchema, validateCreateItem } from "./createItemValidation";

describe("Item Creation Validation", () => {
    it("validates a correct payload", () => {
        const valid = {
            searchQuery: "123456789",
            condition: "New",
            forSale: true,
            price: 100,
            userDescription: "Great condition",
            imageUrl: "http://example.com/img.jpg",
        };
        // Using schema directly
        expect(createItemSchema.parse(valid)).toEqual(valid);
        // Using helper function
        expect(validateCreateItem(valid)).toEqual(valid);
    });

    it("fails when query is empty", () => {
        const invalid = {
            searchQuery: "   ",
            condition: "New",
            forSale: false,
        };
        expect(() => validateCreateItem(invalid)).toThrow(/barcode\/search or a custom title/i);
    });

    it("fails when condition is invalid", () => {
        const invalid = {
            searchQuery: "123",
            condition: "Trash", // Not in enum
            forSale: true,
        };
        expect(() => validateCreateItem(invalid)).toThrow();
    });

    it("fails when price is negative", () => {
        const invalid = {
            searchQuery: "123",
            condition: "Used",
            forSale: true,
            price: -50,
        };
        expect(() => validateCreateItem(invalid)).toThrow("positive number");
    });
});
