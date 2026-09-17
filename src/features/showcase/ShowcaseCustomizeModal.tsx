import { useUpdateShowcaseCustomization } from "@/api/showcase";
import { useUploadImage } from "@/api/storage";
import { useColors, type ThemeColors } from "@/constants/theme";
import { showMessage } from "@/lib/dialogs";
import { DEFAULT_SHOWCASE_ACCENT } from "@/src/features/showcase/ShowcaseVisuals";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "@/src/components/media/ProtectedImage";
import * as ImagePicker from "expo-image-picker";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
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
  initialAccentColor?: string | null;
  initialBannerImageUrl?: string | null;
  canEditBanner?: boolean;
  onDismiss: () => void;
}

export default function ShowcaseCustomizeModal({
  visible,
  showcaseId,
  initialAccentColor,
  initialBannerImageUrl,
  canEditBanner = false,
  onDismiss,
}: ShowcaseCustomizeModalProps) {
  const colors = useColors();
  const styles = getStyles(colors);
  const [accentColor, setAccentColor] = useState(initialAccentColor ?? DEFAULT_SHOWCASE_ACCENT);
  const [bannerImageUrl, setBannerImageUrl] = useState(
    initialBannerImageUrl ?? null,
  );

  const uploadImage = useUploadImage();
  const updateCustomization = useUpdateShowcaseCustomization();

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
    const normalizedColor = accentColor.trim().toUpperCase();
    if (!/^#[0-9A-F]{6}$/.test(normalizedColor)) {
      showMessage("Invalid color", "Enter a six-digit hex color, such as #A77BFF.");
      return;
    }
    try {
      await updateCustomization.mutateAsync({
        showcaseId,
        accentColor: normalizedColor,
        ...(canEditBanner ? { bannerImageUrl } : {}),
      });
      onDismiss();
    } catch (error: any) {
      showMessage(
        "Couldn't save",
        error?.message ?? "Please try again.",
      );
    }
  };

  const isSaving = uploadImage.isPending || updateCustomization.isPending;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <Pressable style={styles.backdrop} onPress={onDismiss}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>Customize Showcase</Text>
          <Text style={styles.hint}>Choose a color for the outline and sheen on your showcase and its items.</Text>

          <Text style={styles.sectionLabel}>Accent color</Text>
          <View style={styles.swatchRow}>
            {ACCENT_SWATCHES.map((swatch) => (
              <TouchableOpacity
                key={swatch}
                onPress={() => setAccentColor(swatch)}
                style={[
                  styles.swatch,
                  { backgroundColor: swatch },
                  accentColor.toUpperCase() === swatch.toUpperCase() && styles.swatchSelected,
                ]}
              >
                {accentColor.toUpperCase() === swatch.toUpperCase() && (
                  <Ionicons name="checkmark" size={16} color="#FFF" />
                )}
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.sectionLabel}>Any color</Text>
          <View style={styles.colorInputRow}>
            <View style={[styles.colorPreview, { backgroundColor: /^#[0-9A-Fa-f]{6}$/.test(accentColor) ? accentColor : DEFAULT_SHOWCASE_ACCENT }]} />
            <TextInput value={accentColor} onChangeText={setAccentColor} maxLength={7} autoCapitalize="characters"
              accessibilityLabel="Showcase accent hex color" placeholder="#A77BFF" placeholderTextColor={colors.grey}
              style={[styles.colorInput, { color: colors.text, borderColor: colors.outlineVariant }]} />
          </View>

          {canEditBanner ? <><Text style={styles.sectionLabel}>Banner image</Text>
          <TouchableOpacity style={styles.bannerPicker} onPress={handlePickBanner}>
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
          </> : <Text style={styles.hint}>Curator members can also upload a custom banner.</Text>}

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
      backgroundColor: colors.surfaceContainer,
      borderRadius: 20,
      padding: 20,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
    },
    title: {
      color: colors.text,
      fontSize: 18,
      fontWeight: "800",
      marginBottom: 16,
    },
    hint: { color: colors.onSurfaceVariant, fontSize: 13, lineHeight: 18, marginBottom: 12 },
    colorInputRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 18 },
    colorPreview: { width: 38, height: 38, borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.45)" },
    colorInput: { flex: 1, minHeight: 46, borderWidth: 1, borderRadius: 11, paddingHorizontal: 12, fontSize: 16, fontWeight: "700" },
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
      marginBottom: 12,
    },
    actions: {
      flexDirection: "row",
      justifyContent: "flex-end",
      gap: 12,
      marginTop: 8,
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
