import { getItemCardId, getItemGame, isCardItem } from "@/lib/itemCards";
import { inferItemCategory } from "@/lib/itemCategory";
import {
  getPokewalletMarketPrice,
  onePieceSetCode,
  parsePokewalletSearch,
  parsePokewalletSetPage,
  pokewalletImagePath,
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
    const parsed = parsePokewalletSearch("ygo", {
      results: [result(), result({ id: "pk_ffffffffffffffffffff" }, { product_type: "sealed" }), { id: "../x", card_info: { name: "x" } }],
      pagination,
    });
    expect(parsed.cards).toHaveLength(1);
    expect(parsed.cards[0].card_info.set_code).toBe("22873");
    expect(parsed).toMatchObject({ page: 1, total: 3, totalPages: 1 });
    expect(() => parsePokewalletSearch("ygo", { results: "nope" })).toThrow();
  });

  it("picks the lowest TCGplayer market price, or null without one", () => {
    const [card] = parsePokewalletSearch("ygo", { results: [result()], pagination }).cards;
    expect(getPokewalletMarketPrice(card)).toBe(3.1);
    const [unpriced] = parsePokewalletSearch("ygo", { results: [result({ tcgplayer: null })], pagination }).cards;
    expect(getPokewalletMarketPrice(unpriced)).toBeNull();
  });

  it("builds a cache row clients can read back as a card", () => {
    const [card] = parsePokewalletSearch("ygo", { results: [result()], pagination }).cards;
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

describe("PokéWallet response shapes per game", () => {
  const onePieceCard = {
    id: "op_3f8a12c4e9b7d02f3f8a12c4e9b7d02f",
    card_number: "OP15-092",
    name: "Nami",
    sub_type_name: "Normal",
    rarity: "R",
    card_type: "Character",
    tcgplayer: { url: "https://www.tcgplayer.com/product/600001", prices: { low_price: 1.2, market_price: 1.76, high_price: 3.5 } },
    cardmarket: null,
  };

  it("normalizes One Piece's flat search shape, deriving the set from the card number", () => {
    const parsed = parsePokewalletSearch("op", { success: true, data: [onePieceCard], total: 12, page: 1, limit: 10 });
    expect(parsed).toMatchObject({ page: 1, total: 12, totalPages: 2 });
    expect(parsed.cards[0].card_info).toMatchObject({
      name: "Nami", card_number: "OP15-092", set_code: "OP15", set_id: "OP15", rarity: "R", product_type: "card",
    });
    expect(getPokewalletMarketPrice(parsed.cards[0])).toBe(1.76);
    // The generic shape is not accepted for One Piece, and vice versa.
    expect(() => parsePokewalletSearch("op", { results: [], pagination })).toThrow();
    expect(() => parsePokewalletSearch("ygo", { success: true, data: [], total: 0, page: 1, limit: 10 })).toThrow();
  });

  it("names One Piece set rosters from the set and keeps CardMarket-only cards", () => {
    const parsed = parsePokewalletSetPage("op", {
      success: true, set: { set_code: "OP15", group_id: "9001", name: "Adventure on KAMI's Island" },
      total: 2, page: 1, limit: 200, data: [onePieceCard, { ...onePieceCard, id: "op_aaaaaaaaaaaaaaaaaaaa", tcgplayer: null }],
    });
    expect(parsed.setName).toBe("Adventure on KAMI's Island");
    expect(parsed.cards).toHaveLength(2);
    expect(parsed.cards[0].card_info.set_name).toBe("Adventure on KAMI's Island");
  });

  it("accepts each game's id prefix and builds the right image path", () => {
    const [ygo] = parsePokewalletSearch("ygo", {
      results: [result({ id: "ygo_9a3718ca91c2b4423f3bd02f650c59e4" })], pagination,
    }).cards;
    expect(ygo.id).toBe("ygo_9a3718ca91c2b4423f3bd02f650c59e4");
    expect(pokewalletImagePath("ygo", ygo)).toBe("/ygo/images/ygo_9a3718ca91c2b4423f3bd02f650c59e4");
    const [op] = parsePokewalletSearch("op", { data: [onePieceCard], total: 1, page: 1, limit: 10 }).cards;
    expect(pokewalletImagePath("op", op)).toBe("/images/OP15-092");
  });

  it("derives One Piece set codes, including hyphenated and promo sets", () => {
    expect(onePieceSetCode("OP01-001")).toBe("OP01");
    expect(onePieceSetCode("EB-01-012")).toBe("EB-01");
    expect(onePieceSetCode("P-025")).toBe("P");
    expect(onePieceSetCode("weird")).toBeNull();
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
