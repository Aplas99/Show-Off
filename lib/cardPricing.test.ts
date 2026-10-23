import {
  isPokemonPriceRedirect,
  isValidPriceCardId,
  pickTcgTrackingMarketPrice,
  tcgplayerIdFromUrl,
} from "@/lib/cardPricing";

const product = (prices: unknown[]) => ({ product: { product_id: 1 }, prices: { tcgplayer: prices } });

describe("card pricing helpers", () => {
  it("reads TCGplayer product ids from direct and redirect URLs", () => {
    expect(tcgplayerIdFromUrl("https://www.tcgplayer.com/product/556443")).toBe(556443);
    expect(tcgplayerIdFromUrl("https://tcgplayer.com/product/557921/magic-foundations-llanowar-elves")).toBe(557921);
    expect(tcgplayerIdFromUrl("https://tcgplayer.pxf.io/scrydex?u=https%3A%2F%2Ftcgplayer.com%2Fproduct%2F42382")).toBe(42382);
    expect(tcgplayerIdFromUrl("https://prices.pokemontcg.io/tcgplayer/base1-4")).toBeNull();
    expect(tcgplayerIdFromUrl(null)).toBeNull();
  });

  it("prefers the Normal finish, then falls back to the cheapest priced finish", () => {
    expect(pickTcgTrackingMarketPrice(product([
      { sub_type_name: "Foil", market_price: "0.81" },
      { sub_type_name: "Normal", market_price: "0.36" },
    ]))).toBe(0.36);
    expect(pickTcgTrackingMarketPrice(product([
      { sub_type_name: "Normal", market_price: null },
      { sub_type_name: "Holofoil", market_price: "12.00" },
    ]))).toBe(12);
    expect(pickTcgTrackingMarketPrice(product([
      { sub_type_name: "Galaxy Foil", market_price: "5" },
      { sub_type_name: "Cold Foil", market_price: "3" },
    ]))).toBe(3);
    expect(pickTcgTrackingMarketPrice(product([{ sub_type_name: "Normal", market_price: "0" }]))).toBeNull();
    expect(pickTcgTrackingMarketPrice({ product: { product_id: 1 }, prices: null })).toBeNull();
    expect(() => pickTcgTrackingMarketPrice({ success: false })).toThrow();
  });

  it("only follows pokemontcg.io's own price redirect", () => {
    expect(isPokemonPriceRedirect("https://prices.pokemontcg.io/tcgplayer/base1-4")).toBe(true);
    expect(isPokemonPriceRedirect("http://prices.pokemontcg.io/tcgplayer/base1-4")).toBe(false);
    expect(isPokemonPriceRedirect("https://evil.example/tcgplayer/base1-4")).toBe(false);
  });

  it("validates card ids per game", () => {
    expect(isValidPriceCardId("pokemon", "tcgtracking:123")).toBe(true);
    expect(isValidPriceCardId("magic", "6a0b230b-d391-4998-a3f7-7b158a0ec2cd")).toBe(true);
    expect(isValidPriceCardId("magic", "base1-4")).toBe(false);
    expect(isValidPriceCardId("riftbound", "69bc5bc7d308c64675ca86c1")).toBe(true);
    expect(isValidPriceCardId("ygo", "512345")).toBe(true);
    expect(isValidPriceCardId("ygo", "../x")).toBe(false);
  });
});
