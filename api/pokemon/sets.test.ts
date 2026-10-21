import { resolvePokemonTcgSets } from "@/api/pokemon/sets";
import { POKEMON_TCG_SETS } from "@/constants/pokemonTcgSets";

jest.mock("@/lib/supabase", () => ({ supabase: {} }));
jest.mock("@/api/catalog", () => ({ fetchCatalog: jest.fn() }));

const NOW = Date.parse("2026-10-21T12:00:00Z");
const freshRow = {
  id: "me5",
  name: "Future Set",
  ptcgo_code: "FUT",
  printed_total: 120,
  refreshed_at: "2026-10-20T12:00:00Z",
};

describe("resolvePokemonTcgSets", () => {
  it("adds server-only sets to the bundled list without refreshing fresh data", async () => {
    const refresh = jest.fn();
    const sets = await resolvePokemonTcgSets({
      readRows: async () => [freshRow],
      refresh,
      now: () => NOW,
    });
    expect(refresh).not.toHaveBeenCalled();
    expect(sets[0]).toEqual({ id: "me5", name: "Future Set", code: "FUT", printedTotal: 120 });
    expect(sets).toHaveLength(POKEMON_TCG_SETS.length + 1);
  });

  it("lets server rows correct bundled sets", async () => {
    const bundled = POKEMON_TCG_SETS[0];
    const sets = await resolvePokemonTcgSets({
      readRows: async () => [{ ...freshRow, id: bundled.id, name: bundled.name, printed_total: 999 }],
      refresh: jest.fn(),
      now: () => NOW,
    });
    expect(sets.filter((set) => set.id === bundled.id)).toEqual([
      { id: bundled.id, name: bundled.name, code: "FUT", printedTotal: 999 },
    ]);
    expect(sets).toHaveLength(POKEMON_TCG_SETS.length);
  });

  it("refreshes an empty or week-old table, then re-reads it", async () => {
    const readRows = jest.fn()
      .mockResolvedValueOnce([{ ...freshRow, refreshed_at: "2026-10-01T00:00:00Z" }])
      .mockResolvedValueOnce([freshRow]);
    const refresh = jest.fn().mockResolvedValue(undefined);
    const sets = await resolvePokemonTcgSets({ readRows, refresh, now: () => NOW });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(readRows).toHaveBeenCalledTimes(2);
    expect(sets.some((set) => set.id === "me5")).toBe(true);
  });

  it("keeps the stale rows when the refresh fails", async () => {
    const stale = { ...freshRow, refreshed_at: "2026-09-01T00:00:00Z" };
    const sets = await resolvePokemonTcgSets({
      readRows: async () => [stale],
      refresh: jest.fn().mockRejectedValue(new Error("vendor down")),
      now: () => NOW,
    });
    expect(sets.some((set) => set.id === "me5")).toBe(true);
  });

  it("falls back to the bundled list when the table cannot be read", async () => {
    const sets = await resolvePokemonTcgSets({
      readRows: jest.fn().mockRejectedValue(new Error("offline")),
      refresh: jest.fn(),
      now: () => NOW,
    });
    expect(sets).toBe(POKEMON_TCG_SETS);
  });
});
