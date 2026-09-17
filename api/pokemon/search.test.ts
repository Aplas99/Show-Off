import { supabase } from "@/lib/supabase";
import type { PokemonTcgCard } from "./index";
import { searchPokemonCardsCacheFirst } from "./index";
import { createManualPokemonCard, searchPokemonCardSources } from "./search";
import { searchTcgTrackingPokemonCards } from "./tcgTracking";
jest.mock("@/lib/supabase", () => ({ supabase: { rpc: jest.fn() } }));

jest.mock("./index", () => ({
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
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

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
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("creates and caches a manual card when providers have no result", async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({ data: { ...baseCard, id: "manual:user:card", name: "Unknown Pikachu", number: "A1", source: "manual" }, error: null } as never);
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
    expect(supabase.rpc).toHaveBeenCalledWith("create_manual_pokemon_card", { p_name: "Unknown Pikachu", p_collection: "Local Promo", p_number: "A1" });
  });

  it("surfaces a catalog configuration error instead of reporting no results", async () => {
    jest.mocked(searchPokemonCardsCacheFirst).mockRejectedValue(new Error("Catalog search is not configured. Please try again later."));

    await expect(searchPokemonCardSources({ name: "Pikachu ex" })).rejects.toThrow("Catalog search is not configured");
  });

  it("still uses the alternate source when the primary catalog is unavailable", async () => {
    jest.mocked(searchPokemonCardsCacheFirst).mockRejectedValue(new Error("Catalog search is not configured."));
    jest.mocked(searchTcgTrackingPokemonCards).mockResolvedValue([baseCard]);

    await expect(searchPokemonCardSources({ name: "Pikachu ex", collection: "Surging Sparks" })).resolves.toEqual([baseCard]);
  });
});
