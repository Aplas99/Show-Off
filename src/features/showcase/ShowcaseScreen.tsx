import { useMembership } from "@/api/memberships";
import { ShowcaseRow, useCreateShowcase, useGetShowcaseStats, useGetVisibleShowcases } from "@/api/showcase";
import { useColors, type ThemeColors } from "@/constants/theme";
import { showMessage } from "@/lib/dialogs";
import { showcaseDisplayAccent } from "@/lib/showcaseColor";
import BannerAdView from "@/src/components/ads/BannerAdView";
import { CuratorGateModal } from "@/src/features/membership/CuratorGate";
import { DEFAULT_SHOWCASE_ACCENT, ShowcaseBanner, ShowcaseStatsBar } from "@/src/features/showcase/ShowcaseVisuals";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Link } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function ShowcaseCoverCard({ item, index }: { item: ShowcaseRow; index: number }) {
  const colors = useColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const { width } = useWindowDimensions();
  const { data: stats } = useGetShowcaseStats(item.id);
  const accentColor = showcaseDisplayAccent(item.accent_color || DEFAULT_SHOWCASE_ACCENT);
  const bannerHeight = Math.max(145, Math.min(270, (Math.min(width, 900) - 48) / 3.2));

  return <Animated.View entering={FadeInDown.delay(index * 60).duration(400)}>
    <Link href={{ pathname: "/(tabs)/showcase/[id]", params: { id: item.id } }} asChild>
      <Pressable accessibilityRole="button" accessibilityLabel={`Open ${item.name} showcase`}
        style={({ pressed }) => [styles.card, { borderColor: `${accentColor}A8` }, pressed && styles.cardPressed]}>
        <ShowcaseBanner imageUrl={item.banner_image_url} accentColor={accentColor} height={bannerHeight} />
        <View style={styles.cardBody}>
          <View style={styles.cardHeadingRow}>
            <View style={styles.cardHeadingCopy}>
              <Text style={styles.cardTitle} numberOfLines={2}>{item.name}</Text>
              {item.description ? <Text style={styles.cardDescription} numberOfLines={2}>{item.description}</Text> : null}
            </View>
            <View style={styles.cardArrow}><Ionicons name="chevron-forward" size={22} color="#FFF" /></View>
          </View>
          <ShowcaseStatsBar itemCount={stats?.itemCount ?? null} followerCount={stats?.followerCount ?? null}
            estimatedValue={stats?.estimatedValue ?? null} accentColor={accentColor} />
        </View>
      </Pressable>
    </Link>
  </Animated.View>;
}

