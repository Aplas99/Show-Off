import { fetchCatalog } from "@/api/catalog";
import { catalogProductSchema, getProductCode, normalizeProductCode, parseBarcodeNestProducts, parseBarcodeProducts, parseUpcProducts, type CatalogProduct } from "@/lib/productCatalog";
import { supabase } from "@/lib/supabase";

export async function fetchFromBarcodeLookup(
  query: string,
  page = 1,
  filters?: { brand?: string; manufacturer?: string; category?: string },
) {
  return parseBarcodeProducts(await fetchCatalog({
    provider: "barcode", query: query.replace(/\s+/g, " ").trim(), page,
    brand: filters?.brand, manufacturer: filters?.manufacturer, category: filters?.category,
  }));
}

export async function fetchFromUPCItemDB(query: string) {
  return parseUpcProducts(await fetchCatalog({ provider: "upc", query: query.replace(/\s+/g, " ").trim() }));
}

/** Exact barcode lookup; BarcodeNest only accepts GTIN-8/12/13/14 lengths. */
export async function fetchFromBarcodeNest(code: string) {
  if (!/^(\d{8}|\d{12,14})$/.test(code)) return [];
  return parseBarcodeNestProducts(await fetchCatalog({ provider: "barcodenest", code }));
}

export async function fetchExternalProducts(query: string) {
  try {
    const products = await fetchFromUPCItemDB(query);
    if (products.length > 0) return products;
  } catch {
    // A shared trial limit must not disable the existing paid fallback.
  }
  return fetchFromBarcodeLookup(query);
}

async function findExistingProductEan(code: string): Promise<string | null> {
  const { data, error } = await supabase.from("products").select("ean").eq("ean", code).maybeSingle();
  if (error) throw error;
  return data ? String(data.ean) : null;
}

async function findCachedProduct(code: string): Promise<CatalogProduct | undefined> {
  const { data, error } = await supabase.from("products").select("data").eq("ean", code).maybeSingle();
  if (error) throw error;
  const parsed = catalogProductSchema.safeParse(data?.data);
  return parsed.success ? parsed.data : undefined;
}

/**
 * First step of barcode item creation: shared cache, then BarcodeNest. The
 * proxy persists BarcodeNest matches, so repeat scans don't spend credits.
 */
export async function lookupProductByBarcode(barcode: string): Promise<CatalogProduct | undefined> {
  const code = normalizeProductCode(barcode);
  if (!code) return undefined;
  const cached = await findCachedProduct(code);
  if (cached) return cached;
  // Numeric lookups must match the requested code, not an unrelated result.
  return (await fetchFromBarcodeNest(code)).find((item) =>
    [item.ean, item.upc, item.isbn].some((value) => {
      const normalized = normalizeProductCode(value);
      return normalized?.replace(/^0+(?=\d)/, "") === code.replace(/^0+(?=\d)/, "");
    }),
  );
}

/** Shared records are read-only here; all new records come from the proxy. */
export async function resolveProductForItem(product?: CatalogProduct | null, searchQuery?: string) {
  const code = getProductCode(product, searchQuery);
  if (!code) return { product, productEan: null };
  const existing = await findExistingProductEan(code);
  if (existing || product) return { product, productEan: existing };

  const match = await lookupProductByBarcode(code);
  const matchCode = getProductCode(match);
  return { product: match, productEan: matchCode ? await findExistingProductEan(matchCode) : null };
}
