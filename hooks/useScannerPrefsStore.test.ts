import { parseScannerPrefs, useScannerPrefsStore } from "@/hooks/useScannerPrefsStore";

describe("parseScannerPrefs", () => {
  it("defaults everything off when nothing is stored", () => {
    expect(parseScannerPrefs(undefined)).toEqual({ torch: false, foil: false, promo: false });
  });

  it("restores stored preferences", () => {
    expect(parseScannerPrefs(JSON.stringify({ torch: true, foil: true, promo: false }))).toEqual({
      torch: true,
      foil: true,
      promo: false,
    });
  });

  it("falls back per field for missing or invalid values", () => {
    expect(parseScannerPrefs(JSON.stringify({ foil: true, promo: "yes" }))).toEqual({
      torch: false,
      foil: true,
      promo: false,
    });
  });

  it("ignores corrupt JSON", () => {
    expect(parseScannerPrefs("{not json")).toEqual({ torch: false, foil: false, promo: false });
  });
});

describe("useScannerPrefsStore", () => {
  it("toggles one preference without touching the others", () => {
    const { toggle } = useScannerPrefsStore.getState();
    toggle("foil");
    expect(useScannerPrefsStore.getState()).toMatchObject({ torch: false, foil: true, promo: false });
    toggle("foil");
    expect(useScannerPrefsStore.getState().foil).toBe(false);
  });
});
