import { ItemWithProduct, useGetItemsWithProductData } from "@/api/items";
import { useMembership } from "@/api/memberships";
import { useGetShowcase, useGetShowcaseOwner, useGetShowcaseStats, useToggleShowcaseFollow } from "@/api/showcase";
import ShowcaseSettingsModal from "@/src/features/showcase/ShowcaseSettingsModal";
import ShowcaseCustomizeModal from "@/src/features/showcase/ShowcaseCustomizeModal";
import { DEFAULT_SHOWCASE_ACCENT, ShowcaseBanner, ShowcaseStatsBar } from "@/src/features/showcase/ShowcaseVisuals";
import ContentSafetyMenu from "@/src/components/social/ContentSafetyMenu";
import { Image } from "@/src/components/media/ProtectedImage";
import { useAuthStore } from "@/hooks/useAuthStore";
import { TAB_BAR_HEIGHT } from "@/constants/layoutConfig";
import { showMessage } from "@/lib/dialogs";
import { showcaseDisplayAccent, textOnAccent } from "@/lib/showcaseColor";
import { CuratorGateModal } from "@/src/features/membership/CuratorGate";
import ItemDetailModal from "@/src/features/showcase/ItemDetailModal";
import { PokemonCardGridView } from "@/src/features/showcase/PokemonCardGridView";
import PokemonCardTiltModal from "@/src/features/showcase/PokemonCardTiltModal";
import ShowcaseCarousel from "@/src/features/showcase/ShowcaseCarousel";
import SetCompletionModal from "@/src/features/showcase/SetCompletionModal";
import ShowcaseListItem from "@/src/features/showcase/ShowcaseListItem";
import { useShowcaseFilters } from "@/src/features/showcase/useShowcaseFilters";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Keyboard,
  Modal,
  Platform,
  RefreshControl,
  Share,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View
} from "react-native";
import Reanimated, { FadeIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// Scryfall color codes in canonical WUBRG order; "C" stands in for colorless.
const MAGIC_COLOR_ORDER = [
  { value: "W", label: "White" },
  { value: "U", label: "Blue" },
  { value: "B", label: "Black" },
  { value: "R", label: "Red" },
  { value: "G", label: "Green" },
  { value: "C", label: "Colorless" },
] as const;

export default function ShowcaseDetail() {
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const showcaseId = typeof params.id === "string" ? params.id : params.id?.[0];

  // Search and filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const {
    sortBy,
    sortOrder,
    selectedTypes,
    selectedSetIds,
    setSortBy,
    setSortOrder,
    toggleType,
    toggleSet,
    clearSelections,
    reset: resetFilters,
    activeFilterCount,
  } = useShowcaseFilters();

  // View mode state
  const [viewMode, setViewMode] = useState<"grid" | "carousel">("grid");

  // Game filter tabs, shown when a card showcase mixes multiple games
  const [gameFilter, setGameFilter] = useState<"all" | "pokemon" | "magic">(
    "all",
  );

  // Sharable public links are available to every membership tier.
  const { data: membership } = useMembership();
  const isCurator = membership?.isCurator ?? false;
  const showcaseQuery = useGetShowcase(showcaseId ?? "");
  const showcase = showcaseQuery.data;
  const { data: stats } = useGetShowcaseStats(showcaseId ?? "");
  const { data: owner } = useGetShowcaseOwner(showcase?.profile_id ?? "");
  const follow = useToggleShowcaseFollow();
  const { session } = useAuthStore();
  const isOwner = !!showcase && showcase.profile_id === session?.user.id;
  const accentColor = showcaseDisplayAccent(showcase?.accent_color || DEFAULT_SHOWCASE_ACCENT);
  const onAccent = textOnAccent(accentColor);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [customizeVisible, setCustomizeVisible] = useState(false);
  const [activeTab, setActiveTab] = useState<"items" | "about" | "activity">("items");
  const router = useRouter();

  // Curator set-completion view
  const [setCompletionVisible, setSetCompletionVisible] = useState(false);
  const [setCompletionPaywallVisible, setSetCompletionPaywallVisible] =
    useState(false);

  const handleSettings = useCallback(() => {
    if (showcaseQuery.data) setSettingsVisible(true);
    else {
      showcaseQuery.refetch();
      showMessage("Showcase unavailable", "Could not load showcase settings. Please retry.");
    }
  }, [showcaseQuery]);

  const handleShare = useCallback(async () => {
    if (!showcase) return;
    if (!showcase.is_public) {
      showMessage("Private showcase", "Make this showcase public in settings before sharing it.");
      return;
    }
    const origin = Platform.OS === "web" && typeof window !== "undefined" ? window.location.origin : process.env.EXPO_PUBLIC_SITE_URL;
    const url = origin ? `${origin.replace(/\/$/, "")}/s/${showcase.id}` : `showoff:///s/${showcase.id}`;
    try {
      if (Platform.OS === "web" && navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        showMessage("Link copied", "The public showcase link is ready to share.");
      } else {
        await Share.share({ message: `View my Show Off showcase: ${url}`, url });
      }
    } catch {
      showMessage("Could not share", "Please try again.");
    }
  }, [showcase]);

  // Modal state
  const [selectedItem, setSelectedItem] = useState<ItemWithProduct | null>(
    null,
  );
  const [modalVisible, setModalVisible] = useState(false);

  // Pokémon card 3D tilt viewer state
  const [tiltItem, setTiltItem] = useState<ItemWithProduct | null>(null);
  const [tiltVisible, setTiltVisible] = useState(false);

  // Keyboard-aware positioning for search bar
  const keyboardOffset = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      (e) => {
        Animated.spring(keyboardOffset, {
          toValue: -e.endCoordinates.height,
          damping: 20,
          stiffness: 150,
          useNativeDriver: true,
        }).start();
      }
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      () => {
        Animated.spring(keyboardOffset, {
          toValue: 0,
          damping: 20,
          stiffness: 150,
          useNativeDriver: true,
        }).start();
      }
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [keyboardOffset]);

  const handleItemPress = useCallback((item: ItemWithProduct) => {
    if (item.pokemon_tcg_card_id || item.magic_card_id) {
      setTiltItem(item);
      setTiltVisible(true);
      return;
    }
    setSelectedItem(item);
    setModalVisible(true);
  }, []);

  const handleCloseTilt = useCallback(() => {
    setTiltVisible(false);
    setTimeout(() => setTiltItem(null), 300);
  }, []);

  const renderGridItem = useCallback(
    ({ item }: { item: ItemWithProduct }) => (
      <ShowcaseListItem item={item} onPress={handleItemPress} accentColor={accentColor} />
    ),
    [handleItemPress, accentColor],
  );

  const handleCloseModal = useCallback(() => {
    setModalVisible(false);
    setTimeout(() => setSelectedItem(null), 300);
  }, []);

  const {
    data: items,
    error,
    isLoading,
    refetch,
    isRefetching,
  } = useGetItemsWithProductData(showcaseId!);


  // Duplicate count per card, computed off the unfiltered list so the badge
  // always reflects true showcase-wide duplication regardless of active filters.
  const duplicateCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of items ?? []) {
      const cardId = item.pokemon_tcg_card_id || item.magic_card_id;
      if (!cardId) continue;
      counts.set(cardId, (counts.get(cardId) ?? 0) + 1);
    }
    return counts;
  }, [items]);

  const hasPokemonCards = useMemo(
    () => (items ?? []).some((item) => !!item.pokemon_tcg_card_id),
    [items],
  );
  const hasMagicCards = useMemo(
    () => (items ?? []).some((item) => !!item.magic_card_id),
    [items],
  );
  const showGameTabs = hasPokemonCards && hasMagicCards;

  // Which game's filters apply: the selected tab, or — in a single-game
  // showcase where tabs are hidden — that showcase's only game. A mixed
  // showcase on the "All" tab gets generic sort-only filtering.
  const effectiveGame: "all" | "pokemon" | "magic" = useMemo(() => {
    if (gameFilter !== "all") return gameFilter;
    if (hasPokemonCards && !hasMagicCards) return "pokemon";
    if (hasMagicCards && !hasPokemonCards) return "magic";
    return "all";
  }, [gameFilter, hasPokemonCards, hasMagicCards]);

  // Distinct type/color/set options actually present in this showcase for the
  // active game — narrower than the full catalog so a filter never yields an
  // empty grid.
  const availableTypes = useMemo(() => {
    if (effectiveGame === "pokemon") {
      const types = new Set<string>();
      for (const item of items ?? []) {
        for (const type of item.pokemonTypes ?? []) types.add(type);
      }
      return Array.from(types)
        .sort()
        .map((type) => ({ value: type, label: type }));
    }
    if (effectiveGame === "magic") {
      const codes = new Set<string>();
      for (const item of items ?? []) {
        if (!item.magic_card_id) continue;
        const colors = item.magicColors ?? [];
        if (colors.length === 0) codes.add("C");
        for (const code of colors) codes.add(code);
      }
      return MAGIC_COLOR_ORDER.filter((entry) => codes.has(entry.value));
    }
    return [];
  }, [items, effectiveGame]);

  const availableSets = useMemo(() => {
    const sets = new Map<string, string>();
    if (effectiveGame === "pokemon") {
      for (const item of items ?? []) {
        if (item.pokemonSetId) {
          sets.set(
            item.pokemonSetId,
            item.products?.searchableDescription?.split(" • ")[0] ||
              item.pokemonSetId,
          );
        }
      }
    } else if (effectiveGame === "magic") {
      for (const item of items ?? []) {
        if (item.magic_card_id && item.magicSetCode) {
          sets.set(item.magicSetCode, item.magicSetName || item.magicSetCode);
        }
      }
    }
    return Array.from(sets.entries()).map(([id, name]) => ({ id, name }));
  }, [items, effectiveGame]);

  // Header-pill count: total cards in the selected game tab, ignoring
  // search/type/set filters (matches the pre-tabs "unfiltered count" behavior).
  const gameFilteredCount = useMemo(() => {
    if (gameFilter === "all") return items?.length ?? 0;
    return (items ?? []).filter((item) =>
      gameFilter === "pokemon"
        ? !!item.pokemon_tcg_card_id
        : !!item.magic_card_id,
    ).length;
  }, [items, gameFilter]);

  // Filter and sort
  const filteredItems = useMemo(() => {
    if (!items) return [];

    let filtered = items.filter((item) => {
      if (gameFilter === "pokemon" && !item.pokemon_tcg_card_id) return false;
      if (gameFilter === "magic" && !item.magic_card_id) return false;

      if (searchQuery) {
        const searchLower = searchQuery.toLowerCase();
        const matchesSearch =
          item.products?.searchableTitle?.toLowerCase().includes(searchLower) ||
          item.products?.searchableDescription
            ?.toLowerCase()
            .includes(searchLower) ||
          item.user_description?.toLowerCase().includes(searchLower);
        if (!matchesSearch) return false;
      }

      if (selectedTypes.length > 0) {
        if (effectiveGame === "magic") {
          const colors = item.magicColors ?? [];
          const codes = colors.length === 0 ? ["C"] : colors;
          if (!selectedTypes.some((code) => codes.includes(code))) {
            return false;
          }
        } else {
          const itemTypes = item.pokemonTypes ?? [];
          if (!selectedTypes.some((type) => itemTypes.includes(type))) {
            return false;
          }
        }
      }

      if (selectedSetIds.length > 0) {
        const itemSetId =
          effectiveGame === "magic" ? item.magicSetCode : item.pokemonSetId;
        if (!itemSetId || !selectedSetIds.includes(itemSetId)) {
          return false;
        }
      }

      return true;
    });

    filtered.sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case "name":
          comparison = (a.products?.searchableTitle || "").localeCompare(
            b.products?.searchableTitle || "",
          );
          break;
        case "price":
          comparison = (a.price || 0) - (b.price || 0);
          break;
        case "date":
        default:
          comparison =
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          break;
      }
      return sortOrder === "asc" ? comparison : -comparison;
    });

    return filtered;
  }, [items, searchQuery, sortBy, sortOrder, selectedTypes, selectedSetIds, gameFilter, effectiveGame]);

  // A showcase made entirely of trading cards (Pokémon or Magic) renders as a
  // TCG Pocket-style collection grid instead of the generic item grid.
  const isPokemonShowcase = useMemo(
    () =>
      (items?.length ?? 0) > 0 &&
      (items ?? []).every(
        (item) => !!item.pokemon_tcg_card_id || !!item.magic_card_id,
      ),
    [items],
  );

  const handleToggleView = useCallback(() => {
    setViewMode((prev) => (prev === "grid" ? "carousel" : "grid"));
  }, []);

  if (!showcaseId) {
    return (
      <View style={styles.centerWrap}>
        <Text style={styles.errorText}>Missing showcase id</Text>
      </View>
    );
  }

  if (isLoading || showcaseQuery.isLoading) {
    return (
      <View style={styles.centerWrap}>
        <ActivityIndicator size="large" color="#9B5DE5" />
      </View>
    );
  }

  if (error || showcaseQuery.error || !showcase) {
    return (
      <View style={styles.centerWrap}>
        <Text style={styles.errorText}>This showcase is unavailable</Text>
      </View>
    );
  }

  // Calculate bottom offset — sits just above the custom tab bar
  const bottomOffset =
    TAB_BAR_HEIGHT + insets.bottom + (Platform.OS === "android" ? 8 : 0) + 24;

  const detailHeader = showcase ? <View style={[styles.showcaseHeader, { paddingTop: Math.max(insets.top, 12) + 8 }]}>
    <View style={styles.topRow}>
      <TouchableOpacity onPress={() => router.back()} style={styles.headerIcon} accessibilityRole="button" accessibilityLabel="Back to showcases">
        <Ionicons name="arrow-back" size={25} color="#FFF" />
      </TouchableOpacity>
      <Text style={styles.topTitle} numberOfLines={1}>{showcase.name}</Text>
      <TouchableOpacity onPress={() => void handleShare()} style={styles.headerIcon} accessibilityRole="button" accessibilityLabel="Share showcase">
        <Ionicons name="share-social-outline" size={23} color="#FFF" />
      </TouchableOpacity>
      {isOwner ? <TouchableOpacity onPress={handleSettings} style={styles.headerIcon} accessibilityRole="button" accessibilityLabel="Showcase settings">
        <Ionicons name="ellipsis-horizontal" size={23} color="#FFF" />
      </TouchableOpacity> : <ContentSafetyMenu type="showcase" id={showcase.id} ownerId={showcase.profile_id} />}
    </View>
    <ShowcaseBanner imageUrl={showcase.banner_image_url} accentColor={accentColor}
      height={Math.max(135, Math.min(270, (Math.min(windowWidth, 900) - 36) / 3.1))} />
    <View style={styles.heroText}>
      <Text style={styles.heroTitle}>{showcase.name}</Text>
      <Text style={styles.heroDescription} numberOfLines={2}>{showcase.description || "A collection worth sharing"}</Text>
    </View>
    <View style={styles.ownerRow}>
      <View style={styles.ownerIdentity}>
        <View style={[styles.ownerAvatar, { borderColor: accentColor }]}>
          {owner?.avatar_url ? <Image source={{ uri: owner.avatar_url }} style={StyleSheet.absoluteFill} contentFit="cover" />
            : <Ionicons name="person" size={25} color={accentColor} />}
        </View>
        <View style={styles.ownerCopy}>
          <View style={styles.ownerNameRow}>
            <Text style={styles.ownerName} numberOfLines={1}>@{owner?.username || "collector"}</Text>
            {isOwner && <Text style={[styles.ownerBadge, { color: accentColor, borderColor: `${accentColor}80` }]}>Owner</Text>}
          </View>
          <Text style={styles.ownerBio} numberOfLines={1}>{owner?.bio || "Collecting what brings joy"}</Text>
        </View>
      </View>
    </View>
    <View style={styles.heroActions}>
      <TouchableOpacity disabled={isOwner || follow.isPending} style={styles.followButton}
        onPress={async () => {
          try { await follow.mutateAsync({ showcaseId: showcase.id, following: !!stats?.isFollowing }); }
          catch (failure: unknown) { showMessage("Could not update follow", failure instanceof Error ? failure.message : "Please try again."); }
        }} accessibilityRole="button" accessibilityLabel={isOwner || stats?.isFollowing ? "Following showcase" : "Follow showcase"}>
        <LinearGradient colors={onAccent === "#17121F" ? [accentColor, "#E2D8FF"] : [accentColor, "#6950E9"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.actionGradient}>
          <Ionicons name={isOwner || stats?.isFollowing ? "checkmark" : "person-add-outline"} size={20} color={onAccent} />
          <Text style={[styles.followText, { color: onAccent }]}>{isOwner || stats?.isFollowing ? "Following" : "Follow"}</Text>
        </LinearGradient>
      </TouchableOpacity>
      {isOwner && <TouchableOpacity style={styles.editShowcaseButton} onPress={() => setCustomizeVisible(true)}
        accessibilityRole="button" accessibilityLabel="Edit showcase appearance">
        <Ionicons name="pencil" size={19} color="#FFF" /><Text style={styles.editShowcaseText}>Edit Showcase</Text>
      </TouchableOpacity>}
    </View>
    <View style={styles.statsPanel}>
      <ShowcaseStatsBar itemCount={stats?.itemCount ?? items?.length ?? null} followerCount={stats?.followerCount ?? null}
        estimatedValue={stats?.estimatedValue ?? null} accentColor={accentColor} />
    </View>
    <View style={styles.detailTabs}>
      {([ ["items", `Items (${items?.length ?? 0})`, "grid-outline"], ["about", "About", "document-text-outline"], ["activity", "Activity", "pulse-outline"] ] as const).map(([key, label, icon]) =>
        <TouchableOpacity key={key} onPress={() => setActiveTab(key)} style={[styles.detailTab, activeTab === key && { backgroundColor: accentColor }]}
          accessibilityRole="tab" accessibilityState={{ selected: activeTab === key }}>
          <Ionicons name={icon} size={18} color={activeTab === key ? onAccent : "#B5B1C2"} />
          <Text style={[styles.detailTabText, activeTab === key && { color: onAccent }]} numberOfLines={1}>{label}</Text>
        </TouchableOpacity>)}
    </View>
  </View> : null;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Content Area */}
      <View style={styles.contentWrapper}>
        {activeTab !== "items" && <ScrollView contentContainerStyle={[styles.infoPage, { paddingBottom: bottomOffset + 60 }]}>
          {detailHeader}
          <View style={styles.infoPanel}>
            <Text style={styles.infoTitle}>{activeTab === "about" ? "About this showcase" : "Recent activity"}</Text>
            {activeTab === "about" ? <Text style={styles.infoBody}>{showcase?.description || "This collector has not added a description yet."}</Text>
              : items?.length ? [...items].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 8).map((item) =>
                <View key={item.id} style={styles.activityRow}>
                  <Ionicons name="cube-outline" size={20} color={accentColor} />
                  <View style={{ flex: 1 }}><Text style={styles.activityTitle} numberOfLines={1}>{item.custom_title || item.products?.searchableTitle || "Collectible"}</Text>
                    <Text style={styles.infoMeta}>Added {new Date(item.created_at).toLocaleDateString("en-US")}</Text></View>
                </View>) : <Text style={styles.infoBody}>No items have been added yet.</Text>}
            {activeTab === "about" && showcase && <Text style={styles.infoMeta}>Created {new Date(showcase.created_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</Text>}
          </View>
        </ScrollView>}
        {activeTab === "items" && viewMode === "grid" && isPokemonShowcase && (
          <Reanimated.View
            entering={FadeIn.duration(150)}
            style={styles.viewContainer}
          >
            <PokemonCardGridView
              items={filteredItems}
              onItemPress={handleItemPress}
              bottomPadding={bottomOffset + 80}
              refreshing={isRefetching}
              onRefresh={refetch}
              totalCount={gameFilteredCount}
              duplicateCounts={duplicateCounts}
              accentColor={accentColor}
              headerAccessory={
                <>{detailHeader}{showGameTabs ? (
                  <View style={styles.gameTabs}>
                    {(
                      [
                        { key: "all", label: "All" },
                        { key: "pokemon", label: "Pokémon" },
                        { key: "magic", label: "Magic" },
                      ] as const
                    ).map((tab) => (
                      <TouchableOpacity
                        key={tab.key}
                        style={[
                          styles.gameTab,
                          gameFilter === tab.key && styles.gameTabActive,
                        ]}
                        onPress={() => {
                          setGameFilter(tab.key);
                          // Type/set picks from another game would zero out
                          // the grid — drop them, keep the sort.
                          clearSelections();
                        }}
                        accessibilityRole="tab"
                        accessibilityState={{ selected: gameFilter === tab.key }}
                      >
                        <Text
                          style={[
                            styles.gameTabText,
                            gameFilter === tab.key && styles.gameTabTextActive,
                          ]}
                        >
                          {tab.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : null}</>
              }
            />
          </Reanimated.View>
        )}

        {activeTab === "items" && viewMode === "grid" && !isPokemonShowcase && (
          <Reanimated.View
            entering={FadeIn.duration(150)}
            style={styles.viewContainer}
          >
          <FlatList
            data={filteredItems}
            keyExtractor={(item) => String(item.id)}
            renderItem={renderGridItem}
            numColumns={2}
            initialNumToRender={8}
            maxToRenderPerBatch={6}
            updateCellsBatchingPeriod={50}
            windowSize={7}
            removeClippedSubviews={process.env.EXPO_OS === "android"}
            contentInsetAdjustmentBehavior="automatic"
            contentContainerStyle={[
              styles.listContent,
              { paddingBottom: bottomOffset + 80 }, // Add extra padding for bottom bar
            ]}
            columnWrapperStyle={styles.row}
            refreshControl={
              <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
            }
            ListHeaderComponent={
              <>{detailHeader}{filteredItems.length !== (items?.length || 0) ? (
                <Text style={styles.resultsText}>
                  Showing {filteredItems.length} of {items?.length || 0} items
                </Text>
              ) : null}</>
            }
            ListEmptyComponent={
              <Text style={styles.emptyText}>
                {searchQuery
                  ? "No items match your filters"
                  : "No items in this showcase yet."}
              </Text>
            }
          />
          </Reanimated.View>
        )}

        {activeTab === "items" && viewMode === "carousel" && (
          <Reanimated.View
            entering={FadeIn.duration(150)}
            style={styles.viewContainer}
          >
            <View style={styles.carouselContainer}>
              <View style={styles.carouselTop}>
                <TouchableOpacity onPress={() => router.back()} style={styles.headerIcon} accessibilityLabel="Back to showcases">
                  <Ionicons name="arrow-back" size={22} color="#FFF" />
                </TouchableOpacity>
                <Text style={styles.topTitle} numberOfLines={1}>{showcase.name}</Text>
                <TouchableOpacity onPress={() => setViewMode("grid")} style={styles.headerIcon} accessibilityLabel="Show item grid">
                  <Ionicons name="grid-outline" size={21} color="#FFF" />
                </TouchableOpacity>
              </View>
              {filteredItems.length === 0 ? (
                <View style={styles.emptyCarouselContainer}>
                  <Text style={styles.emptyText}>No items to display</Text>
                </View>
              ) : (
                <ShowcaseCarousel
                  data={filteredItems}
                  onItemPress={handleItemPress}
                  accentColor={accentColor}
                />
              )}
            </View>
          </Reanimated.View>
        )}

      </View>

      {/* Search and Filter Controls - Positioned above Tab Bar */}
      {activeTab === "items" && <Animated.View
        style={[
          styles.searchContainer,
          {
            bottom: bottomOffset,
            transform: [{ translateY: keyboardOffset }],
          },
        ]}
      >
        <View style={styles.searchInputContainer}>
          <Ionicons
            name="search"
            size={18}
            color="rgba(255,255,255,0.35)"
            style={styles.searchIcon}
          />
          <TextInput
            style={styles.searchInput}
            placeholder="Search items..."
            placeholderTextColor="rgba(255,255,255,0.3)"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery("")}>
              <Ionicons name="close-circle" size={18} color="rgba(255,255,255,0.35)" />
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity
          style={styles.viewToggleButton}
          onPress={handleToggleView}
        >
          <Ionicons
            name={viewMode === "grid" ? "albums" : "grid"}
            size={18}
            color="#9B5DE5"
          />
        </TouchableOpacity>

        {hasPokemonCards && (
          <TouchableOpacity
            style={styles.viewToggleButton}
            onPress={() => {
              if (isCurator) {
                setSetCompletionVisible(true);
              } else {
                setSetCompletionPaywallVisible(true);
              }
            }}
            accessibilityLabel="Set completion"
          >
            <Ionicons name="extension-puzzle-outline" size={18} color="#9B5DE5" />
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.filterButton}
          onPress={() => setFilterModalOpen(true)}
        >
          <Ionicons name="options" size={18} color="#9B5DE5" />
          {activeFilterCount > 0 && (
            <View style={styles.filterCountBadge}>
              <Text style={styles.filterCountBadgeText}>{activeFilterCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </Animated.View>}

      {settingsVisible && showcaseQuery.data && <ShowcaseSettingsModal showcase={showcaseQuery.data}
        onClose={() => setSettingsVisible(false)} onDeleted={() => { setSettingsVisible(false); router.back(); }} />}
      {customizeVisible && showcase && <ShowcaseCustomizeModal visible={customizeVisible} showcaseId={showcase.id}
        initialAccentColor={showcase.accent_color} initialBannerImageUrl={showcase.banner_image_url}
        canEditBanner={isCurator} onDismiss={() => setCustomizeVisible(false)} />}
      <ItemDetailModal
        visible={modalVisible}
        item={selectedItem}
        accentColor={accentColor}
        onClose={handleCloseModal}
      />

      <PokemonCardTiltModal
        visible={tiltVisible}
        item={tiltItem}
        accentColor={accentColor}
        onClose={handleCloseTilt}
      />

      {/* Filter Modal */}
      <Modal
        visible={filterModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setFilterModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[styles.modalCard, { maxHeight: windowHeight * 0.8 }]}
          >
            <Text style={styles.modalTitle}>Filter & Sort</Text>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.modalScrollContent}
            >
              <Text style={styles.sectionLabel}>Sort by</Text>
              <View style={styles.sortOptions}>
                {[
                  { key: "date", label: "Date Added" },
                  { key: "name", label: "Name" },
                  { key: "price", label: "Price" },
                ].map((option) => (
                  <TouchableOpacity
                    key={option.key}
                    style={[
                      styles.sortOption,
                      sortBy === option.key && styles.sortOptionSelected,
                    ]}
                    onPress={() => setSortBy(option.key as any)}
                  >
                    <Text
                      style={[
                        styles.sortOptionText,
                        sortBy === option.key && styles.sortOptionTextSelected,
                      ]}
                      numberOfLines={1}
                    >
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.sectionLabel}>Sort order</Text>
              <View style={styles.sortOrderContainer}>
                <TouchableOpacity
                  style={[
                    styles.sortOrderOption,
                    sortOrder === "asc" && styles.sortOrderOptionSelected,
                  ]}
                  onPress={() => setSortOrder("asc")}
                >
                  <Ionicons
                    name="arrow-up"
                    size={16}
                    color={sortOrder === "asc" ? "#FFF" : "#666"}
                  />
                  <Text
                    style={[
                      styles.sortOrderText,
                      sortOrder === "asc" && styles.sortOrderTextSelected,
                    ]}
                    numberOfLines={1}
                  >
                    Ascending
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.sortOrderOption,
                    sortOrder === "desc" && styles.sortOrderOptionSelected,
                  ]}
                  onPress={() => setSortOrder("desc")}
                >
                  <Ionicons
                    name="arrow-down"
                    size={16}
                    color={sortOrder === "desc" ? "#FFF" : "#666"}
                  />
                  <Text
                    style={[
                      styles.sortOrderText,
                      sortOrder === "desc" && styles.sortOrderTextSelected,
                    ]}
                    numberOfLines={1}
                  >
                    Descending
                  </Text>
                </TouchableOpacity>
              </View>

              {availableTypes.length > 0 && (
                <>
                  <Text style={styles.sectionLabel}>
                    {effectiveGame === "magic" ? "Color" : "Type"}
                  </Text>
                  <View style={styles.sortOptions}>
                    {availableTypes.map((type) => (
                      <TouchableOpacity
                        key={type.value}
                        style={[
                          styles.sortOption,
                          selectedTypes.includes(type.value) &&
                            styles.sortOptionSelected,
                        ]}
                        onPress={() => toggleType(type.value)}
                      >
                        <Text
                          style={[
                            styles.sortOptionText,
                            selectedTypes.includes(type.value) &&
                              styles.sortOptionTextSelected,
                          ]}
                          numberOfLines={1}
                        >
                          {type.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              {availableSets.length > 0 && (
                <>
                  <Text style={styles.sectionLabel}>Set</Text>
                  <View style={styles.sortOptions}>
                    {availableSets.map((set) => (
                      <TouchableOpacity
                        key={set.id}
                        style={[
                          styles.sortOption,
                          selectedSetIds.includes(set.id) &&
                            styles.sortOptionSelected,
                        ]}
                        onPress={() => toggleSet(set.id)}
                      >
                        <Text
                          style={[
                            styles.sortOptionText,
                            selectedSetIds.includes(set.id) &&
                              styles.sortOptionTextSelected,
                          ]}
                          numberOfLines={1}
                        >
                          {set.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}
            </ScrollView>

            <View style={styles.modalActions}>
              {activeFilterCount > 0 && (
                <TouchableOpacity style={styles.resetButton} onPress={resetFilters}>
                  <Text style={styles.resetButtonText}>Reset</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setFilterModalOpen(false)}
              >
                <Text style={styles.cancelButtonText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <CuratorGateModal
        visible={setCompletionPaywallVisible}
        feature="Set completion"
        description="See exactly which cards you're missing from every set in this showcase, with Curator."
        onDismiss={() => setSetCompletionPaywallVisible(false)}
      />

      <SetCompletionModal
        visible={setCompletionVisible}
        items={items ?? []}
        onClose={() => setSetCompletionVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  contentWrapper: {
    flex: 1,
  },
  showcaseHeader: { width: "100%", maxWidth: 900, alignSelf: "center", paddingHorizontal: 10, paddingBottom: 18 },
  topRow: { flexDirection: "row", alignItems: "center", gap: 9, marginBottom: 14 },
  headerIcon: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: "#201F28", borderWidth: 1, borderColor: "#3B3648" },
  topTitle: { flex: 1, color: "#FFF", fontSize: 18, fontWeight: "900", textAlign: "center" },
  heroText: { marginTop: 14 },
  heroTitle: { color: "#FFF", fontSize: 32, fontWeight: "900", letterSpacing: -1 },
  heroDescription: { color: "#AAA5B6", fontSize: 15, marginTop: 3 },
  ownerRow: { marginTop: 18, marginBottom: 13 },
  ownerIdentity: { flexDirection: "row", alignItems: "center", gap: 11 },
  ownerAvatar: { width: 48, height: 48, borderRadius: 24, borderWidth: 2, backgroundColor: "#302344", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  ownerCopy: { flex: 1, minWidth: 0 },
  ownerNameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  ownerName: { color: "#FFF", fontSize: 15, fontWeight: "800", flexShrink: 1 },
  ownerBadge: { borderWidth: 1, borderRadius: 999, overflow: "hidden", paddingHorizontal: 8, paddingVertical: 2, fontSize: 11, fontWeight: "700" },
  ownerBio: { color: "#A9A5B2", fontSize: 12, marginTop: 2 },
  heroActions: { flexDirection: "row", gap: 10, marginBottom: 15 },
  followButton: { flex: 1, minHeight: 46, borderRadius: 24, overflow: "hidden" },
  actionGradient: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  followText: { color: "#FFF", fontWeight: "900", fontSize: 15 },
  editShowcaseButton: { flex: 1, minHeight: 46, borderRadius: 24, borderWidth: 1, borderColor: "#605B6D", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#201F27" },
  editShowcaseText: { color: "#FFF", fontWeight: "800", fontSize: 14 },
  statsPanel: { borderWidth: 1, borderColor: "#45414E", borderRadius: 22, backgroundColor: "#1C1B22", marginBottom: 12 },
  detailTabs: { flexDirection: "row", borderWidth: 1, borderColor: "#45414E", borderRadius: 24, backgroundColor: "#1C1B22", padding: 5 },
  detailTab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 43, borderRadius: 20 },
  detailTabText: { color: "#B5B1C2", fontSize: 13, fontWeight: "700" },
  infoPage: { width: "100%", maxWidth: 900, alignSelf: "center", paddingHorizontal: 10 },
  infoPanel: { borderRadius: 22, borderWidth: 1, borderColor: "#45414E", backgroundColor: "#1C1B22", padding: 20, gap: 10 },
  infoTitle: { color: "#FFF", fontSize: 20, fontWeight: "900" },
  infoBody: { color: "#C8C4D0", fontSize: 15, lineHeight: 23 },
  infoMeta: { color: "#958FA2", fontSize: 12, marginTop: 7 },
  activityRow: { flexDirection: "row", alignItems: "center", gap: 12, borderTopWidth: 1, borderTopColor: "#393542", paddingVertical: 11 },
  activityTitle: { color: "#FFF", fontSize: 14, fontWeight: "700" },
  viewContainer: {
    flex: 1,
  },
  gameTabs: {
    flexDirection: "row",
    alignSelf: "flex-start",
    gap: 4,
    padding: 4,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
    marginBottom: 10,
  },
  gameTab: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
  },
  gameTabActive: {
    backgroundColor: "#FFF",
  },
  gameTabText: {
    color: "#FFF",
    fontSize: 12,
    fontWeight: "700",
  },
  gameTabTextActive: {
    color: "#000",
  },
  absoluteView: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  centerWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  errorText: { color: "#FCA5A5" },
  listContent: { width: "100%", maxWidth: 900, alignSelf: "center", paddingHorizontal: 5, gap: 10 },
  row: { justifyContent: "space-between", gap: 10 },
  resultsText: { color: "#666", fontSize: 14, marginBottom: 8, marginTop: 10 },
  emptyText: { color: "#9CA3AF", textAlign: "center", marginTop: 20 },
  carouselContainer: { flex: 1 },
  carouselTop: { position: "absolute", top: 14, left: 12, right: 12, zIndex: 10, flexDirection: "row", alignItems: "center", gap: 8 },
  emptyCarouselContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },

  // Bottom Search Bar
  searchContainer: {
    position: "absolute",
    left: 12,
    right: 12,
    maxWidth: 876,
    alignSelf: "center",
    flexDirection: "row",
    paddingHorizontal: 6,
    paddingVertical: 8,
    backgroundColor: "rgba(18,18,18,0.92)",
    borderRadius: 16,
    gap: 8,
    zIndex: 100,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  searchInputContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  searchIcon: { marginRight: 8 },
  searchInput: {
    flex: 1,
    color: "#FFF",
    fontSize: 14,
    paddingVertical: 10,
  },
  viewToggleButton: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 12,
    padding: 10,
  },
  filterButton: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 12,
    padding: 10,
  },

  // Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    backgroundColor: "#1a1a1a",
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: "#333",
  },
  modalScrollContent: {
    flexGrow: 1,
  },
  modalTitle: {
    color: "#FFF",
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 20,
  },
  sectionLabel: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 12,
  },
  sortOptions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 20 },
  sortOption: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#333",
    backgroundColor: "#2a2a2a",
  },
  sortOptionSelected: {
    backgroundColor: "#9B5DE5",
    borderColor: "#9B5DE5",
  },
  sortOptionText: { color: "#FFF", fontSize: 14 },
  sortOptionTextSelected: { fontWeight: "600" },

  sortOrderContainer: { flexDirection: "row", gap: 8, marginBottom: 20 },
  sortOrderOption: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#333",
    backgroundColor: "#2a2a2a",
  },
  sortOrderOptionSelected: {
    backgroundColor: "#9B5DE5",
    borderColor: "#9B5DE5",
  },
  sortOrderText: { color: "#666", fontSize: 14, fontWeight: "500" },
  sortOrderTextSelected: { color: "#FFF", fontWeight: "600" },

  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 12,
    marginTop: 12,
  },
  cancelButton: { padding: 10 },
  cancelButtonText: { color: "#9B5DE5", fontSize: 16, fontWeight: "600" },
  resetButton: { padding: 10 },
  resetButtonText: { color: "#999", fontSize: 16, fontWeight: "600" },
  filterCountBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    backgroundColor: "#9B5DE5",
    borderRadius: 999,
    minWidth: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  filterCountBadgeText: {
    color: "#FFF",
    fontSize: 10,
    fontWeight: "800",
  },
});
