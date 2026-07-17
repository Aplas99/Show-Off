import { useGetMyItems } from "@/api/items";
import { useMembership } from "@/api/memberships";
import {
  FREE_MAX_MEDIA_PER_POST,
  PAID_MAX_MEDIA_PER_POST,
  useCreatePost,
  type CreatePostMediaInput,
} from "@/api/social/posts";
import { TAB_BAR_HEIGHT } from "@/constants/layoutConfig";
import { useColors, type ThemeColors } from "@/constants/theme";
import { useHaptics } from "@/hooks/useHaptics";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { Stack, useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function CreatePostScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const haptics = useHaptics();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const [caption, setCaption] = useState("");
  const [media, setMedia] = useState<CreatePostMediaInput[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: membership } = useMembership();
  const isPaidUser = membership?.isCurator ?? false;
  const maxMedia = isPaidUser ? PAID_MAX_MEDIA_PER_POST : FREE_MAX_MEDIA_PER_POST;
  const { data: myItems = [] } = useGetMyItems();
  const createPost = useCreatePost();

  const bottomOffset =
    TAB_BAR_HEIGHT + insets.bottom + (Platform.OS === "android" ? 8 : 0) + 24;

  const pickMedia = async () => {
    setError(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError("Allow photo library access to attach media.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images", "videos"],
      allowsMultipleSelection: true,
      selectionLimit: Math.max(maxMedia - media.length, 1),
      quality: 0.85,
    });
    if (result.canceled) return;

    const picked: CreatePostMediaInput[] = result.assets.map((asset) => ({
      uri: asset.uri,
      type: asset.type === "video" ? "video" : "image",
      fileSize: asset.fileSize ?? undefined,
    }));

    setMedia((current) => {
      const next = [...current, ...picked];
      if (next.length > maxMedia) {
        setError(
          isPaidUser
            ? `Posts can include up to ${maxMedia} photos or videos.`
            : `Free accounts can attach up to ${maxMedia} photos or videos per post. Upgrade to Curator for up to ${PAID_MAX_MEDIA_PER_POST}.`,
        );
      }
      return next.slice(0, maxMedia);
    });
    await haptics.light();
  };

  const removeMedia = (index: number) => {
    setMedia((current) => current.filter((_, i) => i !== index));
  };

  const submit = async () => {
    setError(null);
    try {
      await createPost.mutateAsync({
        caption,
        itemId: selectedItemId,
        media,
      });
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Couldn't create your post. Please try again.",
      );
      return;
    }
    await haptics.success();
    router.replace("/(tabs)/discover");
  };

  const canSubmit =
    !createPost.isPending && (media.length > 0 || caption.trim().length > 0);

  return (
    <View style={[styles.page, { paddingTop: insets.top + 8 }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={() => router.back()}
        >
          <Ionicons name="close" size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.flex}>
          <Text style={styles.title}>New post</Text>
          <Text style={styles.subtitle}>
            Share photos or videos with your followers.
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.postButton, !canSubmit && styles.disabled]}
          onPress={submit}
          disabled={!canSubmit}
        >
          {createPost.isPending ? (
            <ActivityIndicator color="#000" size="small" />
          ) : (
            <Text style={styles.postButtonText}>Post</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: bottomOffset }]}
        keyboardShouldPersistTaps="handled"
      >
        <TextInput
          style={styles.captionInput}
          value={caption}
          onChangeText={setCaption}
          placeholder="Write a caption..."
          placeholderTextColor={colors.grey}
          multiline
          maxLength={2000}
        />

        {/* Media strip */}
        <Text style={styles.sectionLabel}>
          Media ({media.length}/{maxMedia})
        </Text>
        <View style={styles.mediaRow}>
          {media.map((item, index) => (
            <View key={`${item.uri}-${index}`} style={styles.mediaThumbWrap}>
              <Image source={{ uri: item.uri }} style={styles.mediaThumb} contentFit="cover" />
              {item.type === "video" && (
                <View style={styles.videoBadge}>
                  <Ionicons name="play" size={12} color="#FFF" />
                </View>
              )}
              <TouchableOpacity
                style={styles.removeMediaButton}
                onPress={() => removeMedia(index)}
              >
                <Ionicons name="close" size={13} color="#FFF" />
              </TouchableOpacity>
            </View>
          ))}
          {media.length < maxMedia && (
            <TouchableOpacity style={styles.addMediaButton} onPress={pickMedia}>
              <Ionicons name="add" size={26} color={colors.primary} />
              <Text style={styles.addMediaText}>
                {media.length === 0 ? "Add photos or videos" : "Add"}
              </Text>
            </TouchableOpacity>
          )}
        </View>
        {!isPaidUser && (
          <Text style={styles.limitNote}>
            Free accounts: up to {FREE_MAX_MEDIA_PER_POST} attachments and 5MB
            per file. Curators get {PAID_MAX_MEDIA_PER_POST} attachments and
            200MB per file.
          </Text>
        )}

        {/* Item reference */}
        <Text style={styles.sectionLabel}>Feature an item (optional)</Text>
        {myItems.length === 0 ? (
          <Text style={styles.limitNote}>
            Add items to your showcases and they&apos;ll appear here to feature
            in posts.
          </Text>
        ) : (
          <FlatList
            data={myItems}
            horizontal
            keyExtractor={(item) => String(item.id)}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.itemPickerRow}
            renderItem={({ item }) => {
              const selected = selectedItemId === item.id;
              return (
                <TouchableOpacity
                  style={[styles.itemOption, selected && styles.itemOptionSelected]}
                  onPress={() =>
                    setSelectedItemId((current) =>
                      current === item.id ? null : item.id,
                    )
                  }
                >
                  {item.imageUrl ? (
                    <Image
                      source={{ uri: item.imageUrl }}
                      style={styles.itemOptionImage}
                      contentFit="cover"
                    />
                  ) : (
                    <View style={[styles.itemOptionImage, styles.itemOptionFallback]}>
                      <Ionicons name="cube-outline" size={20} color={colors.grey} />
                    </View>
                  )}
                  <Text style={styles.itemOptionTitle} numberOfLines={2}>
                    {item.title}
                  </Text>
                  {selected && (
                    <View style={styles.itemSelectedBadge}>
                      <Ionicons name="checkmark" size={12} color="#FFF" />
                    </View>
                  )}
                </TouchableOpacity>
              );
            }}
          />
        )}

        {error && <Text style={styles.errorText}>{error}</Text>}
      </ScrollView>
    </View>
  );
}

