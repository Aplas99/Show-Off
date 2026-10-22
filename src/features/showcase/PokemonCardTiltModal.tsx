import { ItemWithProduct } from "@/api/items";
import { useMembership } from "@/api/memberships";
import { usePriceHistory } from "@/api/prices";
import { describeRiftboundSet, formatRiftboundCollectorNumber, getRiftboundSetName } from "@/constants/riftboundSets";
import { getTcgGameName } from "@/constants/tcgGames";
import { getItemCardId, getItemGame } from "@/lib/itemCards";
import { useColors, type ThemeColors } from "@/constants/theme";
import PriceHistoryChart from "@/src/components/charts/PriceHistoryChart";
import { CuratorInlineGate } from "@/src/features/membership/CuratorGate";
import { DEFAULT_SHOWCASE_ACCENT } from "@/src/features/showcase/ShowcaseVisuals";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "@/src/components/media/ProtectedImage";
import { LinearGradient } from "expo-linear-gradient";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";
import { getPokemonCardImage } from "./PokemonCardGridView";

const CARD_ASPECT = 63 / 88;
const MAX_TILT_DEG = 22;
const PERSPECTIVE = 800;
const DETAILS_PULL_DEAD_ZONE = 80;
const DETAILS_REVEAL_DISTANCE = 120;
const TILT_SPRING = { damping: 24, stiffness: 380, mass: 0.7 };
const SHEET_SPRING = { damping: 24, stiffness: 230, mass: 0.85 };

type Props = {
  visible: boolean;
  item: ItemWithProduct | null;
  onClose: () => void;
  accentColor?: string;
};

