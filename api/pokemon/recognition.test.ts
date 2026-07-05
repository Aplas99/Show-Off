import type { PokemonTcgCard } from "./index";
import {
  calculatePokemonCardCrop,
  identifyPokemonCardImage,
  parsePokemonCardText,
  type PokemonRecognitionDependencies,
} from "./recognition";

jest.mock("expo-image-manipulator", () => ({
  ImageManipulator: {},
  SaveFormat: { JPEG: "jpeg" },
}));

jest.mock("@/lib/supabase", () => ({
  supabase: {},
}));

const card: PokemonTcgCard = {
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

describe("Pokémon card image recognition", () => {
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

  it("extracts the card name, number, total, and set code from OCR text", () => {
    const identifiers = parsePokemonCardText({
      text: "BASIC\nRaging Bolt HP 130\nAncient\nSCR EN 111/142",
    });

    expect(identifiers).toMatchObject({
      nameCandidates: expect.arrayContaining(["Raging Bolt"]),
      number: "111",
      printedTotal: 142,
      setCode: "SCR",
    });
  });

  it("uses OCR identifiers for structured card search", async () => {
    const dependencies: PokemonRecognitionDependencies = {
      prepareImage: jest.fn().mockResolvedValue("file:///cropped-card.jpg"),
      recognizeText: jest.fn().mockResolvedValue({
        text: "BASIC\nRaging Bolt HP 130\nAncient\nSCR EN 111/142",
      }),
      searchCards: jest.fn().mockResolvedValue([card]),
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
    expect(matches).toEqual([{ card, score: 1 }]);
  });
});
