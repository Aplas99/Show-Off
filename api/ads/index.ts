import { useCallback, useEffect, useRef, useState } from "react";
import { create } from "zustand";
import mobileAds, { AdEventType, AdsConsent, AdsConsentPrivacyOptionsRequirementStatus, MaxAdContentRating, RewardedAd, RewardedAdEventType, TestIds } from "react-native-google-mobile-ads";
import { useAuthStore } from "@/hooks/useAuthStore";
import { createAdConsentController } from "@/lib/adEligibility";
import { ADS_ENABLED, isAdEligible, useAdEligibility } from "./eligibility";

export const AD_UNIT_IDS = {
  banner: process.env.EXPO_PUBLIC_ADMOB_BANNER_UNIT_ID || TestIds.BANNER,
  rewarded: process.env.EXPO_PUBLIC_ADMOB_REWARDED_UNIT_ID || TestIds.REWARDED,
};
export const AD_REQUEST_OPTIONS = { requestNonPersonalizedAdsOnly: true } as const;
export const useAdPrivacyRevision = create<{ revision: number; changing: boolean }>(() => ({ revision: 0, changing: false }));
const consent = createAdConsentController({
  eligible: isAdEligible,
  currentUser: () => useAuthStore.getState().user?.id,
  gatherConsent: async () => (await AdsConsent.gatherConsent({ tagForUnderAgeOfConsent: false })).canRequestAds,
  configure: () => mobileAds().setRequestConfiguration({ maxAdContentRating: MaxAdContentRating.PG }),
  initialize: () => mobileAds().initialize(),
});
useAuthStore.subscribe((state, previous) => {
  if (state.user?.id !== previous.user?.id) consent.reset();
});
export const ensureMobileAdsInitialized = (userId: string) => useAdPrivacyRevision.getState().changing ? Promise.resolve(false) : consent.prepare(userId);

export async function openAdPrivacyOptions(): Promise<string> {
  if (!ADS_ENABLED) return "Advertising is disabled in this build.";
  const userId = useAuthStore.getState().user?.id;
  if (!userId || !await isAdEligible(userId)) return "Ads are not served to paid, under-18, or unknown-age accounts.";
  consent.reset();
  useAdPrivacyRevision.setState((state) => ({ revision: state.revision + 1, changing: true }));
  try {
    const info = await AdsConsent.requestInfoUpdate({ tagForUnderAgeOfConsent: false });
    if (info.privacyOptionsRequirementStatus === AdsConsentPrivacyOptionsRequirementStatus.REQUIRED) {
      await AdsConsent.showPrivacyOptionsForm();
      return "Your advertising privacy choices have been updated.";
    }
    return "No additional privacy form is required for your location. Show Off requests non-personalized ads only.";
  } finally {
    consent.reset();
    useAdPrivacyRevision.setState((state) => ({ revision: state.revision + 1, changing: false }));
  }
}

export type RewardedAdResult = "earned" | "closed" | "failed";
export function useRewardedAd() {
  const { userId, eligible } = useAdEligibility();
  const [isLoading, setIsLoading] = useState(false);
  const pending = useRef(false);
  const cancel = useRef<(() => void) | null>(null);
  const mounted = useRef(true);
  const revision = useAdPrivacyRevision((state) => state.revision);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; cancel.current?.(); };
  }, []);
  useEffect(() => { cancel.current?.(); }, [userId, eligible, revision]);
  const show = useCallback(async (): Promise<RewardedAdResult> => {
    if (!userId || !eligible || pending.current || useAdPrivacyRevision.getState().changing) return "failed";
    pending.current = true;
    setIsLoading(true);
    try {
      if (!await consent.prepare(userId) || !mounted.current || useAdPrivacyRevision.getState().changing || useAdPrivacyRevision.getState().revision !== revision) return "failed";
      return await new Promise<RewardedAdResult>((resolve) => {
        let settled = false;
        let earned = false;
        const subscriptions: (() => void)[] = [];
        let timer: ReturnType<typeof setTimeout>;
        const finish = (result: RewardedAdResult) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          subscriptions.forEach((unsubscribe) => unsubscribe());
          cancel.current = null;
          resolve(useAuthStore.getState().user?.id === userId ? result : "failed");
        };
        cancel.current = () => finish("failed");
        timer = setTimeout(() => finish("failed"), 120_000);
        try {
          const ad = RewardedAd.createForAdRequest(AD_UNIT_IDS.rewarded, AD_REQUEST_OPTIONS);
          subscriptions.push(
            ad.addAdEventListener(RewardedAdEventType.LOADED, () => {
              if (useAuthStore.getState().user?.id !== userId) return finish("failed");
              void ad.show().catch(() => finish("failed"));
            }),
            ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => { earned = true; }),
            ad.addAdEventListener(AdEventType.CLOSED, () => finish(earned ? "earned" : "closed")),
            ad.addAdEventListener(AdEventType.ERROR, () => finish("failed")),
          );
          ad.load();
        } catch { finish("failed"); }
      });
    } finally {
      pending.current = false;
      if (mounted.current) setIsLoading(false);
    }
  }, [userId, eligible, revision]);
  return { show, isLoading, isAvailable: eligible };
}
