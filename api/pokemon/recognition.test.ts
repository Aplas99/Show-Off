import type { PokemonTcgCard } from "./index";
import {
  buildOfficialNameFallbacks,
  calculatePokemonCardCrop,
  countCardIdentifierMatches,
  identifyPokemonCardImage,
  isExactCardIdentifierMatch,
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
  {
    label: "SM Black Star Promo card (concatenated prefix+number, no total)",
    ocrText:
      "BASIC\nPopplio\nSing\nYour opponent's Active Pokémon is now Asleep.\nweakness x2\nNO. 728 Sea Lion Pokémon HT: 1'04 WT. 16.5 lbs.\nSM03\n2016 Pokémon\nresistance\nw60\nretreat",
    expectedName: "Popplio",
    expectedNumber: "sm03",
    expectedTotal: null,
    expectedSetCode: null,
  },
  {
    // Real PaddleOCR output from a phone photo of a full-art card in a
    // toploader with glare: rarity badge reads as its own "VMAX" line and the
    // regulation mark fuses onto the collector number ("E029/203").
    label: "full-art card in toploader (glare, fused regulation mark)",
    ocrText:
      "VMAX\nGyarados\nVMAX\n3300\nEvolves from Gyarados V\nDynamax\nHyper Beam\n120\nDiscard an Energy from your opponent's Active Pokémon.\nMaxTyrant\n240\nweakness\n×2\nresistance\nretreat\n****\nIllus. Shin Nagasawa\nVMAX rule\nWhen your Pokémon VMAX\nE029/203\nis Knocked Out, your opponent takes 3 Prize cards.\n©2021 Pokémon/Nintendo/Creatures/GAME FREAK",
    expectedName: "Gyarados",
    expectedNumber: "029",
    expectedTotal: 203,
    expectedSetCode: null,
  },
  {
    // Real failed scan: OCR invented set code "FS" from footer noise and read
    // the padded number "o42/091". The bogus code must be rejected (only
    // catalog ptcgoCodes are trusted) while number and total survive.
    label: "card with hallucinated set code and padded collector number",
    ocrText:
      "Greavard\nNO 97Ghost Dog Aokémon H2W22 lbs\nGraveyard Gamboling\nessx2 resistance -30\nFs o42/091\nis attack does 10 damage for each Pokémon in your\ncard pile.\n70 O\nretreat\n10x",
    expectedName: "Greavard",
    expectedNumber: "042",
    expectedTotal: 91,
    expectedSetCode: null,
  },
  {
    // Real failed scan: fused "CinderaceV" name and an OCR space inside the
    // collector total ("043/2 64" instead of "043/264").
    label: "V card with fused name suffix and gapped collector total",
    ocrText:
      "BASIC\nCinderaceV\nDiscard 2 O Energy from this Pokêmon,\nweakness x2\nMus. Sban Graphics\nBlaze Kick\nE 043/2 64\nresistance\nVrule\nretreat\nHP\nyour opponent takes 2 Prize cards.\n2021 Pokemon / Nintendo I Creatures/ GAME FREAK\n220\n210\nWhen your Pokémon V is Knocked Qut,",
    expectedName: "Cinderace V",
    expectedNumber: "043",
    expectedTotal: 264,
    expectedSetCode: null,
  },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Pokémon card image recognition", () => {
  describe("calculatePokemonCardCrop", () => {
    it("produces a centered card-shaped crop", () => {
      const crop = calculatePokemonCardCrop(3000, 4000);

      // Card aspect ratio preserved.
      expect(crop.width / crop.height).toBeCloseTo(63 / 88, 5);
      // Centered within the photo.
      expect(crop.originX).toBeCloseTo((3000 - crop.width) / 2, 5);
      expect(crop.originY).toBeCloseTo((4000 - crop.height) / 2, 5);
      // Stays inside the image bounds.
      expect(crop.originX + crop.width).toBeLessThanOrEqual(3000);
      expect(crop.originY + crop.height).toBeLessThanOrEqual(4000);
    });

    it("clamps the crop for short, wide images", () => {
      const crop = calculatePokemonCardCrop(2000, 1000);
      expect(crop.width).toBeGreaterThan(0);
      expect(crop.height).toBeCloseTo(1000, 5);
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

    it("filters standalone rarity badges from name candidates", () => {
      const identifiers = parsePokemonCardText({
        text: "VMAX\nGyarados\n029/203",
      });

      expect(identifiers.nameCandidates).not.toContain("VMAX");
      expect(identifiers.nameCandidates[0]).toBe("Gyarados");
    });

    it("adds split and base-name candidates for fused rarity suffixes", () => {
      const identifiers = parsePokemonCardText({
        text: "BASIC\nCinderaceV\n043/264",
      });

      expect(identifiers.nameCandidates[0]).toBe("Cinderace V");
      expect(identifiers.nameCandidates).toEqual(
        expect.arrayContaining(["Cinderace"]),
      );
    });

    it("repairs a common VMAX foil OCR error", () => {
      const identifiers = parsePokemonCardText({
        text: "VMAX\nGyarados Vny\n029/203",
      });

      expect(identifiers.nameCandidates).toContain("Gyarados VMAX");
      expect(identifiers.number).toBe("029");
      expect(identifiers.printedTotal).toBe(203);
      expect(identifiers.collectionCandidates).toContain("Evolving Skies");
    });

    it("filters out fuzzy metadata like BASIG (misread of BASIC)", () => {
      const identifiers = parsePokemonCardText({
        text: "BASIG\nOkidogi\nAbilityAdrena-Power\nweakness Ox2\nH TWMEN 111/167 k",
      });

      expect(identifiers.nameCandidates).not.toContain("BASIG");
      expect(identifiers.nameCandidates).toContain("Okidogi");
    });

    it("filters out lines containing game-mechanic keywords", () => {
      const identifiers = parsePokemonCardText({
        text: "BASIG\nOkidogi\nAbilityAdrena-Power\nweakness Ox2\nH TWMEN 111/167 k",
      });

      expect(identifiers.nameCandidates).not.toContain("Adrena-Power");
      expect(identifiers.nameCandidates).not.toEqual(
        expect.arrayContaining([expect.stringMatching(/weakness/i)]),
      );
    });

    it("strips language suffixes from set codes (TWMEN → TWM)", () => {
      const identifiers = parsePokemonCardText({
        text: "Okidogi\nH TWMEN 111/167 k",
      });

      expect(identifiers.setCode).toBe("TWM");
    });

    it("produces only the real name from a realistic Okidogi scan", () => {
      const identifiers = parsePokemonCardText({
        text: "BASIG\nOkidogi\nAbilityAdrena-Power\nNO 1014 Retainer Pokémnon HT 5'11 WI 2033 lbs\nweakness Ox2\nH TWMEN 111/167 k",
      });

      expect(identifiers.nameCandidates).toEqual(["Okidogi"]);
      expect(identifiers.number).toBe("111");
      expect(identifiers.printedTotal).toBe(167);
      expect(identifiers.setCode).toBe("TWM");
      expect(identifiers.collectionCandidates).toContain("Twilight Masquerade");
    });

    it("filters evolution, mechanic, and attack text from a foil VMAX scan", () => {
      const identifiers = parsePokemonCardText({
        text: "VHAX GyaradosAY\nEvolves from Gyarados V\nDynamax\nHyper Beam\nDiscard an Energy from your opponents Active Pokémon.\nweaknessx2\n9E 029/203",
      });

      // "Evolves from..." is evolution text, "Dynamax" is a mechanic keyword,
      // "Discard..." is attack text — all should be filtered out.
      expect(identifiers.nameCandidates).not.toEqual(
        expect.arrayContaining([expect.stringMatching(/evolves/i)]),
      );
      expect(identifiers.nameCandidates).not.toContain("Dynamax");
      expect(identifiers.nameCandidates).not.toEqual(
        expect.arrayContaining([expect.stringMatching(/discard/i)]),
      );
      // The mangled name and "Hyper Beam" may still pass — the early-exit
      // threshold handles those by returning matches quickly.
      expect(identifiers.number).toBe("029");
      expect(identifiers.printedTotal).toBe(203);
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

    it("requires all recognized official fields for an exact match", () => {
      expect(isExactCardIdentifierMatch(ragingBolt, "Raging Bolt", baseIdentifiers)).toBe(true);
      expect(isExactCardIdentifierMatch(ragingBolt, "Raging Bolt", {
        ...baseIdentifiers,
        number: "112",
      })).toBe(false);
    });

    it("accepts a two-of-three identifier match", () => {
      expect(countCardIdentifierMatches(ragingBolt, "Raging Bolt", {
        ...baseIdentifiers,
        number: "999",
        collectionCandidates: ["Stellar Crown"],
      })).toBe(2);
    });

    it("builds distinctive official-catalog fallbacks", () => {
      expect(buildOfficialNameFallbacks("Raging Boit ex")).toEqual(["Raging", "Boit"]);
    });

    it("gives partial score for name match with wrong number", () => {
      const identifiers = { ...baseIdentifiers, number: "999" };
      const score = scoreCardMatch(ragingBolt, "Raging Bolt", identifiers);
      // Should get name score but not number score
      expect(score).toBeLessThan(0.8);
    });

    it("keeps a two-of-three match when the recognized name is wrong", () => {
      const score = scoreCardMatch(ragingBolt, "Pikachu", baseIdentifiers);
      expect(score).toBeCloseTo(2 / 3);
    });

    it("rejects a different name unless collection and number both match", () => {
      const score = scoreCardMatch(ragingBolt, "Pikachu", {
        ...baseIdentifiers,
        number: "999",
      });
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

    it("invokes the fallback OCR service when on-device OCR yields nothing", async () => {
      const dependencies: PokemonRecognitionDependencies = {
        prepareImage: jest.fn().mockResolvedValue("file:///cropped.jpg"),
        recognizeText: jest.fn().mockResolvedValue({ text: "" }),
        fallbackRecognizeText: jest.fn().mockResolvedValue({
          text: "BASIC\nRaging Bolt HP 130\nSCR EN 111/142",
        }),
        searchCards: jest.fn().mockResolvedValue([
          { card: ragingBolt, score: 0.95 },
        ]),
      };

      const matches = await identifyPokemonCardImage(
        "file:///card.jpg",
        dependencies,
      );

      expect(dependencies.fallbackRecognizeText).toHaveBeenCalledWith(
        "file:///cropped.jpg",
      );
      expect(dependencies.searchCards).toHaveBeenCalledWith(
        expect.objectContaining({
          nameCandidates: expect.arrayContaining(["Raging Bolt"]),
          number: "111",
        }),
      );
      expect(matches).toHaveLength(1);
    });

    it("skips the fallback OCR service when the first pass matches", async () => {
      const dependencies: PokemonRecognitionDependencies = {
        prepareImage: jest.fn().mockResolvedValue("file:///cropped.jpg"),
        recognizeText: jest.fn().mockResolvedValue({
          text: "BASIC\nRaging Bolt HP 130\nSCR EN 111/142",
        }),
        fallbackRecognizeText: jest.fn(),
        searchCards: jest.fn().mockResolvedValue([
          { card: ragingBolt, score: 0.95 },
        ]),
      };

      const matches = await identifyPokemonCardImage(
        "file:///card.jpg",
        dependencies,
      );

      expect(dependencies.fallbackRecognizeText).not.toHaveBeenCalled();
      expect(matches).toHaveLength(1);
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
