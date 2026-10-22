import { riftboundCard } from "@/lib/riftboundCatalog.fixture";
import type { RiftboundCard } from "./index";
import { extractRiftboundIdentifiers, identifyRiftboundCardImage, type RiftboundScanDependencies } from "./scan";

jest.mock("@/lib/supabase", () => ({ supabase: {} }));
jest.mock("expo-image-manipulator", () => ({
  ImageManipulator: { manipulate: jest.fn() },
  SaveFormat: { JPEG: "jpeg" },
}));

const magmaWurm = riftboundCard as RiftboundCard;
const yone = { ...magmaWurm, id: "69bc5bddd308c64675ca8870", name: "Yone - Blademaster", riftbound_id: "sfd-116-221" } as RiftboundCard;
const yoneAlt = { ...yone, id: "69bc5bddd308c64675ca8871", riftbound_id: "sfd-116a-221" } as RiftboundCard;

const magmaOcr = {
  text: "UNIT FRELJORD\nMagma Wurm\nOther friendly units enter ready.\nA river of flame in an ocean of ice.\nOGN • 011/298 Envar Studio • ©2025RGI",
};
const yoneOcr = {
  text: "",
  blocks: [
    { lines: [{ text: "CHAMPION UNIT YONE IONIA DEMON" }] },
    { lines: [{ text: "Yone" }, { text: "BLADEMASTER" }] },
    { lines: [{ text: "WEAPONMASTER (When you play me, you may EQUIP one of your Equipment" }] },
    { lines: [{ text: "SFD • 116/221" }] },
  ],
};

function deps(overrides: Partial<RiftboundScanDependencies> = {}): Partial<RiftboundScanDependencies> {
  return {
    prepareImage: jest.fn().mockResolvedValue("crop.jpg"),
    recognizeText: jest.fn().mockResolvedValue(magmaOcr),
    findCardsByCode: jest.fn().mockResolvedValue([]),
    searchCardsByName: jest.fn().mockResolvedValue([]),
    ...overrides,
  };
}

describe("extractRiftboundIdentifiers", () => {
  it("reads the footer code and the name banner", () => {
    expect(extractRiftboundIdentifiers(magmaOcr)).toEqual({ codes: ["ogn-011-298"], names: ["Magma Wurm"] });
  });

  it("joins a champion's all-caps title onto the name", () => {
    expect(extractRiftboundIdentifiers(yoneOcr)).toEqual({
      codes: ["sfd-116-221"],
      names: ["Yone - Blademaster", "Yone"],
    });
  });

  it("repairs common OCR digit/letter swaps and keeps signature stars", () => {
    expect(extractRiftboundIdentifiers({ text: "0GN · O1l/298" }).codes).toEqual(["ogn-011-298"]);
    expect(extractRiftboundIdentifiers({ text: "UNL • 229*/219" }).codes).toEqual(["unl-229*-219"]);
  });

  it("corrects misread set codes from the known set list", () => {
    // One-letter misread of a known code.
    expect(extractRiftboundIdentifiers({ text: "SED • 116/221" }).codes).toEqual(["sfd-116-221"]);
    // Unreadable code, but /298 is only printed on Origins.
    expect(extractRiftboundIdentifiers({ text: "Q#N • 011/298" }).codes).toEqual([]);
    expect(extractRiftboundIdentifiers({ text: "XQZ • 011/298" }).codes).toEqual(["ogn-011-298"]);
  });

  it("returns nothing for unreadable text", () => {
    expect(extractRiftboundIdentifiers({ text: "~~ ## 12" })).toEqual({ codes: [], names: [] });
  });
});

describe("identifyRiftboundCardImage", () => {
  it("looks up the footer code first and ranks the exact printing first", async () => {
    const d = deps({ recognizeText: jest.fn().mockResolvedValue(yoneOcr), findCardsByCode: jest.fn().mockResolvedValue([yoneAlt, yone]) });
    const cards = await identifyRiftboundCardImage("photo.jpg", d);
    expect(d.findCardsByCode).toHaveBeenCalledWith("sfd-116");
    expect(cards.map((card) => card.riftbound_id)).toEqual(["sfd-116-221", "sfd-116a-221"]);
    expect(d.searchCardsByName).not.toHaveBeenCalled();
  });

  it("falls back to the name and drops loosely matched results", async () => {
    const d = deps({
      recognizeText: jest.fn().mockResolvedValue({ text: "UNIT FRELJORD\nMagma Wurm\nOther friendly units enter ready." }),
      searchCardsByName: jest.fn().mockResolvedValue([{ ...magmaWurm, id: "69bc5bc7d308c64675ca86c9", name: "Magma Golem" }, magmaWurm]),
    });
    const cards = await identifyRiftboundCardImage("photo.jpg", d);
    expect(d.findCardsByCode).not.toHaveBeenCalled();
    expect(cards.map((card) => card.name)).toEqual(["Magma Wurm"]);
  });

  it("returns no matches when neither code nor name resolves", async () => {
    const d = deps({ findCardsByCode: jest.fn().mockResolvedValue([]), searchCardsByName: jest.fn().mockResolvedValue([]) });
    expect(await identifyRiftboundCardImage("photo.jpg", d)).toEqual([]);
    expect(d.searchCardsByName).toHaveBeenCalledWith("Magma Wurm");
  });
});
