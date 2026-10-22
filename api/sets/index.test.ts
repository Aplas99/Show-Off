import { fetchScryfallApi } from "@/api/magic";
import { fetchAllCardsInSet } from "@/api/pokemon";
import { fetchRiftboundSetCards } from "@/api/riftbound";
import { fetchSetRoster } from "@/api/sets";
import { fetchTcgSetRoster } from "@/api/tcg";

jest.mock("@/api/magic", () => ({
  fetchScryfallApi: jest.fn(),
  getMagicCardImageUrl: (card: { image_uris?: { small?: string } }) => card.image_uris?.small ?? null,
}));
jest.mock("@/api/pokemon", () => ({ fetchAllCardsInSet: jest.fn() }));
jest.mock("@/api/riftbound", () => ({
  fetchRiftboundSetCards: jest.fn(),
  getRiftboundCardImageUrl: (card: { media?: { image_url?: string } }) => card.media?.image_url ?? null,
}));
jest.mock("@/api/tcg", () => ({ fetchTcgSetRoster: jest.fn() }));

const magicCard = (id: string, number: string) => ({
  object: "card", id, name: `Card ${number}`, collector_number: number, image_uris: { small: `https://img/${id}` },
});

describe("set rosters", () => {
  beforeEach(() => jest.clearAllMocks());

  it("pages through every printing of a Magic set and sorts by collector number", async () => {
    (fetchScryfallApi as jest.Mock)
      .mockResolvedValueOnce({ object: "list", has_more: true, data: [magicCard("b", "10"), magicCard("a", "2")] })
      .mockResolvedValueOnce({ object: "list", has_more: false, data: [magicCard("c", "1")] });
    const roster = await fetchSetRoster("magic", "LEA");
    expect(roster.map((card) => card.number)).toEqual(["1", "2", "10"]);
    expect(roster[0]).toMatchObject({ id: "c", imageUrl: "https://img/c" });
    expect((fetchScryfallApi as jest.Mock).mock.calls[0][0]).toBe("/cards/search?q=e%3Alea+unique%3Aprints+order%3Aset&page=1");
    expect(fetchScryfallApi).toHaveBeenCalledTimes(2);
  });

  it("ignores malformed Magic set codes without calling the provider", async () => {
    expect(await fetchSetRoster("magic", "e:lea or x")).toEqual([]);
    expect(fetchScryfallApi).not.toHaveBeenCalled();
  });

  it("pages Riftbound sets and shows printed numbers", async () => {
    (fetchRiftboundSetCards as jest.Mock)
      .mockResolvedValueOnce({ items: [{ id: "r2", name: "Two", riftbound_id: "ogn-011-298", collector_number: 11 }], pages: 2 })
      .mockResolvedValueOnce({ items: [{ id: "r1", name: "One", riftbound_id: "ogn-002-298", collector_number: 2 }], pages: 2 });
    const roster = await fetchSetRoster("riftbound", "OGN");
    expect(fetchRiftboundSetCards).toHaveBeenCalledWith("ogn", 1);
    expect(roster.map((card) => card.number)).toEqual(["002/298", "011/298"]);
  });

  it("maps Pokémon and shared-pipeline rosters to one shape", async () => {
    (fetchAllCardsInSet as jest.Mock).mockResolvedValueOnce([{ id: "base1-4", name: "Charizard", number: "4", images: { small: "https://img/p" } }]);
    expect(await fetchSetRoster("pokemon", "base1")).toEqual([{ id: "base1-4", name: "Charizard", number: "4", imageUrl: "https://img/p" }]);

    (fetchTcgSetRoster as jest.Mock).mockResolvedValueOnce([{ id: "pk_1", name: "Dark Magician", card_number: "LOB-005", image_url: null }]);
    expect(await fetchSetRoster("ygo", "1001")).toEqual([{ id: "pk_1", name: "Dark Magician", number: "LOB-005", imageUrl: null }]);
    expect(fetchTcgSetRoster).toHaveBeenCalledWith("ygo", "1001");
  });
});
