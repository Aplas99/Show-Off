import { ItemWithProduct } from "@/api/items";
import { useColors, type ThemeColors } from "@/constants/theme";
import { Link } from "expo-router";
import React from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";

import { StyleProp, ViewStyle } from "react-native";

type Props = {
  item: ItemWithProduct;
  onPress?: (item: ItemWithProduct) => void;
  style?: StyleProp<ViewStyle>;
};

export default function ShowcaseListItem({ item, onPress, style }: Props) {
  const colors = useColors();
  const styles = getStyles(colors);

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

  const PLACEHOLDER_IMAGE = require("../../../assets/images/placeholder.png");

  const content = (
    <View style={styles.card}>
      <Image
        source={imageUrl ? { uri: imageUrl } : PLACEHOLDER_IMAGE}
        style={styles.image}
        resizeMode="cover"
      />

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

        {brand && <Text style={styles.brand}>{brand}</Text>}

        <View style={styles.footer}>
          {price !== null && (
            <Text style={styles.price}>
              {new Intl.NumberFormat("en-US", {
                style: "currency",
                currency,
              }).format(price)}
            </Text>
          )}

          {item.for_sale && (
            <View style={styles.saleBadge}>
              <Text style={styles.saleText}>For Sale</Text>
            </View>
          )}
        </View>

        {item.condition && (
          <Text style={styles.condition}>{item.condition}</Text>
        )}
      </View>
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={() => onPress(item)}
        style={[styles.container, style]}
      >
        {content}
      </Pressable>
    );
  }

  return (
    <Link href={`/(tabs)/showcase/${item.showcase_id}` as any} asChild>
      <Pressable style={[styles.container, style]}>{content}</Pressable>
    </Link>
  );
}

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    margin: 6,
  },
  card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
  },
  image: {
    width: "100%",
    height: 140,
  },
  imagePlaceholder: {
    width: "100%",
    height: 140,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceLight,
  },
  info: {
    padding: 10,
  },
  title: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 4,
  },
  description: {
    color: colors.textDim,
    fontSize: 11,
    marginBottom: 6,
    lineHeight: 14,
  },
  brand: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: "500",
    marginBottom: 2,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
  },
  price: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "bold",
  },
  saleBadge: {
    backgroundColor: "rgba(76, 175, 80, 0.2)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  saleText: {
    color: "#4CAF50",
    fontSize: 10,
    fontWeight: "600",
  },
  condition: {
    color: colors.textDim,
    fontSize: 10,
    marginTop: 6,
    fontStyle: "italic",
    textAlign: "right",
  },
});
