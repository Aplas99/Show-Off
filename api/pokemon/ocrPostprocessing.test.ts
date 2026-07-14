import {
  cleanOcrText,
  deduplicateLines,
  extractMarketPrice,
  formatPrice,
  levenshtein,
  normalizeName,
  normalizeOcrDigits,
  repairCollectorNumberGaps,
  similarityRatio,
  isPokemonFoilCard,
  isPokemonPromoCard,
} from "./ocrPostprocessing";

describe("OCR postprocessing utilities", () => {
  describe("cleanOcrText", () => {
    it("strips smart quotes and collapses whitespace", () => {
      expect(cleanOcrText("\u201CHello\u201D  World")).toBe("Hello World");
    });

    it("converts em/en dashes to hyphens", () => {
      expect(cleanOcrText("Ho\u2014Oh")).toBe("Ho-Oh");
      expect(cleanOcrText("Ho\u2013Oh")).toBe("Ho-Oh");
    });

    it("removes copyright symbols", () => {
      expect(cleanOcrText("©2024 Pokémon")).toBe("2024 Pokémon");
    });

    it("expands ligatures", () => {
      expect(cleanOcrText("\uFB01re")).toBe("fire");
      expect(cleanOcrText("\uFB02ame")).toBe("flame");
    });

    it("trims leading and trailing whitespace", () => {
      expect(cleanOcrText("  text  ")).toBe("text");
    });
  });

  describe("normalizeOcrDigits", () => {
    it("replaces O with 0, preserving the resulting leading zero", () => {
      expect(normalizeOcrDigits("O42")).toBe("042");
    });

    it("replaces I and L with 1", () => {
      expect(normalizeOcrDigits("I1I")).toBe("111");
      expect(normalizeOcrDigits("L42")).toBe("142");
    });

    it("preserves leading zeros so the API query matches the card's stored number", () => {
      expect(normalizeOcrDigits("042")).toBe("042");
      expect(normalizeOcrDigits("001")).toBe("001");
    });

    it("handles mixed letter/digit sequences", () => {
      expect(normalizeOcrDigits("SWSH039")).toBe("swsh039");
    });
  });

  describe("deduplicateLines", () => {
    it("removes exact duplicates", () => {
      expect(deduplicateLines(["Hello", "Hello"])).toEqual(["Hello"]);
    });

    it("treats case-insensitively", () => {
      expect(deduplicateLines(["HELLO", "hello"])).toEqual(["HELLO"]);
    });

    it("preserves order of first occurrence", () => {
      expect(deduplicateLines(["C", "A", "B", "A"])).toEqual(["C", "A", "B"]);
    });

    it("filters out empty and whitespace-only lines", () => {
      expect(deduplicateLines(["text", "", "  ", "text"])).toEqual(["text"]);
    });
  });

  describe("levenshtein", () => {
    it("returns 0 for identical strings", () => {
      expect(levenshtein("pikachu", "pikachu")).toBe(0);
    });

    it("returns string length for comparison with empty", () => {
      expect(levenshtein("abc", "")).toBe(3);
      expect(levenshtein("", "abc")).toBe(3);
    });

    it("counts single substitution", () => {
      expect(levenshtein("bolt", "boit")).toBe(1);
    });

    it("counts insertion", () => {
      expect(levenshtein("pik", "pika")).toBe(1);
    });

    it("counts deletion", () => {
      expect(levenshtein("pika", "pik")).toBe(1);
    });

    it("handles multi-edit distance", () => {
      expect(levenshtein("kitten", "sitting")).toBe(3);
    });
  });

  describe("similarityRatio", () => {
    it("returns 1 for identical strings", () => {
      expect(similarityRatio("pikachu", "pikachu")).toBe(1);
    });

    it("returns 0 for completely different strings of equal length", () => {
      const ratio = similarityRatio("abcd", "wxyz");
      expect(ratio).toBeLessThanOrEqual(0.25);
    });

    it("returns high value for strings with minor differences", () => {
      expect(similarityRatio("Raging Bolt", "Raging Boit")).toBeGreaterThan(0.85);
    });

    it("returns 1 for two empty strings", () => {
      expect(similarityRatio("", "")).toBe(1);
    });
  });

  describe("normalizeName", () => {
    it("lowercases and strips non-alphanumeric", () => {
      expect(normalizeName("Mr. Mime")).toBe("mrmime");
    });

    it("handles apostrophes and hyphens", () => {
      expect(normalizeName("Farfetch'd")).toBe("farfetchd");
      expect(normalizeName("Ho-Oh")).toBe("hooh");
    });
  });

  describe("repairCollectorNumberGaps", () => {
    it("merges a gap inside the total after the slash", () => {
      expect(repairCollectorNumberGaps("E 043/2 64")).toBe("E 043/264");
    });

    it("merges a gap inside the number before the slash", () => {
      expect(repairCollectorNumberGaps("04 3/264")).toBe("043/264");
    });

    it("leaves lines without a slash untouched", () => {
      expect(repairCollectorNumberGaps("220 210")).toBe("220 210");
    });

    it("does not merge digit groups that would exceed a collector number", () => {
      expect(repairCollectorNumberGaps("123/456 2021")).toBe("123/456 2021");
    });

    it("leaves well-formed collector numbers untouched", () => {
      expect(repairCollectorNumberGaps("SCR EN 111/142")).toBe("SCR EN 111/142");
    });
  });

  describe("extractMarketPrice", () => {
    it("returns the first available market price", () => {
      const prices = {
        holofoil: { market: 12.5 },
        reverseHolofoil: { market: 8.0 },
      };
      expect(extractMarketPrice(prices)).toBe(12.5);
    });

    it("skips variants without a market price", () => {
      const prices = {
        normal: { market: null },
        holofoil: { market: 25.0 },
      };
      expect(extractMarketPrice(prices)).toBe(25.0);
    });

    it("returns null when no prices exist", () => {
      expect(extractMarketPrice(undefined)).toBeNull();
      expect(extractMarketPrice({})).toBeNull();
    });
  });

  describe("formatPrice", () => {
    it("formats as USD with two decimal places", () => {
      expect(formatPrice(12.5)).toBe("$12.50");
      expect(formatPrice(0.99)).toBe("$0.99");
      expect(formatPrice(350)).toBe("$350.00");
    });
  });

  describe("card finish indicators", () => {
    it("recognizes foil cards from rarity or official price variants", () => {
      expect(isPokemonFoilCard({ rarity: "Rare Holo" })).toBe(true);
      expect(isPokemonFoilCard({ tcgplayer: { prices: { reverseHolofoil: {} } } })).toBe(true);
      expect(isPokemonFoilCard({ rarity: "Common" })).toBe(false);
    });

    it("recognizes promo cards from rarity or official set metadata", () => {
      expect(isPokemonPromoCard({ rarity: "Promo", set: { id: "svp", name: "Scarlet & Violet Black Star Promos" } })).toBe(true);
      expect(isPokemonPromoCard({ set: { id: "base1", name: "Base" } })).toBe(false);
    });
  });
});
