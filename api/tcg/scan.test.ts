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
  });

  it("keeps short letter-heavy lines as names and drops rules text and credits", () => {
    const { names } = extractTcgIdentifiers("ygo", {
      text: "Dark Magician\nSpellcaster / Normal\nThe ultimate wizard in terms of attack and defense.\n©1996 KAZUKI TAKAHASHI Konami\n2500",
    });
    expect(names[0]).toBe("Dark Magician");
    expect(names.some((name) => /konami|attack/i.test(name))).toBe(false);
  });
});

describe("shared TCG scan matching", () => {
  it("matches the printed code first and skips name searches", async () => {
    const luffy = card("pk_aaaaaaaaaaaaaaaaaaaa", "Monkey.D.Luffy", "OP01-003");
    const other = card("pk_bbbbbbbbbbbbbbbbbbbb", "Roronoa Zoro", "OP01-025");
    const d = deps(async () => [other, luffy], "Monkey.D.Luffy\nOP01-003");
    expect(await identifyTcgCardImage("op", "photo.jpg", d)).toEqual([luffy]);
    expect(d.searchCards).toHaveBeenCalledTimes(1);
    expect(d.searchCards).toHaveBeenCalledWith("op", "OP01-003");
  });

  it("falls back to close name matches when no code is readable", async () => {
    const elsa = card("pk_aaaaaaaaaaaaaaaaaaaa", "Elsa - Snow Queen", "41/204");
    const anna = card("pk_bbbbbbbbbbbbbbbbbbbb", "Anna - Heir to Arendelle", "1/204");
    const d = deps(async (_game, query) => (query === "Elsa - Snow Queen" ? [anna, elsa] : []), "Elsa - Snow Queen");
    expect(await identifyTcgCardImage("lor", "photo.jpg", d)).toEqual([elsa]);
  });

  it("returns nothing rather than a weak guess", async () => {
    const d = deps(async () => [card("pk_aaaaaaaaaaaaaaaaaaaa", "Something Else Entirely", "X")], "Blurry Text Here");
    expect(await identifyTcgCardImage("fab", "photo.jpg", d)).toEqual([]);
  });
});
