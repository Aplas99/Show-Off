import { Image } from "@/src/components/media/ProtectedImage";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

const DEFAULT_BANNER = require("../../../assets/images/showcase-space-banner.png");
export const DEFAULT_SHOWCASE_ACCENT = "#A77BFF";

export function ShowcaseBanner({ imageUrl, accentColor, height }: {
  imageUrl?: string | null;
  accentColor: string;
  height: number;
}) {
  return <View style={[styles.banner, { height, borderColor: `${accentColor}88` }]}>
    <Image source={imageUrl ? { uri: imageUrl } : DEFAULT_BANNER} style={StyleSheet.absoluteFill} contentFit="cover" />
    <LinearGradient
      colors={[`${accentColor}40`, "transparent", "rgba(4,4,12,0.14)"]}
      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      style={StyleSheet.absoluteFill}
    />
    <LinearGradient
      colors={["rgba(255,255,255,0.4)", "rgba(255,255,255,0.02)", "transparent"]}
      start={{ x: 0, y: 0 }} end={{ x: 0.7, y: 0.8 }}
      style={styles.sheen}
    />
  </View>;
}

export function ShowcaseStatsBar({ itemCount, followerCount, estimatedValue, accentColor }: {
  itemCount: number | null;
  followerCount: number | null;
  estimatedValue: number | null;
  accentColor: string;
}) {
  const stats = [
    { icon: "cube-outline" as const, value: itemCount == null ? "—" : String(itemCount), label: "Items" },
    { icon: "people-outline" as const, value: followerCount == null ? "—" : String(followerCount), label: "Followers" },
    { icon: "stats-chart-outline" as const, value: estimatedValue == null ? "—" : `~$${Math.round(estimatedValue).toLocaleString("en-US")}`, label: "Est. Value" },
  ];
  return <View style={styles.stats}>
    {stats.map((stat, index) => <View key={stat.label} style={[styles.stat, index > 0 && styles.statDivider]}>
      <Ionicons name={stat.icon} size={22} color={accentColor} />
      <View style={styles.statText}>
        <Text style={styles.statValue} numberOfLines={1}>{stat.value}</Text>
        <Text style={styles.statLabel} numberOfLines={1}>{stat.label}</Text>
      </View>
    </View>)}
  </View>;
}

const styles = StyleSheet.create({
  banner: { width: "100%", overflow: "hidden", borderRadius: 26, borderWidth: 1.5, backgroundColor: "#1C1433" },
  sheen: { position: "absolute", top: 0, left: 0, width: "70%", height: "60%", opacity: 0.27 },
  stats: { flexDirection: "row", alignItems: "center", width: "100%", paddingVertical: 14 },
  stat: { flex: 1, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 9, minWidth: 0 },
  statDivider: { borderLeftWidth: 1, borderLeftColor: "rgba(190,180,220,0.2)" },
  statText: { minWidth: 0 },
  statValue: { color: "#FFF", fontSize: 17, fontWeight: "800" },
  statLabel: { color: "#ABA7B9", fontSize: 11, marginTop: 2 },
});