type CardDetails = {
  /** Full game name, e.g. "Magic: The Gathering" or a constants/tcgGames.ts name. */
  game: string;
  /** Short label for the quick-stats row. */
  gameLabel: string;
  title: string;
  typeLine: string | null;
  description: string | null;
  flavorText: string | null;
  setName: string;
  setCode: string | null;
  cardNumber: string | null;
  rarity: string | null;
  artist: string | null;
  setLogo: string | null;
  /** Secondary line under the set name, e.g. "Released Oct 2025 · 298 cards". */
  setDetail?: string | null;
  /** Full printed number when the card carries its own total (e.g. "011/298"). */
  printedNumber?: string | null;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function joinText(values: unknown, separator = " • "): string | null {
  if (!Array.isArray(values)) return null;
  const text = values.map(asText).filter((value): value is string => !!value);
  return text.length > 0 ? text.join(separator) : null;
}

function getCardDetails(item: ItemWithProduct): CardDetails {
  const raw = asRecord(item.products?.data);
  const set = asRecord(raw.set);
  const setImages = asRecord(set.images);
  const isMagic = !!item.magic_card_id;

  if (item.riftbound_card_id) {
    // products.data is the Riftcodex record (see useGetItemsWithProductData).
    const classification = asRecord(raw.classification);
    const text = asRecord(raw.text);
    const media = asRecord(raw.media);
    const metadata = asRecord(raw.metadata);
    const setCode = item.riftboundSetCode || asText(set.set_id);
    const riftboundId = asText(raw.riftbound_id);
    const variants = [
      metadata.signature === true ? "Signature" : null,
      metadata.overnumbered === true ? "Overnumbered" : null,
      metadata.alternate_art === true ? "Alt art" : null,
    ].filter(Boolean);
    const collectorNumber = raw.collector_number;
    return {
      game: "Riftbound",
      gameLabel: "Riftbound",
      title: item.products?.searchableTitle || item.custom_title || "Unknown card",
      typeLine:
        [asText(classification.supertype), asText(classification.type), joinText(classification.domain, " / ")]
          .filter(Boolean)
          .join(" • ") || null,
      description: asText(text.plain),
      flavorText: asText(text.flavour),
      setName: getRiftboundSetName(setCode, item.riftboundSetName || asText(set.label)),
      setCode,
      setDetail: describeRiftboundSet(setCode),
      cardNumber: typeof collectorNumber === "number" ? String(collectorNumber) : null,
      printedNumber: formatRiftboundCollectorNumber(riftboundId),
      rarity: [asText(classification.rarity), ...variants].filter(Boolean).join(" · ") || null,
      artist: asText(media.artist),
      setLogo: null,
    };
  }

  if (item.tcg_card_id) {
    // products.data is built by tcgCardItemProduct from the tcg_cards row.
    const gameName = getTcgGameName(item.tcgGame);
    return {
      game: gameName,
      gameLabel: gameName,
      title: item.products?.searchableTitle || item.custom_title || "Unknown card",
      typeLine: asText(raw.card_type),
      description: null,
      flavorText: null,
      setName: item.tcgSetName || asText(raw.set_name) || item.tcgSetCode || "Unknown set",
      setCode: item.tcgSetCode ?? asText(raw.set_code),
      cardNumber: asText(raw.card_number),
      rarity: item.tcgRarity ?? asText(raw.rarity),
      artist: null,
      setLogo: null,
    };
  }

  if (isMagic) {
    return {
      game: "Magic: The Gathering",
      gameLabel: "Magic",
      title:
        item.products?.searchableTitle || item.custom_title || "Unknown card",
      typeLine: asText(raw.type_line),
      description: asText(raw.oracle_text),
      flavorText: asText(raw.flavor_text),
      setName:
        item.magicSetName || asText(raw.set_name) || "Unknown set",
      setCode: item.magicSetCode || asText(raw.set),
      cardNumber: asText(raw.collector_number),
      rarity: asText(raw.rarity),
      artist: asText(raw.artist),
      setLogo: null,
    };
  }

  const abilities = Array.isArray(raw.abilities)
    ? raw.abilities
        .map((ability) => {
          const entry = asRecord(ability);
          const name = asText(entry.name);
          const text = asText(entry.text);
          return [name, text].filter(Boolean).join(" — ");
        })
        .filter(Boolean)
    : [];
  const attacks = Array.isArray(raw.attacks)
    ? raw.attacks
        .map((attack) => {
          const entry = asRecord(attack);
          const name = asText(entry.name);
          const damage = asText(entry.damage);
          const text = asText(entry.text);
          const heading = [name, damage].filter(Boolean).join(" · ");
          return [heading, text].filter(Boolean).join(" — ");
        })
        .filter(Boolean)
    : [];
  const rules = [...abilities, ...attacks].join("\n\n") || null;
  const subtypes = joinText(raw.subtypes);
  const hp = asText(raw.hp);

  return {
    game: "Pokémon",
    gameLabel: "Pokémon",
    title: item.products?.searchableTitle || item.custom_title || "Unknown card",
    typeLine:
      [subtypes, hp ? `${hp} HP` : null].filter(Boolean).join(" • ") || null,
    description: rules,
    flavorText: asText(raw.flavorText),
    setName: asText(set.name) || item.pokemonSetId || "Unknown set",
    setCode: asText(set.id) || item.pokemonSetId || null,
    cardNumber: asText(raw.number),
    rarity: asText(raw.rarity),
    artist: asText(raw.artist),
    setLogo: asText(setImages.logo) || asText(setImages.symbol),
  };
}

export default function PokemonCardTiltModal({ visible, item, onClose, accentColor = DEFAULT_SHOWCASE_ACCENT }: Props) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const colors = useColors();
  const styles = getStyles(colors);
  const { data: membership } = useMembership();
  const isCurator = membership?.isCurator ?? false;
  // Every card game gets history: TCGTracking prices, cached once a day.
  const priceGame = item ? getItemGame(item) : null;
  const priceCardId = item ? getItemCardId(item) : null;
  const { data: priceHistory } = usePriceHistory(
    priceGame,
    visible && isCurator ? priceCardId : null,
  );

  // Open at the original full-card size. The details transition scales and
  // lifts this same movable card instead of replacing it with a thumbnail.
  const cardWidth = Math.min(width * 0.88, 400);
  const cardHeight = cardWidth / CARD_ASPECT;
  const sheetHeight = Math.min(height * 0.64, 590);
  const collapsedCardScale = Math.min(
    0.56,
    Math.max(0.36, (height - sheetHeight - 46) / cardHeight),
  );
  const sheetY = useSharedValue(sheetHeight);
  const rotX = useSharedValue(0);
  const rotY = useSharedValue(0);
  const pressed = useSharedValue(0);
  const intro = useSharedValue(0);
  const [detailsShown, setDetailsShown] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setDetailsShown(false);
    sheetY.value = sheetHeight;
    rotX.value = 0;
    rotY.value = 0;
    pressed.value = 0;
    intro.value = 0;
    intro.value = withTiming(1, { duration: 520 });

    // Give each opened card a subtle, organic presentation tilt. Any user
    // touch immediately takes control through the interactive tilt gesture.
    const randomTilt = () => {
      const value = (Math.random() * 2 - 1) * 6;
      return Math.abs(value) < 2 ? (value < 0 ? -2 : 2) : value;
    };
    const previewX = randomTilt();
    const previewY = randomTilt();
    const previewEasing = Easing.inOut(Easing.cubic);
    rotX.value = withDelay(
      620,
      withSequence(
        withTiming(previewX, { duration: 650, easing: previewEasing }),
        withTiming(0, { duration: 1150, easing: previewEasing }),
      ),
    );
    rotY.value = withDelay(
      620,
      withSequence(
        withTiming(previewY, { duration: 650, easing: previewEasing }),
        withTiming(0, { duration: 1150, easing: previewEasing }),
      ),
    );
  }, [visible, sheetHeight, sheetY, rotX, rotY, pressed, intro]);

  const showDetails = useCallback(() => {
    setDetailsShown(true);
    sheetY.value = withSpring(0, SHEET_SPRING);
  }, [sheetY]);

  const hideDetails = useCallback(() => {
    setDetailsShown(false);
    pressed.value = withSpring(0, TILT_SPRING);
    rotX.value = withSpring(0, TILT_SPRING);
    rotY.value = withSpring(0, TILT_SPRING);
    // cardStyle is derived from sheetY, so lowering the sheet restores the
    // exact full-size card progressively and re-enables tilt interaction.
    sheetY.value = withSpring(sheetHeight, SHEET_SPRING);
  }, [sheetHeight, sheetY, pressed, rotX, rotY]);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetY.value }],
  }));

  const cardStyle = useAnimatedStyle(() => {
    const detailProgress = 1 - Math.min(1, sheetY.value / sheetHeight);
    const introLift = interpolate(intro.value, [0, 1], [100, 0]);
    const introTilt = interpolate(intro.value, [0, 1], [34, 0]);
    const introScale = interpolate(intro.value, [0, 1], [0.68, 1]);
    const detailLift = -sheetHeight * 0.5 * detailProgress;
    const detailScale = interpolate(
      detailProgress,
      [0, 1],
      [1, collapsedCardScale],
    );

    return {
      opacity: interpolate(intro.value, [0, 0.2, 1], [0, 1, 1]),
      transform: [
        { perspective: PERSPECTIVE },
        { translateY: introLift + detailLift },
        { rotateX: `${rotX.value + introTilt}deg` },
        { rotateY: `${rotY.value}deg` },
        {
          scale:
            introScale *
            detailScale *
            interpolate(pressed.value, [0, 1], [1, 1.045]),
        },
      ],
    };
  });

  const glareStyle = useAnimatedStyle(() => ({
    opacity: pressed.value * 0.4,
    transform: [
      { translateX: (rotY.value / MAX_TILT_DEG) * cardWidth * 0.5 },
      { translateY: (rotX.value / MAX_TILT_DEG) * cardHeight * 0.5 },
    ],
  }));

  const applyTilt = (absoluteX: number, absoluteY: number) => {
    "worklet";
    const nx = Math.max(
      -1,
      Math.min(1, (absoluteX - width / 2) / (width / 2)),
    );
    const ny = Math.max(
      -1,
      Math.min(1, (absoluteY - height / 2) / (height / 2)),
    );
    rotY.value = withSpring(nx * MAX_TILT_DEG, TILT_SPRING);
    rotX.value = withSpring(ny * MAX_TILT_DEG, TILT_SPRING);
  };

  const cardGesture = Gesture.Pan()
    .enabled(!detailsShown)
    .minDistance(0)
    .onBegin((event) => {
      pressed.value = withSpring(1, TILT_SPRING);
      applyTilt(event.absoluteX, event.absoluteY);
    })
    .onUpdate((event) => {
      applyTilt(event.absoluteX, event.absoluteY);
      // Tilting from the lower half naturally creates a little upward travel.
      // Keep a generous dead zone so only a deliberate pull reveals details.
      if (event.translationY < -DETAILS_PULL_DEAD_ZONE) {
        const deliberatePull =
          Math.abs(event.translationY) - DETAILS_PULL_DEAD_ZONE;
        sheetY.value = Math.max(0, sheetHeight - deliberatePull * 2.2);
      } else {
        sheetY.value = sheetHeight;
      }
    })
    .onEnd((event) => {
      pressed.value = withSpring(0, TILT_SPRING);
      rotX.value = withSpring(0, TILT_SPRING);
      rotY.value = withSpring(0, TILT_SPRING);

      const isTap =
        Math.abs(event.translationX) < 7 && Math.abs(event.translationY) < 7;
      const isDeliberatePull =
        event.translationY < -DETAILS_REVEAL_DISTANCE ||
        (event.translationY < -DETAILS_PULL_DEAD_ZONE &&
          event.velocityY < -1100);
      if (isTap || isDeliberatePull) {
        runOnJS(showDetails)();
      } else {
        sheetY.value = withTiming(sheetHeight, { duration: 180 });
      }
    });

  const sheetGesture = Gesture.Pan()
    .onUpdate((event) => {
      sheetY.value = Math.max(0, event.translationY);
    })
    .onEnd((event) => {
      if (event.translationY > 65 || event.velocityY > 700) {
        runOnJS(hideDetails)();
      } else {
        sheetY.value = withSpring(0, SHEET_SPRING);
      }
    });

  const details = useMemo(() => (item ? getCardDetails(item) : null), [item]);
  if (!item || !details) return null;

  const imageUrl = getPokemonCardImage(item);
  const currentMarketPrice =
    item.riftbound_card_id
      // Riftcodex has no prices; use the latest TCGTracking snapshot.
      ? priceHistory?.at(-1)?.price ?? item.price
      : item.tcg_card_id
        ? item.tcgMarketPrice ?? priceHistory?.at(-1)?.price ?? item.price
      : item.magic_card_id
        ? item.magicMarketPrice ?? item.price
        : item.pokemonMarketPrice ?? item.price;
  const formattedPrice =
    currentMarketPrice != null
      ? new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: item.currency_code || "USD",
        }).format(currentMarketPrice)
      : "Not listed";
  const cardIndex = details.printedNumber
    ?? [details.cardNumber, item.pokemonSetPrintedTotal]
      .filter((value) => value != null)
      .join("/");

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <GestureHandlerRootView style={styles.root}>
        <LinearGradient
          colors={[colors.primaryContainer, colors.background, colors.background]}
          locations={[0, 0.42, 1]}
          style={StyleSheet.absoluteFill}
        />
        <View pointerEvents="none" style={styles.ambientOrb} />

        <View style={styles.stage}>
          <GestureDetector gesture={cardGesture}>
            <Animated.View
              entering={FadeIn.duration(220)}
              style={[
                styles.cardShadow,
                { width: cardWidth, height: cardHeight, borderColor: accentColor, shadowColor: accentColor },
                cardStyle,
              ]}
            >
              {imageUrl ? (
                <Image
                  source={{ uri: imageUrl }}
                  style={styles.cardImage}
                  contentFit="contain"
                  cachePolicy="memory-disk"
                  transition={180}
                />
              ) : (
                <View style={styles.cardPlaceholder}>
                  <Ionicons name="image-outline" size={42} color={colors.grey} />
                </View>
              )}

              <Animated.View
                pointerEvents="none"
                style={[
                  styles.glareContainer,
                  {
                    width: cardWidth * 1.1,
                    height: cardWidth * 1.1,
                    left: -cardWidth * 0.05,
                    top: (cardHeight - cardWidth * 1.1) / 2,
                  },
                  glareStyle,
                ]}
              >
                <Svg width="100%" height="100%">
                  <Defs>
                    <RadialGradient id="cardGlare" cx="50%" cy="50%" r="50%">
                      <Stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.55" />
                      <Stop offset="55%" stopColor="#FFFFFF" stopOpacity="0.18" />
                      <Stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
                    </RadialGradient>
                  </Defs>
                  <Rect width="100%" height="100%" fill="url(#cardGlare)" />
                </Svg>
              </Animated.View>
            </Animated.View>
          </GestureDetector>
          {!detailsShown && (
            <Animated.View
              entering={FadeInDown.delay(450)}
              style={styles.cardHint}
            >
              <Ionicons name="move-outline" size={14} color="#FFFFFF" />
              <Text style={styles.cardHintText}>
                Move to tilt • Tap or swipe up for details
              </Text>
            </Animated.View>
          )}
        </View>

        <Animated.View
          style={[styles.sheet, { height: sheetHeight }, sheetStyle]}
        >
          <GestureDetector gesture={sheetGesture}>
            <View
              style={styles.dragArea}
              accessibilityRole="adjustable"
              accessibilityLabel="Pull down to return to the full-size card"
            >
              <View style={styles.handle} />
              <Text style={styles.dragHint}>Pull down for full card</Text>
            </View>
          </GestureDetector>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[
              styles.sheetContent,
              { paddingBottom: Math.max(insets.bottom, 18) + 20 },
            ]}
          >
            <View style={styles.quickStats}>
              <QuickStat
                icon="shield-checkmark-outline"
                label="Condition"
                value={item.condition || "Not set"}
                colors={colors}
              />
              <View style={styles.quickDivider} />
              <QuickStat
                icon="pricetag-outline"
                label="Market"
                value={formattedPrice}
                colors={colors}
              />
              <View style={styles.quickDivider} />
              <QuickStat
                icon="game-controller-outline"
                label="Game"
                value={details.gameLabel}
                colors={colors}
              />
            </View>

            <View style={styles.titleBlock}>
              <Text style={styles.title}>{details.title}</Text>
              {details.typeLine ? (
                <Text style={styles.typeLine}>{details.typeLine}</Text>
              ) : null}
            </View>

            {(details.description || details.flavorText) && (
              <View style={styles.descriptionCard}>
                {details.description ? (
                  <Text style={styles.rulesText}>{details.description}</Text>
                ) : null}
                {details.flavorText ? (
                  <Text style={styles.flavorText}>{details.flavorText}</Text>
                ) : null}
              </View>
            )}

            <View style={styles.setCard}>
              <View style={styles.setIdentity}>
                {details.setLogo ? (
                  <Image
                    source={{ uri: details.setLogo }}
                    style={styles.setLogo}
                    contentFit="contain"
                  />
                ) : (
                  <View style={styles.setIconFallback}>
                    <Ionicons name="albums-outline" size={22} color={colors.primary} />
                  </View>
                )}
                <View style={styles.setCopy}>
                  <Text style={styles.metaLabel}>SET</Text>
                  <Text style={styles.setName} numberOfLines={1}>
                    {details.setName}
                  </Text>
                  {details.setDetail ? (
                    <Text style={styles.setDetail} numberOfLines={1}>
                      {details.setDetail}
                    </Text>
                  ) : null}
                </View>
              </View>
              <View style={styles.collectorPill}>
                {details.setCode ? (
                  <Text style={styles.setCode}>{details.setCode.toUpperCase()}</Text>
                ) : null}
                <Text style={styles.cardNumber}>{cardIndex || "—"}</Text>
              </View>
            </View>

            <View style={styles.metadataRow}>
              <MetadataCell label="Rarity" value={details.rarity || "Unknown"} colors={colors} />
              <MetadataCell label="Artist" value={details.artist || "Unknown"} colors={colors} />
            </View>

            {priceCardId ? (
              <View style={styles.priceHistoryPanel}>
                <Text style={styles.sectionTitle}>Market history</Text>
                <CuratorInlineGate
                  feature="Price history"
                  description="Track this card's market value over time with Curator."
                >
                  {priceHistory && priceHistory.length > 0 ? (
                    <PriceHistoryChart points={priceHistory} />
                  ) : (
                    <Text style={styles.priceHistoryEmpty}>
                      Price history will appear as market prices refresh.
                    </Text>
                  )}
                </CuratorInlineGate>
              </View>
            ) : null}
          </ScrollView>
        </Animated.View>

        <TouchableOpacity
          onPress={onClose}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Close card details"
          style={[styles.closeButton, { top: insets.top + 12 }]}
        >
          <Ionicons name="close" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </GestureHandlerRootView>
    </Modal>
  );
}

