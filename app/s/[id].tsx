import ContentSafetyMenu from "@/src/components/social/ContentSafetyMenu";
import { PublicShowcaseItem, usePublicShowcase } from "@/api/showcase/public";
import { useColors } from "@/constants/theme";
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
const NUM_COLUMNS = 3;

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
  const cardWidth =
    (width - GRID_PADDING * 2 - GRID_GAP * (NUM_COLUMNS - 1)) / NUM_COLUMNS;

  const { data: showcase, isLoading, error } = usePublicShowcase(showcaseId);

  const renderItem = useCallback(
    ({ item }: { item: PublicShowcaseItem }) => {
      const imageUrl = getItemImage(item);
      return (
        <View style={[styles.cell, { width: cardWidth, height: cardWidth / (63 / 88) }]}>
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
        </View>
      );
    },
    [cardWidth],
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

  const accentColor = showcase.accent_color || colors.primary;

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
          paddingHorizontal: GRID_PADDING,
          paddingBottom: insets.bottom + 24,
          gap: GRID_GAP,
        }}
        ListHeaderComponent={
          <View style={styles.header}>
            {showcase.banner_image_url ? (
              <Image
                source={{ uri: showcase.banner_image_url }}
                style={[styles.banner, { marginTop: insets.top }]}
                contentFit="cover"
              />
            ) : (
              <LinearGradient
                colors={[accentColor, colors.secondary]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.banner, { marginTop: insets.top }]}
              />
            )}

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
  showcaseName: { fontSize: 22, fontWeight: "800" },
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
  cell: { borderRadius: 6, overflow: "hidden", backgroundColor: "rgba(128,128,128,0.1)" },
  cellImage: { width: "100%", height: "100%" },
  cellPlaceholder: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyText: { textAlign: "center", marginTop: 40, fontSize: 14 },
});
