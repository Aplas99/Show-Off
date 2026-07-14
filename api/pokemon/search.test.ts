import type { PokemonTcgCard } from "./index";
import { cachePokemonCards, searchPokemonCardsCacheFirst } from "./index";
import { createManualPokemonCard, searchPokemonCardSources } from "./search";
import { searchTcgTrackingPokemonCards } from "./tcgTracking";

jest.mock("./index", () => ({
  cachePokemonCards: jest.fn(),
  searchPokemonCardsCacheFirst: jest.fn(),
}));

jest.mock("./tcgTracking", () => ({
  searchTcgTrackingPokemonCards: jest.fn(),
}));

const baseCard: PokemonTcgCard = {
  id: "sv8-57",
  name: "Pikachu ex",
  supertype: "Pokémon",
  subtypes: ["Basic", "ex"],
  types: ["Lightning"],
  set: { id: "sv8", name: "Surging Sparks" },
  number: "57",
  nationalPokedexNumbers: [25],
  images: { small: "small.png", large: "large.png" },
};

describe("multi-source Pokémon search", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("merges providers while preferring the Pokémon TCG record", async () => {
    jest.mocked(searchPokemonCardsCacheFirst).mockResolvedValue({
      cards: [baseCard],
      page: 1,
      pageSize: 50,
      totalCount: 1,
      source: "api",
    });
    jest.mocked(searchTcgTrackingPokemonCards).mockResolvedValue([
      {
        ...baseCard,
        id: "tcgtracking:123",
        set: { id: "tcgtracking:8", name: "SV08: Surging Sparks" },
        number: "057",
      },
    ]);

    const cards = await searchPokemonCardSources({
      name: "Pikachu ex",
      collection: "Surging Sparks",
    });

    expect(cards).toEqual([baseCard]);
    expect(cachePokemonCards).toHaveBeenCalled();
  });

  it("creates and caches a manual card when providers have no result", async () => {
    const card = await createManualPokemonCard({
      name: "Unknown Pikachu",
      collection: "Local Promo",
      number: "A1",
    });

    expect(card).toMatchObject({
      name: "Unknown Pikachu",
      number: "A1",
      source: "manual",
    });
    expect(cachePokemonCards).toHaveBeenCalledWith([card]);
  });
});
