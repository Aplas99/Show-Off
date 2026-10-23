import { fetchCatalog } from "@/api/catalog";
import { catalogProductSchema, getProductCode, normalizeProductCode, parseBarcodeNestProducts, parseBarcodeProducts, parseUpcProducts, productMatchesCode, type CatalogProduct } from "@/lib/productCatalog";
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

/** How long an imageless product waits before its image backups are retried. */
const IMAGE_RECHECK_MS = 7 * 24 * 60 * 60 * 1000;

function needsImageRecheck(product: CatalogProduct, now = Date.now()) {
  if (product.images?.length) return false;
  const checkedAt = product.imageCheckedAt ? Date.parse(product.imageCheckedAt) : NaN;
  return !Number.isFinite(checkedAt) || now - checkedAt > IMAGE_RECHECK_MS;
}

async function fetchBarcodeNestMatch(code: string) {
  // Numeric lookups must match the requested code, not an unrelated result.
  return (await fetchFromBarcodeNest(code)).find((item) => productMatchesCode(item, code));
}

/**
 * First step of barcode item creation: shared cache, then BarcodeNest (with
 * server-side image/product backups). The proxy persists matches, so repeat
 * scans don't spend credits. Cached products without an image re-run the
 * backups (at most weekly), since rows cached before the backups existed, or
 * from a busy backup, otherwise never get one.
 */
export async function lookupProductByBarcode(barcode: string): Promise<CatalogProduct | undefined> {
  const code = normalizeProductCode(barcode);
  if (!code) return undefined;
  const cached = await findCachedProduct(code);
  if (cached && !needsImageRecheck(cached)) return cached;
  if (!cached) return fetchBarcodeNestMatch(code);
  try {
    const fresh = await fetchBarcodeNestMatch(code);
    return fresh?.images?.length ? { ...cached, ...fresh } : cached;
  } catch {
    // The cached record is still a valid match without an image.
    return cached;
  }
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
