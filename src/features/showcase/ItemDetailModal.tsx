import { ItemWithProduct } from "@/api/items";
import { COLORS } from "@/constants/theme";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useRef } from "react";
import {
  Animated,
  Dimensions,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

type Props = {
  visible: boolean;
  item: ItemWithProduct | null;
  onClose: () => void;
};

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
// Reduced header height slightly to fit better on standard screens
const HEADER_HEIGHT = 350;

export default function ItemDetailModal({ visible, item, onClose }: Props) {
  // Modal Transition Animations
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // Scroll & Parallax Animations
  const scrollY = useRef(new Animated.Value(0)).current;

  // Staggered Entrance Animations (Opacity)
  const headerOpacity = useRef(new Animated.Value(0)).current;
  const gridOpacity = useRef(new Animated.Value(0)).current;
  const descOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      // 1. Reset values
      scrollY.setValue(0);
      headerOpacity.setValue(0);
      gridOpacity.setValue(0);
      descOpacity.setValue(0);

      // 2. Start Modal Entrance
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
      ]).start(() => {
        // 3. Trigger Staggered Content Animation after modal opens
        Animated.stagger(100, [
          Animated.timing(headerOpacity, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(gridOpacity, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(descOpacity, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
        ]).start();
      });
    } else {
      // Exit Animation
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

  const displayItem = item;
  if (!displayItem && visible) return null;

  // --- Data Parsing ---
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
    displayItem?.custom_title ||
    displayItem?.products?.searchableTitle ||
    displayItem?.user_description ||
    "Unknown Item";
  const brand =
    displayItem?.custom_brand || displayItem?.products?.searchableBrand;
  const description =
    displayItem?.user_description ||
    displayItem?.products?.searchableDescription;

  const price =
    displayItem?.price != null
      ? displayItem.price
      : productData.offers?.[0]?.price;
  const currency = displayItem?.currency_code || productData.offers?.[0]?.currency || "USD";

  // --- Animation Interpolations ---

  // Parallax Header
  const imageTranslateY = scrollY.interpolate({
    inputRange: [-HEADER_HEIGHT, 0, HEADER_HEIGHT],
    outputRange: [HEADER_HEIGHT / 2, 0, -HEADER_HEIGHT / 3],
    extrapolate: "clamp",
  });

  const imageScale = scrollY.interpolate({
    inputRange: [-HEADER_HEIGHT, 0, HEADER_HEIGHT],
    outputRange: [2, 1, 1],
    extrapolate: "clamp",
  });

  // Slide-up effect for content sections matching opacity
  const contentTranslateY = (anim: Animated.Value) =>
    anim.interpolate({
      inputRange: [0, 1],
      outputRange: [20, 0],
    });

  return (
    <Modal
      transparent
      visible={visible}
      onRequestClose={onClose}
      animationType="none"
    >
      <View style={styles.overlay}>
        {/* Backdrop */}
        <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]}>
          <Pressable style={styles.backdropPressable} onPress={onClose} />
        </Animated.View>

        {/* Modal Sheet */}
        <Animated.View
          style={[
            styles.modalContainer,
            { transform: [{ translateY: slideAnim }] },
          ]}
        >
          {/* Background for modal content (so you don't see through it during bounce) */}
          <View style={[styles.absoluteFill, { backgroundColor: "#000" }]} />

          {/* Floating Close Button */}
          <View style={styles.floatingHeader}>
            <TouchableOpacity style={styles.roundButton} onPress={onClose}>
              <BlurView
                intensity={20}
                tint="dark"
                style={StyleSheet.absoluteFill}
              />
              <Ionicons name="close" size={24} color="#FFF" />
            </TouchableOpacity>
          </View>

          <Animated.ScrollView
            style={styles.scrollView}
            contentContainerStyle={{ paddingBottom: 100 }}
            scrollEventThrottle={16}
            onScroll={Animated.event(
              [{ nativeEvent: { contentOffset: { y: scrollY } } }],
              { useNativeDriver: true }
            )}
          >
            {/* Parallax Image Header */}
            <View style={styles.imageContainer}>
              <Animated.View
                style={[
                  StyleSheet.absoluteFill,
                  {
                    transform: [
                      { translateY: imageTranslateY },
                      { scale: imageScale },
                    ],
                  },
                ]}
              >
                {imageUrl ? (
                  <Image
                    source={{ uri: imageUrl }}
                    style={styles.image}
                    contentFit="cover"
                    transition={200}
                  />
                ) : (
                  <View style={styles.imagePlaceholder}>
                    <Ionicons name="image-outline" size={64} color="#333" />
                  </View>
                )}
                <LinearGradient
                  colors={["transparent", "rgba(0,0,0,0.8)"]}
                  style={styles.imageGradient}
                />
              </Animated.View>
            </View>

            {/* Content Sheet */}
            <View style={styles.contentSheet}>
              <View style={styles.handleBar} />

              {/* 1. Header Section */}
              <Animated.View
                style={{
                  opacity: headerOpacity,
                  transform: [{ translateY: contentTranslateY(headerOpacity) }],
                }}
              >
                {brand && (
                  <Text style={styles.brandText}>{brand.toUpperCase()}</Text>
                )}
                <Text style={styles.titleText}>{title}</Text>

                <View style={styles.priceRow}>
                  {price != null ? (
                    <Text style={styles.priceText}>
                      {new Intl.NumberFormat("en-US", {
                        style: "currency",
                        currency: currency,
                      }).format(price)}
                    </Text>
                  ) : (
                    <Text style={styles.priceTextPlaceholder}>Price N/A</Text>
                  )}

                  {displayItem?.for_sale && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>FOR SALE</Text>
                    </View>
                  )}
                </View>
              </Animated.View>

              <View style={styles.divider} />

              {/* 2. Grid Section */}
              <Animated.View
                style={[
                  styles.gridContainer,
                  {
                    opacity: gridOpacity,
                    transform: [{ translateY: contentTranslateY(gridOpacity) }],
                  },
                ]}
              >
                <InfoItem
                  icon="ribbon-outline"
                  label="Condition"
                  value={displayItem?.condition || "N/A"}
                  color={COLORS.primary}
                />
                <InfoItem
                  icon="pricetag-outline"
                  label="Category"
                  value={productData.category || "Uncategorized"}
                  color="#3B82F6"
                />
                <InfoItem
                  icon="business-outline"
                  label="Publisher"
                  value={productData.publisher || "Unknown"}
                  color="#F59E0B"
                />
                <InfoItem
                  icon="calendar-outline"
                  label="Added"
                  value={
                    displayItem?.created_at
                      ? new Date(displayItem.created_at).toLocaleDateString()
                      : "N/A"
                  }
                  color="#10B981"
                />
              </Animated.View>

              {/* 3. Description Section */}
              <Animated.View
                style={{
                  opacity: descOpacity,
                  transform: [{ translateY: contentTranslateY(descOpacity) }],
                }}
              >
                {(description || displayItem?.user_description) && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Description</Text>
                    {displayItem?.user_description && (
                      <Text style={[styles.descriptionText, { marginBottom: 10 }]}>{displayItem.user_description}</Text>
                    )}
                    {productData.searchableDescription && (
                      <Text style={[styles.descriptionText, { color: COLORS.textDim }]}>{productData.searchableDescription}</Text>
                    )}
                  </View>
                )}
              </Animated.View>

              {/* Identifiers (Static, part of desc block effectively) */}
              <Animated.View style={{
                paddingTop: 20,
                opacity: descOpacity
              }}>
                <Text style={styles.sectionTitle}>Identifiers</Text>
                <View style={styles.identifierRow}>
                  <Text style={styles.identifierLabel}>EAN/UPC</Text>
                  <Text style={styles.identifierValue}>{displayItem?.product_ean || 'N/A'}</Text>
                </View>
              </Animated.View>

            </View>
          </Animated.ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const InfoItem = ({
  icon,
  label,
  value,
  color,
}: {
  icon: any;
  label: string;
  value: string;
  color: string;
}) => (
  <View style={styles.gridItem}>
    <View style={[styles.iconBox, { backgroundColor: color + "20" }]}>
      <Ionicons name={icon} size={20} color={color} />
    </View>
    <View style={{ flex: 1 }}>
      <Text style={styles.gridLabel}>{label}</Text>
      <Text style={styles.gridValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  </View>
);

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
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    overflow: "hidden",
    // Base bg color, but content sheet covers most of it
    backgroundColor: "#000",
  },
  absoluteFill: {
    ...StyleSheet.absoluteFillObject,
  },
  floatingHeader: {
    position: "absolute",
    top: 20,
    right: 20,
    zIndex: 100,
  },
  roundButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  scrollView: {
    flex: 1,
  },
  imageContainer: {
    height: HEADER_HEIGHT,
    width: "100%",
    overflow: "hidden",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  imagePlaceholder: {
    width: "100%",
    height: "100%",
    backgroundColor: "#111",
    alignItems: "center",
    justifyContent: "center",
  },
  imageGradient: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 120, // Taller gradient for better fade
  },
  contentSheet: {
    flex: 1,
    backgroundColor: "#000",
    marginTop: -30, // Overlap the image
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingHorizontal: 24,
    paddingTop: 12,
    minHeight: 500,
  },
  handleBar: {
    width: 40,
    height: 4,
    backgroundColor: "#333",
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 24,
  },
  brandText: {
    color: "#9B5DE5",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 1,
    marginBottom: 8,
  },
  titleText: {
    color: "#FFF",
    fontSize: 26,
    fontWeight: "bold",
    marginBottom: 8,
    lineHeight: 32,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 8,
  },
  priceText: {
    color: "#FFF",
    fontSize: 22,
    fontWeight: "700",
  },
  priceTextPlaceholder: {
    color: "#666",
    fontSize: 20,
    fontWeight: "600",
  },
  badge: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeText: {
    color: "#FFF",
    fontSize: 12,
    fontWeight: "700",
  },
  divider: {
    height: 1,
    backgroundColor: "#222",
    marginVertical: 24,
  },
  gridContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
    marginBottom: 24,
  },
  gridItem: {
    width: "47%",
    backgroundColor: "#111",
    borderRadius: 12,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  gridLabel: {
    color: "#666",
    fontSize: 11,
    marginBottom: 2,
  },
  gridValue: {
    color: "#FFF",
    fontSize: 14,
    fontWeight: "600",
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    color: "#FFF",
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 12,
  },
  descriptionText: {
    color: "#CCC",
    fontSize: 15,
    lineHeight: 24,
  },
  identifierRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#111",
  },
  identifierLabel: {
    color: "#666",
    fontSize: 15,
  },
  identifierValue: {
    color: "#FFF",
    fontSize: 15,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
});
