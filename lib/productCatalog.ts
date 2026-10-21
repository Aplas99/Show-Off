import { z } from "zod";

export const catalogProductSchema = z.object({
  title: z.string().trim().min(1),
  brand: z.string().optional(),
  description: z.string().optional(),
  images: z.array(z.string()).optional(),
  ean: z.string().optional(),
  upc: z.string().optional(),
  isbn: z.string().optional(),
  category: z.string().optional(),
  model: z.string().optional(),
  color: z.string().optional(),
  manufacturer: z.string().optional(),
  price: z.number().finite().nonnegative().optional(),
});
export type CatalogProduct = z.infer<typeof catalogProductSchema>;

const barcodeProductSchema = z.object({
  title: z.string().trim().min(1),
  barcode_number: z.string().trim().min(1),
  images: z.array(z.string()).nullish(),
  description: z.string().nullish(),
  brand: z.string().nullish(),
  manufacturer: z.string().nullish(),
  category: z.string().nullish(),
  stores: z.array(z.object({ price: z.union([z.string(), z.number()]).nullish() })).nullish(),
});

const upcProductSchema = z.object({
  title: z.string().trim().min(1),
  ean: z.string().nullish(),
  upc: z.string().nullish(),
  isbn: z.string().nullish(),
  images: z.array(z.string()).nullish(),
  description: z.string().nullish(),
  brand: z.string().nullish(),
  lowest_recorded_price: z.union([z.string(), z.number()]).nullish(),
});

const barcodeNestResponseSchema = z.object({
  barcode: z.string().regex(/^\d{8,14}$/),
  found: z.boolean(),
  product: z.object({
    name: z.string().nullish(),
    brand: z.string().nullish(),
    image_url: z.string().nullish(),
  }).nullish(),
});

function price(value: string | number | null | undefined) {
  if (value == null || String(value).trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

export function parseBarcodeProducts(raw: unknown): CatalogProduct[] {
  const { products } = z.object({ products: z.array(z.unknown()).max(1000) }).parse(raw);
  return products.flatMap((value) => {
    const parsed = barcodeProductSchema.safeParse(value);
    if (!parsed.success) return [];
    const item = parsed.data;
    return [{
      title: item.title, ean: item.barcode_number, upc: item.barcode_number,
      images: item.images ?? undefined, description: item.description ?? undefined,
      brand: item.brand ?? undefined, manufacturer: item.manufacturer ?? undefined,
      category: item.category ?? undefined, price: price(item.stores?.[0]?.price),
    }];
  });
}

export function parseUpcProducts(raw: unknown): CatalogProduct[] {
  const { items } = z.object({ code: z.literal("OK"), items: z.array(z.unknown()).max(1000) }).parse(raw);
  return items.flatMap((value) => {
    const parsed = upcProductSchema.safeParse(value);
    if (!parsed.success) return [];
    const item = parsed.data;
    return [{
      title: item.title, ean: item.ean ?? undefined, upc: item.upc ?? undefined,
      isbn: item.isbn ?? undefined, images: item.images ?? undefined,
      description: item.description ?? undefined, brand: item.brand ?? undefined,
      price: price(item.lowest_recorded_price),
    }];
  });
}

function httpsImage(value: string | null | undefined) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? [url.toString()] : undefined;
  } catch {
    return undefined;
  }
}

/** BarcodeNest returns one product per code; not-found and nameless records yield none. */
export function parseBarcodeNestProducts(raw: unknown): CatalogProduct[] {
  const parsed = barcodeNestResponseSchema.safeParse(raw);
  if (!parsed.success) {
    if (z.object({ found: z.literal(false) }).safeParse(raw).success) return [];
    throw parsed.error;
  }
  const { barcode, found, product } = parsed.data;
  const title = product?.name?.trim();
  if (!found || !title) return [];
  return [{
    title, ean: barcode, upc: barcode.length === 12 ? barcode : undefined,
    brand: product?.brand?.trim() || undefined, images: httpsImage(product?.image_url),
  }];
}

/** The existing database key is BIGINT; retain leading zeroes in product data. */
export function normalizeProductCode(value?: string | null): string | null {
  const normalized = value?.replace(/[\s-]/g, "");
  if (!normalized || !/^\d{8,14}$/.test(normalized) || /^0+$/.test(normalized)) return null;
  return normalized;
}

export function getProductCode(product?: CatalogProduct | null, fallback?: string | null) {
  return normalizeProductCode(product?.ean) ?? normalizeProductCode(product?.upc)
    ?? normalizeProductCode(product?.isbn) ?? normalizeProductCode(fallback);
}

export function productsToCacheRows(products: CatalogProduct[]) {
  const rows = new Map<string, {
    ean: string; data: CatalogProduct; searchableTitle: string;
    searchableDescription: string; searchableBrand: string;
  }>();
  for (const input of products) {
    const product = catalogProductSchema.parse(input);
    const code = getProductCode(product);
    if (!code) continue;
    const ean = code.replace(/^0+(?=\d)/, "");
    rows.set(ean, {
      ean, data: { ...product, ean: code }, searchableTitle: product.title,
      searchableDescription: product.description ?? "",
      searchableBrand: product.brand || product.manufacturer || "",
    });
  }
  return [...rows.values()];
}

export function upcRetryDelay(headers: Headers, now = Date.now()) {
  const reset = Number(headers.get("X-RateLimit-Reset"));
  const retry = Number(headers.get("Retry-After"));
  return Math.min(86400, Math.max(60,
    Number.isFinite(reset) ? Math.ceil(reset - now / 1000) : 0,
    Number.isFinite(retry) ? Math.ceil(retry) : 0,
  ));
}
