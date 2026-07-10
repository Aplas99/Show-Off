import type { PokemonTcgCard } from "./index";
import {
  calculatePokemonCardCrop,
  identifyPokemonCardImage,
  parsePokemonCardText,
  scoreCardMatch,
  type PokemonCardIdentifiers,
  type PokemonRecognitionDependencies,
} from "./recognition";

jest.mock("expo-image-manipulator", () => ({
  ImageManipulator: {},
  SaveFormat: { JPEG: "jpeg" },
}));

jest.mock("@/lib/supabase", () => ({
  supabase: {},
}));

// ---------------------------------------------------------------------------
// Test cards
// ---------------------------------------------------------------------------

const ragingBolt: PokemonTcgCard = {
  id: "sv7-111",
  name: "Raging Bolt",
  supertype: "Pokémon",
  subtypes: [],
  types: [],
  set: {
    id: "sv7",
    name: "Stellar Crown",
    printedTotal: 142,
    ptcgoCode: "SCR",
  },
  number: "111",
  nationalPokedexNumbers: [],
  images: { small: "small.png", large: "large.png" },
};

const charizardEx: PokemonTcgCard = {
  id: "sv3-125",
  name: "Charizard ex",
  supertype: "Pokémon",
  subtypes: ["Stage 2", "ex"],
  types: ["Fire"],
  set: {
    id: "sv3",
    name: "Obsidian Flames",
    printedTotal: 197,
    ptcgoCode: "OBF",
  },
  number: "125",
  nationalPokedexNumbers: [6],
  images: { small: "small.png", large: "large.png" },
};

const pikachuVmax: PokemonTcgCard = {
  id: "swsh4-44",
  name: "Pikachu VMAX",
  supertype: "Pokémon",
  subtypes: ["VMAX"],
  types: ["Lightning"],
  set: {
    id: "swsh4",
    name: "Vivid Voltage",
    printedTotal: 185,
    ptcgoCode: "VIV",
  },
  number: "44",
  nationalPokedexNumbers: [25],
  images: { small: "small.png", large: "large.png" },
};

const promoCard: PokemonTcgCard = {
  id: "swshp-SWSH039",
  name: "Pikachu V",
  supertype: "Pokémon",
  subtypes: ["Basic", "V"],
  types: ["Lightning"],
  set: {
    id: "swshp",
    name: "SWSH Black Star Promos",
    printedTotal: 1,
    ptcgoCode: "PR-SW",
  },
  number: "SWSH039",
  nationalPokedexNumbers: [25],
  images: { small: "small.png", large: "large.png" },
};

const mrMime: PokemonTcgCard = {
  id: "base1-22",
  name: "Mr. Mime",
  supertype: "Pokémon",
  subtypes: [],
  types: ["Psychic"],
  set: {
    id: "base1",
    name: "Base",
    printedTotal: 102,
  },
  number: "22",
  nationalPokedexNumbers: [122],
  images: { small: "small.png", large: "large.png" },
};

// ---------------------------------------------------------------------------
// OCR fixtures: realistic ML Kit outputs for diverse card types
// ---------------------------------------------------------------------------

interface OcrFixture {
  label: string;
  ocrText: string;
  expectedName: string;
  expectedNumber: string | null;
  expectedTotal: number | null;
  expectedSetCode: string | null;
}

