import { z } from "zod";

/** Riftcodex IDs are opaque 24-char hex ObjectIds; Riftbound IDs look like `ogn-011-298`. */
export const RIFTCODEX_ID_PATTERN = /^[a-f0-9]{24}$/;
// Signature printings mark the number with `*` (e.g. `unl-229*-219`).
export const RIFTBOUND_ID_PATTERN = /^[a-z0-9]{2,10}(-[a-z0-9*]{1,10}){1,3}$/i;

export const riftboundCardSchema = z
  .object({
    id: z.string().regex(RIFTCODEX_ID_PATTERN),
    name: z.string().trim().min(1),
    riftbound_id: z.string().regex(RIFTBOUND_ID_PATTERN),
    tcgplayer_id: z.string().nullish(),
    collector_number: z.number().int().nullish(),
    attributes: z
      .object({
        energy: z.number().nullish(),
        might: z.number().nullish(),
        power: z.number().nullish(),
      })
      .passthrough()
      .nullish(),
    classification: z
      .object({
        type: z.string().nullish(),
        supertype: z.string().nullish(),
        rarity: z.string().nullish(),
        domain: z.array(z.string()).nullish(),
      })
      .passthrough()
      .nullish(),
    text: z
      .object({
        rich: z.string().nullish(),
        plain: z.string().nullish(),
        flavour: z.string().nullish(),
      })
      .passthrough()
      .nullish(),
    set: z.object({ set_id: z.string().min(1), label: z.string().nullish() }).passthrough(),
    media: z
      .object({
        image_url: z.string().nullish(),
        artist: z.string().nullish(),
        accessibility_text: z.string().nullish(),
      })
      .passthrough()
      .nullish(),
    tags: z.array(z.string()).nullish(),
    orientation: z.string().nullish(),
    metadata: z
      .object({
        clean_name: z.string().nullish(),
        updated_on: z.string().nullish(),
        alternate_art: z.boolean().nullish(),
        overnumbered: z.boolean().nullish(),
        signature: z.boolean().nullish(),
      })
      .passthrough()
      .nullish(),
  })
  .passthrough();

export type RiftboundCard = z.infer<typeof riftboundCardSchema>;

/** Paginated envelope used by `/cards`, `/cards/name`, and `/cards/search`. */
export const riftboundListResponseSchema = z.object({
  items: z.array(riftboundCardSchema).max(100),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  size: z.number().int().positive(),
  pages: z.number().int().nonnegative(),
});

/** `/cards/riftbound/{id}` matches partially and returns a bare array. */
export const riftboundCardArraySchema = z.array(riftboundCardSchema).max(100);

/** Only HTTPS images without embedded credentials are cached or displayed. */
export function getRiftboundCardImageUrl(card: RiftboundCard): string | null {
  const value = card.media?.image_url;
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.toString() : null;
  } catch {
    return null;
  }
}

export function riftboundCardToCacheRow(card: RiftboundCard) {
  return {
    id: card.id,
    riftbound_id: card.riftbound_id.toLowerCase(),
    name: card.name,
    tcgplayer_id: card.tcgplayer_id ?? null,
    collector_number: card.collector_number ?? null,
    card_type: card.classification?.type ?? null,
    supertype: card.classification?.supertype ?? null,
    rarity: card.classification?.rarity ?? null,
    domains: card.classification?.domain ?? [],
    energy: card.attributes?.energy ?? null,
    might: card.attributes?.might ?? null,
    power: card.attributes?.power ?? null,
    plain_text: card.text?.plain ?? null,
    set_code: card.set.set_id.toUpperCase(),
    set_name: card.set.label ?? null,
    artist: card.media?.artist ?? null,
    image_url: getRiftboundCardImageUrl(card),
    tags: card.tags ?? [],
    alternate_art: card.metadata?.alternate_art ?? false,
    overnumbered: card.metadata?.overnumbered ?? false,
    signature: card.metadata?.signature ?? false,
    raw_data: card,
    cached_at: new Date().toISOString(),
  };
}

/** Normalizes any of the three Riftcodex card response shapes to a card list. */
export function parseRiftboundCards(path: string, raw: unknown): RiftboundCard[] {
  if (path.startsWith("/cards/riftbound/")) return riftboundCardArraySchema.parse(raw);
  if (/^\/cards\/[a-f0-9]{24}$/.test(path)) return [riftboundCardSchema.parse(raw)];
  return riftboundListResponseSchema.parse(raw).items;
}
