import { useMembership } from "@/api/memberships";
import { AD_UNIT_IDS, ensureMobileAdsInitialized } from "@/api/ads";
import React, { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { BannerAd, BannerAdSize } from "react-native-google-mobile-ads";

/**
 * Banner ad shown only to free ("Collector") users — Curator members
 * never see ads. Renders nothing while membership status is loading or
 * for Curator members, so it's safe to drop into any screen.
 */
export default function BannerAdView() {
  const { data: membership, isLoading } = useMembership();

  useEffect(() => {
    ensureMobileAdsInitialized();
  }, []);

  if (isLoading || membership?.isCurator) return null;

  return (
    <View style={styles.container}>
      <BannerAd
        unitId={AD_UNIT_IDS.banner}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
  },
});
