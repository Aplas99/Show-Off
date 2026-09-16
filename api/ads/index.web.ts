export type RewardedAdResult = "earned" | "closed" | "failed";
export function useRewardedAd() {
  return { isLoading: false, isAvailable: false, show: async (): Promise<RewardedAdResult> => "failed" };
}
export async function openAdPrivacyOptions(): Promise<string> {
  return "Show Off does not serve ads on the web.";
}