function getStyles(colors: ThemeColors) {
  return StyleSheet.create({
    page: { flex: 1, backgroundColor: colors.background },
    flex: { flex: 1 },
    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingHorizontal: 20,
      paddingBottom: 14,
    },
    headerButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surfaceContainerHighest,
    },
    title: { color: colors.text, fontSize: 20, fontWeight: "800" },
    subtitle: { color: colors.onSurfaceVariant, fontSize: 12, marginTop: 2 },
    postButton: {
      minWidth: 76,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 18,
      backgroundColor: colors.primary,
    },
    postButtonText: { color: "#000", fontSize: 14, fontWeight: "800" },
    disabled: { opacity: 0.45 },
    content: { paddingHorizontal: 20, gap: 10 },
    captionInput: {
      minHeight: 110,
      borderRadius: 16,
      padding: 14,
      textAlignVertical: "top",
      color: colors.text,
      fontSize: 15,
      backgroundColor: colors.surfaceContainerHighest,
    },
    sectionLabel: {
      color: colors.text,
      fontSize: 13,
      fontWeight: "800",
      marginTop: 10,
    },
    mediaRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
    mediaThumbWrap: { position: "relative" },
    mediaThumb: {
      width: 86,
      height: 86,
      borderRadius: 12,
      backgroundColor: colors.surfaceContainerHighest,
    },
    videoBadge: {
      position: "absolute",
      bottom: 6,
      left: 6,
      width: 20,
      height: 20,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(0,0,0,0.65)",
    },
    removeMediaButton: {
      position: "absolute",
      top: -6,
      right: -6,
      width: 22,
      height: 22,
      borderRadius: 11,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.danger,
    },
    addMediaButton: {
      width: 86,
      height: 86,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      gap: 2,
      borderWidth: 1.5,
      borderStyle: "dashed",
      borderColor: colors.primary,
    },
    addMediaText: {
      color: colors.primary,
      fontSize: 9,
      fontWeight: "700",
      textAlign: "center",
      paddingHorizontal: 4,
    },
    limitNote: { color: colors.grey, fontSize: 11, lineHeight: 15 },
    itemPickerRow: { gap: 10, paddingVertical: 4 },
    itemOption: {
      width: 96,
      borderRadius: 14,
      padding: 8,
      gap: 6,
      backgroundColor: colors.surfaceContainerHighest,
      borderWidth: 1.5,
      borderColor: "transparent",
    },
    itemOptionSelected: { borderColor: colors.primary },
    itemOptionImage: {
      width: "100%",
      height: 76,
      borderRadius: 10,
    },
    itemOptionFallback: {
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surfaceContainerHigh,
    },
    itemOptionTitle: { color: colors.text, fontSize: 10, fontWeight: "700" },
    itemSelectedBadge: {
      position: "absolute",
      top: 6,
      right: 6,
      width: 20,
      height: 20,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.primary,
    },
    errorText: { color: colors.danger, fontSize: 12, marginTop: 6 },
  });
}
