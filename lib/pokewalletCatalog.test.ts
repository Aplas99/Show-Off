import { getItemCardId, getItemGame, isCardItem } from "@/lib/itemCards";
import { inferItemCategory } from "@/lib/itemCategory";
import {
  getPokewalletMarketPrice,
  parsePokewalletSearch,
  tcgCardItemProduct,
  tcgCardToCacheRow,
  tcgCardSchema,
} from "@/lib/pokewalletCatalog";

const result = (overrides: Record<string, unknown> = {}, info: Record<string, unknown> = {}) => ({
  id: "pk_0123456789abcdef0123",
  card_info: { name: "Monkey.D.Luffy", set_name: "Romance Dawn", set_code: 22873, set_id: "22873", card_number: "OP01-003", rarity: "Leader", product_type: "card", ...info },
  images: { languages: ["en"] },
  tcgplayer: { prices: [{ sub_type_name: "Normal", market_price: 3.1 }, { sub_type_name: "Foil", market_price: null }], url: "https://www.tcgplayer.com/product/1" },
  cardmarket: null,
  ...overrides,
});

const pagination = { page: 1, limit: 10, total: 3, total_pages: 1 };

describe("PokéWallet catalog parsing", () => {
  it("keeps valid cards, drops sealed products and malformed rows, and stringifies loose fields", () => {
    const parsed = parsePokewalletSearch({
      results: [result(), result({ id: "pk_ffffffffffffffffffff" }, { product_type: "sealed" }), { id: "../x", card_info: { name: "x" } }],
      pagination,
    });
    expect(parsed.cards).toHaveLength(1);
    expect(parsed.cards[0].card_info.set_code).toBe("22873");
    expect(parsed).toMatchObject({ page: 1, total: 3, totalPages: 1 });
    expect(() => parsePokewalletSearch({ results: "nope" })).toThrow();
  });

  it("picks the lowest TCGplayer market price, or null without one", () => {
    const [card] = parsePokewalletSearch({ results: [result()], pagination }).cards;
    expect(getPokewalletMarketPrice(card)).toBe(3.1);
    const [unpriced] = parsePokewalletSearch({ results: [result({ tcgplayer: null })], pagination }).cards;
    expect(getPokewalletMarketPrice(unpriced)).toBeNull();
  });

  it("builds a cache row clients can read back as a card", () => {
    const [card] = parsePokewalletSearch({ results: [result()], pagination }).cards;
    const row = tcgCardToCacheRow("op", card, "https://project.invalid/op/pk.jpg");
    expect(row).toMatchObject({ id: card.id, game: "op", card_number: "OP01-003", market_price: 3.1, raw_data: card });
    expect(tcgCardSchema.safeParse(row).success).toBe(true);
    expect(tcgCardSchema.safeParse({ ...row, game: "mtg" }).success).toBe(false);
    expect(tcgCardSchema.safeParse({ ...row, id: "not-an-id" }).success).toBe(false);
  });

  it("presents a card as a product for item views", () => {
    const product = tcgCardItemProduct({
      id: "pk_0123456789abcdef0123", game: "op", name: "Luffy", set_name: "Romance Dawn", set_code: "OP01",
      card_number: "OP01-003", rarity: "Leader", image_url: "https://project.invalid/a.jpg",
    }, "One Piece");
    expect(product).toMatchObject({
      searchableTitle: "Luffy",
      searchableDescription: "Romance Dawn • #OP01-003 • Leader",
      searchableBrand: "One Piece",
      data: { category: "TCG", images: ["https://project.invalid/a.jpg"] },
    });
  });
});

describe("item card helpers", () => {
  it("identifies shared-pipeline cards alongside the dedicated games", () => {
    expect(getItemGame({ tcg_card_id: "pk_1", tcgGame: "lor" })).toBe("lor");
    expect(getItemGame({ tcg_card_id: "pk_1", tcgGame: "unknown" })).toBeNull();
    expect(getItemGame({ riftbound_card_id: "r" })).toBe("riftbound");
    expect(getItemCardId({ tcg_card_id: "pk_1" })).toBe("pk_1");
    expect(isCardItem({})).toBe(false);
    expect(inferItemCategory({ tcgCardId: "pk_1", hints: ["Book"] })).toBe("tcg");
  });
});
