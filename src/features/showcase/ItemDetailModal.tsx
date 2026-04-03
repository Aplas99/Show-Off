import { ItemWithProduct } from "@/api/items";
import { COLORS } from "@/constants/theme";
import { Ionicons } from "@expo/vector-icons";

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
import { GestureHandlerRootView, PanGestureHandler, State } from "react-native-gesture-handler";

type Props = {
  visible: boolean;
  item: ItemWithProduct | null;
  onClose: () => void;
};

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get("window");

export default function ItemDetailModal({ visible, item, onClose }: Props) {
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const headerOpacity = useRef(new Animated.Value(0)).current;
  const gridOpacity = useRef(new Animated.Value(0)).current;
  const descOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      headerOpacity.setValue(0);
      gridOpacity.setValue(0);
      descOpacity.setValue(0);

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

      Animated.sequence([
        Animated.delay(100),
        Animated.stagger(80, [
          Animated.timing(headerOpacity, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
          }),
          Animated.timing(gridOpacity, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
          }),
          Animated.timing(descOpacity, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
          }),
        ]),
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

  const category =
    displayItem?.custom_category ||
    productData.category ||
    "Uncategorized";

  const publisher =
    displayItem?.custom_publisher ||
    productData.publisher ||
    "Unknown";

  const contentTranslateY = (anim: Animated.Value) =>
    anim.interpolate({
      inputRange: [0, 1],
      outputRange: [20, 0],
    });

  const onGestureEvent = Animated.event(
    [{ nativeEvent: { translationY: slideAnim } }],
    { useNativeDriver: true }
  );

  const onHandlerStateChange = ({ nativeEvent }: any) => {
    if (nativeEvent.oldState === State.ACTIVE) {
      if (nativeEvent.translationY > 100) {
        onClose();
      } else {
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          damping: 20,
          stiffness: 90,
        }).start();
      }
    }
  };

  return (
    <Modal
      transparent
      visible={visible}
      onRequestClose={onClose}
      animationType="none"
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
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
            <View style={[styles.absoluteFill, { backgroundColor: COLORS.background }]} />



            <Animated.ScrollView
              style={styles.scrollView}
              contentContainerStyle={{ paddingBottom: 100 }}
              scrollEventThrottle={16}
            >
              {/* Content */}
              <View style={styles.contentSheet}>
                <PanGestureHandler
                  onGestureEvent={onGestureEvent}
                  onHandlerStateChange={onHandlerStateChange}
                >
                  <Animated.View>
                    <View style={styles.handleBar} />
                  </Animated.View>
                </PanGestureHandler>

                {/* Back + More Row */}
                <View style={styles.inlineHeader}>
                  <TouchableOpacity style={styles.backButton} onPress={onClose}>
                    <Ionicons name="arrow-back" size={22} color={COLORS.primary} />
                  </TouchableOpacity>
                  <View style={styles.actionRow}>
                    <TouchableOpacity style={styles.editButton}>
                      <Ionicons name="pencil" size={16} color="#000" />
                      <Text style={styles.editButtonText}>Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.shareButton}>
                      <Ionicons name="share-outline" size={18} color="#FFF" />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* 1. Header Section */}
                <Animated.View
                  style={{
                    opacity: headerOpacity,
                    transform: [{ translateY: contentTranslateY(headerOpacity) }],
                  }}
                >
                  {brand && (
                    <View style={styles.brandBadge}>
                      <Text style={styles.brandText}>{brand}</Text>
                    </View>
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
                      <View style={styles.saleBadge}>
                        <Text style={styles.saleBadgeText}>FOR SALE</Text>
                      </View>
                    )}
                  </View>
                </Animated.View>

                {/* 2. Bento Grid */}
                <Animated.View
                  style={[
                    styles.bentoGrid,
                    {
                      opacity: gridOpacity,
                      transform: [{ translateY: contentTranslateY(gridOpacity) }],
                    },
                  ]}
                >
                  <View style={styles.bentoRow}>
                    <BentoItem
                      label="Condition"
                      value={displayItem?.condition || "N/A"}
                      flex={1}
                    />
                    <BentoItem
                      label="Category"
                      value={category}
                      flex={1}
                    />
                  </View>
                  <BentoItem
                    label="Publisher"
                    value={publisher}
                    trailing={
                      <View style={styles.verifiedIcon}>
                        <Ionicons name="checkmark-circle" size={22} color={COLORS.primary} />
                      </View>
                    }
                    fullWidth
                  />
                  <BentoItem
                    label="Date Added"
                    value={
                      displayItem?.created_at
                        ? new Date(displayItem.created_at).toLocaleDateString("en-US", {
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                          })
                        : "N/A"
                    }
                    icon="calendar-outline"
                    fullWidth
                  />
                </Animated.View>

                {/* 3. Provenance Section */}
                <Animated.View
                  style={{
                    opacity: descOpacity,
                    transform: [{ translateY: contentTranslateY(descOpacity) }],
                  }}
                >
                  {(description || displayItem?.user_description) && (
                    <View style={styles.provenanceSection}>
                      <Text style={styles.provenanceTitle}>Provenance</Text>
                      {displayItem?.user_description && (
                        <Text style={styles.provenanceText}>{displayItem.user_description}</Text>
                      )}
                      {productData.searchableDescription && (
                        <Text style={[styles.provenanceText, { color: "rgba(255,255,255,0.6)" }]}>
                          {productData.searchableDescription}
                        </Text>
                      )}
                    </View>
                  )}
                </Animated.View>

                {/* EAN/UPC */}
                <Animated.View style={{ opacity: descOpacity, paddingVertical: 24 }}>
                  <Text style={styles.eanText}>
                    EAN/UPC: {displayItem?.product_ean || "N/A"}
                  </Text>
                </Animated.View>
              </View>
            </Animated.ScrollView>
          </Animated.View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

