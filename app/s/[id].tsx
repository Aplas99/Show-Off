import ContentSafetyMenu from "@/src/components/social/ContentSafetyMenu";
import { PublicShowcaseItem, usePublicShowcase } from "@/api/showcase/public";
import { useGetShowcaseStats } from "@/api/showcase";
import { DEFAULT_SHOWCASE_ACCENT, ShowcaseBanner, ShowcaseStatsBar } from "@/src/features/showcase/ShowcaseVisuals";
import { useColors } from "@/constants/theme";
import { showcaseDisplayAccent } from "@/lib/showcaseColor";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "@/src/components/media/ProtectedImage";
import { LinearGradient } from "expo-linear-gradient";
import { Stack, useLocalSearchParams } from "expo-router";
import React, { useCallback } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const GRID_GAP = 8;
const GRID_PADDING = 12;
const NUM_COLUMNS = 2;

function getItemImage(item: PublicShowcaseItem): string | null {
  return item.card_image_large || item.card_image_small || item.image_url || null;
}

/**
 * Public, unauthenticated showcase view — reachable through a member's
 * shareable link. Deliberately minimal: no tab bar, no auth chrome, no
 * edit affordances. `AuthInitializer` exempts this "s" segment from the
 * sign-in redirect so signed-out visitors can actually load it.
 */
