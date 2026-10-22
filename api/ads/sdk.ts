import type * as GoogleMobileAds from "react-native-google-mobile-ads";
import { Platform, TurboModuleRegistry } from "react-native";

/** Build-time switch, also read by app.config.ts (see its AdMob notes). */
export const ADS_FLAG_ENABLED = process.env.EXPO_PUBLIC_ADS_ENABLED === "true";

/**
 * The AdMob native SDK is only compiled into builds with ads enabled.
 * The JS package calls `TurboModuleRegistry.getEnforcing` at import time, so
 * importing it without the native module crashes on launch. Load it only
 * when the flag is on *and* the native module is actually linked.
 */
function loadAdsSdk(): typeof GoogleMobileAds | null {
  if (!ADS_FLAG_ENABLED || Platform.OS === "web" || !TurboModuleRegistry?.get("RNGoogleMobileAdsModule")) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("react-native-google-mobile-ads");
  } catch {
    return null;
  }
}

export const adsSdk = loadAdsSdk();

export function requireAdsSdk(): typeof GoogleMobileAds {
  if (!adsSdk) throw new Error("Advertising is disabled in this build.");
  return adsSdk;
}
