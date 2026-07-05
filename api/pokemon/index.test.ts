import {
  buildPokemonCardQuery,
  buildPokemonNameQuery,
  getPokemonCardCacheFirst,
  pokemonCardToCacheRow,
  searchPokemonCardsCacheFirst,
  type PokemonTcgCard,
  type PokemonTcgDependencies,
} from "./index";

jest.mock("@/lib/supabase", () => ({
  supabase: {},
}));

const card: PokemonTcgCard = {
  id: "base1-4",
  name: "Charizard",
  supertype: "Pokémon",
  subtypes: ["Stage 2"],
  hp: "120",
  types: ["Fire"],
  set: {
    id: "base1",
    name: "Base",
    series: "Base",
    printedTotal: 102,
    total: 102,
    releaseDate: "1999/01/09",
  },
  number: "4",
  artist: "Mitsuhiro Arita",
  rarity: "Rare Holo",
  nationalPokedexNumbers: [6],
  images: {
    small: "https://images.pokemontcg.io/base1/4.png",
    large: "https://images.pokemontcg.io/base1/4_hires.png",
  },
  tcgplayer: {
    prices: {
      holofoil: { market: 350.25 },
    },
  },
};

function createDependencies(
  overrides: Partial<PokemonTcgDependencies> = {},
): PokemonTcgDependencies {
  return {
    findCachedCards: jest.fn().mockResolvedValue([]),
    findCachedCardById: jest.fn().mockResolvedValue(null),
    fetchCards: jest.fn().mockResolvedValue({
      cards: [card],
      page: 1,
      pageSize: 20,
      totalCount: 1,
    }),
    fetchCardById: jest.fn().mockResolvedValue(card),
    cacheCards: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("Pokémon TCG cache-first provider", () => {
  it("returns cached search results without calling the external API", async () => {
    const dependencies = createDependencies({
      findCachedCards: jest.fn().mockResolvedValue([card]),
    });

    const result = await searchPokemonCardsCacheFirst(
      { query: " Charizard " },
      dependencies,
    );

    expect(result.source).toBe("cache");
    expect(result.cards).toEqual([card]);
    expect(dependencies.fetchCards).not.toHaveBeenCalled();
    expect(dependencies.cacheCards).not.toHaveBeenCalled();
  });

  it("fetches and caches cards when the database has no matches", async () => {
    const dependencies = createDependencies();

    const result = await searchPokemonCardsCacheFirst(
      { query: "Charizard", page: 1, pageSize: 20 },
      dependencies,
    );

    expect(result.source).toBe("api");
    expect(dependencies.fetchCards).toHaveBeenCalledWith("Charizard", 1, 20);
    expect(dependencies.cacheCards).toHaveBeenCalledWith([card]);
  });

  it("does not accept an inexact cached result for structured OCR lookup", async () => {
    const dependencies = createDependencies({
      findCachedCards: jest.fn().mockResolvedValue([card]),
    });

    const result = await searchPokemonCardsCacheFirst(
      {
        query: "Raging Bolt",
        number: "111",
        printedTotal: 142,
        setCode: "SCR",
      },
      dependencies,
    );

    expect(result.source).toBe("api");
    expect(dependencies.fetchCards).toHaveBeenCalledWith(
      "Raging Bolt",
      1,
      20,
      "111",
      undefined,
      142,
      "SCR",
    );
  });

  it("uses an exact cached card before fetching by id", async () => {
    const dependencies = createDependencies({
      findCachedCardById: jest.fn().mockResolvedValue(card),
    });

    const result = await getPokemonCardCacheFirst("base1-4", dependencies);

    expect(result).toEqual({ card, source: "cache" });
    expect(dependencies.fetchCardById).not.toHaveBeenCalled();
  });

  it("normalizes API cards into the Supabase cache shape", () => {
    const row = pokemonCardToCacheRow(card);

    expect(row).toMatchObject({
      id: "base1-4",
      name: "Charizard",
      set_id: "base1",
      set_name: "Base",
      set_release_date: "1999-01-09",
      number: "4",
      raw_data: card,
    });
  });

  it("escapes quoted API name searches", () => {
    expect(buildPokemonNameQuery("  Blaine's  \"Charizard\"  ")).toBe(
      "name:\"Blaine's \\\"Charizard\\\"\"",
    );
  });

  it("combines a recognized name and collector number", () => {
    expect(buildPokemonCardQuery("Bulbasaur", "166/165")).toBe(
      'name:"Bulbasaur" number:"166"',
    );
  });

  it("includes a collection in provider searches", () => {
    expect(buildPokemonCardQuery("Pikachu", undefined, "Surging Sparks")).toBe(
      'name:"Pikachu" set.name:"Surging Sparks"',
    );
  });

  it("includes printed total and set code in OCR searches", () => {
    expect(
      buildPokemonCardQuery("Raging Bolt", "111/142", undefined, 142, "SCR"),
    ).toBe(
      'name:"Raging Bolt" number:"111" set.printedTotal:142 set.ptcgoCode:"SCR"',
    );
  });
});
