import { createItemSchema, validateCreateItem } from "./createItemValidation";

describe("Item Creation Validation", () => {
    it("validates a correct payload", () => {
        const valid = {
            searchQuery: "123456789",
            productData: {
                title: "Test Product",
                brand: "Example Brand",
                ean: "123456789",
            },
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

    it("accepts a payload without forSale", () => {
        const valid = { customTitle: "Manual item", condition: "Good" };
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

    it("accepts a known item category", () => {
        const valid = {
            customTitle: "Dune",
            category: "books",
            condition: "Good",
            forSale: false,
        };
        expect(validateCreateItem(valid).category).toBe("books");
    });

    it("rejects an unknown item category", () => {
        const invalid = {
            customTitle: "Dune",
            category: "Electronics",
            condition: "Good",
            forSale: false,
        };
        expect(() => validateCreateItem(invalid)).toThrow();
    });
});
