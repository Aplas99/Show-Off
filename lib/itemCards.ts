import { TCG_GAMES, isTcgGameCode, type TcgGameCode } from "@/constants/tcgGames";

/** Every card game an item can link to: the dedicated pipelines plus constants/tcgGames.ts. */
export type ItemGame = "pokemon" | "magic" | "riftbound" | TcgGameCode;

/** Display order for game tabs. */
export const ITEM_GAMES: readonly { key: ItemGame; label: string }[] = [
  { key: "pokemon", label: "Pokémon" },
  { key: "magic", label: "Magic" },
  { key: "riftbound", label: "Riftbound" },
  ...TCG_GAMES.map((game) => ({ key: game.code, label: game.name })),
];

/** Item fields that identify a linked card (a structural subset of ItemWithProduct). */
export interface CardLinkedItem {
  pokemon_tcg_card_id?: string | null;
  magic_card_id?: string | null;
  riftbound_card_id?: string | null;
  tcg_card_id?: string | null;
  tcgGame?: string | null;
}

export function getItemCardId(item: CardLinkedItem): string | null {
  return item.pokemon_tcg_card_id || item.magic_card_id || item.riftbound_card_id || item.tcg_card_id || null;
}

export function isCardItem(item: CardLinkedItem): boolean {
  return getItemCardId(item) !== null;
}

export function getItemGame(item: CardLinkedItem): ItemGame | null {
  if (item.pokemon_tcg_card_id) return "pokemon";
  if (item.magic_card_id) return "magic";
  if (item.riftbound_card_id) return "riftbound";
  if (item.tcg_card_id && isTcgGameCode(item.tcgGame)) return item.tcgGame;
  return null;
}
