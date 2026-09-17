import ContentSafetyMenu from "@/src/components/social/ContentSafetyMenu";
import {
  ItemWithProduct,
  type ItemDetailsUpdate,
  useAddItemImages,
  useDeleteItem,
  useUpdateItemCondition,
  useUpdateItemDetails,
} from "@/api/items";
import { useMembership } from "@/api/memberships";
import { useBookmarkItem, useIsItemBookmarked, useUnbookmarkItem } from "@/api/social/interactions";
import { ITEM_CONDITIONS } from "@/constants/itemCondition";
import { COLORS } from "@/constants/theme";
import { useAuthStore } from "@/hooks/useAuthStore";
import { DEFAULT_SHOWCASE_ACCENT } from "@/src/features/showcase/ShowcaseVisuals";
import { confirmAction, showMessage } from "@/lib/dialogs";
import CyclingImage from "@/src/components/media/CyclingImage";
import { CuratorGateModal } from "@/src/features/membership/CuratorGate";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";

import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { GestureHandlerRootView, PanGestureHandler, State } from "react-native-gesture-handler";

type Props = {
  visible: boolean;
  item: ItemWithProduct | null;
  onClose: () => void;
  accentColor?: string;
};

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

export default function ItemDetailModal({ visible, item, onClose, accentColor = DEFAULT_SHOWCASE_ACCENT }: Props) {
  const updateCondition = useUpdateItemCondition();
  const deleteItem = useDeleteItem();
  const addItemImages = useAddItemImages();
  const updateDetails = useUpdateItemDetails();
  const { data: bookmarked } = useIsItemBookmarked(item?.id ?? 0);
  const bookmarkItem = useBookmarkItem();
  const unbookmarkItem = useUnbookmarkItem();
  const { session } = useAuthStore();
  const { data: membership } = useMembership();
  const isCurator = membership?.isCurator ?? false;
  const isOwner = !!item && session?.user?.id === item.user_id;
  const [galleryPaywallVisible, setGalleryPaywallVisible] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editedFields, setEditedFields] = useState<Partial<ItemWithProduct> | null>(null);

  useEffect(() => {
    setEditedFields(null);
    setEditOpen(false);
  }, [item?.id]);
  useEffect(() => {
    if (!visible) setEditOpen(false);
  }, [visible]);

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
    if (Platform.OS !== "web") {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) return;
    }
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
      showMessage(
        "Couldn't add photos",
        error?.message ?? "Please try again.",
      );
    }
  };

  const handleDelete = async () => {
    if (!item) return;
    if (!await confirmAction(
      "Delete Item",
      "This removes the item from all showcases and cannot be undone.",
      "Delete",
    )) return;
    try {
      await deleteItem.mutateAsync(item.id);
      onClose();
    } catch (error: unknown) {
      showMessage("Could not delete item", error instanceof Error ? error.message : "Please try again.");
    }
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
  const displayItem = item && editedFields ? { ...item, ...editedFields } : item;
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
              Platform.OS === "web" && styles.webModalContainer,
              { borderColor: `${accentColor}A8` },
              { transform: [{ translateY: slideAnim }] },
            ]}
          >
            <View style={[styles.absoluteFill, { backgroundColor: COLORS.background }]} />



            <Animated.ScrollView
              style={styles.scrollView}
              contentContainerStyle={{ paddingBottom: 100 }}
              scrollEventThrottle={16}
            >
              {item && <ContentSafetyMenu type="item" id={item.id} ownerId={item.user_id} />}
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
                    {isOwner && <>
                      <TouchableOpacity style={styles.editButton} onPress={() => setEditOpen(true)} accessibilityRole="button" accessibilityLabel="Edit item details">
                        <Ionicons name="pencil" size={16} color="#000" />
                        <Text style={styles.editButtonText}>Edit</Text>
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
                    </>}
                  </View>
                </View>

                {/* Photo gallery — cycles with a fade when the item has
                    multiple images (Curator perk); tap advances manually. */}
                {(galleryUrls.length > 0 || isOwner) && (
                  <View style={[styles.galleryWrap, { borderColor: accentColor }]}>
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
                    <LinearGradient colors={[`${accentColor}3D`, "transparent", "rgba(0,0,0,0.16)"]}
                      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} pointerEvents="none" />
                    <LinearGradient colors={["rgba(255,255,255,0.36)", "transparent"]}
                      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.gallerySheen} pointerEvents="none" />
                    {price != null && <View style={styles.galleryPrice}><Text style={styles.galleryPriceText}>
                      {new Intl.NumberFormat("en-US", { style: "currency", currency }).format(price)}
                    </Text></View>}
                    <TouchableOpacity style={styles.galleryHeart} accessibilityRole="button"
                      accessibilityLabel={bookmarked ? "Remove saved item" : "Save item"}
                      onPress={async () => {
                        if (!displayItem) return;
                        try {
                          if (bookmarked) await unbookmarkItem.mutateAsync(displayItem.id);
                          else await bookmarkItem.mutateAsync(displayItem.id);
                        } catch (failure: unknown) {
                          showMessage("Could not save item", failure instanceof Error ? failure.message : "Please try again.");
                        }
                      }}>
                      <Ionicons name={bookmarked ? "heart" : "heart-outline"} size={23} color={bookmarked ? accentColor : "#FFF"} />
                    </TouchableOpacity>
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
                      onPress={isOwner ? () => setConditionPickerOpen(true) : undefined}
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
      {displayItem && <EditItemDetailsModal
        visible={editOpen}
        item={displayItem}
        saving={updateDetails.isPending}
        onClose={() => setEditOpen(false)}
        onSave={async (fields) => {
          const updated = await updateDetails.mutateAsync({ itemId: displayItem.id, ...fields });
          setEditedFields(updated);
          setEditOpen(false);
        }}
      />}
    </Modal>
  );
}

