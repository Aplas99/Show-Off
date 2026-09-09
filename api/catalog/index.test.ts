import { CatalogRequestError, fetchCatalog } from "@/api/catalog";
import { supabase } from "@/lib/supabase";
import { FunctionsHttpError } from "@supabase/supabase-js";

jest.mock("@/lib/supabase", () => ({
  supabase: { functions: { invoke: jest.fn() } },
}));

const invoke = jest.mocked(supabase.functions.invoke);

describe("catalog client", () => {
  beforeEach(() => invoke.mockReset());

  it("invokes the authenticated proxy without vendor credentials", async () => {
    invoke.mockResolvedValue({ data: { products: [] }, error: null });
    await expect(fetchCatalog({ provider: "barcode", query: "book" }))
      .resolves.toEqual({ products: [] });
    expect(invoke).toHaveBeenCalledWith("catalog-proxy", {
      body: { provider: "barcode", query: "book", page: 1 },
    });
  });

  it("preserves HTTP status and actionable proxy errors", async () => {
    invoke.mockResolvedValue({ data: null, error: new FunctionsHttpError(new Response(
      JSON.stringify({ error: "Catalog request limit reached. Please try again later." }),
      { status: 429 },
    )) });
    await expect(fetchCatalog({ provider: "pokemon", path: "/cards/base1-4" }))
      .rejects.toMatchObject({ status: 429, message: "Catalog request limit reached. Please try again later." });
  });

  it("handles gateway and network errors without leaking their raw details", async () => {
    invoke.mockResolvedValueOnce({ data: null, error: new FunctionsHttpError(new Response(
      "internal gateway details", { status: 401 },
    )) });
    await expect(fetchCatalog({ provider: "pokemon", path: "/cards/base1-4" }))
      .rejects.toMatchObject({ status: 401, message: "Could not search the catalog. Please try again." });
    invoke.mockResolvedValueOnce({ data: null, error: new Error("private network details") });
    await expect(fetchCatalog({ provider: "pokemon", path: "/cards/base1-4" }))
      .rejects.toEqual(new CatalogRequestError(503, "Could not search the catalog. Please try again."));
  });
});