export default function PublicShowcaseScreen() {
  const params = useLocalSearchParams();
  const showcaseId = typeof params.id === "string" ? params.id : params.id?.[0];
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { width } = useWindowDimensions();
  const containerWidth = Math.min(width, 900);
  const cardWidth =
    (containerWidth - GRID_PADDING * 2 - GRID_GAP * (NUM_COLUMNS - 1)) / NUM_COLUMNS;

  const { data: showcase, isLoading, error } = usePublicShowcase(showcaseId);
  const { data: stats } = useGetShowcaseStats(showcaseId ?? "");
  const accentColor = showcaseDisplayAccent(showcase?.accent_color || DEFAULT_SHOWCASE_ACCENT);

  const renderItem = useCallback(
    ({ item }: { item: PublicShowcaseItem }) => {
      const imageUrl = getItemImage(item);
      return (
        <View style={[styles.cell, { width: cardWidth, borderColor: `${accentColor}A0` }]}>
          <View style={styles.cellImageWrap}>
          {imageUrl ? (
            <Image
              source={{ uri: imageUrl }}
              style={styles.cellImage}
              contentFit="contain"
              cachePolicy="memory-disk"
              recyclingKey={String(item.id)}
            />
          ) : (
            <View style={styles.cellPlaceholder}>
              <Ionicons name="image-outline" size={20} color="rgba(255,255,255,0.6)" />
            </View>
          )}
          <LinearGradient colors={[`${accentColor}3D`, "transparent", "rgba(0,0,0,0.25)"]} style={StyleSheet.absoluteFill} pointerEvents="none" />
          {item.price != null && <View style={styles.pricePill}><Text style={styles.priceText}>
            {new Intl.NumberFormat("en-US", { style: "currency", currency: item.currency_code || "USD" }).format(item.price)}
          </Text></View>}
          </View>
          <View style={styles.itemInfo}>
            <Text style={styles.itemTitle} numberOfLines={1}>{item.custom_title || item.card_name || "Collectible"}</Text>
            <Text style={styles.itemSubtitle} numberOfLines={1}>{item.card_set_name || item.card_rarity || "From this collection"}</Text>
          </View>
        </View>
      );
    },
    [cardWidth, accentColor],
  );

  if (isLoading) {
    return (
      <View style={[styles.centerWrap, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (error || !showcase) {
    return (
      <View style={[styles.centerWrap, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <Ionicons name="lock-closed-outline" size={40} color={colors.onSurfaceVariant} />
        <Text style={[styles.notFoundText, { color: colors.text }]}>
          This showcase isn&apos;t available
        </Text>
        <Text style={[styles.notFoundSubText, { color: colors.onSurfaceVariant }]}>
          The showcase may be private, removed, or unavailable for your age. Sign in with an eligible account to view an 18+ showcase.
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <FlatList
        data={showcase.items}
        renderItem={renderItem}
        keyExtractor={(item) => String(item.id)}
        numColumns={NUM_COLUMNS}
        columnWrapperStyle={styles.columnWrapper}
        contentContainerStyle={{
          width: "100%",
          maxWidth: 900,
          alignSelf: "center",
          paddingHorizontal: GRID_PADDING,
          paddingBottom: insets.bottom + 24,
          gap: GRID_GAP,
        }}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={{ marginTop: insets.top + 12 }}><ShowcaseBanner imageUrl={showcase.banner_image_url}
              accentColor={accentColor} height={Math.max(140, Math.min(270, (containerWidth - 24) / 3.1))} /></View>

            <View style={styles.headerInfo}>
              <Text style={[styles.showcaseName, { color: colors.text }]} numberOfLines={2}>
                {showcase.name}
              </Text>
              <ContentSafetyMenu type="showcase" id={showcase.id} ownerId={showcase.owner.id} />
              {showcase.audience_rating === "18_plus" && <Text style={{ color: colors.text }}>18+ showcase</Text>}
              <View style={styles.ownerRow}>
                {showcase.owner.avatar_url ? (
                  <Image
                    source={{ uri: showcase.owner.avatar_url }}
                    style={styles.ownerAvatar}
                  />
                ) : (
                  <View style={[styles.ownerAvatar, styles.ownerAvatarPlaceholder]}>
                    <Ionicons name="person" size={14} color={colors.onSurfaceVariant} />
                  </View>
                )}
                <Text style={[styles.ownerName, { color: colors.onSurfaceVariant }]}>
                  {showcase.owner.username ? `@${showcase.owner.username}` : "Collector"}
                </Text>
                <View style={[styles.countPill, { borderColor: colors.outlineVariant }]}>
                  <Text style={[styles.countPillText, { color: colors.onSurfaceVariant }]}>
                    {showcase.items.length}{" "}
                    {showcase.items.length === 1 ? "item" : "items"}
                  </Text>
                </View>
              </View>
              <View style={styles.statsPanel}><ShowcaseStatsBar itemCount={showcase.items.length}
                followerCount={stats?.followerCount ?? null}
                estimatedValue={showcase.items.reduce((sum, item) => sum + (item.price || 0), 0)} accentColor={accentColor} /></View>
            </View>
          </View>
        }
        ListEmptyComponent={
          <Text style={[styles.emptyText, { color: colors.onSurfaceVariant }]}>
            No items in this showcase yet.
          </Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centerWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 24,
  },
  notFoundText: { fontSize: 17, fontWeight: "700" },
  notFoundSubText: { fontSize: 13, textAlign: "center" },
  header: { marginBottom: 16 },
  banner: { width: "100%", height: 140 },
  headerInfo: { paddingHorizontal: GRID_PADDING, paddingTop: 14, gap: 8 },
  showcaseName: { fontSize: 30, fontWeight: "900" },
  statsPanel: { borderWidth: 1, borderColor: "#45414E", borderRadius: 20, backgroundColor: "#1C1B22", marginTop: 12 },
  ownerRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  ownerAvatar: { width: 22, height: 22, borderRadius: 11 },
  ownerAvatarPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(128,128,128,0.2)",
  },
  ownerName: { fontSize: 13, fontWeight: "600" },
  countPill: {
    marginLeft: "auto",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
  },
  countPillText: { fontSize: 11, fontWeight: "600" },
  columnWrapper: { gap: GRID_GAP },
  cell: { borderRadius: 20, borderWidth: 1.2, overflow: "hidden", backgroundColor: "#211F27" },
  cellImageWrap: { width: "100%", aspectRatio: 1.65, overflow: "hidden", borderBottomLeftRadius: 15, borderBottomRightRadius: 15 },
  cellImage: { width: "100%", height: "100%" },
  pricePill: { position: "absolute", bottom: 8, left: 8, backgroundColor: "rgba(15,13,22,0.82)", borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 },
  priceText: { color: "#FFF", fontSize: 12, fontWeight: "900" },
  itemInfo: { padding: 11, gap: 4 },
  itemTitle: { color: "#FFF", fontSize: 15, fontWeight: "800" },
  itemSubtitle: { color: "#B1ADBE", fontSize: 12 },
  cellPlaceholder: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyText: { textAlign: "center", marginTop: 40, fontSize: 14 },
});
