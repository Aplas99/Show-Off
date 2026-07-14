import { ShowcaseRow, useGetVisibleShowcases } from "@/api/showcase";
import { useColors, type ThemeColors } from "@/constants/theme";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Link } from "expo-router";
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

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

/** Rotating accent looks so every showcase card feels like its own little world. */
function getAccents(colors: ThemeColors): {
  gradient: [string, string];
  icon: IoniconName;
}[] {
  return [
    { gradient: [colors.primary, colors.secondary], icon: "planet" },
    { gradient: [colors.secondary, colors.tertiary], icon: "sparkles" },
    { gradient: [colors.tertiary, colors.primary], icon: "trophy" },
    { gradient: [colors.primaryContainer, colors.secondary], icon: "rocket" },
    { gradient: [colors.secondary, colors.primaryDim], icon: "diamond" },
    { gradient: [colors.primaryDim, colors.tertiary], icon: "color-palette" },
  ];
}

export default function ShowcaseScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const styles = getStyles(colors);
  const accents = getAccents(colors);
  const { data: showcases, isLoading, error } = useGetVisibleShowcases();

  const showcaseCount = showcases?.length ?? 0;

  const renderItem = ({ item, index }: { item: ShowcaseRow; index: number }) => {
    const accent = accents[index % accents.length];

    return (
      <Animated.View entering={FadeInDown.delay(index * 60).duration(400)}>
        <Link
          href={{
            pathname: "/(tabs)/showcase/[id]",
            params: { id: item.id },
          }}
          asChild
        >
          <Pressable
            style={({ pressed }) => [
              styles.card,
              { borderColor: `${accent.gradient[0]}40` },
              pressed && styles.cardPressed,
            ]}
          >
            {/* Soft accent wash across the card */}
            <LinearGradient
              colors={[`${accent.gradient[0]}14`, "transparent"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />

            {/* Thumbnail */}
            <LinearGradient
              colors={accent.gradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.thumbnail}
            >
              <View style={styles.thumbnailBubble} />
              <View style={styles.thumbnailBubbleSmall} />
              <Ionicons name={accent.icon} size={34} color="#FFF" />
            </LinearGradient>

            {/* Info */}
            <View style={styles.cardInfo}>
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
              <Text style={styles.cardTitle} numberOfLines={1}>
                {item.name}
              </Text>
              {item.is_default && (
                <View
                  style={[
                    styles.defaultBadge,
                    {
                      backgroundColor: `${accent.gradient[0]}22`,
                      borderColor: `${accent.gradient[0]}55`,
                    },
                  ]}
                >
                  <Ionicons name="star" size={10} color={accent.gradient[0]} />
                  <Text
                    style={[styles.defaultBadgeText, { color: accent.gradient[0] }]}
                  >
                    DEFAULT
                  </Text>
                </View>
              )}
            </View>

            <Ionicons
              name="chevron-forward"
              size={20}
              color={`${accent.gradient[0]}AA`}
            />
          </Pressable>
        </Link>
      </Animated.View>
    );
  };

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
      {/* Ambient glows behind everything */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <LinearGradient
          colors={[`${colors.primary}30`, "transparent"]}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.7, y: 1 }}
          style={styles.glowTop}
        />
        <LinearGradient
          colors={[`${colors.secondary}22`, "transparent"]}
          start={{ x: 1, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.glowRight}
        />
      </View>

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
            <LinearGradient
              colors={[colors.primary, colors.secondary, colors.tertiary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.heroUnderline}
            />
            <View style={styles.heroPill}>
              <View style={styles.heroPillDot} />
              <Text style={styles.heroPillLabel}>Active</Text>
              <Text style={styles.heroPillValue}>{showcaseCount}</Text>
            </View>
          </Animated.View>
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <LinearGradient
              colors={[colors.primary, colors.secondary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.emptyIconCircle}
            >
              <Ionicons name="sparkles" size={40} color="#FFF" />
            </LinearGradient>
            <Text style={styles.emptyText}>No showcases yet</Text>
            <Text style={styles.emptySubText}>
              Create your first showcase and start the collection!
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
    // --- Ambient glows ---
    glowTop: {
      position: "absolute",
      top: -80,
      left: -60,
      width: 320,
      height: 320,
      borderRadius: 320,
    },
    glowRight: {
      position: "absolute",
      top: 180,
      right: -100,
      width: 260,
      height: 260,
      borderRadius: 260,
    },
    // --- Hero ---
    heroSection: {
      marginBottom: 32,
      marginTop: 16,
    },
    heroTitle: {
      fontSize: 48,
      fontWeight: "800",
      color: colors.text,
      letterSpacing: -2,
      marginBottom: 8,
    },
    heroUnderline: {
      width: 120,
      height: 5,
      borderRadius: 3,
      marginBottom: 16,
    },
    heroPill: {
      flexDirection: "row",
      alignItems: "center",
      alignSelf: "flex-start",
      gap: 8,
      paddingHorizontal: 16,
      paddingVertical: 7,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: `${colors.primary}44`,
      backgroundColor: `${colors.primary}1A`,
    },
    heroPillDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: colors.primary,
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
      fontWeight: "800",
      color: colors.text,
    },
    // --- Card ---
    card: {
      flexDirection: "row",
      alignItems: "center",
      gap: 18,
      padding: 16,
      borderRadius: 20,
      backgroundColor: `${colors.surfaceContainer}CC`,
      borderWidth: 1.5,
      marginBottom: 14,
      overflow: "hidden",
    },
    cardPressed: {
      transform: [{ scale: 0.98 }],
      opacity: 0.9,
    },
    thumbnail: {
      width: 84,
      height: 84,
      borderRadius: 18,
      justifyContent: "center",
      alignItems: "center",
      overflow: "hidden",
    },
    thumbnailBubble: {
      position: "absolute",
      top: -22,
      right: -22,
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: "rgba(255,255,255,0.18)",
    },
    thumbnailBubbleSmall: {
      position: "absolute",
      bottom: -12,
      left: -12,
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: "rgba(255,255,255,0.12)",
    },
    cardInfo: {
      flex: 1,
      gap: 5,
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
      backgroundColor: `${colors.onSurfaceVariant}55`,
    },
    cardTitle: {
      fontSize: 22,
      fontWeight: "700",
      color: colors.text,
      letterSpacing: -0.5,
    },
    defaultBadge: {
      flexDirection: "row",
      alignItems: "center",
      alignSelf: "flex-start",
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 999,
      borderWidth: 1,
    },
    defaultBadgeText: {
      fontSize: 9,
      fontWeight: "800",
      letterSpacing: 1,
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
    emptyIconCircle: {
      width: 88,
      height: 88,
      borderRadius: 44,
      justifyContent: "center",
      alignItems: "center",
      marginBottom: 4,
    },
    emptyText: {
      color: colors.text,
      fontSize: 18,
      fontWeight: "700",
      marginTop: 16,
    },
    emptySubText: {
      color: colors.onSurfaceVariant,
      fontSize: 14,
      marginTop: 8,
    },
  });
