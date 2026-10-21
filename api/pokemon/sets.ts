import { fetchCatalog } from "@/api/catalog";
import { POKEMON_TCG_SETS } from "@/constants/pokemonTcgSets";
import {
  mergePokemonTcgSets,
  type PokemonTcgSetRow,
  type PokemonTcgSetSummary,
} from "@/lib/pokemonCatalog";
import { supabase } from "@/lib/supabase";
import { useQuery } from "@tanstack/react-query";
import { cardScanDebug, cardScanError } from "./cardScanDebug";

/** Ask catalog-proxy to refresh the shared table once it is this old. */
const SET_LIST_REFRESH_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

interface StoredSetRow extends PokemonTcgSetRow {
  refreshed_at: string;
}

export interface PokemonSetSources {
  readRows: () => Promise<StoredSetRow[]>;
  refresh: () => Promise<void>;
  now?: () => number;
}

function isStale(rows: StoredSetRow[], now: number) {
  if (rows.length === 0) return true;
  const newest = Math.max(...rows.map((row) => Date.parse(row.refreshed_at) || 0));
  return now - newest > SET_LIST_REFRESH_AFTER_MS;
}

/**
 * Server sets merged over the bundled snapshot. Never throws: the scanner
 * must keep working on the bundled list when Supabase or the vendor is down.
 */
export async function resolvePokemonTcgSets(
  sources: PokemonSetSources,
): Promise<readonly PokemonTcgSetSummary[]> {
  const now = sources.now?.() ?? Date.now();
  let rows: StoredSetRow[];
  try {
    rows = await sources.readRows();
  } catch (error) {
    cardScanError("sets.read-failed", error);
    return POKEMON_TCG_SETS;
  }

  if (isStale(rows, now)) {
    try {
      await sources.refresh();
      rows = await sources.readRows();
      cardScanDebug("sets.refreshed", { count: rows.length });
    } catch (error) {
      // A stale list is still better than the bundled one alone.
      cardScanError("sets.refresh-failed", error);
    }
  }

  const merged = mergePokemonTcgSets(rows, POKEMON_TCG_SETS);
  cardScanDebug("sets.resolved", {
    serverCount: rows.length,
    bundledCount: POKEMON_TCG_SETS.length,
    mergedCount: merged.length,
  });
  return merged;
}

const supabaseSetSources: PokemonSetSources = {
  readRows: async () => {
    const { data, error } = await supabase
      .from("pokemon_tcg_sets")
      .select("id, name, ptcgo_code, printed_total, refreshed_at")
      .limit(1000);
    if (error) throw new Error(error.message);
    return (data ?? []) as StoredSetRow[];
  },
  refresh: async () => {
    await fetchCatalog({ provider: "pokemon", path: "/sets" });
  },
};

export const pokemonSetKeys = {
  all: ["pokemon", "sets"] as const,
};

/**
 * Set list for the scanner. Shows the bundled snapshot immediately and swaps
 * in the merged server list once loaded.
 */
export function usePokemonTcgSets() {
  return useQuery({
    queryKey: pokemonSetKeys.all,
    queryFn: () => resolvePokemonTcgSets(supabaseSetSources),
    placeholderData: POKEMON_TCG_SETS,
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: Infinity,
  });
}
