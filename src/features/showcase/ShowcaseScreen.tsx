import { ShowcaseRow, useGetVisibleShowcases } from "@/api/showcase";
import { COLORS } from "@/constants/theme";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function ShowcaseScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data: showcases, isLoading, error } = useGetVisibleShowcases();

  const renderItem = ({ item }: { item: ShowcaseRow }) => (
    <Link
      href={{
        pathname: "/(tabs)/showcase/[id]",
        params: { id: item.id },
      }}
      asChild
    >
      <Pressable style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>{item.name}</Text>
          {item.is_default && (
            <View style={styles.defaultBadge}>
              <Text style={styles.defaultText}>Default</Text>
            </View>
          )}
        </View>
        <View style={styles.cardFooter}>
          <Text style={styles.date}>
            Created: {new Date(item.created_at).toLocaleDateString()}
          </Text>
          {item.is_public ? (
            <Ionicons name="globe-outline" size={16} color={COLORS.textDim} />
          ) : (
            <Ionicons
              name="lock-closed-outline"
              size={16}
              color={COLORS.textDim}
            />
          )}
        </View>
      </Pressable>
    </Link>
  );

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={COLORS.primary} />
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
      <View style={styles.header}>
        <Text style={styles.title}>My Showcases</Text>
        {/* Future: Add Create Button */}
      </View>

      <FlatList
        data={showcases}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="library-outline" size={64} color={COLORS.textDim} />
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background || "#000",
  },
  centered: {
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#222",
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: COLORS.white || "#FFF",
  },
  listContent: {
    padding: 16,
  },
  card: {
    backgroundColor: COLORS.surface || "#1A1A1A",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#333",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: COLORS.white || "#FFF",
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  date: {
    fontSize: 12,
    color: COLORS.textDim || "#888",
  },
  defaultBadge: {
    backgroundColor: "rgba(168, 85, 247, 0.2)", // Purple tint
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  defaultText: {
    fontSize: 10,
    color: COLORS.primary || "#A855F7",
    fontWeight: "bold",
  },
  errorText: {
    color: "#FF5252",
    fontSize: 16,
    marginBottom: 8,
  },
  errorSubText: {
    color: COLORS.textDim || "#888",
    fontSize: 14,
  },
  emptyContainer: {
    alignItems: "center",
    marginTop: 60,
  },
  emptyText: {
    color: COLORS.white || "#FFF",
    fontSize: 18,
    fontWeight: "600",
    marginTop: 16,
  },
  emptySubText: {
    color: COLORS.textDim || "#888",
    fontSize: 14,
    marginTop: 8,
  },
});
