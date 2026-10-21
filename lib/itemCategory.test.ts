import { getItemCategory, inferItemCategory, resolveItemCategory } from "@/lib/itemCategory";

describe("inferItemCategory", () => {
  it("treats any linked trading card as TCG", () => {
    expect(inferItemCategory({ pokemonTcgCardId: "xy1-1" })).toBe("tcg");
    expect(inferItemCategory({ magicCardId: "abc", hints: ["Book"] })).toBe("tcg");
    expect(inferItemCategory({ riftboundCardId: "69bc5bc7d308c64675ca86c1", hints: ["Book"] })).toBe("tcg");
  });

  it("recognizes ISBN barcodes as books, as strings or numbers", () => {
    expect(inferItemCategory({ productEan: "9780141036144" })).toBe("books");
    expect(inferItemCategory({ productEan: 9791032300824 })).toBe("books");
    expect(inferItemCategory({ productEan: "0045496590420" })).toBe("general");
  });

  it("maps type and catalog text to each category", () => {
    expect(inferItemCategory({ hints: ["Pokémon card"] })).toBe("tcg");
    expect(inferItemCategory({ hints: ["Trading Cards > Sports"] })).toBe("tcg");
    expect(inferItemCategory({ hints: ["Media > Books > Fiction"] })).toBe("books");
    expect(inferItemCategory({ hints: ["Manga"] })).toBe("books");
    expect(inferItemCategory({ hints: ["Video Games > Nintendo Switch"] })).toBe("video_games");
    expect(inferItemCategory({ hints: ["PS5"] })).toBe("video_games");
    expect(inferItemCategory({ hints: ["Board game"] })).toBe("board_games");
    expect(inferItemCategory({ hints: [null, "Toys & Games > Puzzles"] })).toBe("board_games");
    expect(inferItemCategory({ hints: ["Toys & Games > Games"] })).toBe("board_games");
    expect(inferItemCategory({ hints: ["Toys & Games > Action Figures"] })).toBe("figures");
    expect(inferItemCategory({ hints: ["Funko"] })).toBe("figures");
    expect(inferItemCategory({ hints: ["Vinyl"] })).toBe("music");
    expect(inferItemCategory({ hints: ["Music > CDs"] })).toBe("music");
    expect(inferItemCategory({ hints: ["Movies"] })).toBe("movies");
    expect(inferItemCategory({ hints: ["Blu-ray"] })).toBe("movies");
  });

  it("resolves overlapping keywords in rule order", () => {
    expect(inferItemCategory({ hints: ["Vinyl Figure"] })).toBe("figures");
    expect(inferItemCategory({ hints: ["The Hunger Games Blu-ray"] })).toBe("movies");
    expect(inferItemCategory({ hints: ["Toys & Games > Plush"] })).toBe("general");
  });

  it("does not treat franchise names alone as trading cards", () => {
    expect(inferItemCategory({ hints: ["Pokémon plush"] })).toBe("general");
    expect(inferItemCategory({ hints: ["Pokémon figure"] })).toBe("figures");
  });

  it("puts unknown text in General", () => {
    expect(inferItemCategory({ hints: ["Watch"] })).toBe("general");
    expect(inferItemCategory({ hints: ["Gamepad stand"] })).toBe("general");
    expect(inferItemCategory({ hints: [] })).toBe("general");
    expect(inferItemCategory({})).toBe("general");
  });
});

describe("resolveItemCategory", () => {
  it("prefers the stored category over inference", () => {
    expect(resolveItemCategory({ category: "movies", hints: ["Book"] })).toBe("movies");
    expect(resolveItemCategory({ category: "general", productEan: "9780141036144" })).toBe("general");
  });

  it("never lets a stored category hide a linked card", () => {
    expect(resolveItemCategory({ category: "books", pokemonTcgCardId: "xy1-1" })).toBe("tcg");
  });

  it("falls back to inference when the stored value is missing or unknown", () => {
    expect(resolveItemCategory({ category: null, hints: ["Comics"] })).toBe("books");
    expect(resolveItemCategory({ category: "games", hints: ["Xbox"] })).toBe("video_games");
  });
});

describe("getItemCategory", () => {
  it("reads signals from an item row", () => {
    expect(getItemCategory({ category: "music" })).toBe("music");
    expect(getItemCategory({ magic_card_id: "abc", category: "general" })).toBe("tcg");
    expect(getItemCategory({ riftbound_card_id: "69bc5bc7d308c64675ca86c1", category: "books" })).toBe("tcg");
    expect(getItemCategory({ product_ean: 9780141036144 })).toBe("books");
    expect(getItemCategory({ products: { data: { category: "Video Games" } } })).toBe("video_games");
  });

  it("ignores non-string catalog categories", () => {
    expect(getItemCategory({ products: { data: { category: ["Books"] } } })).toBe("general");
    expect(getItemCategory({ products: null })).toBe("general");
  });
});
