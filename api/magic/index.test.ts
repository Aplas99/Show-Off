import { CatalogRequestError, fetchCatalog } from "@/api/catalog";
import { fetchScryfallApi, MagicApiError, searchMagicCardsCacheFirst } from "./index";

jest.mock("@/lib/supabase", () => ({ supabase: {} }));
jest.mock("@/api/catalog", () => ({
  ...jest.requireActual("@/api/catalog"),
  fetchCatalog: jest.fn(),
}));

describe("Magic catalog client", () => {
  beforeEach(() => jest.clearAllMocks());

  it("routes search and fuzzy lookups through the authenticated catalog function", async () => {
    jest.mocked(fetchCatalog).mockResolvedValue({ object: "list", data: [] });
    for (const path of ["/cards/search?q=Black+Lotus", "/cards/named?fuzzy=Lightning+Bolt"]) {
      await fetchScryfallApi(path);
      expect(fetchCatalog).toHaveBeenLastCalledWith({ provider: "magic", path });
    }
  });

  it("preserves no-match handling and actionable proxy errors", async () => {
    jest.mocked(fetchCatalog).mockRejectedValue(new CatalogRequestError(404, "No match"));
    await expect(fetchScryfallApi("/cards/named?fuzzy=missing")).rejects.toBeInstanceOf(MagicApiError);
    const error = new CatalogRequestError(503, "Could not save catalog results. Please try again.");
    jest.mocked(fetchCatalog).mockRejectedValue(error);
    await expect(fetchScryfallApi("/cards/search?q=card")).rejects.toBe(error);
  });

  it("keeps cached search results available without invoking the proxy", async () => {
    const card = { id: "test", name: "Test", colors: [], color_identity: [] };
    const fetchCards = jest.fn();
    const result = await searchMagicCardsCacheFirst({ query: "Test" }, {
      findCachedCards: jest.fn().mockResolvedValue([card]), fetchCards,
    });
    expect(result.cards).toEqual([card]);
    expect(result.source).toBe("cache");
    expect(fetchCards).not.toHaveBeenCalled();
    expect(fetchCatalog).not.toHaveBeenCalled();
  });

  it("returns a no-match result for search 404s", async () => {
    const result = await searchMagicCardsCacheFirst({ query: "Missing" }, {
      findCachedCards: jest.fn().mockResolvedValue([]),
      fetchCards: jest.fn().mockRejectedValue(new MagicApiError(404, "/cards/search")),
    });
    expect(result.cards).toEqual([]);
    expect(result.source).toBe("api");
  });
});
