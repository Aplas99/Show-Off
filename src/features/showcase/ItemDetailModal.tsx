import { ItemWithProduct } from "@/api/items";
import { COLORS } from "@/constants/theme";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import React, { useEffect, useRef } from "react";
import {
  Animated,
  Dimensions,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

type Props = {
  visible: boolean;
  item: ItemWithProduct | null;
  onClose: () => void;
};

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

export default function ItemDetailModal({ visible, item, onClose }: Props) {
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          damping: 20,
          stiffness: 90,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: SCREEN_HEIGHT,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, slideAnim, fadeAnim]);

  if (!item && !visible) return null;

  // Safe item access for when it's closing (item might be null during fade out)
  const displayItem = item;

  if (!displayItem && visible) return null; // Should not happen

  // Parse product data
  let productData: any = {};
  if (displayItem?.products?.data) {
    if (typeof displayItem.products.data === "string") {
      try {
        productData = JSON.parse(displayItem.products.data);
      } catch {
        productData = {};
      }
    } else {
      productData = displayItem.products.data;
    }
  }

  const imageUrl =
    displayItem?.image_url ||
    (productData.images && productData.images.length > 0
      ? productData.images[0]
      : null);

  const title =
    displayItem?.products?.searchableTitle ||
    displayItem?.user_description ||
    "Unknown Item";
  const brand = displayItem?.products?.searchableBrand;
  const description =
    displayItem?.products?.searchableDescription ||
    displayItem?.user_description;

  return (
    <Modal
      transparent
      visible={visible}
      onRequestClose={onClose}
      animationType="none"
    >
      <View style={styles.overlay}>
        <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]}>
          <Pressable style={styles.backdropPressable} onPress={onClose} />
        </Animated.View>

        <Animated.View
          style={[
            styles.modalContainer,
            { transform: [{ translateY: slideAnim }] },
          ]}
        >
          {Platform.OS === "ios" ? (
            <BlurView intensity={80} tint="dark" style={styles.absoluteFill} />
          ) : (
            <View
              style={[styles.absoluteFill, { backgroundColor: "#1A1A1A" }]}
            />
          )}

          <View style={styles.header}>
            <View style={styles.handle} />
            <Pressable onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close-circle" size={30} color={COLORS.textDim} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.content}>
            {imageUrl ? (
              <Image
                source={{ uri: imageUrl }}
                style={styles.image}
                resizeMode="contain"
              />
            ) : (
              <View style={styles.imagePlaceholder}>
                <Ionicons name="image" size={48} color={COLORS.textDim} />
              </View>
            )}

            <View style={styles.details}>
              {brand && <Text style={styles.brand}>{brand}</Text>}
              <Text style={styles.title}>{title}</Text>

              {displayItem?.price && (
                <Text style={styles.price}>
                  {new Intl.NumberFormat("en-US", {
                    style: "currency",
                    currency: "USD",
                  }).format(displayItem.price)}
                </Text>
              )}

              <View style={styles.divider} />

              {description && (
                <>
                  <Text style={styles.sectionTitle}>Description</Text>
                  <Text style={styles.description}>{description}</Text>
                </>
              )}

              <View style={styles.divider} />

              <View style={styles.row}>
                <Text style={styles.label}>Condition</Text>
                <Text style={styles.value}>
                  {displayItem?.condition || "N/A"}
                </Text>
              </View>

              <View style={styles.row}>
                <Text style={styles.label}>For Sale</Text>
                <Text
                  style={[
                    styles.value,
                    {
                      color: displayItem?.for_sale ? "#4CAF50" : COLORS.textDim,
                    },
                  ]}
                >
                  {displayItem?.for_sale ? "Yes" : "No"}
                </Text>
              </View>

              <View style={styles.row}>
                <Text style={styles.label}>Added On</Text>
                <Text style={styles.value}>
                  {displayItem?.created_at
                    ? new Date(displayItem.created_at).toLocaleDateString()
                    : "N/A"}
                </Text>
              </View>
            </View>
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.7)",
  },
  backdropPressable: {
    flex: 1,
  },
  modalContainer: {
    height: "90%",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
    backgroundColor: Platform.OS === "android" ? "#1A1A1A" : "transparent",
  },
  absoluteFill: {
    ...StyleSheet.absoluteFillObject,
  },
  header: {
    alignItems: "center",
    paddingTop: 12,
    paddingBottom: 8,
    zIndex: 10,
  },
  handle: {
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.3)",
    marginBottom: 10,
  },
  closeButton: {
    position: "absolute",
    right: 16,
    top: 16,
  },
  content: {
    paddingBottom: 40,
  },
  image: {
    width: "100%",
    height: 300,
    backgroundColor: "rgba(0,0,0,0.2)",
  },
  imagePlaceholder: {
    width: "100%",
    height: 300,
    backgroundColor: "rgba(0,0,0,0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  details: {
    padding: 24,
  },
  brand: {
    color: COLORS.primary,
    fontWeight: "600",
    marginBottom: 4,
    textTransform: "uppercase",
    fontSize: 12,
  },
  title: {
    color: COLORS.white,
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 8,
  },
  price: {
    color: COLORS.white,
    fontSize: 20,
    fontWeight: "600",
    marginBottom: 16,
  },
  divider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.1)",
    marginVertical: 16,
  },
  sectionTitle: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 8,
  },
  description: {
    color: COLORS.textDim,
    fontSize: 14,
    lineHeight: 22,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
  },
  label: {
    color: COLORS.textDim,
    fontSize: 14,
  },
  value: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: "500",
  },
});
