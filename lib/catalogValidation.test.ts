import { validateCatalogRequest } from "@/lib/catalogValidation";

describe("catalog request boundary", () => {
  it("accepts only bounded Magic search and fuzzy-name requests", () => {
    expect(validateCatalogRequest({ provider: "magic", path: "/cards/named?fuzzy=Black%20Lotus" }))
      .toEqual({ provider: "magic", path: "/cards/named?fuzzy=Black+Lotus" });
    expect(validateCatalogRequest({ provider: "magic", path: "/cards/search?q=lotus" }))
      .toEqual({ provider: "magic", path: "/cards/search?q=lotus&page=1" });
    for (const path of [
      "https://attacker.invalid/cards/search?q=x", "/cards/collection", "/cards/search?q=x&q=y",
      "/cards/search?q=x&page=101", "/cards/search?q=x&page=1.5", "/cards/named?fuzzy=",
      "/cards/named?fuzzy=x&url=https://attacker.invalid", "/cards/search?q=x&format=csv",
    ]) {
      expect(() => validateCatalogRequest({ provider: "magic", path })).toThrow();
    }
    expect(() => validateCatalogRequest({ provider: "magic", path: "/cards/search?q=x", cards: [] })).toThrow();
  });
  it("preserves bounded search and set-roster requests", () => {
    const input = { provider: "pokemon", path: '/cards?q=set.id%3A%22base1%22&page=2&pageSize=250&orderBy=number' };
    const request = validateCatalogRequest(input);
    expect(request).toEqual(input);
  });

  it("accepts only the bare set-list path", () => {
    expect(validateCatalogRequest({ provider: "pokemon", path: "/sets" }))
      .toEqual({ provider: "pokemon", path: "/sets" });
    for (const path of ["/sets?pageSize=1000", "/sets?q=name:x", "/sets/", "/setsx"]) {
      expect(() => validateCatalogRequest({ provider: "pokemon", path })).toThrow();
    }
  });

  it("accepts a single card lookup", () => {
    expect(validateCatalogRequest({ provider: "pokemon", path: "/cards/base1-4" }))
      .toEqual({ provider: "pokemon", path: "/cards/base1-4" });
  });

  it.each([
    "https://attacker.invalid/cards",
    "//attacker.invalid/cards",
    "/cards/../../users",
    "/cards/%2e%2e",
    "/cards/base1-4?key=injected",
    "/cards?q=name:test&key=injected",
    "/cards?q=name:test&page=1&page=2",
    "/cards?q=name:test&pageSize=251",
    "/cards?q=name:test&page=-1",
    "/cards?q=name:test&page=1.5",
    "/cards?q=name:test&page=101",
    "/cards?q=name:test&orderBy=unknown",
    "/cards?q=",
  ])("rejects unsafe or unbounded Pokemon paths: %s", (path) => {
    expect(() => validateCatalogRequest({ provider: "pokemon", path })).toThrow();
  });

  it("normalizes barcode input and rejects injected fields", () => {
    expect(validateCatalogRequest({ provider: "barcode", query: "  book  " }))
      .toEqual({ provider: "barcode", query: "book", page: 1 });
    expect(() => validateCatalogRequest({ provider: "barcode", query: "book", key: "injected" })).toThrow();
    expect(() => validateCatalogRequest({ provider: "barcode", query: "book", page: 0 })).toThrow();
    expect(() => validateCatalogRequest({ provider: "barcode", query: "x".repeat(201) })).toThrow();
  });

  it("canonicalizes bounded Riftbound reads and rejects everything else", () => {
    expect(validateCatalogRequest({ provider: "riftbound", path: "/cards/name?fuzzy=yi%20hone" }))
      .toEqual({ provider: "riftbound", path: "/cards/name?fuzzy=yi+hone&page=1&size=50" });
    expect(validateCatalogRequest({ provider: "riftbound", path: "/cards/riftbound/OGN-011" }))
      .toEqual({ provider: "riftbound", path: "/cards/riftbound/ogn-011" });
    expect(validateCatalogRequest({ provider: "riftbound", path: "/cards?set_id=ogn&page=2&size=100" }))
      .toEqual({ provider: "riftbound", path: "/cards?set_id=ogn&sort=collector_number&page=2&size=100" });
    expect(validateCatalogRequest({ provider: "riftbound", path: "/cards/69bc5bc7d308c64675ca86c1" }))
      .toEqual({ provider: "riftbound", path: "/cards/69bc5bc7d308c64675ca86c1" });
    for (const path of [
      "https://attacker.invalid/cards", "/cards", "/cards/name", "/cards/name?fuzzy=a&exact=b",
      "/cards/name?fuzzy=a&fuzzy=b", "/cards/name?fuzzy=a&size=101", "/cards/name?fuzzy=a&url=x",
      "/cards/riftbound/ogn%2F..", "/cards/riftbound/ogn-011/x", "/cards/not-an-id", "/cards/search?query=x",
      "/cards?set_id=../x", "/sets",
    ]) {
      expect(() => validateCatalogRequest({ provider: "riftbound", path })).toThrow();
    }
  });
});
