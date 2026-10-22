import { CatalogRequestError } from "@/api/catalog";
import { fetchRiftboundCardsByCode, searchRiftboundCardsCacheFirst, type RiftboundDependencies } from "@/api/riftbound";
import { riftboundCard } from "@/lib/riftboundCatalog.fixture";

jest.mock("@/lib/supabase", () => ({ supabase: { rpc: jest.fn() } }));
jest.mock("@/api/catalog", () => {
  class CatalogRequestError extends Error {
    constructor(public readonly status: number, message: string) { super(message); }
  }
  return { CatalogRequestError, fetchCatalog: jest.fn() };
});

function deps(overrides: Partial<RiftboundDependencies> = {}): RiftboundDependencies {
  return {
    findCachedCards: jest.fn().mockResolvedValue([]),
    fetchCards: jest.fn().mockResolvedValue({ items: [riftboundCard], total: 1, page: 1, size: 40, pages: 1 }),
    ...overrides,
  };
}

describe("Riftbound search", () => {
  it("returns cached cards without calling the provider", async () => {
    const d = deps({ findCachedCards: jest.fn().mockResolvedValue([riftboundCard]) });
    const result = await searchRiftboundCardsCacheFirst({ query: "  magma   wurm " }, d);
    expect(result).toMatchObject({ source: "cache", cards: [{ name: "Magma Wurm" }] });
    expect(d.findCachedCards).toHaveBeenCalledWith("magma wurm", 40, 0);
    expect(d.fetchCards).not.toHaveBeenCalled();
  });

  it("falls back to a fuzzy provider search and skips the cache for set filters", async () => {
    const d = deps();
    const result = await searchRiftboundCardsCacheFirst({ query: "wurm", setId: "ogn", page: 2, pageSize: 10 }, d);
    expect(d.findCachedCards).not.toHaveBeenCalled();
    expect(d.fetchCards).toHaveBeenCalledWith("/cards/name?fuzzy=wurm&set_id=ogn&page=2&size=10");
    expect(result).toMatchObject({ source: "api", totalCount: 1 });
  });

  it("treats provider 404 as no results and surfaces other failures", async () => {
    expect((await searchRiftboundCardsCacheFirst({ query: "x" }, deps({ fetchCards: jest.fn().mockRejectedValue(new CatalogRequestError(404, "none")) }))).cards).toEqual([]);
    await expect(searchRiftboundCardsCacheFirst({ query: "x" }, deps({ fetchCards: jest.fn().mockRejectedValue(new CatalogRequestError(503, "down")) }))).rejects.toThrow("down");
  });

  it("looks up printed codes and ignores malformed ones", async () => {
    const d = deps({ fetchCards: jest.fn().mockResolvedValue([riftboundCard]) });
    expect(await fetchRiftboundCardsByCode(" OGN-011 ", d)).toHaveLength(1);
    expect(d.fetchCards).toHaveBeenCalledWith("/cards/riftbound/ogn-011");
    expect(await fetchRiftboundCardsByCode("ogn/../x", d)).toEqual([]);
    expect(d.fetchCards).toHaveBeenCalledTimes(1);
  });
});
