import { ShowcaseRow, useGetVisibleShowcases } from "@/api/showcase";
import { useColors, type ThemeColors } from "@/constants/theme";
import { Ionicons } from "@expo/vector-icons";
import { Link, useRouter } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function ShowcaseScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const colors = useColors();
  const styles = getStyles(colors);
  const { data: showcases, isLoading, error } = useGetVisibleShowcases();

  const showcaseCount = showcases?.length ?? 0;

  const renderItem = ({ item, index }: { item: ShowcaseRow; index: number }) => (
    <Animated.View entering={FadeInDown.delay(index * 60).duration(400)}>
      <Link
        href={{
          pathname: "/(tabs)/showcase/[id]",
          params: { id: item.id },
        }}
        asChild
      >
        <Pressable style={styles.card}>
          {/* Thumbnail */}
          <View style={styles.thumbnail}>
            <View style={styles.thumbnailInner}>
              <Ionicons name="library" size={28} color={colors.onSurfaceVariant} />
            </View>
          </View>
          {/* Info */}
          <View style={styles.cardInfo}>
            {/* Date & Visibility */}
            <View style={styles.metaRow}>
              <Text style={styles.dateText}>
                {new Date(item.created_at).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </Text>
              <View style={styles.metaDot} />
              <Ionicons
                name={item.is_public ? "globe-outline" : "lock-closed-outline"}
                size={12}
                color={colors.onSurfaceVariant}
              />
            </View>
            {/* Title */}
            <Text style={styles.cardTitle} numberOfLines={1}>
              {item.name}
            </Text>
            {/* Description */}
            {item.is_default && (
              <Text style={styles.cardDescription} numberOfLines={1}>
                Default showcase
              </Text>
            )}
          </View>
        </Pressable>
      </Link>
    </Animated.View>
  );

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.errorText}>Failed to load showcases</Text>
        <Text style={styles.errorSubText}>{(error as Error).message}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <FlatList
        data={showcases}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <Animated.View
            entering={FadeInDown.duration(500)}
            style={styles.heroSection}
          >
            <Text style={styles.heroTitle}>Showcases</Text>
            <View style={styles.heroPill}>
              <Text style={styles.heroPillLabel}>Active</Text>
              <Text style={styles.heroPillValue}>{showcaseCount}</Text>
            </View>
          </Animated.View>
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="library-outline" size={64} color={colors.onSurfaceVariant} />
            <Text style={styles.emptyText}>No showcases found</Text>
            <Text style={styles.emptySubText}>
              Create your first showcase to get started!
            </Text>
          </View>
        }
      />
    </View>
  );
}

const getStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    centered: {
      justifyContent: "center",
      alignItems: "center",
    },
    listContent: {
      paddingHorizontal: 24,
      paddingBottom: 120,
    },
    // --- Hero ---
    heroSection: {
      marginBottom: 32,
      marginTop: 16,
    },
    heroLabel: {
      fontSize: 10,
      fontWeight: "700",
      color: colors.primary,
      letterSpacing: 2,
      textTransform: "uppercase",
      marginBottom: 8,
    },
    heroTitle: {
      fontSize: 48,
      fontWeight: "800",
      color: colors.text,
      letterSpacing: -2,
      marginBottom: 12,
    },
    heroPill: {
      flexDirection: "row",
      alignItems: "center",
      alignSelf: "flex-start",
      gap: 8,
      paddingHorizontal: 16,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: `${colors.outlineVariant}33`,
      backgroundColor: `${colors.surfaceContainerHigh}80`,
    },
    heroPillLabel: {
      fontSize: 10,
      fontWeight: "700",
      color: colors.onSurfaceVariant,
      textTransform: "uppercase",
      letterSpacing: 2,
    },
    heroPillValue: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.text,
    },
    // --- Card (card-glass) ---
    card: {
      flexDirection: "row",
      alignItems: "center",
      gap: 20,
      padding: 16,
      borderRadius: 16,
      backgroundColor: `${colors.surfaceContainer}99`,
      borderWidth: 1,
      borderColor: `${colors.outlineVariant}26`,
      marginBottom: 12,
    },
    thumbnail: {
      width: 96,
      height: 96,
      borderRadius: 12,
      overflow: "hidden",
    },
    thumbnailInner: {
      width: "100%",
      height: "100%",
      backgroundColor: colors.surfaceContainerHigh,
      justifyContent: "center",
      alignItems: "center",
    },
    cardInfo: {
      flex: 1,
      gap: 4,
    },
    metaRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    dateText: {
      fontSize: 10,
      fontWeight: "700",
      color: colors.onSurfaceVariant,
      textTransform: "uppercase",
      letterSpacing: 2,
    },
    metaDot: {
      width: 4,
      height: 4,
      borderRadius: 2,
      backgroundColor: `${colors.onSurfaceVariant}33`,
    },
    cardTitle: {
      fontSize: 22,
      fontWeight: "700",
      color: colors.text,
      letterSpacing: -0.5,
    },
    cardDescription: {
      fontSize: 12,
      color: colors.onSurfaceVariant,
    },
    // --- States ---
    errorText: {
      color: colors.danger,
      fontSize: 16,
      marginBottom: 8,
    },
    errorSubText: {
      color: colors.onSurfaceVariant,
      fontSize: 14,
    },
    emptyContainer: {
      alignItems: "center",
      marginTop: 60,
    },
    emptyText: {
      color: colors.text,
      fontSize: 18,
      fontWeight: "600",
      marginTop: 16,
    },
    emptySubText: {
      color: colors.onSurfaceVariant,
      fontSize: 14,
      marginTop: 8,
    },
  });
