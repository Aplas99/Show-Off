import type { PokemonTcgCard } from "./index";

const developmentBuild = typeof __DEV__ !== "undefined" && __DEV__;
let enabled =
  developmentBuild && process.env.EXPO_PUBLIC_CARD_SCAN_DEBUG !== "false";

export function setCardScanDebugEnabled(value: boolean) {
  enabled = developmentBuild && value;
}

export function isCardScanDebugEnabled() {
  return enabled;
}

export function summarizePokemonCard(card: PokemonTcgCard) {
  const prices = card.tcgplayer?.prices ?? {};
  const marketPrices = Object.entries(prices)
    .map(([variant, price]) => ({ variant, market: price.market ?? null }))
    .filter((price) => price.market !== null);

  return {
    id: card.id,
    name: card.name,
    set: card.set.name,
    setId: card.set.id,
    number: card.number,
    rarity: card.rarity ?? null,
    source: typeof card.source === "string" ? card.source : "pokemon-tcg",
    marketPrices,
  };
}

export function cardScanDebug(
  event: string,
  details?: Record<string, unknown>,
) {
  if (!enabled) return;
  if (details) {
    console.log(`[CardScan] ${event}`, details);
  } else {
    console.log(`[CardScan] ${event}`);
  }
}

export function cardScanError(event: string, error: unknown) {
  console.error(`[CardScan] ${event}`, {
    message: error instanceof Error ? error.message : String(error),
  });
}
