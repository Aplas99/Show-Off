import { ItemWithProduct } from "@/api/items";
import { COLORS } from "@/constants/theme";
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
  // Prefer the joined product data if available
  const product = item.products;
  const title = item.custom_title || product?.searchableTitle || "Unknown Item";
  const brand = item.custom_brand || product?.searchableBrand;

  // Data is already parsed by the API layer
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

  // If no onPress, wrap in Link (optional fallback, though usually we pass onPress)
  return (
    <Link href={`/(tabs)/showcase/${item.showcase_id}` as any} asChild>
      <Pressable style={[styles.container, style]}>{content}</Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    margin: 6,
    // maxWidth removed to allow parent to control width (e.g. via numColumns or Carousel)
  },
  card: {
    flex: 1,
    backgroundColor: COLORS.surface || "#1E1E1E",
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#333",
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
    backgroundColor: "#2A2A2A",
  },
  info: {
    padding: 10,
  },
  title: {
    color: COLORS.white || "#FFF",
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 4,
  },
  description: {
    color: COLORS.textDim || "#888",
    fontSize: 11,
    marginBottom: 6,
    lineHeight: 14,
  },
  brand: {
    color: COLORS.primary || "#A855F7",
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
    color: COLORS.white || "#FFF",
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
    color: "#666",
    fontSize: 10,
    marginTop: 6,
    fontStyle: "italic",
    textAlign: "right",
  },
});
