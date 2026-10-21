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
});
