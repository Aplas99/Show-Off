import { GAME_BRAND_COLORS, type ThemeColors } from "@/constants/theme";
import { useHaptics } from "@/hooks/useHaptics";
import { ITEM_GAMES, type ItemGame } from "@/lib/itemCards";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Animated, { FadeIn, FadeInDown, FadeOut } from "react-native-reanimated";

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

/** Per-game picker art: an icon that nods to each game's identity. */
const GAME_ICONS: Record<ItemGame, IoniconName> = {
  pokemon: "flash",
  magic: "sparkles",
  riftbound: "diamond",
  ygo: "eye",
  op: "skull",
  lor: "color-wand",
  fab: "shield-half",
  dgm: "hardware-chip",
  swu: "planet",
  dbs: "flame",
  dbm: "bonfire",
  cfv: "infinite",
  cpk: "pulse",
};

function routeFor(game: ItemGame) {
  if (game === "pokemon") return "/(tabs)/tcg-create";
  if (game === "magic") return "/(tabs)/magic-create";
  if (game === "riftbound") return "/(tabs)/riftbound-create";
  return `/(tabs)/tcg-game-create?game=${game}`;
}

/**
 * Create-screen TCG tab: one big dropdown of every card game, each drawn in
 * its own brand colors, then a button to start that game's create flow.
 */
export function TcgGamePicker({ colors }: { colors: ThemeColors }) {
  const router = useRouter();
  const haptics = useHaptics();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const [selected, setSelected] = useState<ItemGame | null>(null);
  const [open, setOpen] = useState(false);

  const selectedGame = ITEM_GAMES.find((game) => game.key === selected) ?? null;
  const brand = selected ? GAME_BRAND_COLORS[selected] : null;

  const toggle = async () => {
    await haptics.light();
    setOpen((value) => !value);
  };

  const choose = async (game: ItemGame) => {
    await haptics.selection();
    setSelected(game);
    setOpen(false);
  };

  const begin = async () => {
    if (!selected) return;
    await haptics.medium();
    router.push(routeFor(selected) as never);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Add cards to your collection</Text>

      <Pressable onPress={toggle} accessibilityRole="button" accessibilityState={{ expanded: open }}
        accessibilityLabel={selectedGame ? `Game: ${selectedGame.label}. Change game` : "Choose a game"}>
        {selected && brand ? (
          <LinearGradient
            colors={brand.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.selector, { borderColor: brand.accent }]}
          >
            <View style={[styles.selectorIcon, { backgroundColor: `${brand.accent}33` }]}>
              <Ionicons name={GAME_ICONS[selected]} size={30} color={brand.accent} />
            </View>
            <View style={styles.flex}>
              <Text style={[styles.selectorEyebrow, { color: brand.accent }]}>Selected game</Text>
              <Text style={styles.selectorTitle} numberOfLines={1}>{selectedGame?.label}</Text>
              <Text style={styles.selectorTagline}>Scan with your camera, or search</Text>
            </View>
            <Ionicons name={open ? "chevron-up" : "chevron-down"} size={22} color="#FFF" />
          </LinearGradient>
        ) : (
          <View style={[styles.selector, styles.selectorEmpty]}>
            <View style={[styles.selectorIcon, { backgroundColor: `${colors.primary}22` }]}>
              <Ionicons name="layers" size={30} color={colors.primary} />
            </View>
            <View style={styles.flex}>
              <Text style={[styles.selectorEyebrow, { color: colors.primary }]}>Trading cards</Text>
              <Text style={[styles.selectorTitle, { color: colors.text }]}>Choose a game</Text>
              <Text style={[styles.selectorTagline, { color: colors.onSurfaceVariant }]}>
                {ITEM_GAMES.length} games to collect
              </Text>
            </View>
            <Ionicons name={open ? "chevron-up" : "chevron-down"} size={22} color={colors.onSurfaceVariant} />
          </View>
        )}
      </Pressable>

      {open && (
        <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(120)} style={styles.list}>
          {ITEM_GAMES.map((game, index) => {
            const gameBrand = GAME_BRAND_COLORS[game.key];
            const isSelected = game.key === selected;
            return (
              <Animated.View key={game.key} entering={FadeInDown.delay(index * 25).duration(180)}>
                <Pressable onPress={() => choose(game.key)} accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }} accessibilityLabel={game.label}>
                  <LinearGradient
                    colors={gameBrand.gradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={[styles.option, isSelected && { borderColor: gameBrand.accent }]}
                  >
                    <View style={[styles.optionIcon, { backgroundColor: `${gameBrand.accent}33` }]}>
                      <Ionicons name={GAME_ICONS[game.key]} size={18} color={gameBrand.accent} />
                    </View>
                    <Text style={styles.optionTitle} numberOfLines={1}>{game.label}</Text>
                    {isSelected && <Ionicons name="checkmark-circle" size={20} color={gameBrand.accent} />}
                  </LinearGradient>
                </Pressable>
              </Animated.View>
            );
          })}
        </Animated.View>
      )}

      <TouchableOpacity
        style={[
          styles.beginButton,
          { backgroundColor: brand?.accent ?? colors.primary },
          !selected && styles.disabled,
        ]}
        onPress={begin}
        disabled={!selected}
        activeOpacity={0.85}
      >
        <Ionicons name="camera" size={20} color={brand?.onAccent ?? "#000"} />
        <Text style={[styles.beginText, { color: brand?.onAccent ?? "#000" }]}>Begin scanning</Text>
      </TouchableOpacity>
    </View>
  );
}

function getStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { gap: 12 },
    flex: { flex: 1 },
    sectionTitle: { color: colors.text, fontSize: 16, fontWeight: "800", marginBottom: 2 },
    selector: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      minHeight: 112,
      padding: 18,
      borderRadius: 22,
      borderWidth: 1.5,
      overflow: "hidden",
    },
    selectorEmpty: {
      backgroundColor: colors.surfaceContainerHighest,
      borderColor: colors.outlineVariant,
      borderStyle: "dashed",
    },
    selectorIcon: {
      width: 56,
      height: 56,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
    },
    selectorEyebrow: { fontSize: 11, fontWeight: "800", letterSpacing: 0.8, textTransform: "uppercase" },
    selectorTitle: { color: "#FFF", fontSize: 22, fontWeight: "900", marginTop: 2 },
    selectorTagline: { color: "rgba(255,255,255,0.8)", fontSize: 12, marginTop: 3 },
    list: { gap: 8 },
    option: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderRadius: 16,
      borderWidth: 1.5,
      borderColor: "transparent",
      overflow: "hidden",
    },
    optionIcon: {
      width: 34,
      height: 34,
      borderRadius: 11,
      alignItems: "center",
      justifyContent: "center",
    },
    optionTitle: { flex: 1, color: "#FFF", fontSize: 15, fontWeight: "800" },
    beginButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingVertical: 16,
      borderRadius: 16,
      marginTop: 4,
    },
    beginText: { fontSize: 16, fontWeight: "800" },
    disabled: { opacity: 0.45 },
  });
}
