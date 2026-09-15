import { getCurrentMembershipAccess, useMembership } from "@/api/memberships";
import { useAuthStore } from "@/hooks/useAuthStore";
import { canServeAds } from "@/lib/adEligibility";
import { supabase } from "@/lib/supabase";
import { useQuery } from "@tanstack/react-query";

export const ADS_ENABLED = process.env.EXPO_PUBLIC_ADS_ENABLED === "true";
export async function isAdEligible(userId: string): Promise<boolean> {
  if (!ADS_ENABLED || useAuthStore.getState().user?.id !== userId) return false;
  const [{ data: age, error }, membership] = await Promise.all([
    supabase.rpc("viewer_age"), getCurrentMembershipAccess(),
  ]);
  return !error && useAuthStore.getState().user?.id === userId && canServeAds(age, membership.isPaidUser, ADS_ENABLED);
}

export function useAdEligibility() {
  const userId = useAuthStore((state) => state.user?.id);
  const membership = useMembership();
  const age = useQuery({
    queryKey: ["ad-age", userId],
    enabled: ADS_ENABLED && !!userId && membership.data?.isPaidUser === false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("viewer_age");
      if (error) throw error;
      return data;
    },
    staleTime: 60_000,
  });
  return { userId, eligible: !membership.isError && !age.isError && canServeAds(age.data, membership.data?.isPaidUser, ADS_ENABLED) };
}
