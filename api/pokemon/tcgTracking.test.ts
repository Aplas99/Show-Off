import { searchTcgTrackingPokemonCards } from "./tcgTracking";

describe("TCGTracking Pokémon adapter", () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
  });

  it("searches a collection and maps matching cards", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          sets: [{ id: 23651, name: "SV08: Surging Sparks", abbreviation: "SSP" }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          set_id: 23651,
          set_name: "SV08: Surging Sparks",
          set_abbr: "SSP",
          set_released: "2024-11-08",
          products: [
            {
              id: 589939,
              name: "Exeggcute - 001/191",
              number: "001/191",
              rarity: "Common",
              image_url: "https://cdn.tcgtracking.com/product/589939_200w.jpg",
              cardtrader: [{ name: "Exeggcute", collector_number: "001" }],
            },
          ],
        }),
      });

    const cards = await searchTcgTrackingPokemonCards({
      name: "Exeggcute",
      collection: "Surging Sparks",
      number: "1",
    });

    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      id: "tcgtracking:589939",
      name: "Exeggcute",
      number: "1",
      set: { id: "tcgtracking:23651", name: "SV08: Surging Sparks" },
      source: "tcgtracking",
    });
  });
});
