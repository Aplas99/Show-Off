import { fetchCatalog } from "@/api/catalog";
import { supabase } from "@/lib/supabase";
import { fetchExternalProducts, lookupProductByBarcode, resolveProductForItem } from "./index";

jest.mock("@/api/catalog", () => ({ fetchCatalog: jest.fn() }));
jest.mock("@/lib/supabase", () => ({ supabase: { from: jest.fn() } }));

describe("read-only product linking", () => {
  const maybeSingle = jest.fn();
  const eq = jest.fn(() => ({ maybeSingle }));
  const select = jest.fn(() => ({ eq }));
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(supabase.from).mockReturnValue({ select } as unknown as ReturnType<typeof supabase.from>);
    maybeSingle.mockResolvedValue({ data: null, error: null });
  });

  it("links existing products without a provider call or client write", async () => {
    maybeSingle.mockResolvedValue({ data: { ean: 12345678 }, error: null });
    expect(await resolveProductForItem(undefined, "12345678")).toMatchObject({ productEan: "12345678" });
    expect(fetchCatalog).not.toHaveBeenCalled();
    expect(select).toHaveBeenCalledWith("ean");
  });

  it("never submits selected product metadata to the shared catalog", async () => {
    const product = { title: "My custom metadata", ean: "12345678" };
    expect(await resolveProductForItem(product)).toEqual({ product, productEan: null });
    expect(fetchCatalog).not.toHaveBeenCalled();
  });

  it("looks up uncached barcodes with BarcodeNest and links the server-persisted result", async () => {
    maybeSingle.mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: { ean: 3017620422003 }, error: null });
    jest.mocked(fetchCatalog).mockResolvedValueOnce({
      barcode: "3017620422003", found: true, product: { name: "Nutella", brand: "Ferrero", image_url: null },
    });
    const result = await resolveProductForItem(undefined, "3017620422003");
    expect(result).toMatchObject({ productEan: "3017620422003", product: { title: "Nutella", brand: "Ferrero" } });
    expect(fetchCatalog).toHaveBeenCalledTimes(1);
    expect(fetchCatalog).toHaveBeenCalledWith({ provider: "barcodenest", code: "3017620422003" });
  });

  it("reads cached product data before spending a BarcodeNest lookup", async () => {
    const cached = { title: "Cached", ean: "12345678", images: ["https://img.example/c.jpg"] };
    maybeSingle.mockResolvedValueOnce({ data: { data: cached }, error: null });
    expect(await lookupProductByBarcode("1234-5678")).toEqual(cached);
    maybeSingle.mockResolvedValueOnce({ data: { data: { title: "No image", ean: "12345678", imageCheckedAt: new Date().toISOString() } }, error: null });
    expect(await lookupProductByBarcode("12345678")).toMatchObject({ title: "No image" });
    expect(fetchCatalog).not.toHaveBeenCalled();
  });

  it("re-runs image backups for cached products without an image", async () => {
    maybeSingle.mockResolvedValueOnce({ data: { data: { title: "Cached", ean: "12345678", description: "Kept" } }, error: null });
    jest.mocked(fetchCatalog).mockResolvedValueOnce({
      barcode: "12345678", found: true, product: { name: "Cached", image_url: "https://img.example/c.jpg" }, image_source: "upcitemdb",
    });
    expect(await lookupProductByBarcode("12345678")).toMatchObject({
      title: "Cached", description: "Kept", images: ["https://img.example/c.jpg"], imageSource: "upcitemdb",
    });
    maybeSingle.mockResolvedValueOnce({ data: { data: { title: "Cached", ean: "12345678" } }, error: null });
    jest.mocked(fetchCatalog).mockRejectedValueOnce(new Error("busy"));
    expect(await lookupProductByBarcode("12345678")).toEqual({ title: "Cached", ean: "12345678" });
  });

  it("does not link an unrelated or missing BarcodeNest result", async () => {
    jest.mocked(fetchCatalog).mockResolvedValueOnce({ barcode: "99999999", found: true, product: { name: "Wrong" } });
    expect(await resolveProductForItem(undefined, "12345678")).toEqual({ product: undefined, productEan: null });
    jest.mocked(fetchCatalog).mockResolvedValueOnce({ barcode: "12345678", found: false, product: null });
    expect(await lookupProductByBarcode("12345678")).toBeUndefined();
  });

  it("skips BarcodeNest for code lengths it cannot accept", async () => {
    expect(await lookupProductByBarcode("123456789")).toBeUndefined();
    expect(fetchCatalog).not.toHaveBeenCalled();
  });

  it("uses Barcode Lookup after an empty external search and surfaces its errors", async () => {
    jest.mocked(fetchCatalog).mockResolvedValueOnce({ code: "OK", items: [] })
      .mockRejectedValueOnce(new Error("Cannot save products"));
    await expect(fetchExternalProducts("book")).rejects.toThrow("Cannot save products");
  });

  it("surfaces cache read errors instead of pretending a record is absent", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: new Error("Read unavailable") });
    await expect(resolveProductForItem(undefined, "12345678")).rejects.toThrow("Read unavailable");
  });
});
