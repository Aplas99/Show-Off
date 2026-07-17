import {
  ItemWithProduct,
  useAddItemImages,
  useDeleteItem,
  useUpdateItemCondition,
} from "@/api/items";
import { useMembership } from "@/api/memberships";
import { ITEM_CONDITIONS } from "@/constants/itemCondition";
import { COLORS } from "@/constants/theme";
import { useAuthStore } from "@/hooks/useAuthStore";
import CyclingImage from "@/src/components/media/CyclingImage";
import { CuratorGateModal } from "@/src/features/membership/CuratorGate";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";

import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
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
  const updateCondition = useUpdateItemCondition();
  const deleteItem = useDeleteItem();
  const addItemImages = useAddItemImages();
  const { session } = useAuthStore();
  const { data: membership } = useMembership();
  const isCurator = membership?.isCurator ?? false;
  const isOwner = !!item && session?.user?.id === item.user_id;
  const [galleryPaywallVisible, setGalleryPaywallVisible] = useState(false);

  const galleryUrls =
    item?.image_urls && item.image_urls.length > 0
      ? item.image_urls
      : item?.image_url
        ? [item.image_url]
        : [];

  const handleAddPhotos = async () => {
    if (!item) return;
    if (!isCurator) {
      setGalleryPaywallVisible(true);
      return;
    }
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      selectionLimit: 8,
      quality: 0.85,
    });
    if (result.canceled || result.assets.length === 0) return;
    try {
      await addItemImages.mutateAsync({
        itemId: item.id,
        currentImageUrls: item.image_urls ?? [],
        currentCoverUrl: item.image_url,
        newImageUris: result.assets.map((asset) => ({
          uri: asset.uri,
          fileSize: asset.fileSize ?? undefined,
        })),
      });
    } catch (error: any) {
      Alert.alert(
        "Couldn't add photos",
        error?.message ?? "Please try again.",
      );
    }
  };

  const handleDelete = () => {
    if (!item) return;
    Alert.alert(
      "Delete Item",
      "This removes the item from all showcases and cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteItem.mutateAsync(item.id);
              onClose();
            } catch (error: any) {
              Alert.alert(
                "Could not delete item",
                error?.message ?? "Please try again.",
              );
            }
          },
        },
      ],
    );
  };
  const [conditionPickerOpen, setConditionPickerOpen] = useState(false);
  const [condition, setCondition] = useState<string | null>(item?.condition ?? null);
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

  useEffect(() => {
    setCondition(item?.condition ?? null);
  }, [item?.condition, item?.id]);

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
                    <TouchableOpacity
                      style={styles.deleteButton}
                      onPress={handleDelete}
                      disabled={deleteItem.isPending}
                      accessibilityRole="button"
                      accessibilityLabel="Delete item"
                    >
                      <Ionicons name="trash-outline" size={18} color="#FFF" />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Photo gallery — cycles with a fade when the item has
                    multiple images (Curator perk); tap advances manually. */}
                {(galleryUrls.length > 0 || isOwner) && (
                  <View style={styles.galleryWrap}>
                    {galleryUrls.length > 0 ? (
                      <CyclingImage
                        urls={galleryUrls}
                        style={styles.galleryImage}
                        contentFit="cover"
                      />
                    ) : (
                      <View style={[styles.galleryImage, styles.galleryEmpty]}>
                        <Ionicons name="images-outline" size={34} color="rgba(255,255,255,0.4)" />
                      </View>
                    )}
                    {isOwner && (
                      <TouchableOpacity
                        style={styles.addPhotosButton}
                        onPress={handleAddPhotos}
                        disabled={addItemImages.isPending}
                      >
                        <Ionicons
                          name={addItemImages.isPending ? "hourglass-outline" : "images"}
                          size={14}
                          color="#000"
                        />
                        <Text style={styles.addPhotosButtonText}>
                          {addItemImages.isPending ? "Uploading..." : "Add photos"}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}

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
                  {displayItem?.pokemon_tcg_card_id && price != null && (
                    <Text style={styles.priceDisclaimer}>
                      Market price estimate — may not be 100% accurate and
                      varies with grading, style, and condition.
                    </Text>
                  )}
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
                      value={condition || "Add condition"}
                      flex={1}
                      onPress={() => setConditionPickerOpen(true)}
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
      <Modal visible={conditionPickerOpen} transparent animationType="fade" onRequestClose={() => setConditionPickerOpen(false)}>
        <Pressable style={styles.conditionOverlay} onPress={() => setConditionPickerOpen(false)}>
          <View style={styles.conditionPicker}>
            <Text style={styles.conditionPickerTitle}>Card condition</Text>
            {ITEM_CONDITIONS.map((option) => (
              <TouchableOpacity
                key={option}
                style={styles.conditionOption}
                onPress={async () => {
                  if (!displayItem) return;
                  await updateCondition.mutateAsync({ itemId: displayItem.id, condition: option });
                  setCondition(option);
                  setConditionPickerOpen(false);
                }}
              >
                <Text style={styles.conditionOptionText}>{option}</Text>
                {condition === option && <Ionicons name="checkmark" size={20} color={COLORS.primary} />}
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>
      <CuratorGateModal
        visible={galleryPaywallVisible}
        feature="Multiple photos per item"
        description="Show off every angle — attach a full photo gallery to each item with Curator."
        onDismiss={() => setGalleryPaywallVisible(false)}
      />
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
  onPress,
}: {
  label: string;
  value: string;
  icon?: any;
  trailing?: React.ReactNode;
  flex?: number;
  fullWidth?: boolean;
  onPress?: () => void;
}) => (
  <TouchableOpacity
    style={[
      bentoStyles.container,
      flex ? { flex } : {},
      fullWidth ? { flexDirection: "row", alignItems: "center", justifyContent: "space-between" } : {},
    ]}
    onPress={onPress}
    disabled={!onPress}
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
  </TouchableOpacity>
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
  galleryWrap: {
    marginTop: 14,
    marginBottom: 4,
  },
  galleryImage: {
    width: "100%",
    height: 240,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  galleryEmpty: {
    alignItems: "center",
    justifyContent: "center",
  },
  addPhotosButton: {
    position: "absolute",
    right: 10,
    bottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: COLORS.primary,
  },
  addPhotosButtonText: {
    color: "#000",
    fontSize: 12,
    fontWeight: "800",
  },
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
  conditionOverlay: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    backgroundColor: "rgba(0,0,0,0.72)",
  },
  conditionPicker: {
    padding: 20,
    borderRadius: 20,
    backgroundColor: COLORS.surfaceContainerHigh,
  },
  conditionPickerTitle: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 12,
  },
  conditionOption: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: COLORS.outlineVariant,
  },
  conditionOptionText: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "600",
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
  deleteButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: `${COLORS.danger}CC`,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
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
  // Pulls up into priceRow's bottom margin so it hugs the price it qualifies.
  priceDisclaimer: {
    color: COLORS.onSurfaceVariant,
    fontSize: 11,
    lineHeight: 15,
    marginTop: -24,
    marginBottom: 32,
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
