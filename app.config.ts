import type { ConfigContext, ExpoConfig } from "expo/config";

export default function appConfig({ config }: ConfigContext): ExpoConfig {
  return {
    ...config,
    name: config.name ?? "show-off",
    slug: config.slug ?? "show-off",
    plugins: config.plugins?.map((plugin) => {
      if (Array.isArray(plugin) && plugin[0] === "react-native-google-mobile-ads") {
        return [plugin[0], { ...plugin[1], delayAppMeasurementInit: true }];
      }
      return plugin;
    }),
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
