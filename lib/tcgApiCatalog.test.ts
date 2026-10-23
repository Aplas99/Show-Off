import { getItemCardId, getItemGame, isCardItem } from "@/lib/itemCards";
import { inferItemCategory } from "@/lib/itemCategory";
import {
  getTcgApiMarketPrice,
  parseTcgApiSearch,
  parseTcgApiSetList,
  parseTcgApiSetPage,
  setCodeFromNumber,
  tcgApiImageUrl,
  tcgCardItemProduct,
  tcgCardSchema,
  tcgCardToCacheRow,
} from "@/lib/tcgApiCatalog";

const row = (overrides: Record<string, unknown> = {}) => ({
  id: 512345,
  name: "Monkey.D.Luffy",
  clean_name: "monkeydluffy",
  number: "OP15-092",
  rarity: "Super Rare",
  image_url: "https://tcgplayer-cdn.tcgplayer.com/product/600001_200w.jpg",
  tcgplayer_id: 600001,
  product_type: "Cards",
  set_name: "The World's Strongest Warriors",
  game_name: "One Piece Card Game",
  game_slug: "one-piece-card-game",
  printing: "Normal",
  market_price: 3.1,
  ...overrides,
});

const meta = { total: 3, page: 1, per_page: 100, has_more: false };
const slug = "one-piece-card-game";

describe("TCG API catalog parsing", () => {
  it("keeps valid cards and drops sealed products, other games and malformed rows", () => {
    const parsed = parseTcgApiSearch(slug, {
      data: [
        row(),
        row({ id: 2, product_type: "Sealed Products" }),
        row({ id: 3, game_slug: "yugioh" }),
        { id: "../x", name: "x" },
      ],
      meta,
      rate_limit: { daily_limit: 100, daily_remaining: 99 },
    });
    expect(parsed.cards.map(({ card }) => card.id)).toEqual(["512345"]);
    expect(parsed).toMatchObject({ page: 1, total: 3, totalPages: 1 });
    expect(() => parseTcgApiSearch(slug, { data: "nope", meta })).toThrow();
  });

  it("merges printings of one card and prefers the Normal price", () => {
    const { cards } = parseTcgApiSearch(slug, {
      data: [row({ printing: "Foil", market_price: 9 }), row({ printing: "Normal", market_price: "3.10" })],
      meta,
    });
    expect(cards).toHaveLength(1);
    expect(cards[0].printings).toEqual([{ printing: "Foil", market_price: 9 }, { printing: "Normal", market_price: 3.1 }]);
    expect(getTcgApiMarketPrice(cards[0].printings)).toBe(3.1);
    expect(getTcgApiMarketPrice([{ printing: "Etched", market_price: 9 }, { printing: "Gold Foil", market_price: 4 }])).toBe(4);
    expect(getTcgApiMarketPrice([{ printing: "Normal", market_price: null }])).toBeNull();
  });

  it("keeps TCGplayer CDN images and builds one from the product id otherwise", () => {
    const [{ card }] = parseTcgApiSearch(slug, { data: [row()], meta }).cards;
    expect(tcgApiImageUrl(card)).toBe("https://tcgplayer-cdn.tcgplayer.com/product/600001_200w.jpg");
    for (const image_url of [null, "http://tcgplayer-cdn.tcgplayer.com/x.jpg", "https://evil.example/x.jpg", "https://u:p@tcgplayer-cdn.tcgplayer.com/x.jpg"]) {
      const [{ card: other }] = parseTcgApiSearch(slug, { data: [row({ image_url })], meta }).cards;
      expect(tcgApiImageUrl(other)).toBe("https://tcgplayer-cdn.tcgplayer.com/product/600001_in_1000x1000.jpg");
    }
    const [{ card: bare }] = parseTcgApiSearch(slug, { data: [row({ image_url: null, tcgplayer_id: null })], meta }).cards;
    expect(tcgApiImageUrl(bare)).toBeNull();
  });

  it("builds a cache row clients can read back as a card, filling the set from tcg_sets", () => {
    const [entry] = parseTcgApiSearch(slug, { data: [row()], meta }).cards;
    const cacheRow = tcgCardToCacheRow("op", entry, { id: "1100079", name: "The World's Strongest Warriors", abbreviation: null });
    expect(cacheRow).toMatchObject({
      id: "512345", game: "op", card_number: "OP15-092", set_id: "1100079", set_code: "OP15", market_price: 3.1,
      image_url: "https://tcgplayer-cdn.tcgplayer.com/product/600001_200w.jpg",
    });
    expect(cacheRow.raw_data).toMatchObject({ tcgplayer_id: 600001, printings: [{ printing: "Normal", market_price: 3.1 }] });
    expect(tcgCardSchema.safeParse(cacheRow).success).toBe(true);
    expect(tcgCardSchema.safeParse({ ...cacheRow, game: "mtg" }).success).toBe(false);
    expect(tcgCardSchema.safeParse({ ...cacheRow, id: "op_abc" }).success).toBe(false);
    // A card row's own set id wins; without a set match it stays unknown.
    expect(tcgCardToCacheRow("op", { ...entry, card: { ...entry.card, set_id: "77" } }).set_id).toBe("77");
    expect(tcgCardToCacheRow("op", entry).set_id).toBeNull();
  });

  it("derives set codes from printed numbers", () => {
    expect(setCodeFromNumber("OP01-003")).toBe("OP01");
    expect(setCodeFromNumber("LOB-EN005")).toBe("LOB");
    expect(setCodeFromNumber("EB-01-012")).toBe("EB-01");
    expect(setCodeFromNumber("BT1-001")).toBe("BT1");
    expect(setCodeFromNumber("12/204")).toBeNull();
    expect(setCodeFromNumber(null)).toBeNull();
  });

  it("reads set rosters and set lists", () => {
    const page = parseTcgApiSetPage(slug, { data: [row(), row({ id: 9, product_type: "Sealed Products" })], meta: { ...meta, has_more: true } });
    expect(page).toMatchObject({ rawCount: 2, hasMore: true });
    expect(page.cards).toHaveLength(1);

    const list = parseTcgApiSetList("op", {
      data: [
        { id: 1100079, name: "The World's Strongest Warriors", abbreviation: null, card_count: 186, release_date: "2026-08-22" },
        { id: "bad", name: "x" },
      ],
      meta,
    });
    expect(list.sets).toEqual([expect.objectContaining({
      game: "op", id: "1100079", name: "The World's Strongest Warriors", abbreviation: null, card_count: 186, release_date: "2026-08-22",
    })]);
    expect(list.hasMore).toBe(false);
  });

  it("presents a card as a product for item views", () => {
    const product = tcgCardItemProduct({
      id: "512345", game: "op", name: "Luffy", set_name: "Romance Dawn", set_code: "OP01",
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
    expect(getItemGame({ tcg_card_id: "1", tcgGame: "lor" })).toBe("lor");
    expect(getItemGame({ tcg_card_id: "1", tcgGame: "dbm" })).toBe("dbm");
    expect(getItemGame({ tcg_card_id: "1", tcgGame: "unknown" })).toBeNull();
    expect(getItemGame({ riftbound_card_id: "r" })).toBe("riftbound");
    expect(getItemCardId({ tcg_card_id: "1" })).toBe("1");
    expect(isCardItem({})).toBe(false);
    expect(inferItemCategory({ tcgCardId: "1", hints: ["Book"] })).toBe("tcg");
  });
});