const ocrFixtures: OcrFixture[] = [
  {
    label: "standard Pokémon with set code and total",
    ocrText: "BASIC\nRaging Bolt HP 130\nAncient\nSCR EN 111/142",
    expectedName: "Raging Bolt",
    expectedNumber: "111",
    expectedTotal: 142,
    expectedSetCode: "SCR",
  },
  {
    label: "EX card with HP on same line",
    ocrText: "Stage 2\nCharizard ex HP 330\nFire\nOBF EN 125/197",
    expectedName: "Charizard ex",
    expectedNumber: "125",
    expectedTotal: 197,
    expectedSetCode: "OBF",
  },
  {
    label: "VMAX card",
    ocrText: "VMAX\nPikachu VMAX HP 310\nLightning\nVIV EN 44/185",
    expectedName: "Pikachu VMAX",
    expectedNumber: "44",
    expectedTotal: 185,
    expectedSetCode: "VIV",
  },
  {
    label: "OCR with mangled slash (pipe instead of slash)",
    ocrText: "BASIC\nRaging Bolt HP 130\nSCR 111|142",
    expectedName: "Raging Bolt",
    expectedNumber: "111",
    expectedTotal: 142,
    expectedSetCode: "SCR",
  },
  {
    label: "card with OCR digit confusion (O instead of 0)",
    ocrText: "BASIC\nRaging Bolt HP 130\nSCR EN 1I1/I42",
    expectedName: "Raging Bolt",
    expectedNumber: "111",
    expectedTotal: 142,
    expectedSetCode: "SCR",
  },
  {
    label: "card with special characters in name",
    ocrText: "BASIC\nMr. Mime HP 40\n22/102",
    expectedName: "Mr. Mime",
    expectedNumber: "22",
    expectedTotal: 102,
    expectedSetCode: null,
  },
  {
    label: "HP value after name as digits then HP",
    ocrText: "BASIC\nRaging Bolt 130 HP\n111/142",
    expectedName: "Raging Bolt",
    expectedNumber: "111",
    expectedTotal: 142,
    expectedSetCode: null,
  },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Pokémon card image recognition", () => {
  describe("calculatePokemonCardCrop", () => {
    it("maps the visible card guide into a cover-scaled camera image", () => {
      const crop = calculatePokemonCardCrop(3000, 4000, {
        previewWidth: 390,
        previewHeight: 844,
        frameX: 25,
        frameY: 170,
        frameWidth: 340,
        frameHeight: 475,
      });

      expect(crop).toEqual({
        originX: 694,
        originY: 806,
        width: 1611,
        height: 2251,
      });
    });

    it("centers a default crop when no scan frame is provided", () => {
      const crop = calculatePokemonCardCrop(2000, 3000);
      expect(crop.width).toBeGreaterThan(0);
      expect(crop.height).toBeGreaterThan(0);
      expect(crop.originX).toBeGreaterThanOrEqual(0);
      expect(crop.originY).toBeGreaterThanOrEqual(0);
    });
  });

  describe("parsePokemonCardText", () => {
    it.each(ocrFixtures)(
      "parses $label",
      ({ ocrText, expectedName, expectedNumber, expectedTotal, expectedSetCode }) => {
        const identifiers = parsePokemonCardText({ text: ocrText });

        if (expectedName) {
          expect(identifiers.nameCandidates).toEqual(
            expect.arrayContaining([expectedName]),
          );
        }
        expect(identifiers.number).toBe(expectedNumber);
        expect(identifiers.printedTotal).toBe(expectedTotal);
        expect(identifiers.setCode).toBe(expectedSetCode);
      },
    );

    it("returns no candidates for an empty OCR result", () => {
      const identifiers = parsePokemonCardText({ text: "" });

      expect(identifiers.nameCandidates).toEqual([]);
      expect(identifiers.number).toBeNull();
    });

    it("filters out lines that are entirely metadata words", () => {
      const identifiers = parsePokemonCardText({
        text: "Basic\nPokémon\nCharizard HP 120\n4/102",
      });

      expect(identifiers.nameCandidates).not.toContain("Basic");
      expect(identifiers.nameCandidates).not.toContain("Pokémon");
      expect(identifiers.nameCandidates).toEqual(
        expect.arrayContaining(["Charizard"]),
      );
    });

    it("deduplicates identical lines from overlapping OCR blocks", () => {
      const identifiers = parsePokemonCardText({
        text: "Charizard HP 120\nCharizard HP 120\n4/102",
      });

      expect(identifiers.nameCandidates).toHaveLength(1);
      expect(identifiers.nameCandidates[0]).toBe("Charizard");
    });
  });

  describe("scoreCardMatch", () => {
    const baseIdentifiers: PokemonCardIdentifiers = {
      nameCandidates: ["Raging Bolt"],
      number: "111",
      printedTotal: 142,
      setCode: "SCR",
      rawText: "",
    };

    it("gives high score for exact match across all fields", () => {
      const score = scoreCardMatch(ragingBolt, "Raging Bolt", baseIdentifiers);
      expect(score).toBeGreaterThanOrEqual(0.9);
    });

    it("gives partial score for name match with wrong number", () => {
      const identifiers = { ...baseIdentifiers, number: "999" };
      const score = scoreCardMatch(ragingBolt, "Raging Bolt", identifiers);
      // Should get name score but not number score
      expect(score).toBeLessThan(0.8);
    });

    it("returns 0 for completely different names", () => {
      const score = scoreCardMatch(ragingBolt, "Pikachu", baseIdentifiers);
      expect(score).toBe(0);
    });

    it("handles fuzzy name matching with minor OCR errors", () => {
      // "Raging Boit" is 1 edit away from "Raging Bolt"
      const score = scoreCardMatch(ragingBolt, "Raging Boit", baseIdentifiers);
      expect(score).toBeGreaterThan(MIN_MATCH_SCORE);
    });

    it("scores EX cards correctly", () => {
      const identifiers: PokemonCardIdentifiers = {
        nameCandidates: ["Charizard ex"],
        number: "125",
        printedTotal: 197,
        setCode: "OBF",
        rawText: "",
      };
      const score = scoreCardMatch(charizardEx, "Charizard ex", identifiers);
      expect(score).toBeGreaterThanOrEqual(0.9);
    });

    it("gives partial credit when OCR has no number", () => {
      const identifiers: PokemonCardIdentifiers = {
        nameCandidates: ["Raging Bolt"],
        number: null,
        printedTotal: null,
        setCode: null,
        rawText: "",
      };
      const score = scoreCardMatch(ragingBolt, "Raging Bolt", identifiers);
      expect(score).toBeGreaterThan(0);
    });
  });

  describe("identifyPokemonCardImage (integration)", () => {
    it("uses OCR identifiers for structured card search", async () => {
      const dependencies: PokemonRecognitionDependencies = {
        prepareImage: jest.fn().mockResolvedValue("file:///cropped-card.jpg"),
        recognizeText: jest.fn().mockResolvedValue({
          text: "BASIC\nRaging Bolt HP 130\nAncient\nSCR EN 111/142",
        }),
        searchCards: jest.fn().mockResolvedValue([
          { card: ragingBolt, score: 0.95 },
        ]),
      };

      const matches = await identifyPokemonCardImage(
        "file:///card.jpg",
        dependencies,
      );

      expect(dependencies.prepareImage).toHaveBeenCalledWith("file:///card.jpg");
      expect(dependencies.recognizeText).toHaveBeenCalledWith(
        "file:///cropped-card.jpg",
      );
      expect(dependencies.searchCards).toHaveBeenCalledWith(
        expect.objectContaining({
          nameCandidates: expect.arrayContaining(["Raging Bolt"]),
          number: "111",
          printedTotal: 142,
          setCode: "SCR",
        }),
      );
      expect(matches).toEqual([{ card: ragingBolt, score: 0.95 }]);
    });

    it("returns empty when OCR extracts no identifiers", async () => {
      const dependencies: PokemonRecognitionDependencies = {
        prepareImage: jest.fn().mockResolvedValue("file:///cropped.jpg"),
        recognizeText: jest.fn().mockResolvedValue({ text: "" }),
        searchCards: jest.fn(),
      };

      const matches = await identifyPokemonCardImage(
        "file:///card.jpg",
        dependencies,
      );

      expect(matches).toEqual([]);
      expect(dependencies.searchCards).not.toHaveBeenCalled();
    });

    it("still searches when name is found but no number", async () => {
      const dependencies: PokemonRecognitionDependencies = {
        prepareImage: jest.fn().mockResolvedValue("file:///cropped.jpg"),
        recognizeText: jest.fn().mockResolvedValue({
          text: "Charizard ex HP 330",
        }),
        searchCards: jest.fn().mockResolvedValue([
          { card: charizardEx, score: 0.6 },
        ]),
      };

      const matches = await identifyPokemonCardImage(
        "file:///card.jpg",
        dependencies,
      );

      expect(dependencies.searchCards).toHaveBeenCalled();
      expect(matches).toHaveLength(1);
    });
  });
});

// Need to import the constant for the fuzzy test
const MIN_MATCH_SCORE = 0.55;