// --- Bento Grid Item ---
const BentoItem = ({
  label,
  value,
  icon,
  trailing,
  flex,
  fullWidth,
}: {
  label: string;
  value: string;
  icon?: any;
  trailing?: React.ReactNode;
  flex?: number;
  fullWidth?: boolean;
}) => (
  <View
    style={[
      bentoStyles.container,
      flex ? { flex } : {},
      fullWidth ? { flexDirection: "row", alignItems: "center", justifyContent: "space-between" } : {},
    ]}
  >
    {icon && (
      <Ionicons
        name={icon}
        size={20}
        color={COLORS.onSurfaceVariant}
        style={{ marginRight: 12 }}
      />
    )}
    <View style={fullWidth && !icon ? { flex: 1 } : {}}>
      <Text style={bentoStyles.label}>{label}</Text>
      <Text style={bentoStyles.value}>{value}</Text>
    </View>
    {trailing}
  </View>
);

const bentoStyles = StyleSheet.create({
  container: {
    backgroundColor: `${COLORS.surfaceContainerHigh}66`,
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.03)",
  },
  label: {
    fontSize: 10,
    color: COLORS.onSurfaceVariant,
    textTransform: "uppercase",
    letterSpacing: 2,
    marginBottom: 4,
  },
  value: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFF",
  },
});

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
    height: "95%",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    overflow: "hidden",
    backgroundColor: COLORS.background,
  },
  absoluteFill: {
    ...StyleSheet.absoluteFillObject,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  scrollView: {
    flex: 1,
  },
  // --- Content Sheet ---
  contentSheet: {
    backgroundColor: COLORS.background,
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  handleBar: {
    width: 40,
    height: 4,
    backgroundColor: COLORS.outlineVariant,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 24,
    marginTop: 10,
  },
  // --- Inline Header ---
  inlineHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 32,
  },
  // --- Action Row ---
  actionRow: {
    flexDirection: "row",
    gap: 12,
  },
  editButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 999,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
  },
  editButtonText: {
    color: "#000",
    fontSize: 14,
    fontWeight: "700",
  },
  shareButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: `${COLORS.surfaceContainerHigh}99`,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  // --- Header Info ---
  brandBadge: {
    alignSelf: "flex-start",
    backgroundColor: `${COLORS.primary}1A`,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
    marginBottom: 8,
  },
  brandText: {
    color: COLORS.primary,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  titleText: {
    color: "#FFF",
    fontSize: 40,
    fontWeight: "800",
    letterSpacing: -2,
    marginBottom: 8,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 12,
    marginBottom: 32,
  },
  priceText: {
    color: "#FFF",
    fontSize: 28,
    fontWeight: "700",
  },
  priceTextPlaceholder: {
    color: COLORS.outline,
    fontSize: 20,
    fontWeight: "600",
  },
  saleBadge: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  saleBadgeText: {
    color: "#000",
    fontSize: 10,
    fontWeight: "800",
  },
  // --- Bento Grid ---
  bentoGrid: {
    gap: 16,
    marginBottom: 32,
  },
  bentoRow: {
    flexDirection: "row",
    gap: 16,
  },
  verifiedIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: COLORS.background,
    justifyContent: "center",
    alignItems: "center",
  },
  // --- Provenance ---
  provenanceSection: {
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.05)",
    paddingTop: 48,
    marginTop: 32,
    marginBottom: 20,
  },
  provenanceTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#FFF",
    letterSpacing: -0.5,
    marginBottom: 24,
  },
  provenanceText: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 15,
    lineHeight: 28,
    marginBottom: 10,
  },
  // --- EAN ---
  eanText: {
    fontSize: 10,
    color: "rgba(255,255,255,0.3)",
    textAlign: "center",
    letterSpacing: 1,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
});
