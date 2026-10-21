import {
  describeRiftboundSet,
  formatRiftboundCollectorNumber,
  getRiftboundSetName,
  resolveRiftboundSetCode,
} from "@/constants/riftboundSets";

describe("Riftbound sets", () => {
  it("uses short names for known sets and falls back to the provider label", () => {
    expect(getRiftboundSetName("opp", "Riftbound Organized Play Promotional Cards")).toBe("Organized Play Promos");
    expect(getRiftboundSetName("NEW", "Brand New Set")).toBe("Brand New Set");
    expect(getRiftboundSetName("NEW", null)).toBe("NEW");
    expect(getRiftboundSetName(null)).toBe("Unknown set");
  });

  it("formats printed collector numbers from Riftbound IDs", () => {
    expect(formatRiftboundCollectorNumber("ogn-011-298")).toBe("011/298");
    expect(formatRiftboundCollectorNumber("OGN-011a-298")).toBe("011a/298");
    expect(formatRiftboundCollectorNumber("unl-229*-219")).toBe("229*/219");
    expect(formatRiftboundCollectorNumber("ven-r06")).toBe("r06");
    expect(formatRiftboundCollectorNumber(null)).toBeNull();
  });

  it("describes main and promo sets", () => {
    expect(describeRiftboundSet("OGN")).toBe("Released Oct 2025 · 298 cards");
    expect(describeRiftboundSet("OPP")).toBe("Promo set");
    expect(describeRiftboundSet("NEW")).toBeNull();
  });

  it("resolves OCR'd set codes by code, printed total, then near-miss", () => {
    expect(resolveRiftboundSetCode("sfd", 221)).toBe("SFD");
    expect(resolveRiftboundSetCode("XQZ", 166)).toBe("VEN");
    expect(resolveRiftboundSetCode("SED", 999)).toBe("SFD");
    // Too ambiguous: OGN/OGS/OPP are all one letter from "OGP".
    expect(resolveRiftboundSetCode("OGP", 999)).toBeNull();
  });
});
