import { fetchCatalog } from "@/api/catalog";
import { supabase } from "@/lib/supabase";
import { fetchExternalProducts, resolveProductForItem } from "./index";

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

  it("falls back on a free-tier failure and links the server-persisted result", async () => {
    maybeSingle.mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: { ean: 12345678 }, error: null });
    jest.mocked(fetchCatalog).mockRejectedValueOnce(new Error("trial cap"))
      .mockResolvedValueOnce({ products: [{ title: "Found", barcode_number: "12345678" }] });
    const result = await resolveProductForItem(undefined, "12345678");
    expect(result).toMatchObject({ productEan: "12345678", product: { title: "Found" } });
    expect(fetchCatalog).toHaveBeenNthCalledWith(1, { provider: "upc", query: "12345678" });
    expect(fetchCatalog).toHaveBeenNthCalledWith(2, expect.objectContaining({ provider: "barcode", query: "12345678" }));
  });

  it("does not link an unrelated result from a numeric search", async () => {
    jest.mocked(fetchCatalog).mockResolvedValueOnce({ code: "OK", items: [{ title: "Wrong", ean: "99999999" }] })
      .mockResolvedValueOnce({ products: [] });
    expect(await resolveProductForItem(undefined, "12345678")).toEqual({ product: undefined, productEan: null });
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