type EditableFields = Omit<ItemDetailsUpdate, "itemId">;

function EditItemDetailsModal({ visible, item, saving, onClose, onSave }: {
  visible: boolean;
  item: ItemWithProduct;
  saving: boolean;
  onClose: () => void;
  onSave: (fields: EditableFields) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [brand, setBrand] = useState("");
  const [publisher, setPublisher] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [forSale, setForSale] = useState(false);
  const initializedItemId = useRef<number | null>(null);

  useEffect(() => {
    if (!visible) {
      initializedItemId.current = null;
      return;
    }
    if (initializedItemId.current === item.id) return;
    initializedItemId.current = item.id;
    const product = item.products;
    setTitle(item.custom_title || product?.searchableTitle || "");
    setBrand(item.custom_brand || product?.searchableBrand || "");
    setPublisher(item.custom_publisher || "");
    setCategory(item.custom_category || "");
    setDescription(item.user_description || "");
    setPrice(item.price == null ? "" : String(item.price));
    setForSale(item.for_sale);
  }, [visible, item]);

  const save = async () => {
    const parsedPrice = price.trim() === "" ? null : Number(price.trim());
    if (!title.trim()) return showMessage("Title required", "Enter an item title.");
    if (parsedPrice !== null && (!Number.isFinite(parsedPrice) || parsedPrice < 0)) {
      return showMessage("Invalid price", "Enter a positive number or leave the price blank.");
    }
    try {
      await onSave({ title, brand, publisher, category, description, price: parsedPrice, forSale });
    } catch (error: unknown) {
      showMessage("Could not save item", error instanceof Error ? error.message : "Please try again.");
    }
  };

  const fields = [
    { label: "Title", value: title, onChangeText: setTitle, multiline: false },
    { label: "Brand", value: brand, onChangeText: setBrand, multiline: false },
    { label: "Publisher", value: publisher, onChangeText: setPublisher, multiline: false },
    { label: "Category", value: category, onChangeText: setCategory, multiline: false },
    { label: "Extra details", value: description, onChangeText: setDescription, multiline: true },
  ];

  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <View style={editStyles.overlay}>
      <View style={editStyles.card}>
        <Text style={editStyles.heading}>Edit item details</Text>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={editStyles.fields}>
          {fields.map((field) => <View key={field.label}>
            <Text style={editStyles.label}>{field.label}</Text>
            <TextInput
              accessibilityLabel={field.label}
              style={[editStyles.input, field.multiline && editStyles.multiline]}
              value={field.value}
              onChangeText={field.onChangeText}
              multiline={field.multiline}
              maxLength={field.multiline ? 2000 : 160}
              placeholderTextColor={COLORS.onSurfaceVariant}
            />
          </View>)}
          <Text style={editStyles.label}>Price ({item.currency_code || "USD"})</Text>
          <TextInput accessibilityLabel="Price" style={editStyles.input} value={price} onChangeText={setPrice} keyboardType="decimal-pad" />
          <TouchableOpacity onPress={() => setForSale((current) => !current)} accessibilityRole="switch" accessibilityState={{ checked: forSale }} style={editStyles.saleRow}>
            <Text style={editStyles.label}>For sale</Text>
            <Ionicons name={forSale ? "checkbox" : "square-outline"} size={24} color={COLORS.primary} />
          </TouchableOpacity>
        </ScrollView>
        <View style={editStyles.actions}>
          <TouchableOpacity onPress={onClose} disabled={saving} style={editStyles.cancelButton} accessibilityRole="button"><Text style={editStyles.cancelText}>Cancel</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => void save()} disabled={saving} style={editStyles.saveButton} accessibilityRole="button"><Text style={editStyles.saveText}>{saving ? "Saving..." : "Save changes"}</Text></TouchableOpacity>
        </View>
      </View>
    </View>
  </Modal>;
}

