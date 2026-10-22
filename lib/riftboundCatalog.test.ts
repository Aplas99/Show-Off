import { getRiftboundCardImageUrl, parseRiftboundCards, riftboundCardSchema, riftboundCardToCacheRow } from "@/lib/riftboundCatalog";
import { riftboundCard } from "@/lib/riftboundCatalog.fixture";

describe("Riftbound catalog schema", () => {
  it("parses Riftcodex cards, including null optional fields", () => {
    expect(riftboundCardSchema.parse(riftboundCard).classification?.supertype).toBeNull();
  });

  it("rejects malformed IDs and missing names", () => {
    expect(riftboundCardSchema.safeParse({ ...riftboundCard, id: "../x" }).success).toBe(false);
    expect(riftboundCardSchema.safeParse({ ...riftboundCard, riftbound_id: "ogn/011" }).success).toBe(false);
    expect(riftboundCardSchema.safeParse({ ...riftboundCard, riftbound_id: "unl-229*-219" }).success).toBe(true);
    expect(riftboundCardSchema.safeParse({ ...riftboundCard, name: " " }).success).toBe(false);
  });

  it("normalizes list, array, and single-card responses", () => {
    expect(parseRiftboundCards("/cards/name?fuzzy=wurm&page=1&size=50", { items: [riftboundCard], total: 1, page: 1, size: 50, pages: 1 })).toHaveLength(1);
    expect(parseRiftboundCards("/cards/riftbound/ogn-011", [riftboundCard])).toHaveLength(1);
    expect(parseRiftboundCards(`/cards/${riftboundCard.id}`, riftboundCard)).toHaveLength(1);
    expect(() => parseRiftboundCards("/cards/name?fuzzy=x", [riftboundCard])).toThrow();
  });

  it("builds cache rows and drops non-HTTPS images", () => {
    const row = riftboundCardToCacheRow(riftboundCardSchema.parse(riftboundCard));
    expect(row).toMatchObject({ id: riftboundCard.id, riftbound_id: "ogn-011-298", set_code: "OGN", domains: ["Fury"], supertype: null, energy: 8 });
    expect(row.image_url).toMatch(/^https:\/\//);
    const insecure = riftboundCardSchema.parse({ ...riftboundCard, media: { ...riftboundCard.media, image_url: "http://x/y.png" } });
    expect(getRiftboundCardImageUrl(insecure)).toBeNull();
  });
});
