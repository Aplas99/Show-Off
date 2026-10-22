import { ItemWithProduct } from "@/api/items";
import { getItemCoverUrl } from "@/lib/itemImages";
import { useBookmarkItem, useIsItemBookmarked, useUnbookmarkItem } from "@/api/social/interactions";
import { showMessage } from "@/lib/dialogs";
import { useHaptics } from "@/hooks/useHaptics";
import { DEFAULT_SHOWCASE_ACCENT } from "@/src/features/showcase/ShowcaseVisuals";
import { Image } from "@/src/components/media/ProtectedImage";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Link } from "expo-router";
import React, { useMemo } from "react";
import { Pressable, StyleProp, StyleSheet, Text, TouchableOpacity, View, ViewStyle } from "react-native";

const PLACEHOLDER_IMAGE = require("../../../assets/images/placeholder.png");

type Props = {
  item: ItemWithProduct;
  onPress?: (item: ItemWithProduct) => void;
  style?: StyleProp<ViewStyle>;
  accentColor?: string;
};

function conditionColor(condition: string): string {
  const lower = condition.toLowerCase();
  if (lower.includes("mint") || lower.includes("excellent")) return "#7EEBC9";
  if (lower.includes("new")) return "#9DD6FF";
  if (lower.includes("good")) return "#F2C46D";
  return "#D8B5FF";
}

function ShowcaseListItem({ item, onPress, style, accentColor = DEFAULT_SHOWCASE_ACCENT }: Props) {
  const haptics = useHaptics();
  const { data: bookmarked } = useIsItemBookmarked(item.id);
  const bookmark = useBookmarkItem();
  const unbookmark = useUnbookmarkItem();
  const product = item.products;
  const title = item.custom_title || product?.searchableTitle || "Unknown item";
  const subtitle = [item.custom_category || item.custom_brand || product?.searchableBrand, item.user_description || product?.searchableDescription]
    .filter(Boolean).join("  ·  ");
  const imageUrl = getItemCoverUrl(item);
  const currency = item.currency_code || "USD";
  const formattedPrice = useMemo(() => item.price == null ? null : new Intl.NumberFormat("en-US", {
    style: "currency", currency,
  }).format(item.price), [currency, item.price]);
  const badgeColor = conditionColor(item.condition || "");

  const toggleBookmark = async (event: { stopPropagation: () => void }) => {
    event.stopPropagation();
    try {
      if (bookmarked) await unbookmark.mutateAsync(item.id);
      else await bookmark.mutateAsync(item.id);
    } catch (error: unknown) {
      showMessage("Could not save item", error instanceof Error ? error.message : "Please try again.");
    }
  };

  const renderContent = (pressed: boolean) => <View style={[styles.card, { borderColor: `${accentColor}9A`, shadowColor: accentColor }, pressed && styles.pressed]}>
    <View style={styles.imageWrap}>
      <Image source={imageUrl ? { uri: imageUrl } : PLACEHOLDER_IMAGE} style={styles.image} contentFit="cover"
        cachePolicy="memory-disk" recyclingKey={String(item.id)} transition={150} />
      <LinearGradient colors={[`${accentColor}33`, "transparent", "rgba(0,0,0,0.28)"]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <LinearGradient colors={["rgba(255,255,255,0.4)", "transparent"]} start={{ x: 0, y: 0 }} end={{ x: 0.8, y: 0.8 }} style={styles.sheen} />
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={bookmarked ? "Remove saved item" : "Save item"}
        onPress={(event) => void toggleBookmark(event)} style={styles.heartButton}>
        <Ionicons name={bookmarked ? "heart" : "heart-outline"} size={21} color={bookmarked ? accentColor : "#FFF"} />
      </TouchableOpacity>
      {formattedPrice && <View style={styles.pricePill}><Text style={styles.priceText}>{formattedPrice}</Text></View>}
    </View>
    <View style={styles.info}>
      <Text style={styles.title} numberOfLines={1}>{title}</Text>
      <Text style={styles.subtitle} numberOfLines={1}>{subtitle || "Collectible"}</Text>
      {item.condition && <View style={[styles.conditionPill, { borderColor: badgeColor, backgroundColor: `${badgeColor}14` }]}>
        <Ionicons name="sparkles" size={12} color={badgeColor} />
        <Text style={[styles.conditionText, { color: badgeColor }]} numberOfLines={1}>{item.condition}</Text>
      </View>}
    </View>
  </View>;

  if (onPress) return <Pressable onPress={() => { haptics.selection(); onPress(item); }} style={[styles.container, style]}>
    {({ pressed }) => renderContent(pressed)}
  </Pressable>;
  return <Link href={`/(tabs)/showcase/${item.showcase_id}` as never} asChild>
    <Pressable onPress={() => haptics.selection()} style={[styles.container, style]}>{({ pressed }) => renderContent(pressed)}</Pressable>
  </Link>;
}

export default React.memo(ShowcaseListItem);

const styles = StyleSheet.create({
  container: { flex: 1, minWidth: 0, margin: 5 },
  card: { flex: 1, backgroundColor: "#211F27", borderRadius: 22, overflow: "hidden", borderWidth: 1.2, shadowOpacity: 0.16, shadowRadius: 14, elevation: 3 },
  pressed: { opacity: 0.9, transform: [{ scale: 0.98 }] },
  imageWrap: { width: "100%", aspectRatio: 1.65, overflow: "hidden", borderBottomLeftRadius: 17, borderBottomRightRadius: 17 },
  image: { width: "100%", height: "100%" },
  sheen: { position: "absolute", top: 0, left: 0, width: "70%", height: "65%", opacity: 0.2 },
  heartButton: { position: "absolute", top: 9, right: 9, width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(15,13,22,0.74)", borderWidth: 1, borderColor: "rgba(255,255,255,0.22)" },
  pricePill: { position: "absolute", left: 9, bottom: 9, minHeight: 27, paddingHorizontal: 10, borderRadius: 15, justifyContent: "center", backgroundColor: "rgba(17,16,23,0.82)" },
  priceText: { color: "#FFF", fontSize: 12, fontWeight: "900" },
  info: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 11, gap: 4 },
  title: { color: "#FFF", fontSize: 15, fontWeight: "800" },
  subtitle: { color: "#B1ADBE", fontSize: 12 },
  conditionPill: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, borderWidth: 1, marginTop: 3 },
  conditionText: { fontSize: 11, fontWeight: "700" },
});