export default function ShowcaseScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const { data: showcases, isLoading, error } = useGetVisibleShowcases();
  const { data: membership } = useMembership();
  const isPaidUser = membership?.isPaidUser ?? false;
  const createShowcase = useCreateShowcase();
  const [createPaywallVisible, setCreatePaywallVisible] = useState(false);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [showcaseName, setShowcaseName] = useState("");

  const handleCreatePress = useCallback(() => {
    if (isPaidUser) setCreateModalVisible(true);
    else setCreatePaywallVisible(true);
  }, [isPaidUser]);

  const handleCreateShowcase = async () => {
    const name = showcaseName.replace(/\s+/g, " ").trim();
    if (!name) return;
    try {
      await createShowcase.mutateAsync({ name });
      setShowcaseName("");
      setCreateModalVisible(false);
    } catch (caught: unknown) {
      showMessage("Could not create showcase", caught instanceof Error ? caught.message : "Please try again.");
    }
  };

  if (isLoading) return <View style={[styles.container, styles.centered]}><ActivityIndicator size="large" color={colors.primary} /></View>;
  if (error) return <View style={[styles.container, styles.centered]}><Text style={styles.errorText}>Failed to load showcases</Text><Text style={styles.muted}>{error.message}</Text></View>;

  return <View style={[styles.container, { paddingTop: insets.top }]}>
    <FlatList
      data={showcases}
      renderItem={({ item, index }) => <ShowcaseCoverCard item={item} index={index} />}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.listContent}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      ListHeaderComponent={<View style={styles.header}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.heading}>Showcases</Text>
            <Text style={styles.muted}>Your collections, in one place</Text>
          </View>
          <TouchableOpacity style={styles.createButton} onPress={handleCreatePress} accessibilityRole="button"
            accessibilityLabel={isPaidUser ? "Create a new showcase" : "Additional showcases require a paid membership"}>
            <Ionicons name={isPaidUser ? "add" : "lock-closed"} size={18} color="#FFF" />
            <Text style={styles.createText}>New</Text>
          </TouchableOpacity>
        </View>
        <LinearGradient colors={[colors.primary, colors.secondary, "transparent"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.underline} />
      </View>}
      ListEmptyComponent={<View style={styles.empty}>
        <Ionicons name="albums-outline" size={46} color={colors.primary} />
        <Text style={styles.emptyTitle}>No showcases yet</Text>
        <Text style={styles.muted}>Create your first showcase and start collecting.</Text>
      </View>}
      ListFooterComponent={showcases?.length ? <View style={styles.adFooter}><BannerAdView /></View> : null}
    />

    <Modal visible={createModalVisible} transparent animationType="fade" onRequestClose={() => setCreateModalVisible(false)}>
      <Pressable style={styles.modalBackdrop} onPress={() => setCreateModalVisible(false)}>
        <Pressable style={styles.createModal} onPress={(event) => event.stopPropagation()}>
          <Text style={styles.modalTitle}>New showcase</Text>
          <Text style={styles.muted}>Give this collection a memorable name. You can customize its look afterward.</Text>
          <TextInput value={showcaseName} onChangeText={setShowcaseName} placeholder="Showcase name"
            placeholderTextColor={colors.grey} style={styles.createInput} autoFocus maxLength={80}
            returnKeyType="done" onSubmitEditing={handleCreateShowcase} />
          <TouchableOpacity style={[styles.confirmButton, (!showcaseName.trim() || createShowcase.isPending) && styles.disabled]}
            onPress={handleCreateShowcase} disabled={!showcaseName.trim() || createShowcase.isPending}>
            {createShowcase.isPending ? <ActivityIndicator color="#FFF" /> : <Text style={styles.confirmText}>Create showcase</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelButton} onPress={() => setCreateModalVisible(false)}><Text style={styles.muted}>Cancel</Text></TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
    <CuratorGateModal visible={createPaywallVisible} feature="Additional showcases"
      description="Collector accounts are limited to one showcase. Upgrade to Curator to create unlimited showcases."
      onDismiss={() => setCreatePaywallVisible(false)} />
  </View>;
}

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: { justifyContent: "center", alignItems: "center", padding: 24 },
  listContent: { width: "100%", maxWidth: 900, alignSelf: "center", paddingHorizontal: 18, paddingBottom: 120 },
  header: { paddingTop: 20, paddingBottom: 22 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
  heading: { color: colors.text, fontSize: 34, fontWeight: "900", letterSpacing: -1 },
  muted: { color: colors.onSurfaceVariant, fontSize: 14, lineHeight: 20 },
  underline: { width: 150, height: 3, borderRadius: 2, marginTop: 14 },
  createButton: { flexDirection: "row", alignItems: "center", gap: 5, minHeight: 44, paddingHorizontal: 15, borderRadius: 22, backgroundColor: colors.primary },
  createText: { color: "#FFF", fontWeight: "800" },
  separator: { height: 18 },
  card: { width: "100%", backgroundColor: "#1C1A24", borderWidth: 1.5, borderRadius: 28, overflow: "hidden", shadowColor: colors.primary, shadowOpacity: 0.17, shadowRadius: 22, elevation: 5 },
  cardPressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
  cardBody: { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 4 },
  cardHeadingRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  cardHeadingCopy: { flex: 1 },
  cardTitle: { color: "#FFF", fontSize: 28, fontWeight: "900", letterSpacing: -0.6 },
  cardDescription: { color: "#B2AEBE", fontSize: 13, marginTop: 2 },
  cardArrow: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#514A61", backgroundColor: "#201F29" },
  empty: { alignItems: "center", gap: 12, marginTop: 70 },
  emptyTitle: { color: colors.text, fontSize: 20, fontWeight: "800" },
  errorText: { color: colors.danger, fontSize: 17, fontWeight: "700" },
  adFooter: { alignItems: "center", marginTop: 24 },
  modalBackdrop: { flex: 1, justifyContent: "center", alignItems: "center", padding: 20, backgroundColor: "rgba(0,0,0,0.75)" },
  createModal: { width: "100%", maxWidth: 440, padding: 24, gap: 16, borderRadius: 22, borderWidth: 1, borderColor: colors.outlineVariant, backgroundColor: colors.surfaceContainer },
  modalTitle: { color: colors.text, fontSize: 23, fontWeight: "900" },
  createInput: { minHeight: 50, borderRadius: 12, borderWidth: 1, borderColor: colors.outlineVariant, backgroundColor: colors.surfaceContainerHigh, color: colors.text, paddingHorizontal: 14, fontSize: 16 },
  confirmButton: { minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: 24, backgroundColor: colors.primary },
  confirmText: { color: "#FFF", fontWeight: "800" },
  disabled: { opacity: 0.45 },
  cancelButton: { minHeight: 40, alignItems: "center", justifyContent: "center" },
});
