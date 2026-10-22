import type { ItemWithProduct } from "@/api/items";
import { useRemoveItemsFromShowcase, useUpdateShowcaseCustomization } from "@/api/showcase";
import { useUploadImage } from "@/api/storage";
import { useColors, type ThemeColors } from "@/constants/theme";
import { confirmAction, showMessage } from "@/lib/dialogs";
import { getItemCoverUrl } from "@/lib/itemImages";
import { textOnAccent } from "@/lib/showcaseColor";
import { DEFAULT_SHOWCASE_ACCENT } from "@/src/features/showcase/ShowcaseVisuals";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "@/src/components/media/ProtectedImage";
import * as ImagePicker from "expo-image-picker";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

const ACCENT_SWATCHES = [
  "#9B7BFF",
  "#c77dff",
  "#ff94a4",
  "#4CAF50",
  "#FFB020",
  "#3DA9FC",
  "#FF6B6B",
  "#00C2A8",
];

interface ShowcaseCustomizeModalProps {
  visible: boolean;
  showcaseId: string;
  initialName: string;
  initialAccentColor?: string | null;
  initialBannerImageUrl?: string | null;
  canEditBanner?: boolean;
  /** Items currently in the showcase, offered for removal. */
  items: ItemWithProduct[];
  onDismiss: () => void;
}

