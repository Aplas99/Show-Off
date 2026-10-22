import { getProductCode, parseBarcodeNestProducts, parseBarcodeProducts, parseUpcProducts, productsToCacheRows, upcRetryDelay } from "./productCatalog";

describe("trusted product normalization", () => {
  it("preserves barcode zeroes, ignores malformed records, and normalizes prices", () => {
    const products = parseBarcodeProducts({ products: [
      { title: " Book ", barcode_number: "0012345678905", stores: [{ price: "12.50" }] },
      { title: "Negative", barcode_number: "12345678", stores: [{ price: -1 }] },
      { title: "Invalid" },
    ] });
    expect(products).toHaveLength(2);
    expect(products[0]).toMatchObject({ title: "Book", ean: "0012345678905", price: 12.5 });
    expect(products[1].price).toBeUndefined();
  });

  it("rejects provider error envelopes instead of treating them as successful searches", () => {
    expect(() => parseUpcProducts({ code: "EXCEED_LIMIT", items: [] })).toThrow();
    expect(() => parseBarcodeProducts({ error: "unavailable" })).toThrow();
  });

  it("normalizes UPC results without persisting unrelated vendor fields", () => {
    const [product] = parseUpcProducts({ code: "OK", items: [{
      title: "Book", ean: "0012345678905", upc: null, lowest_recorded_price: "NaN", vendor_private: "ignored",
    }] });
    expect(product.price).toBeUndefined();
    expect(product).not.toHaveProperty("vendor_private");
  });

  it("deduplicates BIGINT keys while retaining leading zeroes in display data", () => {
    const rows = productsToCacheRows([
      { title: "First", ean: "0012345678905" },
      { title: "Second", ean: "012345678905", manufacturer: "Maker" },
      { title: "Invalid", ean: "12345678901234567890" },
      { title: "Invalid", ean: "00000000" },
      { title: "Invalid", ean: "manual:123" },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ ean: "12345678905", searchableTitle: "Second", searchableBrand: "Maker", data: { ean: "012345678905" } });
    expect(getProductCode({ title: "Book", ean: "", upc: "1234-5678" })).toBe("12345678");
  });

  it("bounds upstream cooldowns and honors a future reset", () => {
    expect(upcRetryDelay(new Headers(), 0)).toBe(60);
    expect(upcRetryDelay(new Headers({ "X-RateLimit-Reset": "1120" }), 1_000_000)).toBe(120);
    expect(upcRetryDelay(new Headers({ "Retry-After": "9999999" }))).toBe(86400);
  });

  it("parses BarcodeNest products and drops unsafe images or nameless records", () => {
    expect(parseBarcodeNestProducts({ barcode: "036000291452", found: true, product: { name: " Tissue ", brand: "Kleenex", image_url: "http://insecure/x.png" } }))
      .toEqual([{ title: "Tissue", ean: "036000291452", upc: "036000291452", brand: "Kleenex", images: undefined }]);
    expect(parseBarcodeNestProducts({ barcode: "12345678", found: true, product: { name: null } })).toEqual([]);
    expect(parseBarcodeNestProducts({ found: false })).toEqual([]);
    expect(() => parseBarcodeNestProducts({ barcode: "x", found: true })).toThrow();
  });
});
