import { CatalogRequestError } from "@/api/catalog";
import { fetchTcgSetRoster, searchTcgCardsCacheFirst, type TcgCard, type TcgDependencies } from "@/api/tcg";

jest.mock("@/lib/supabase", () => ({ supabase: { rpc: jest.fn() } }));
jest.mock("@/api/catalog", () => {
  class CatalogRequestError extends Error {
    constructor(public readonly status: number, message: string) { super(message); }
  }
  return { CatalogRequestError, fetchCatalog: jest.fn() };
});

const card: TcgCard = {
  id: "pk_aaaaaaaaaaaaaaaaaaaa", game: "ygo", name: "Dark Magician", set_name: "Legend of Blue Eyes",
  set_code: "LOB", set_id: "1001", card_number: "LOB-005", rarity: "Ultra Rare", card_type: null,
  image_url: "https://project.invalid/a.jpg", market_price: 12.5,
};

function deps(overrides: Partial<TcgDependencies> = {}): TcgDependencies {
  return {
    findCachedCards: jest.fn().mockResolvedValue([]),
    searchProvider: jest.fn().mockResolvedValue({ cards: [card], page: 1, total: 1, totalPages: 1 }),
    ...overrides,
  };
}

describe("shared TCG search", () => {
  it("returns cached cards without spending provider quota", async () => {
    const d = deps({ findCachedCards: jest.fn().mockResolvedValue([card]) });
    const result = await searchTcgCardsCacheFirst({ game: "ygo", query: "  dark   magician " }, d);
    expect(result).toMatchObject({ source: "cache", cards: [{ name: "Dark Magician" }] });
    expect(d.findCachedCards).toHaveBeenCalledWith("ygo", "dark magician", 40, 0);
    expect(d.searchProvider).not.toHaveBeenCalled();
  });

  it("falls back to the provider on a cache miss or when bypassing the cache", async () => {
    const miss = deps();
    expect(await searchTcgCardsCacheFirst({ game: "lor", query: "elsa", page: 2 }, miss)).toMatchObject({ source: "api", totalPages: 1 });
    expect(miss.searchProvider).toHaveBeenCalledWith("lor", "elsa", 2);

    const bypass = deps({ findCachedCards: jest.fn().mockResolvedValue([card]) });
    await searchTcgCardsCacheFirst({ game: "ygo", query: "dark", bypassCache: true }, bypass);
    expect(bypass.findCachedCards).not.toHaveBeenCalled();
    expect(bypass.searchProvider).toHaveBeenCalled();
  });

  it("skips queries shorter than the provider minimum", async () => {
    const d = deps();
    expect((await searchTcgCardsCacheFirst({ game: "op", query: " a " }, d)).cards).toEqual([]);
    expect(d.findCachedCards).not.toHaveBeenCalled();
    expect(d.searchProvider).not.toHaveBeenCalled();
  });

  it("treats provider 404 as no results and surfaces other failures", async () => {
    const notFound = deps({ searchProvider: jest.fn().mockRejectedValue(new CatalogRequestError(404, "none")) });
    expect((await searchTcgCardsCacheFirst({ game: "fab", query: "bravo" }, notFound)).cards).toEqual([]);
    const busy = deps({ searchProvider: jest.fn().mockRejectedValue(new CatalogRequestError(429, "busy")) });
    await expect(searchTcgCardsCacheFirst({ game: "fab", query: "bravo" }, busy)).rejects.toThrow("busy");
    const malformed = deps({ searchProvider: jest.fn().mockResolvedValue({ cards: [{ id: "bad" }] }) });
    await expect(searchTcgCardsCacheFirst({ game: "fab", query: "bravo" }, malformed)).rejects.toThrow();
  });
});

describe("shared TCG set rosters", () => {
  it("serves a fully cached set without calling the provider", async () => {
    const d = { findCachedRoster: jest.fn().mockResolvedValue([card]), fetchRoster: jest.fn() };
    expect(await fetchTcgSetRoster("ygo", "1001", d)).toEqual([card]);
    expect(d.fetchRoster).not.toHaveBeenCalled();
  });

  it("fetches through the proxy on a miss and skips non-numeric set ids", async () => {
    const d = {
      findCachedRoster: jest.fn().mockResolvedValue(null),
      fetchRoster: jest.fn().mockResolvedValue({ setName: "Legend of Blue Eyes", cards: [card] }),
    };
    expect(await fetchTcgSetRoster("ygo", "1001", d)).toEqual([card]);
    expect(d.fetchRoster).toHaveBeenCalledWith("ygo", "1001");
    expect(await fetchTcgSetRoster("ygo", "LOB", d)).toEqual([]);
    expect(d.fetchRoster).toHaveBeenCalledTimes(1);
  });
});
