import { AD_REQUEST_OPTIONS, AD_UNIT_IDS, ensureMobileAdsInitialized, useAdPrivacyRevision } from "@/api/ads";
import { useAdEligibility } from "@/api/ads/eligibility";
import React, { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { BannerAd, BannerAdSize } from "react-native-google-mobile-ads";

export default function BannerAdView() {
  const { userId, eligible } = useAdEligibility();
  const revision = useAdPrivacyRevision((state) => state.revision);
  const changing = useAdPrivacyRevision((state) => state.changing);
  const [ready, setReady] = useState<string | null>(null);
  const key = `${userId}:${revision}`;
  useEffect(() => {
    let active = true;
    setReady(null);
    if (eligible && userId && !changing) {
      void ensureMobileAdsInitialized(userId).then((allowed) => {
        if (active && allowed) setReady(key);
      });
    }
    return () => { active = false; };
  }, [eligible, userId, key, changing]);
  if (!eligible || changing || ready !== key) return null;
  return <View style={styles.container}>
    <BannerAd key={key} unitId={AD_UNIT_IDS.banner} size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER} requestOptions={AD_REQUEST_OPTIONS} onAdFailedToLoad={() => setReady(null)} />
  </View>;
}
const styles = StyleSheet.create({ container: { alignItems: "center", justifyContent: "center" } });
