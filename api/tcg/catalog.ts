import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as FileSystem from "expo-file-system/legacy";
import { z } from "zod";

/**
 * Generic multi-game trading card catalog client, backed by
 * https://openapi.tcgtracking.com/v1 (the same provider already used for
 * Pokémon in api/pokemon/tcgTracking.ts, but that module is scoped to
 * Pokémon's card shape). This one is intentionally game-agnostic —
 * Magic and Yu-Gi-Oh today, any future category works the same way.
 */

export const TCG_CATEGORIES = {
  magic: { id: 1, label: "Magic: The Gathering" },
  yugioh: { id: 2, label: "Yu-Gi-Oh!" },
} as const;

export type TcgGameKey = keyof typeof TCG_CATEGORIES;

const TCG_TRACKING_URL = "https://openapi.tcgtracking.com/v1";

// Standard trading card size (63mm x 88mm) — same physical ratio Magic,
// Yu-Gi-Oh, and Pokémon all use.
const CARD_ASPECT_RATIO = 63 / 88;

// The live /v1/scan endpoint rejects images over 100KB (confirmed against
// the real API — not documented). Degrade width/quality until under budget.
const SCAN_IMAGE_MAX_BYTES = 100 * 1024;
const SCAN_IMAGE_ATTEMPTS: { width: number; compress: number }[] = [
  { width: 600, compress: 0.7 },
  { width: 450, compress: 0.5 },
  { width: 350, compress: 0.35 },
  { width: 280, compress: 0.25 },
];

const tcgSetSchema = z.object({
  id: z.number(),
  name: z.string(),
  abbreviation: z.string().nullable().optional(),
  published_on: z.string().nullable().optional(),
  product_count: z.number().optional(),
});

const tcgSetSearchSchema = z.object({
  sets: z.array(tcgSetSchema),
});

const tcgProductSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    number: z.string().nullable().optional(),
    rarity: z.string().nullable().optional(),
    image_url: z.string().nullable().optional(),
    tcgplayer_url: z.string().nullable().optional(),
  })
  .passthrough();

const tcgCardsResponseSchema = z.object({
  set_id: z.number(),
  set_name: z.string(),
  set_abbr: z.string().nullable().optional(),
  set_released: z.string().nullable().optional(),
  products: z.array(tcgProductSchema),
});

const tcgProductDetailSchema = z.object({
  success: z.boolean(),
  product: z
    .object({
      product_id: z.number(),
      category_id: z.number(),
      group_id: z.number(),
      name: z.string(),
      image_url: z.string().nullable().optional(),
      ext_number: z.string().nullable().optional(),
      ext_rarity: z.string().nullable().optional(),
      market_price: z.union([z.string(), z.number()]).nullable().optional(),
      url: z.string().nullable().optional(),
    })
    .passthrough(),
});

const tcgScanResultSchema = z.object({
  product_id: z.number(),
  score: z.number(),
  name: z.string(),
  number: z.string().nullable().optional(),
  printing: z.string().nullable().optional(),
  set_id: z.number(),
});

const tcgScanResponseSchema = z.object({
  success: z.boolean(),
  error: z.string().optional(),
  results: z.array(tcgScanResultSchema).optional(),
  candidates_scanned: z.number().optional(),
});

export interface TcgSet {
  id: number;
  name: string;
  abbreviation: string | null;
}

export interface TcgCard {
  /** `tcg:{categoryId}:{productId}` — globally unique across every game. */
  id: string;
  gameCategoryId: number;
  gameName: string;
  productId: number;
  name: string;
  number: string | null;
  rarity: string | null;
  setId: number;
  setName: string;
  imageUrl: string | null;
  tcgplayerUrl: string | null;
  /** Only populated by getTcgProductDetail — the set/cards list endpoint doesn't include pricing. */
  marketPrice: number | null;
}

export interface TcgScanResult {
  productId: number;
  score: number;
  name: string;
  number: string | null;
  setId: number;
}

export function buildTcgCardId(categoryId: number, productId: number) {
  return `tcg:${categoryId}:${productId}`;
}

async function fetchJson(path: string) {
  const response = await fetch(`${TCG_TRACKING_URL}${path}`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`TCGTracking API error: ${response.status}`);
  }
  return response.json();
}

export async function searchTcgSets(
  categoryId: number,
  query: string,
): Promise<TcgSet[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const raw = await fetchJson(
    `/${categoryId}/search?q=${encodeURIComponent(trimmed)}`,
  );
  return tcgSetSearchSchema.parse(raw).sets.map((set) => ({
    id: set.id,
    name: set.name,
    abbreviation: set.abbreviation ?? null,
  }));
}

