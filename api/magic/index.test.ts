import {
  fetchScryfallApi,
  SCRYFALL_REQUEST_HEADERS,
} from "./index";

jest.mock("@/lib/supabase", () => ({
  supabase: {},
}));

describe("Scryfall API client", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("identifies the app and requests JSON", async () => {
    const json = jest.fn().mockResolvedValue({ object: "list", data: [] });
    const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json,
    } as unknown as Response);

    await fetchScryfallApi("/cards/search?q=Black+Lotus");

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.scryfall.com/cards/search?q=Black+Lotus",
      { headers: SCRYFALL_REQUEST_HEADERS },
    );
    expect(SCRYFALL_REQUEST_HEADERS).toEqual({
      Accept: "application/json;q=0.9,*/*;q=0.8",
      "User-Agent": "Show-Off/1.0.0 (Expo React Native)",
    });
  });
});
