import { z } from "zod";

const scryfallImageUrisSchema = z
  .object({
    small: z.string().optional(),
    normal: z.string().optional(),
    large: z.string().optional(),
    png: z.string().optional(),
    art_crop: z.string().optional(),
    border_crop: z.string().optional(),
  })
  .passthrough();

const scryfallCardFaceSchema = z
  .object({
    name: z.string(),
    mana_cost: z.string().optional(),
    type_line: z.string().optional(),
    oracle_text: z.string().optional(),
    image_uris: scryfallImageUrisSchema.optional(),
  })
  .passthrough();

const scryfallPricesSchema = z
  .object({
    usd: z.string().nullable().optional(),
    usd_foil: z.string().nullable().optional(),
  })
  .passthrough();

export const magicCardSchema = z
  .object({
    id: z.string().min(1),
    oracle_id: z.string().optional(),
    name: z.string().min(1),
    mana_cost: z.string().optional(),
    cmc: z.number().optional(),
    type_line: z.string().optional(),
    oracle_text: z.string().optional(),
    colors: z.array(z.string()).optional().default([]),
    color_identity: z.array(z.string()).optional().default([]),
    rarity: z.string().optional(),
    set: z.string().optional(),
    set_name: z.string().optional(),
    collector_number: z.string().optional(),
    artist: z.string().optional(),
    image_uris: scryfallImageUrisSchema.optional(),
    card_faces: z.array(scryfallCardFaceSchema).optional(),
    prices: scryfallPricesSchema.optional(),
  })
  .passthrough();

export const scryfallSearchResponseSchema = z.object({
  object: z.literal("list"),
  total_cards: z.number().optional(),
  has_more: z.boolean().optional(),
  data: z.array(magicCardSchema),
});

export type MagicCard = z.infer<typeof magicCardSchema>;

/** DFCs (double-faced cards) have no top-level `image_uris` — fall back to the front face. */
export function getMagicCardImageUrl(
  card: MagicCard,
  size: "small" | "normal" = "normal",
): string | null {
  return (
    card.image_uris?.[size] ?? card.card_faces?.[0]?.image_uris?.[size] ?? null
  );
}

export function getMagicCardPrice(card: MagicCard): number | null {
  const usd = card.prices?.usd ?? card.prices?.usd_foil;
  if (!usd) return null;
  const parsed = Number(usd);
  return Number.isFinite(parsed) ? parsed : null;
}

export function getMagicCardTypeLine(card: MagicCard): string | null {
  return card.type_line ?? card.card_faces?.[0]?.type_line ?? null;
}

export function magicCardToCacheRow(card: MagicCard) {
  const priceUsd = card.prices?.usd ? Number(card.prices.usd) : null;
  const priceUsdFoil = card.prices?.usd_foil ? Number(card.prices.usd_foil) : null;

  return {
    id: card.id,
    oracle_id: card.oracle_id ?? null,
    name: card.name,
    mana_cost: card.mana_cost ?? null,
    cmc: card.cmc ?? null,
    type_line: getMagicCardTypeLine(card),
    oracle_text: card.oracle_text ?? card.card_faces?.[0]?.oracle_text ?? null,
    colors: card.colors,
    color_identity: card.color_identity,
    rarity: card.rarity ?? null,
    set_code: card.set ?? null,
    set_name: card.set_name ?? null,
    collector_number: card.collector_number ?? null,
    artist: card.artist ?? null,
    image_small: getMagicCardImageUrl(card, "small"),
    image_normal: getMagicCardImageUrl(card, "normal"),
    price_usd: Number.isFinite(priceUsd) ? priceUsd : null,
    price_usd_foil: Number.isFinite(priceUsdFoil) ? priceUsdFoil : null,
    raw_data: card,
    cached_at: new Date().toISOString(),
  };
}

