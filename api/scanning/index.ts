import { supabase } from "@/lib/supabase";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

/**
 * Shared daily scan quota — covers both the Pokémon TCG camera scanner
 * and the barcode scanner, since both draw from the same per-user daily
 * counter (`scan_usage` / the `record_scan_attempt` RPC don't
 * distinguish scan type). Free ("Collector") users get 10/day plus
 * optional rewarded-ad bonuses; Curator members are unlimited.
 */
export interface ScanQuotaStatus {
  isCurator: boolean;
  remaining: number | null;
  dailyLimit: number | null;
}

const scanQuotaKeys = {
  status: () => ["scanQuota", "status"] as const,
};

function mapStatusRow(row: {
  is_curator: boolean;
  remaining: number | null;
  daily_limit: number | null;
}): ScanQuotaStatus {
  return {
    isCurator: row.is_curator,
    remaining: row.remaining,
    dailyLimit: row.daily_limit,
  };
}

/**
 * Read-only scan quota status (doesn't consume a scan) — for rendering
 * "N scans left today" and disabling capture once exhausted.
 */
export function useScanQuotaStatus() {
  return useQuery({
    queryKey: scanQuotaKeys.status(),
    queryFn: async (): Promise<ScanQuotaStatus> => {
      const { data, error } = await supabase
        .rpc("get_scan_quota_status")
        .single();
      if (error) throw new Error(error.message);
      return mapStatusRow(data as any);
    },
    staleTime: 30 * 1000,
  });
}

/**
 * Atomically checks and consumes one scan. Call once per scan attempt
 * (one Pokémon card capture, or one successfully-decoded barcode) — not
 * per camera frame. Curator users always pass (isCurator: true,
 * remaining/dailyLimit: null = unlimited).
 */
export function useRecordScanAttempt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<ScanQuotaStatus & { allowed: boolean }> => {
      const { data, error } = await supabase
        .rpc("record_scan_attempt")
        .single();
      if (error) throw new Error(error.message);
      const row = data as {
        allowed: boolean;
        remaining: number | null;
        daily_limit: number | null;
      };
      return {
        allowed: row.allowed,
        isCurator: row.remaining == null,
        remaining: row.remaining,
        dailyLimit: row.daily_limit,
      };
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: scanQuotaKeys.status() });
    },
  });
}

/**
 * Grants bonus scans for today after a rewarded ad completes.
 */
export function useGrantBonusScans() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (bonus: number = 5): Promise<number> => {
      const { data, error } = await supabase.rpc("grant_bonus_scans", {
        p_bonus: bonus,
      });
      if (error) throw new Error(error.message);
      return data as number;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: scanQuotaKeys.status() });
    },
  });
}

// ---------------------------------------------------------------------------
// Search quota — same server-side pattern as scans (search_usage table),
// but a separate counter: 15 searches/day shared across product/barcode
// search, Pokémon manual card search, and Magic name search.
// ---------------------------------------------------------------------------

const searchQuotaKeys = {
  status: () => ["searchQuota", "status"] as const,
};

/**
 * Read-only search quota status (doesn't consume a search).
 */
export function useSearchQuotaStatus() {
  return useQuery({
    queryKey: searchQuotaKeys.status(),
    queryFn: async (): Promise<ScanQuotaStatus> => {
      const { data, error } = await supabase
        .rpc("get_search_quota_status")
        .single();
      if (error) throw new Error(error.message);
      return mapStatusRow(data as any);
    },
    staleTime: 30 * 1000,
  });
}

/**
 * Atomically checks and consumes one search. Call once per user-submitted
 * search (not per keystroke or per result page). Curator users always pass.
 */
export function useRecordSearchAttempt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<ScanQuotaStatus & { allowed: boolean }> => {
      const { data, error } = await supabase
        .rpc("record_search_attempt")
        .single();
      if (error) throw new Error(error.message);
      const row = data as {
        allowed: boolean;
        remaining: number | null;
        daily_limit: number | null;
      };
      return {
        allowed: row.allowed,
        isCurator: row.remaining == null,
        remaining: row.remaining,
        dailyLimit: row.daily_limit,
      };
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: searchQuotaKeys.status() });
    },
  });
}

/**
 * Grants bonus searches for today after a rewarded ad completes.
 */
export function useGrantBonusSearches() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (bonus: number = 5): Promise<number> => {
      const { data, error } = await supabase.rpc("grant_bonus_searches", {
        p_bonus: bonus,
      });
      if (error) throw new Error(error.message);
      return data as number;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: searchQuotaKeys.status() });
    },
  });
}
