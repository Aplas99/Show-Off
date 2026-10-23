/**
 * Trading card games served through the shared TCG API pipeline
 * (tcg_cards / items.tcg_card_id, https://tcgapi.dev). Pokémon, Magic and
 * Riftbound have their own pipelines and are not listed here.
 *
 * `code` is the value stored in tcg_cards.game; keep it in sync with that
 * column's CHECK constraint. `slug` is the game's TCG API slug (`?game=`).
 */
export const TCG_GAMES = [
  { code: "ygo", name: "Yu-Gi-Oh!", slug: "yugioh" },
  { code: "op", name: "One Piece", slug: "one-piece-card-game" },
  { code: "lor", name: "Disney Lorcana", slug: "lorcana-tcg" },
  { code: "fab", name: "Flesh and Blood", slug: "flesh-and-blood-tcg" },
  { code: "dgm", name: "Digimon", slug: "digimon-card-game" },
  { code: "swu", name: "Star Wars: Unlimited", slug: "star-wars-unlimited" },
  { code: "dbs", name: "Dragon Ball Super: Fusion World", slug: "dragon-ball-super-fusion-world" },
  { code: "dbm", name: "Dragon Ball Super: Masters", slug: "dragon-ball-super-ccg" },
  { code: "cfv", name: "Cardfight!! Vanguard", slug: "cardfight-vanguard" },
  { code: "cpk", name: "Cyberpunk", slug: "cyberpunk-tcg" },
] as const;

export type TcgGameCode = (typeof TCG_GAMES)[number]["code"];

export const TCG_GAME_CODES = TCG_GAMES.map((game) => game.code) as [TcgGameCode, ...TcgGameCode[]];

export function isTcgGameCode(value: unknown): value is TcgGameCode {
  return typeof value === "string" && (TCG_GAME_CODES as readonly string[]).includes(value);
}

export function getTcgGameName(code: string | null | undefined): string {
  return TCG_GAMES.find((game) => game.code === code)?.name ?? "Trading card";
}

export function getTcgGameSlug(code: TcgGameCode): string {
  return TCG_GAMES.find((game) => game.code === code)!.slug;
}
