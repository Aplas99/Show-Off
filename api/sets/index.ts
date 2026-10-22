import { useQuery } from "@tanstack/react-query";

import { fetchScryfallApi, getMagicCardImageUrl } from "@/api/magic";
import { fetchAllCardsInSet } from "@/api/pokemon";
import { fetchRiftboundSetCards, getRiftboundCardImageUrl } from "@/api/riftbound";
import { fetchTcgSetRoster } from "@/api/tcg";
import { formatRiftboundCollectorNumber } from "@/constants/riftboundSets";
import { isTcgGameCode } from "@/constants/tcgGames";
import type { ItemGame } from "@/lib/itemCards";
import { scryfallSearchResponseSchema } from "@/lib/magicCatalog";

// Full set rosters for the Curator set-completion view, one shape for every
// game. Card ids match the item link columns (pokemon_tcg_card_id,
// magic_card_id, riftbound_card_id, tcg_card_id), so owned cards are found
// by id.

export interface RosterCard {
  id: string;
  name: string;
  /** Printed collector number, e.g. "4", "011/298", "LOB-005". */
  number: string | null;
  imageUrl: string | null;
}

const MAGIC_SET_CODE = /^[a-z0-9]{2,8}$/i;
// Scryfall returns 175 cards a page; the largest sets fit in well under 10.
const MAGIC_MAX_PAGES = 10;
const RIFTBOUND_MAX_PAGES = 10;

export function sortByCollectorNumber(cards: RosterCard[]) {
  return [...cards].sort((a, b) =>
    (a.number ?? "").localeCompare(b.number ?? "", undefined, { numeric: true, sensitivity: "base" }));
}

async function fetchMagicSetRoster(setCode: string): Promise<RosterCard[]> {
  if (!MAGIC_SET_CODE.test(setCode)) return [];
  const cards: RosterCard[] = [];
  for (let page = 1; page <= MAGIC_MAX_PAGES; page += 1) {
    // Every printing in the set, not one per name (Scryfall's default).
    const params = new URLSearchParams({ q: `e:${setCode.toLowerCase()} unique:prints order:set`, page: String(page) });
    const parsed = scryfallSearchResponseSchema.parse(await fetchScryfallApi(`/cards/search?${params}`));
    cards.push(...parsed.data.map((card) => ({
      id: card.id,
      name: card.name,
      number: card.collector_number ?? null,
      imageUrl: getMagicCardImageUrl(card, "small"),
    })));
    if (!parsed.has_more) break;
  }
  return cards;
}

async function fetchRiftboundSetRoster(setCode: string): Promise<RosterCard[]> {
  const cards: RosterCard[] = [];
  for (let page = 1; page <= RIFTBOUND_MAX_PAGES; page += 1) {
    const parsed = await fetchRiftboundSetCards(setCode.toLowerCase(), page);
    cards.push(...parsed.items.map((card) => ({
      id: card.id,
      name: card.name,
      number: formatRiftboundCollectorNumber(card.riftbound_id)
        ?? (card.collector_number != null ? String(card.collector_number) : null),
      imageUrl: getRiftboundCardImageUrl(card),
    })));
    if (page >= parsed.pages) break;
  }
  return cards;
}

export async function fetchSetRoster(game: ItemGame, setId: string): Promise<RosterCard[]> {
  if (game === "pokemon") {
    return (await fetchAllCardsInSet(setId)).map((card) => ({
      id: card.id,
      name: card.name,
      number: card.number,
      imageUrl: card.images.small ?? null,
    }));
  }
  if (game === "magic") return sortByCollectorNumber(await fetchMagicSetRoster(setId));
  if (game === "riftbound") return sortByCollectorNumber(await fetchRiftboundSetRoster(setId));
  if (!isTcgGameCode(game)) return [];
  return sortByCollectorNumber((await fetchTcgSetRoster(game, setId)).map((card) => ({
    id: card.id,
    name: card.name,
    number: card.card_number,
    imageUrl: card.image_url,
  })));
}

/**
 * Every card in one set. Rosters change rarely; keep them for a day so
 * reopening the view doesn't spend provider quota (PokéWallet's especially).
 */
export function useSetRoster(game: ItemGame | null, setId: string | null, enabled = true) {
  return useQuery({
    queryKey: ["set-roster", game, setId],
    queryFn: () => fetchSetRoster(game!, setId!),
    enabled: enabled && !!game && !!setId,
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    retry: false,
  });
}