export default function ShowcaseCustomizeModal({
  visible,
  showcaseId,
  initialName,
  initialAccentColor,
  initialBannerImageUrl,
  canEditBanner = false,
  items,
  onDismiss,
}: ShowcaseCustomizeModalProps) {
  const colors = useColors();
  const styles = getStyles(colors);
  const [name, setName] = useState(initialName);
  const [accentColor, setAccentColor] = useState(initialAccentColor ?? DEFAULT_SHOWCASE_ACCENT);
  const [bannerImageUrl, setBannerImageUrl] = useState(
    initialBannerImageUrl ?? null,
  );
  const [removedIds, setRemovedIds] = useState<Set<number>>(() => new Set());

  useEffect(() => {
    if (!visible) return;
    setName(initialName);
    setAccentColor(initialAccentColor ?? DEFAULT_SHOWCASE_ACCENT);
    setBannerImageUrl(initialBannerImageUrl ?? null);
    setRemovedIds(new Set());
  }, [visible, initialName, initialAccentColor, initialBannerImageUrl]);

  const uploadImage = useUploadImage();
  const updateCustomization = useUpdateShowcaseCustomization();
  const removeItems = useRemoveItemsFromShowcase();

  const toggleRemoved = (itemId: number) => {
    setRemovedIds((current) => {
      const next = new Set(current);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  const handlePickBanner = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [3, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;

    try {
      const url = await uploadImage.mutateAsync({
        uri: result.assets[0].uri,
        fileSize: result.assets[0].fileSize,
        bucketName: "item-images",
      });
      setBannerImageUrl(url);
    } catch (error: any) {
      showMessage(
        "Upload failed",
        error?.message ?? "Could not upload banner image.",
      );
    }
  };

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      showMessage("Name required", "Give your showcase a name.");
      return;
    }
    const normalizedColor = accentColor.trim().toUpperCase();
    if (!/^#[0-9A-F]{6}$/.test(normalizedColor)) {
      showMessage("Invalid color", "Enter a six-digit hex color, such as #A77BFF.");
      return;
    }
    const itemIds = [...removedIds];
    if (itemIds.length > 0 && !await confirmAction(
      `Remove ${itemIds.length} ${itemIds.length === 1 ? "item" : "items"}?`,
      "They leave this showcase but stay in your collection and any other showcases.",
      "Remove",
    )) return;
    try {
      await updateCustomization.mutateAsync({
        showcaseId,
        name: trimmedName,
        accentColor: normalizedColor,
        ...(canEditBanner ? { bannerImageUrl } : {}),
      });
      await removeItems.mutateAsync({ showcaseId, itemIds });
      onDismiss();
    } catch (error: any) {
      showMessage(
        "Couldn't save",
        error?.message ?? "Please try again.",
      );
    }
  };

  const isSaving = uploadImage.isPending || updateCustomization.isPending || removeItems.isPending;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <Pressable style={styles.backdrop} onPress={onDismiss}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>Edit Showcase</Text>
          <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">
            <Text style={styles.sectionLabel}>Name</Text>
            <TextInput value={name} onChangeText={setName} maxLength={100}
              accessibilityLabel="Showcase name" placeholder="Showcase name" placeholderTextColor={colors.grey}
              style={[styles.textInput, { color: colors.text, borderColor: colors.outlineVariant }]} />

            <Text style={styles.sectionLabel}>Accent color</Text>
            <Text style={styles.hint}>Colors the outline and sheen on your showcase and its items.</Text>
            <View style={styles.swatchRow}>
              {ACCENT_SWATCHES.map((swatch) => (
                <TouchableOpacity
                  key={swatch}
                  onPress={() => setAccentColor(swatch)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: accentColor.toUpperCase() === swatch.toUpperCase() }}
                  accessibilityLabel={`Accent ${swatch}`}
                  style={[
                    styles.swatch,
                    { backgroundColor: swatch },
                    accentColor.toUpperCase() === swatch.toUpperCase() && styles.swatchSelected,
                  ]}
                >
                  {accentColor.toUpperCase() === swatch.toUpperCase() && (
                    <Ionicons name="checkmark" size={16} color={textOnAccent(swatch)} />
                  )}
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.sectionLabel}>Any color</Text>
            <View style={styles.colorInputRow}>
              <View style={[styles.colorPreview, { backgroundColor: /^#[0-9A-Fa-f]{6}$/.test(accentColor) ? accentColor : DEFAULT_SHOWCASE_ACCENT }]} />
              <TextInput value={accentColor} onChangeText={setAccentColor} maxLength={7} autoCapitalize="characters"
                accessibilityLabel="Showcase accent hex color" placeholder="#A77BFF" placeholderTextColor={colors.grey}
                style={[styles.textInput, styles.colorInput, { color: colors.text, borderColor: colors.outlineVariant }]} />
            </View>

            <Text style={styles.sectionLabel}>Banner image</Text>
            {canEditBanner ? <>
              <TouchableOpacity style={styles.bannerPicker} onPress={handlePickBanner}
                accessibilityRole="button" accessibilityLabel={bannerImageUrl ? "Change banner image" : "Add a banner image"}>
                {bannerImageUrl ? (
                  <Image
                    source={{ uri: bannerImageUrl }}
                    style={styles.bannerPreview}
                    contentFit="cover"
                  />
                ) : (
                  <View style={styles.bannerPlaceholder}>
                    <Ionicons name="image-outline" size={22} color={colors.onSurfaceVariant} />
                    <Text style={styles.bannerPlaceholderText}>Add a banner image</Text>
                  </View>
                )}
              </TouchableOpacity>
              {bannerImageUrl && (
                <TouchableOpacity onPress={() => setBannerImageUrl(null)}>
                  <Text style={styles.removeBannerText}>Remove banner</Text>
                </TouchableOpacity>
              )}
            </> : <Text style={styles.hint}>Curator members can upload a custom banner.</Text>}

            <Text style={styles.sectionLabel}>
              Items ({items.length - removedIds.size}{removedIds.size > 0 ? ` of ${items.length}` : ""})
            </Text>
            {items.length === 0 ? <Text style={styles.hint}>This showcase has no items yet.</Text> : (
              <View style={styles.itemList}>
                {items.map((item) => {
                  const removed = removedIds.has(item.id);
                  const title = item.custom_title || item.products?.searchableTitle || "Untitled item";
                  const cover = getItemCoverUrl(item);
                  return (
                    <View key={item.id} style={[styles.itemRow, removed && styles.itemRowRemoved]}>
                      {cover
                        ? <Image source={{ uri: cover }} style={styles.itemThumb} contentFit="cover" />
                        : <View style={[styles.itemThumb, styles.itemThumbEmpty]}>
                          <Ionicons name="cube-outline" size={18} color={colors.onSurfaceVariant} />
                        </View>}
                      <Text style={[styles.itemTitle, removed && styles.itemTitleRemoved]} numberOfLines={2}>{title}</Text>
                      <TouchableOpacity onPress={() => toggleRemoved(item.id)} style={styles.itemAction}
                        accessibilityRole="button" accessibilityLabel={removed ? `Keep ${title}` : `Remove ${title}`}>
                        <Ionicons name={removed ? "arrow-undo" : "remove-circle-outline"} size={22}
                          color={removed ? colors.text : colors.danger} />
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            )}
          </ScrollView>

          <View style={styles.actions}>
            <TouchableOpacity onPress={onDismiss} style={styles.cancelButton}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSave}
              disabled={isSaving}
              style={[styles.saveButton, { backgroundColor: colors.tertiary }]}
            >
              {isSaving ? (
                <ActivityIndicator color="#000" size="small" />
              ) : (
                <Text style={styles.saveButtonText}>Save</Text>
              )}
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const getStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.7)",
      justifyContent: "center",
      padding: 20,
    },
    card: {
      width: "100%",
      maxWidth: 560,
      maxHeight: "90%",
      alignSelf: "center",
      backgroundColor: colors.surfaceContainer,
      borderRadius: 20,
      padding: 20,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
    },
    body: { flexGrow: 0 },
    title: {
      color: colors.text,
      fontSize: 18,
      fontWeight: "800",
      marginBottom: 16,
    },
    hint: { color: colors.onSurfaceVariant, fontSize: 13, lineHeight: 18, marginBottom: 12 },
    textInput: { minHeight: 46, borderWidth: 1, borderRadius: 11, paddingHorizontal: 12, fontSize: 16, fontWeight: "700", marginBottom: 18 },
    colorInputRow: { flexDirection: "row", alignItems: "center", gap: 12 },
    colorPreview: { width: 38, height: 38, borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.45)", marginBottom: 18 },
    colorInput: { flex: 1 },
    sectionLabel: {
      color: colors.onSurfaceVariant,
      fontSize: 12,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 1,
      marginBottom: 10,
    },
    swatchRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
      marginBottom: 20,
    },
    swatch: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
    },
    swatchSelected: {
      borderWidth: 2,
      borderColor: colors.text,
    },
    bannerPicker: {
      borderRadius: 12,
      overflow: "hidden",
      marginBottom: 8,
    },
    bannerPreview: {
      width: "100%",
      height: 90,
    },
    bannerPlaceholder: {
      height: 90,
      borderRadius: 12,
      borderWidth: 1,
      borderStyle: "dashed",
      borderColor: colors.outlineVariant,
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
    },
    bannerPlaceholderText: {
      color: colors.onSurfaceVariant,
      fontSize: 13,
    },
    removeBannerText: {
      color: colors.danger,
      fontSize: 13,
      fontWeight: "600",
      marginBottom: 18,
    },
    itemList: { gap: 8, marginBottom: 8 },
    itemRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      padding: 8,
      borderRadius: 12,
      backgroundColor: colors.surfaceContainerHigh,
    },
    itemRowRemoved: { opacity: 0.5 },
    itemThumb: { width: 44, height: 44, borderRadius: 8, overflow: "hidden" },
    itemThumbEmpty: { alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceContainerHighest },
    itemTitle: { flex: 1, color: colors.text, fontSize: 14, fontWeight: "600" },
    itemTitleRemoved: { textDecorationLine: "line-through" },
    itemAction: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
    actions: {
      flexDirection: "row",
      justifyContent: "flex-end",
      gap: 12,
      marginTop: 12,
    },
    cancelButton: {
      paddingVertical: 10,
      paddingHorizontal: 16,
    },
    cancelButtonText: {
      color: colors.grey,
      fontSize: 14,
      fontWeight: "600",
    },
    saveButton: {
      paddingVertical: 10,
      paddingHorizontal: 20,
      borderRadius: 999,
      minWidth: 72,
      alignItems: "center",
    },
    saveButtonText: {
      color: "#000",
      fontSize: 14,
      fontWeight: "800",
    },
  });