function QuickStat({
  icon,
  label,
  value,
  colors,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  value: string;
  colors: ThemeColors;
}) {
  const styles = getStyles(colors);
  return (
    <View style={styles.quickStat}>
      <Ionicons name={icon} size={17} color={colors.primary} />
      <Text style={styles.quickValue} numberOfLines={1}>{value}</Text>
      <Text style={styles.quickLabel}>{label}</Text>
    </View>
  );
}

function MetadataCell({
  label,
  value,
  colors,
}: {
  label: string;
  value: string;
  colors: ThemeColors;
}) {
  const styles = getStyles(colors);
  return (
    <View style={styles.metadataCell}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metadataValue} numberOfLines={2}>{value}</Text>
    </View>
  );
}

const getStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.background,
    },
    ambientOrb: {
      position: "absolute",
      top: -100,
      right: -80,
      width: 280,
      height: 280,
      borderRadius: 140,
      backgroundColor: `${colors.secondary}28`,
    },
    stage: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingTop: 30,
    },
    cardShadow: {
      borderRadius: 12,
      borderWidth: 1.5,
      shadowColor: "#000000",
      shadowOffset: { width: 0, height: 14 },
      shadowOpacity: 0.48,
      shadowRadius: 18,
      elevation: 16,
      overflow: "hidden",
    },
    glareContainer: {
      position: "absolute",
    },
    cardImage: {
      width: "100%",
      height: "100%",
      borderRadius: 12,
    },
    cardPlaceholder: {
      flex: 1,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surfaceContainerHigh,
    },
    cardHint: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      marginTop: 12,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: "rgba(0,0,0,0.35)",
    },
    cardHintText: {
      color: "#FFFFFF",
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 0.4,
    },
    closeButton: {
      position: "absolute",
      right: 18,
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(0,0,0,0.35)",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.18)",
      zIndex: 5,
    },
    sheet: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      borderTopLeftRadius: 30,
      borderTopRightRadius: 30,
      backgroundColor: colors.background,
      shadowColor: "#000000",
      shadowOffset: { width: 0, height: -8 },
      shadowOpacity: 0.28,
      shadowRadius: 20,
      elevation: 24,
      overflow: "hidden",
    },
    dragArea: {
      height: 46,
      alignItems: "center",
      justifyContent: "center",
      gap: 5,
    },
    handle: {
      width: 42,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.outlineVariant,
    },
    dragHint: {
      color: colors.onSurfaceVariant,
      fontSize: 10,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 0.7,
    },
    sheetContent: {
      paddingHorizontal: 18,
    },
    quickStats: {
      minHeight: 76,
      flexDirection: "row",
      alignItems: "center",
      borderRadius: 20,
      paddingHorizontal: 8,
      backgroundColor: colors.surfaceContainerLow,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
    },
    quickStat: {
      flex: 1,
      alignItems: "center",
      paddingHorizontal: 5,
    },
    quickValue: {
      color: colors.text,
      fontSize: 12,
      fontWeight: "800",
      marginTop: 3,
    },
    quickLabel: {
      color: colors.onSurfaceVariant,
      fontSize: 10,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 0.7,
      marginTop: 1,
    },
    quickDivider: {
      width: 1,
      height: 34,
      backgroundColor: colors.outlineVariant,
    },
    titleBlock: {
      alignItems: "center",
      paddingVertical: 24,
    },
    title: {
      color: colors.text,
      fontSize: 28,
      fontWeight: "900",
      textAlign: "center",
      letterSpacing: -0.7,
    },
    typeLine: {
      color: colors.onSurfaceVariant,
      fontSize: 13,
      fontWeight: "600",
      textAlign: "center",
      marginTop: 7,
    },
    descriptionCard: {
      gap: 12,
      padding: 16,
      borderRadius: 17,
      backgroundColor: colors.surfaceContainerLow,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
    },
    rulesText: {
      color: colors.text,
      fontSize: 14,
      lineHeight: 21,
      fontWeight: "500",
    },
    flavorText: {
      color: colors.onSurfaceVariant,
      fontSize: 13,
      lineHeight: 20,
      fontStyle: "italic",
    },
    setCard: {
      minHeight: 72,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      marginTop: 14,
      padding: 12,
      borderRadius: 18,
      backgroundColor: colors.surfaceContainerHigh,
    },
    setIdentity: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 11,
    },
    setLogo: {
      width: 58,
      height: 38,
    },
    setIconFallback: {
      width: 44,
      height: 44,
      borderRadius: 13,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: `${colors.primary}18`,
    },
    setCopy: {
      flex: 1,
    },
    metaLabel: {
      color: colors.onSurfaceVariant,
      fontSize: 10,
      fontWeight: "800",
      textTransform: "uppercase",
      letterSpacing: 1.2,
    },
    setName: {
      color: colors.text,
      fontSize: 14,
      fontWeight: "800",
      marginTop: 3,
    },
    setDetail: {
      color: colors.onSurfaceVariant,
      fontSize: 12,
      marginTop: 2,
    },
    collectorPill: {
      minWidth: 68,
      alignItems: "center",
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: 12,
      backgroundColor: colors.surfaceContainerLowest,
    },
    setCode: {
      color: colors.onSurfaceVariant,
      fontSize: 10,
      fontWeight: "900",
    },
    cardNumber: {
      color: colors.text,
      fontSize: 12,
      fontWeight: "800",
      marginTop: 2,
    },
    metadataRow: {
      flexDirection: "row",
      gap: 10,
      marginTop: 10,
    },
    metadataCell: {
      flex: 1,
      minHeight: 65,
      justifyContent: "center",
      paddingHorizontal: 14,
      borderRadius: 16,
      backgroundColor: colors.surfaceContainerLow,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
    },
    metadataValue: {
      color: colors.text,
      fontSize: 13,
      fontWeight: "700",
      marginTop: 4,
    },
    priceHistoryPanel: {
      marginTop: 18,
      paddingTop: 4,
    },
    sectionTitle: {
      color: colors.text,
      fontSize: 17,
      fontWeight: "800",
      marginBottom: 12,
    },
    priceHistoryEmpty: {
      color: colors.onSurfaceVariant,
      fontSize: 12,
      textAlign: "center",
      paddingVertical: 12,
    },
  });
