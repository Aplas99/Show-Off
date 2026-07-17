import { extractMagicNameCandidates, identifyMagicCardImage } from "./scan";
import type { MagicCard } from "./index";

jest.mock("@/lib/supabase", () => ({
  supabase: {},
}));

jest.mock("expo-image-manipulator", () => ({
  ImageManipulator: { manipulate: jest.fn() },
  SaveFormat: { JPEG: "jpeg" },
}));

function makeCard(overrides: Partial<MagicCard> = {}): MagicCard {
  return {
    id: "card-1",
    name: "Lightning Bolt",
    colors: [],
    color_identity: [],
    ...overrides,
  } as MagicCard;
}

describe("extractMagicNameCandidates", () => {
  it("returns the name line from block-structured OCR", () => {
    const candidates = extractMagicNameCandidates({
      text: "Lightning Bolt\n{R}",
      blocks: [
        { lines: [{ text: "Lightning Bolt" }] },
        { lines: [{ text: "{R}" }] },
      ],
    });
    expect(candidates).toEqual(["Lightning Bolt"]);
  });

  it("strips trailing mana-cost fragments from the name line", () => {
    const candidates = extractMagicNameCandidates({
      text: "Kefka, Court Mage 2 U B R",
      blocks: [{ lines: [{ text: "Kefka, Court Mage 2 U B R" }] }],
    });
    expect(candidates[0]).toBe("Kefka, Court Mage");
  });

  it("rejects digit-heavy and too-short lines", () => {
    const candidates = extractMagicNameCandidates({
      text: "231/281 M\nFDN EN\nSol Ring",
      blocks: [
        { lines: [{ text: "231/281 M" }, { text: "FD" }, { text: "Sol Ring" }] },
      ],
    });
    expect(candidates).toEqual(["Sol Ring"]);
  });

  it("falls back to splitting raw text when blocks are missing", () => {
    const candidates = extractMagicNameCandidates({
      text: "Counterspell\nInstant",
    });
    expect(candidates).toContain("Counterspell");
  });

  it("caps candidates at three", () => {
    const lines = ["Alpha Name", "Beta Name", "Gamma Name", "Delta Name"];
    const candidates = extractMagicNameCandidates({
      text: lines.join("\n"),
      blocks: [{ lines: lines.map((text) => ({ text })) }],
    });
    expect(candidates).toHaveLength(3);
  });
});

describe("identifyMagicCardImage", () => {
  const baseDependencies = {
    prepareImage: jest.fn().mockResolvedValue("file://prepared.jpg"),
    cacheCards: jest.fn().mockResolvedValue(undefined),
  };

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("returns fuzzy match first with name-search alternates", async () => {
    const fuzzyCard = makeCard({ id: "fuzzy-1" });
    const alternate = makeCard({ id: "alt-1" });

    const matches = await identifyMagicCardImage("file://photo.jpg", {
      ...baseDependencies,
      recognizeText: jest.fn().mockResolvedValue({
        text: "Lightning Bolt",
        blocks: [{ lines: [{ text: "Lightning Bolt" }] }],
      }),
      findCardByFuzzyName: jest.fn().mockResolvedValue(fuzzyCard),
      searchCardsByName: jest.fn().mockResolvedValue([fuzzyCard, alternate]),
    });

    expect(matches.map((card) => card.id)).toEqual(["fuzzy-1", "alt-1"]);
  });

  it("falls back to name search when fuzzy misses every candidate", async () => {
    const fallbackCard = makeCard({ id: "fallback-1" });
    const searchCardsByName = jest.fn().mockResolvedValue([fallbackCard]);

    const matches = await identifyMagicCardImage("file://photo.jpg", {
      ...baseDependencies,
      recognizeText: jest.fn().mockResolvedValue({
        text: "Misread Name",
        blocks: [{ lines: [{ text: "Misread Name" }] }],
      }),
      findCardByFuzzyName: jest.fn().mockResolvedValue(null),
      searchCardsByName,
    });

    expect(matches.map((card) => card.id)).toEqual(["fallback-1"]);
    expect(searchCardsByName).toHaveBeenCalledWith("Misread Name");
  });

  it("returns empty without searching when OCR finds no name", async () => {
    const findCardByFuzzyName = jest.fn();

    const matches = await identifyMagicCardImage("file://photo.jpg", {
      ...baseDependencies,
      recognizeText: jest.fn().mockResolvedValue({
        text: "231/281",
        blocks: [{ lines: [{ text: "231/281" }] }],
      }),
      findCardByFuzzyName,
      searchCardsByName: jest.fn(),
    });

    expect(matches).toEqual([]);
    expect(findCardByFuzzyName).not.toHaveBeenCalled();
  });
});
