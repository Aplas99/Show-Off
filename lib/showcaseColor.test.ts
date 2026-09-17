import { showcaseDisplayAccent, textOnAccent } from "@/lib/showcaseColor";

describe("showcase color", () => {
  it("keeps the default accent and lifts very dark custom colors", () => {
    expect(showcaseDisplayAccent("#A77BFF")).toBe("#A77BFF");
    expect(showcaseDisplayAccent("#000000")).not.toBe("#000000");
    expect(showcaseDisplayAccent("#000000")).toMatch(/^#[0-9A-F]{6}$/);
  });

  it("chooses readable text for light and dark accents", () => {
    expect(textOnAccent("#FFFFFF")).toBe("#17121F");
    expect(textOnAccent("#FFFF00")).toBe("#17121F");
    expect(textOnAccent("#FF0000")).toBe("#17121F");
    expect(textOnAccent("#6950E9")).toBe("#FFFFFF");
  });
});
