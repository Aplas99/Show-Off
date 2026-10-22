/**
 * Trading card games served through the shared PokéWallet pipeline
 * (tcg_cards / items.tcg_card_id). Pokémon, Magic and Riftbound have their
 * own pipelines and are not listed here.
 *
 * `code` is PokéWallet's path prefix (`/ygo/search`) and the value stored in
 * tcg_cards.game; keep it in sync with that column's CHECK constraint.
 */
export const TCG_GAMES = [
  { code: "ygo", name: "Yu-Gi-Oh!" },
  { code: "op", name: "One Piece" },
  { code: "lor", name: "Disney Lorcana" },
  { code: "fab", name: "Flesh and Blood" },
  { code: "dgm", name: "Digimon" },
  { code: "swu", name: "Star Wars: Unlimited" },
  { code: "dbs", name: "Dragon Ball Super" },
  { code: "cfv", name: "Cardfight!! Vanguard" },
  { code: "cpk", name: "Cyberpunk" },
] as const;

export type TcgGameCode = (typeof TCG_GAMES)[number]["code"];

export const TCG_GAME_CODES = TCG_GAMES.map((game) => game.code) as [TcgGameCode, ...TcgGameCode[]];

export function isTcgGameCode(value: unknown): value is TcgGameCode {
  return typeof value === "string" && (TCG_GAME_CODES as readonly string[]).includes(value);
}

export function getTcgGameName(code: string | null | undefined): string {
  return TCG_GAMES.find((game) => game.code === code)?.name ?? "Trading card";
}
