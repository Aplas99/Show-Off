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
  /** Where `images[0]` came from, for barcode lookups (BarcodeNest or a backup). */
  imageSource: z.enum(["barcodenest", "openlibrary", "upcitemdb"]).optional(),
  /** Set when every image backup came up empty, so repeat scans skip re-checking. */
  imageCheckedAt: z.string().optional(),
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
  image_source: z.enum(["barcodenest", "openlibrary", "upcitemdb"]).nullish(),
  image_checked_at: z.string().nullish(),
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

/**
 * A loadable https image URL, or undefined. `http://` is upgraded like
 * `normalizeImageUrl` does for display (native loaders block cleartext);
 * URLs carrying credentials are dropped.
 */
export function safeImageUrl(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  try {
    const url = new URL(/^http:\/\//i.test(trimmed) ? `https://${trimmed.slice(7)}` : trimmed);
    return url.protocol === "https:" && !url.username && !url.password ? url.toString() : undefined;
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
  const { barcode, found, product, image_source, image_checked_at } = parsed.data;
  const title = product?.name?.trim();
  if (!found || !title) return [];
  const image = safeImageUrl(product?.image_url);
  return [{
    title, ean: barcode, upc: barcode.length === 12 ? barcode : undefined,
    brand: product?.brand?.trim() || undefined, images: image ? [image] : undefined,
    imageSource: image ? image_source ?? "barcodenest" : undefined,
    imageCheckedAt: image ? undefined : image_checked_at ?? undefined,
  }];
}

/** BarcodeNest answered with no usable (named) product for the code. */
export function barcodeNestMissing(raw: unknown): boolean {
  const parsed = barcodeNestResponseSchema.safeParse(raw);
  return parsed.success && (!parsed.data.found || !parsed.data.product?.name?.trim());
}

/**
 * Open Library cover for an ISBN-13 barcode (978/979 prefix), or null. With
 * `default=false` a missing cover is a 404 rather than a blank image.
 */
export function openLibraryCoverUrl(code: string): string | null {
  if (!/^97[89]\d{10}$/.test(code)) return null;
  return `https://covers.openlibrary.org/b/isbn/${code}-L.jpg?default=false`;
}

/** A found, named BarcodeNest product with no usable image needs a fallback cover. */
export function barcodeNestNeedsImage(raw: unknown): boolean {
  const [product] = (() => { try { return parseBarcodeNestProducts(raw); } catch { return []; } })();
  return !!product && !product.images?.length;
}

type BarcodeImageSource = NonNullable<CatalogProduct["imageSource"]>;

/** Fills BarcodeNest's `product.image_url` so parsing and the client see the fallback. */
export function withBarcodeNestImage(raw: unknown, imageUrl: string, source: BarcodeImageSource = "openlibrary"): unknown {
  const parsed = barcodeNestResponseSchema.safeParse(raw);
  if (!parsed.success || !parsed.data.product) return raw;
  const body = raw as { product: Record<string, unknown> };
  return { ...body, product: { ...body.product, image_url: imageUrl }, image_source: source };
}

/** Replaces a BarcodeNest miss with a backup provider's product for the same code. */
export function withBarcodeNestProduct(code: string, product: CatalogProduct, source: BarcodeImageSource): unknown {
  const image = product.images?.map(safeImageUrl).find(Boolean);
  return {
    barcode: code, found: true,
    product: { name: product.title, brand: product.brand ?? null, image_url: image ?? null },
    image_source: image ? source : null,
  };
}

/** Marks a product whose image backups all came up empty. */
export function withBarcodeNestImageChecked(raw: unknown, checkedAt: string): unknown {
  const parsed = barcodeNestResponseSchema.safeParse(raw);
  if (!parsed.success) return raw;
  return { ...(raw as Record<string, unknown>), image_checked_at: checkedAt };
}

/** Whether a catalog product's code is `code`, ignoring leading zeroes. */
export function productMatchesCode(product: CatalogProduct, code: string): boolean {
  const target = code.replace(/^0+(?=\d)/, "");
  return [product.ean, product.upc, product.isbn].some((value) =>
    normalizeProductCode(value)?.replace(/^0+(?=\d)/, "") === target);
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
