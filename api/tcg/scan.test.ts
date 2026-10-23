import { extractTcgIdentifiers, identifyTcgCardImage, type TcgScanDependencies } from "@/api/tcg/scan";
import type { TcgCard } from "@/api/tcg";

jest.mock("expo-image-manipulator", () => ({ ImageManipulator: {}, SaveFormat: { JPEG: "jpeg" } }));
jest.mock("@/lib/supabase", () => ({ supabase: { rpc: jest.fn() } }));
jest.mock("@/api/catalog", () => ({ CatalogRequestError: class extends Error {}, fetchCatalog: jest.fn() }));

const card = (id: string, name: string, cardNumber: string | null): TcgCard => ({
  id, game: "op", name, set_name: "Romance Dawn", set_code: "OP01", set_id: "1", card_number: cardNumber,
  rarity: "Leader", card_type: null, image_url: null, market_price: null,
});

function deps(searchCards: TcgScanDependencies["searchCards"], text: string): Partial<TcgScanDependencies> {
  return {
    prepareImage: jest.fn().mockResolvedValue("prepared.jpg"),
    recognizeText: jest.fn().mockResolvedValue({ text }),
    searchCards: jest.fn(searchCards),
  };
}

describe("shared TCG scan identifiers", () => {
  it("reads each game's printed code format, repairing O/0 misreads", () => {
    expect(extractTcgIdentifiers("op", { text: "Monkey.D.Luffy\nOPO1-OO3 L" }).codes).toEqual(["OP01-003"]);
    expect(extractTcgIdentifiers("ygo", { text: "Dark Magician\nLOB-EN005" }).codes).toEqual(["LOB-EN005"]);
    expect(extractTcgIdentifiers("fab", { text: "Bravo, Showstopper\nWTR039" }).codes).toEqual(["WTR039"]);
    expect(extractTcgIdentifiers("dgm", { text: "Agumon\nBT1-010" }).codes).toEqual(["BT1-010"]);
    expect(extractTcgIdentifiers("cfv", { text: "Blaster Blade\nD-BT01/001EN" }).codes).toEqual(["D-BT01/001EN"]);
    expect(extractTcgIdentifiers("lor", { text: "Elsa\n12 / 204 • EN • 1" }).codes).toEqual(["12/204"]);
    expect(extractTcgIdentifiers("dbs", { text: "Son Goku\nFB01-001" }).codes).toEqual(["FB01-001"]);
    expect(extractTcgIdentifiers("dbm", { text: "Son Goku\nBT1-031" }).codes).toEqual(["BT1-031"]);
  });

  it("keeps short letter-heavy lines as names and drops rules text and credits", () => {
    const { names } = extractTcgIdentifiers("ygo", {
      text: "Dark Magician\nSpellcaster / Normal\nThe ultimate wizard in terms of attack and defense.\n©1996 KAZUKI TAKAHASHI Konami\n2500",
    });
    expect(names[0]).toBe("Dark Magician");
    expect(names.some((name) => /konami|attack/i.test(name))).toBe(false);
  });

  it("drops rules sentences and frame words, and joins a name wrapped over two lines", () => {
    const { names } = extractTcgIdentifiers("op", {
      text: "base power becomes 7000.\nCHARACTER\nMonkey.D.\nLuffy\nStraw Hat Crew\nOP15-092 4",
    });
    expect(names[0]).toBe("Monkey.D. Luffy");
    expect(names).not.toContain("base power becomes 7000.");
    expect(names).not.toContain("CHARACTER");
  });
});

describe("shared TCG scan matching", () => {
  it("matches the printed code in the cache first and skips name searches", async () => {
    const luffy = card("1001", "Monkey.D.Luffy", "OP01-003");
    const other = card("1002", "Roronoa Zoro", "OP01-025");
    const d = deps(async () => [other, luffy], "Monkey.D.Luffy\nOP01-003");
    expect(await identifyTcgCardImage("op", "photo.jpg", d)).toEqual([luffy]);
    expect(d.searchCards).toHaveBeenCalledTimes(1);
    expect(d.searchCards).toHaveBeenCalledWith("op", "OP01-003", { cacheOnly: true });
  });

  it("on a cache miss, searches by name and puts the printing carrying the code first", async () => {
    const base = card("1001", "Monkey.D.Luffy (OP15-092)", "OP15-092");
    const alt = card("1002", "Monkey.D.Luffy (OP15-092) (Alternate Art)", "OP15-092");
    const otherLuffy = card("1003", "Monkey.D.Luffy", "OP01-003");
    const garp = card("1004", "Monkey.D.Garp", "OP02-001");
    const d = deps(
      async (_game, query, options) => (options?.cacheOnly ? [] : query === "Monkey.D. Luffy" ? [otherLuffy, garp, alt, base] : []),
      "Monkey.D.\nLuffy\nOP15-092",
    );
    const matches = await identifyTcgCardImage("op", "photo.jpg", d);
    expect(matches.slice(0, 2).map((match) => match.card_number)).toEqual(["OP15-092", "OP15-092"]);
    expect(matches).toContain(otherLuffy);
    expect(matches).not.toContain(garp);
    expect(d.searchCards).toHaveBeenNthCalledWith(1, "op", "OP15-092", { cacheOnly: true });
    expect(d.searchCards).toHaveBeenNthCalledWith(2, "op", "Monkey.D. Luffy");
  });

  it("falls back to close name matches when no code is readable", async () => {
    const elsa = card("1001", "Elsa - Snow Queen", "41/204");
    const anna = card("1002", "Anna - Heir to Arendelle", "1/204");
    const d = deps(async (_game, query) => (query === "Elsa - Snow Queen" ? [anna, elsa] : []), "Elsa - Snow Queen");
    expect(await identifyTcgCardImage("lor", "photo.jpg", d)).toEqual([elsa]);
  });

  it("returns nothing rather than a weak guess", async () => {
    const d = deps(async () => [card("1001", "Something Else Entirely", "X")], "Blurry Text Here");
    expect(await identifyTcgCardImage("fab", "photo.jpg", d)).toEqual([]);
  });
});
