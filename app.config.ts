import type { ConfigContext, ExpoConfig } from "expo/config";

// Google's SKAdNetwork list from the AdMob iOS quick-start ("Update your
// Info.plist"), 2026-10-20. Re-check it before each ads-enabled release.
const ADMOB_SKADNETWORK_ITEMS = [
  "cstr6suwn9", "4fzdc2evr5", "2fnua5tdw4", "ydx93a7ass", "p78axxw29g", "v72qych5uu", "ludvb6z3bs",
  "cp8zw746q7", "3sh42y64q3", "c6k4g5qg8m", "s39g8k73mm", "wg4vff78zm", "3qy4746246", "f38h382jlk",
  "hs6bdukanm", "mlmmfzh3r3", "v4nxqhlyqp", "wzmmz9fp6w", "su67r6k2v3", "yclnxrl5pm", "t38b2kh725",
  "7ug5zh24hu", "gta9lk7p23", "vutu7akeur", "y5ghdn5j9k", "v9wttpbfk9", "n38lu8286q", "47vhws6wlr",
  "kbd757ywx3", "9t245vhmpl", "a2p9lx4jpn", "22mmun2rn5", "44jx6755aq", "k674qkevps", "4468km3ulz",
  "2u9pt9hc89", "8s468mfl3y", "klf5c3l5u5", "ppxm28t8ap", "kbmxgpxpgc", "uw77j35x4d", "578prtvx9j",
  "4dzt52r2t5", "tl55sbb4fm", "c3frkrj4fj", "e5fvkxwrpn", "8c4e2ghe7u", "3rd42ekr43", "97r2b46745",
  "3qcr597p9d",
].map((id) => `${id}.skadnetwork`);

/**
 * AdMob is off until the store and AdMob accounts are approved. With
 * EXPO_PUBLIC_ADS_ENABLED unset, the plugin is left out here and
 * package.json's `expo.autolinking.exclude` keeps the native SDK out of the
 * binary. Turning it on requires removing that exclude and setting the real
 * app ids below; Google's test ids are never shipped.
 */
function adMobPlugin(): [string, Record<string, unknown>] | null {
  if (process.env.EXPO_PUBLIC_ADS_ENABLED !== "true") return null;
  const excluded: string[] = require("./package.json").expo?.autolinking?.exclude ?? [];
  if (excluded.includes("react-native-google-mobile-ads")) {
    throw new Error("EXPO_PUBLIC_ADS_ENABLED=true but react-native-google-mobile-ads is excluded from autolinking in package.json.");
  }
  const androidAppId = process.env.ADMOB_ANDROID_APP_ID;
  const iosAppId = process.env.ADMOB_IOS_APP_ID;
  if (!androidAppId || !iosAppId) {
    throw new Error("EXPO_PUBLIC_ADS_ENABLED=true requires ADMOB_ANDROID_APP_ID and ADMOB_IOS_APP_ID.");
  }
  return ["react-native-google-mobile-ads", {
    androidAppId,
    iosAppId,
    delayAppMeasurementInit: true,
    skAdNetworkItems: ADMOB_SKADNETWORK_ITEMS,
    // Ads are non-personalized only and never request ATT, so no
    // userTrackingUsageDescription is set.
  }];
}

export default function appConfig({ config }: ConfigContext): ExpoConfig {
  const adMob = adMobPlugin();
  return {
    ...config,
    name: config.name ?? "Show Off",
    slug: config.slug ?? "show-off",
    plugins: [...(config.plugins ?? []), ...(adMob ? [adMob] : [])],
    android: {
      ...config.android,
      // No advertising identifier is needed for this release's ad requests.
      blockedPermissions: [...new Set([
        ...(config.android?.blockedPermissions ?? []),
        "com.google.android.gms.permission.AD_ID",
      ])],
    },
  };
}
