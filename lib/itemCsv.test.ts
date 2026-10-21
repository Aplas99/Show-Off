import {
  ITEM_CSV_COLUMNS,
  ITEM_CSV_MAX_ROWS,
  itemCsvFileName,
  itemsToCsv,
  parseCsv,
  parseItemCsv,
  toCsv,
} from "@/lib/itemCsv";

describe("parseCsv / toCsv", () => {
  it("round-trips quotes, commas and newlines", () => {
    const rows = [["a", 'say "hi"', "x,y", "line1\nline2"]];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });

  it("handles a BOM and LF endings", () => {
    expect(parseCsv("﻿title,brand\nOne,Two\n")).toEqual([
      ["title", "brand"],
      ["One", "Two"],
    ]);
  });

  it("rejects an unclosed quote", () => {
    expect(() => parseCsv('title\n"oops')).toThrow(/unclosed/);
  });

  it("neutralizes spreadsheet formulas on export and restores them on import", () => {
    const csv = toCsv([["title"], ["=HYPERLINK(1)"]]);
    expect(csv).toContain("'=HYPERLINK(1)");
    expect(parseItemCsv(csv).rows[0].title).toBe("=HYPERLINK(1)");
  });
});

describe("itemsToCsv", () => {
  it("writes the header and one row per item", () => {
    const csv = itemsToCsv([
      {
        title: "Charizard",
        category: "tcg",
        price: 12.5,
        currency: "USD",
        pokemonCardId: "base1-4",
        showcases: ["Binder", "Favorites"],
      },
    ]);
    const [header, row] = parseCsv(csv);
    expect(header).toEqual([...ITEM_CSV_COLUMNS]);
    expect(row[0]).toBe("Charizard");
    expect(header).not.toContain("for_sale");
    expect(row[ITEM_CSV_COLUMNS.indexOf("showcases")]).toBe("Binder; Favorites");
  });

  it("re-imports its own export", () => {
    const csv = itemsToCsv([
      { title: "Zelda", type: "Cartridge", condition: "Good", price: null, showcases: ["Games"], createdAt: "2026-01-01T00:00:00Z" },
    ]);
    const { rows, errors } = parseItemCsv(csv);
    expect(errors).toEqual([]);
    expect(rows[0]).toMatchObject({ title: "Zelda", type: "Cartridge", condition: "Good", price: null, currency: "USD", showcases: ["Games"] });
  });

  it("names the file by date", () => {
    expect(itemCsvFileName(new Date("2026-10-21T12:00:00Z"))).toBe("show-off-collection-2026-10-21.csv");
  });
});

describe("parseItemCsv", () => {
  it("accepts any column order, case and lenient values", () => {
    const { rows, errors } = parseItemCsv(
      "Price,Title,Condition,For Sale,Category,Showcases,Image_URL\n\"$1,200.00\",Lamp,new in box,TRUE,Video Games,a; A ;b,http://x.test/p.png\n",
    );
    expect(errors).toEqual([]);
    expect(rows[0]).toMatchObject({
      line: 2,
      title: "Lamp",
      price: 1200,
      condition: "New in box",
      category: "video_games",
      showcases: ["a", "b"],
      image_url: "https://x.test/p.png",
    });
  });

  it("reports invalid rows by line and keeps the valid ones", () => {
    const { rows, errors } = parseItemCsv("title,condition,price,barcode\nOk,,,\nBad,Mint,,\nNeg,,-3,\n,,,x\nCode,,,abc\n\n");
    expect(rows.map((r) => r.title)).toEqual(["Ok"]);
    expect(errors).toEqual([
      { line: 3, message: expect.stringMatching(/^condition must be one of/) },
      { line: 4, message: "price must be a non-negative number" },
      { line: 5, message: "barcode must be 8-14 digits" },
      { line: 6, message: "barcode must be 8-14 digits" },
    ]);
  });

  it("requires something to identify the item", () => {
    expect(parseItemCsv("title,brand\n,Acme\n").errors).toEqual([{ line: 2, message: "Row needs a title, barcode, or card id" }]);
  });

  it("allows a card id without a title", () => {
    const { rows } = parseItemCsv("title,magic_card_id\n,abc-123\n");
    expect(rows[0]).toMatchObject({ title: null, magic_card_id: "abc-123" });
  });

  it("drops non-https image references", () => {
    const { rows } = parseItemCsv("title,image_url\nA,file:///local.png\n");
    expect(rows[0].image_url).toBeNull();
  });

  it("fails fast on files it cannot use", () => {
    expect(() => parseItemCsv("")).toThrow(/empty/);
    expect(() => parseItemCsv("name\nx\n")).toThrow(/title/);
    expect(() => parseItemCsv("title\n")).toThrow(/no item rows/);
    expect(() => parseItemCsv(`title\n${"x\n".repeat(ITEM_CSV_MAX_ROWS + 1)}`)).toThrow(/up to/);
  });
});
