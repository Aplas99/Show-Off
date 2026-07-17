import { useCallback, useEffect, useRef, useState } from "react";
import mobileAds, {
  AdEventType,
  RewardedAd,
  RewardedAdEventType,
  TestIds,
} from "react-native-google-mobile-ads";

/**
 * Ad unit ids. Falls back to Google's official test units (safe to ship,
 * never serve real ads/revenue) until a real AdMob app + these env vars
 * are configured — see .env.example.
 */
export const AD_UNIT_IDS = {
  banner: process.env.EXPO_PUBLIC_ADMOB_BANNER_UNIT_ID || TestIds.BANNER,
  rewarded: process.env.EXPO_PUBLIC_ADMOB_REWARDED_UNIT_ID || TestIds.REWARDED,
};

let initPromise: Promise<unknown> | null = null;

/** Idempotent — safe to call from multiple components. */
export function ensureMobileAdsInitialized() {
  if (!initPromise) {
    initPromise = mobileAds().initialize();
  }
  return initPromise;
}

export type RewardedAdResult = "earned" | "closed" | "failed";

/**
 * Loads and shows a rewarded ad on demand, resolving once the user
 * either earns the reward, closes without earning it, or the ad fails
 * to load/show. Callers should treat anything other than "earned" as
 * "no reward" — never grant the reward speculatively before this
 * resolves.
 */
export function useRewardedAd() {
  const [isLoading, setIsLoading] = useState(false);
  const adRef = useRef<RewardedAd | null>(null);

  useEffect(() => {
    ensureMobileAdsInitialized();
  }, []);

  const show = useCallback((): Promise<RewardedAdResult> => {
    setIsLoading(true);
    return new Promise((resolve) => {
      const ad = RewardedAd.createForAdRequest(AD_UNIT_IDS.rewarded);
      adRef.current = ad;
      let earned = false;
      let settled = false;

      const finish = (result: RewardedAdResult) => {
        if (settled) return;
        settled = true;
        setIsLoading(false);
        unsubscribeLoaded();
        unsubscribeEarned();
        unsubscribeClosed();
        unsubscribeError();
        resolve(result);
      };

      const unsubscribeLoaded = ad.addAdEventListener(
        RewardedAdEventType.LOADED,
        () => ad.show(),
      );
      const unsubscribeEarned = ad.addAdEventListener(
        RewardedAdEventType.EARNED_REWARD,
        () => {
          earned = true;
        },
      );
      const unsubscribeClosed = ad.addAdEventListener(AdEventType.CLOSED, () => {
        finish(earned ? "earned" : "closed");
      });
      const unsubscribeError = ad.addAdEventListener(AdEventType.ERROR, () => {
        finish("failed");
      });

      ad.load();
    });
  }, []);

  return { show, isLoading };
}