export async function getTcgSetCards(
  categoryId: number,
  setId: number,
  gameName: string,
): Promise<TcgCard[]> {
  const raw = await fetchJson(`/${categoryId}/sets/${setId}/cards`);
  const parsed = tcgCardsResponseSchema.parse(raw);

  return parsed.products.map((product) => ({
    id: buildTcgCardId(categoryId, product.id),
    gameCategoryId: categoryId,
    gameName,
    productId: product.id,
    name: product.name,
    number: product.number ?? null,
    rarity: product.rarity ?? null,
    setId: parsed.set_id,
    setName: parsed.set_name,
    imageUrl: product.image_url ?? null,
    tcgplayerUrl: product.tcgplayer_url ?? null,
    marketPrice: null,
  }));
}

/**
 * Hydrates a single product with full detail, including live market
 * price — the set/cards list endpoint doesn't return pricing, so this is
 * called once, at the moment a user actually selects/confirms a card
 * (browse selection or scan-result pick), not for every row in a list.
 */
export async function getTcgProductDetail(
  categoryId: number,
  productId: number,
  gameName: string,
  fallbackSetName?: string,
): Promise<TcgCard> {
  const raw = await fetchJson(`/products/${productId}`);
  const parsed = tcgProductDetailSchema.parse(raw);
  const product = parsed.product;
  const marketPriceRaw = product.market_price;
  const marketPrice =
    marketPriceRaw != null && marketPriceRaw !== "" ? Number(marketPriceRaw) : null;

  return {
    id: buildTcgCardId(categoryId, product.product_id),
    gameCategoryId: categoryId,
    gameName,
    productId: product.product_id,
    name: product.name,
    number: product.ext_number ?? null,
    rarity: product.ext_rarity ?? null,
    setId: product.group_id,
    setName: fallbackSetName ?? "",
    imageUrl: product.image_url ?? null,
    tcgplayerUrl: product.url ?? null,
    marketPrice:
      marketPrice != null && !Number.isNaN(marketPrice) ? marketPrice : null,
  };
}

/** Centered card-shaped crop, same geometry as the Pokémon OCR pipeline. */
function calculateCardCrop(imageWidth: number, imageHeight: number) {
  const cropWidth = Math.min(imageWidth * 0.9, imageHeight * CARD_ASPECT_RATIO);
  const cropHeight = cropWidth / CARD_ASPECT_RATIO;
  return {
    originX: Math.max(0, Math.round((imageWidth - cropWidth) / 2)),
    originY: Math.max(0, Math.round((imageHeight - cropHeight) / 2)),
    width: Math.round(cropWidth),
    height: Math.round(cropHeight),
  };
}

/**
 * Crops to a card-shaped region and compresses under the /v1/scan
 * endpoint's undocumented 100KB limit, degrading width/quality until it
 * fits. Throws if even the smallest attempt doesn't fit (shouldn't
 * happen in practice for a cropped card photo).
 */
async function prepareTcgScanImage(imageUri: string): Promise<string> {
  const original = await ImageManipulator.manipulate(imageUri).renderAsync();
  const crop = calculateCardCrop(original.width, original.height);

  for (const attempt of SCAN_IMAGE_ATTEMPTS) {
    const context = ImageManipulator.manipulate(imageUri);
    context.crop(crop).resize({ width: Math.min(attempt.width, crop.width), height: null });
    const rendered = await context.renderAsync();
    const saved = await rendered.saveAsync({
      compress: attempt.compress,
      format: SaveFormat.JPEG,
    });

    const info = await FileSystem.getInfoAsync(saved.uri);
    if (info.exists && typeof info.size === "number" && info.size <= SCAN_IMAGE_MAX_BYTES) {
      return saved.uri;
    }
  }

  throw new Error("Could not compress card image small enough to scan.");
}

/**
 * Uploads a captured photo to TCGTracking's image-to-product matching
 * endpoint, scoped to one game category. Returns a ranked list of
 * candidate matches (empty if nothing scored well) — callers should
 * present the top few for confirmation rather than auto-accepting,
 * since match quality is inherently less certain than a dedicated
 * per-game OCR pipeline.
 */
export async function scanTcgCardImage(
  categoryId: number,
  imageUri: string,
): Promise<TcgScanResult[]> {
  const preparedUri = await prepareTcgScanImage(imageUri);

  const formData = new FormData();
  formData.append("game_id", String(categoryId));
  formData.append("image", {
    uri: preparedUri,
    name: "card.jpg",
    type: "image/jpeg",
  } as any);

  const response = await fetch(`${TCG_TRACKING_URL}/scan`, {
    method: "POST",
    body: formData,
  });
  const raw = await response.json();
  const parsed = tcgScanResponseSchema.parse(raw);

  if (!parsed.success) {
    throw new Error(parsed.error || "Card scan failed");
  }

  return (parsed.results ?? []).map((result) => ({
    productId: result.product_id,
    score: result.score,
    name: result.name,
    number: result.number ?? null,
    setId: result.set_id,
  }));
}
