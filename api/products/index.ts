import { fetchCatalog } from "@/api/catalog";
import { getProductCode, normalizeProductCode, parseBarcodeProducts, parseUpcProducts, type CatalogProduct } from "@/lib/productCatalog";
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

/** Shared records are read-only here; all new records come from the proxy. */
export async function resolveProductForItem(product?: CatalogProduct | null, searchQuery?: string) {
  const code = getProductCode(product, searchQuery);
  if (!code) return { product, productEan: null };
  const existing = await findExistingProductEan(code);
  if (existing || product) return { product, productEan: existing };

  let products: CatalogProduct[] = [];
  try {
    products = await fetchFromUPCItemDB(code);
  } catch {
    // The shared free-tier budget can be exhausted; use the paid provider.
  }
  // Numeric searches must match the requested code, not an unrelated result.
  const matching = (items: CatalogProduct[]) => items.find((item) =>
    [item.ean, item.upc, item.isbn].some((value) => {
      const normalized = normalizeProductCode(value);
      return normalized?.replace(/^0+(?=\d)/, "") === code.replace(/^0+(?=\d)/, "");
    }),
  );
  let match = matching(products);
  if (!match) match = matching(await fetchFromBarcodeLookup(code));
  const matchCode = getProductCode(match);
  return { product: match, productEan: matchCode ? await findExistingProductEan(matchCode) : null };
}
