import { supabase } from "@/lib/supabase";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

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
 * Atomically checks and consumes one scan. Call once per OCR attempt on
 * a captured frame, not per shutter press. Curator users always pass
 * (isCurator: true, remaining/dailyLimit: null = unlimited).
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