const editStyles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "center", alignItems: "center", padding: 16, backgroundColor: "rgba(0,0,0,0.75)" },
  card: { width: "100%", maxWidth: 560, maxHeight: "90%", padding: 20, borderRadius: 20, backgroundColor: COLORS.surfaceContainerHigh },
  heading: { color: COLORS.text, fontSize: 21, fontWeight: "800", marginBottom: 16 },
  fields: { gap: 12, paddingBottom: 12 },
  label: { color: COLORS.text, fontSize: 13, fontWeight: "700", marginBottom: 6 },
  input: { color: COLORS.text, backgroundColor: COLORS.background, borderColor: COLORS.outlineVariant, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  multiline: { minHeight: 96, textAlignVertical: "top" },
  saleRow: { minHeight: 48, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 12, paddingTop: 12 },
  cancelButton: { minHeight: 44, paddingHorizontal: 14, justifyContent: "center" },
  cancelText: { color: COLORS.text, fontWeight: "700" },
  saveButton: { minHeight: 44, paddingHorizontal: 18, justifyContent: "center", borderRadius: 12, backgroundColor: COLORS.primary },
  saveText: { color: "#000", fontWeight: "800" },
});

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
    borderWidth: 1.5,
    borderRadius: 20,
    overflow: "hidden",
  },
  gallerySheen: { position: "absolute", left: 0, top: 0, width: "75%", height: "75%", opacity: 0.24 },
  galleryPrice: { position: "absolute", left: 12, bottom: 12, borderRadius: 999, paddingHorizontal: 13, paddingVertical: 8, backgroundColor: "rgba(17,14,24,0.78)" },
  galleryPriceText: { color: "#FFF", fontSize: 18, fontWeight: "900" },
  galleryHeart: { position: "absolute", top: 12, right: 12, width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(17,14,24,0.76)", borderWidth: 1, borderColor: "rgba(255,255,255,0.24)" },
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
    borderWidth: 1.5,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    overflow: "hidden",
    backgroundColor: COLORS.background,
  },
  webModalContainer: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
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
