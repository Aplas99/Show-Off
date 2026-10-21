type ItemImageSource = {
  image_url?: string | null;
  image_urls?: (string | null | undefined)[] | null;
  products?: { data?: unknown } | null;
};

/**
 * Normalizes a stored image reference into a URL the native image loaders
 * will fetch. Legacy catalog rows (UPCItemDB, Barcode Lookup) often stored
 * `http://` images, which iOS ATS and Android cleartext rules block, so
 * those are upgraded to https. Anything else non-loadable is dropped.
 */
export function normalizeImageUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  if (/^http:\/\//i.test(trimmed)) return `https://${trimmed.slice(7)}`;
  if (/^(https:|file:|content:|data:image\/|blob:|ph:|assets-library:)/i.test(trimmed)) return trimmed;
  return null;
}

function productImages(products: ItemImageSource["products"]): unknown[] {
  let data = products?.data;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch {
      return [];
    }
  }
  const images = (data as { images?: unknown } | null | undefined)?.images;
  return Array.isArray(images) ? images : [];
}

/**
 * Ordered, de-duplicated gallery for an item: the user's own photos first
 * (the `image_url` cover, then `image_urls`), falling back to the linked
 * product's primary catalog image when the user never uploaded one.
 */
export function getItemImageUrls(item: ItemImageSource | null | undefined): string[] {
  if (!item) return [];
  const own = [item.image_url, ...(item.image_urls ?? [])];
  if (!own.some((value) => normalizeImageUrl(value))) {
    // Catalogs often carry a dozen retailer shots; show only the primary one
    // so the gallery doesn't look like photos the user added.
    const cover = productImages(item.products).map(normalizeImageUrl).find(Boolean);
    return cover ? [cover] : [];
  }
  const urls: string[] = [];
  for (const candidate of own) {
    const url = normalizeImageUrl(candidate);
    if (url && !urls.includes(url)) urls.push(url);
  }
  return urls;
}

/**
 * Whether the user uploaded a photo for this item (stored in our
 * `item-images` bucket), as opposed to only having a catalog image —
 * barcode items copy the catalog image into `image_url`.
 */
export function hasUploadedItemPhoto(item: ItemImageSource | null | undefined): boolean {
  if (!item) return false;
  return [item.image_url, ...(item.image_urls ?? [])].some((value) =>
    typeof value === "string" && /\/storage\/v1\/object\/(?:public|authenticated)\/item-images\//.test(value));
}

/** First displayable image for an item, or null. */
export function getItemCoverUrl(item: ItemImageSource | null | undefined): string | null {
  return getItemImageUrls(item)[0] ?? null;
}
