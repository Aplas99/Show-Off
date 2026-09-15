import { ItemWithProduct } from "@/api/items";
import { useColors, type ThemeColors } from "@/constants/theme";
import { useHaptics } from "@/hooks/useHaptics";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "@/src/components/media/ProtectedImage";
import { LinearGradient } from "expo-linear-gradient";
import { Link } from "expo-router";
import React, { useMemo } from "react";
import {
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from "react-native";

const PLACEHOLDER_IMAGE = require("../../../assets/images/placeholder.png");

type Props = {
  item: ItemWithProduct;
  onPress?: (item: ItemWithProduct) => void;
  style?: StyleProp<ViewStyle>;
};

function ShowcaseListItem({ item, onPress, style }: Props) {
  const colors = useColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const haptics = useHaptics();

  const product = item.products;
  const title = item.custom_title || product?.searchableTitle || "Unknown Item";
  const brand = item.custom_brand || product?.searchableBrand;

  const productData = product?.data || {};

  const imageUrl =
    item.image_url ||
    (productData?.images && productData.images.length > 0
      ? productData.images[0]
      : null);

  const price = item.price;
  const currency = item.currency_code || "USD";

  const formattedPrice = useMemo(() => {
    if (price == null) return null;
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(price);
  }, [currency, price]);

  const handlePress = () => {
    haptics.selection();
    onPress?.(item);
  };

  const renderContent = (pressed: boolean) => (
    <View style={[styles.card, pressed && styles.cardPressed]}>
      <View style={styles.imageWrap}>
        <Image
          source={imageUrl ? { uri: imageUrl } : PLACEHOLDER_IMAGE}
          style={styles.image}
          contentFit="cover"
          cachePolicy="memory-disk"
          recyclingKey={String(item.id)}
          transition={150}
        />
        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.55)"]}
          start={{ x: 0, y: 0.4 }}
          end={{ x: 0, y: 1 }}
          style={styles.imageScrim}
        />

        {item.for_sale && (
          <View style={styles.saleBadge}>
            <Ionicons name="pricetag" size={10} color="#FFF" />
            <Text style={styles.saleText}>For Sale</Text>
          </View>
        )}

        {formattedPrice && (
          <View style={styles.pricePill}>
            <Text style={styles.pricePillText}>{formattedPrice}</Text>
          </View>
        )}
      </View>

      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>

        {item.user_description ? (
          <Text style={styles.description} numberOfLines={2}>
            {item.user_description}
          </Text>
        ) : product?.searchableDescription ? (
          <Text style={styles.description} numberOfLines={2}>
            {product.searchableDescription}
          </Text>
        ) : null}

        <View style={styles.metaRow}>
          {brand && (
            <Text style={styles.brand} numberOfLines={1}>
              {brand}
            </Text>
          )}
          {item.condition && (
            <View style={styles.conditionPill}>
              <Text style={styles.conditionText} numberOfLines={1}>
                {item.condition}
              </Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={handlePress} style={[styles.container, style]}>
        {({ pressed }) => renderContent(pressed)}
      </Pressable>
    );
  }

  return (
    <Link href={`/(tabs)/showcase/${item.showcase_id}` as any} asChild>
      <Pressable onPress={() => haptics.selection()} style={[styles.container, style]}>
        {({ pressed }) => renderContent(pressed)}
      </Pressable>
    </Link>
  );
}

export default React.memo(ShowcaseListItem);

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    margin: 6,
  },
  card: {
    flex: 1,
    backgroundColor: colors.surfaceContainer,
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 3,
  },
  cardPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.98 }],
  },
  imageWrap: {
    width: "100%",
    height: 150,
  },
  image: {
    width: "100%",
    height: "100%",
  },
  imageScrim: {
    ...StyleSheet.absoluteFillObject,
  },
  imagePlaceholder: {
    width: "100%",
    height: 140,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceLight,
  },
  saleBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#4CAF50",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  saleText: {
    color: "#FFF",
    fontSize: 10,
    fontWeight: "700",
  },
  pricePill: {
    position: "absolute",
    left: 8,
    bottom: 8,
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  pricePillText: {
    color: "#FFF",
    fontSize: 12,
    fontWeight: "800",
  },
  info: {
    padding: 12,
    gap: 4,
  },
  title: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  description: {
    color: colors.onSurfaceVariant,
    fontSize: 11,
    lineHeight: 14,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
    gap: 8,
  },
  brand: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: "600",
    flexShrink: 1,
  },
  conditionPill: {
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
  },
  conditionText: {
    color: colors.onSurfaceVariant,
    fontSize: 10,
    fontWeight: "600",
  },
});
