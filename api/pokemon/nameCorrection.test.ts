import {
  containsKnownPokemonName,
  correctPokemonNameCandidate,
  fuzzyMatchPokemonName,
} from "./nameCorrection";

describe("Pokémon name correction", () => {
  describe("fuzzyMatchPokemonName", () => {
    it("returns the canonical name for an exact match", () => {
      expect(fuzzyMatchPokemonName("Pikachu")).toBe("Pikachu");
      expect(fuzzyMatchPokemonName("pikachu")).toBe("Pikachu");
    });

    it("repairs small OCR errors", () => {
      expect(fuzzyMatchPokemonName("Cinderaee")).toBe("Cinderace");
      expect(fuzzyMatchPokemonName("Gyaradcs")).toBe("Gyarados");
      expect(fuzzyMatchPokemonName("Charizrd")).toBe("Charizard");
    });

    it("canonicalizes punctuation-heavy names", () => {
      expect(fuzzyMatchPokemonName("mr mime")).toBe("Mr. Mime");
      expect(fuzzyMatchPokemonName("Farfetchd")).toBe("Farfetch'd");
    });

    it("matches multi-word species", () => {
      expect(fuzzyMatchPokemonName("Iron Hands")).toBe("Iron Hands");
      expect(fuzzyMatchPokemonName("Tapu Koko")).toBe("Tapu Koko");
    });

    it("rejects strings that are not close to any species", () => {
      expect(fuzzyMatchPokemonName("Blaze Kick")).toBeNull();
      expect(fuzzyMatchPokemonName("Graphics")).toBeNull();
    });

    it("ignores very short strings", () => {
      expect(fuzzyMatchPokemonName("HP")).toBeNull();
      expect(fuzzyMatchPokemonName("Mew")).toBeNull();
    });
  });

  describe("containsKnownPokemonName", () => {
    it("accepts species names, with or without rarity suffixes", () => {
      expect(containsKnownPokemonName("Gyarados")).toBe(true);
      expect(containsKnownPokemonName("Gyarados VMAX")).toBe(true);
      expect(containsKnownPokemonName("Galarian Moltres V")).toBe(true);
    });

    it("accepts slightly garbled species names", () => {
      expect(containsKnownPokemonName("Cinderaee V")).toBe(true);
    });

    it("rejects attack and ability names", () => {
      expect(containsKnownPokemonName("Hyper Beam")).toBe(false);
      expect(containsKnownPokemonName("Blaze Kick")).toBe(false);
      expect(containsKnownPokemonName("Graveyard Gamboling")).toBe(false);
    });

    it("rejects trainer names so trainer cards keep their raw candidates", () => {
      expect(containsKnownPokemonName("Iono")).toBe(false);
    });
  });

  describe("correctPokemonNameCandidate", () => {
    it("corrects a garbled name and keeps the rarity suffix", () => {
      expect(correctPokemonNameCandidate("Cinderaee V")).toBe("Cinderace V");
      expect(correctPokemonNameCandidate("Gyaradcs VMAX")).toBe("Gyarados VMAX");
    });

    it("repairs a garbled word inside a prefixed name", () => {
      expect(correctPokemonNameCandidate("Galarian Moltrez V")).toBe(
        "Galarian Moltres V",
      );
    });

    it("returns null when the candidate is already canonical", () => {
      expect(correctPokemonNameCandidate("Pikachu")).toBeNull();
      expect(correctPokemonNameCandidate("Cinderace V")).toBeNull();
    });

    it("returns null for text that is not a Pokémon name", () => {
      expect(correctPokemonNameCandidate("Blaze Kick")).toBeNull();
      expect(correctPokemonNameCandidate("Mus. Sban Graphics")).toBeNull();
    });
  });
});
