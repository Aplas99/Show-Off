import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import type { ThemeColors } from "@/constants/theme";

export type TcgScanHint = "foil" | "promo";

interface TcgScanHintToggles {
  foil: boolean;
  promo: boolean;
  onToggle: (hint: TcgScanHint) => void;
}

interface TcgScannerToolsProps {
  colors: ThemeColors;
  torchOn: boolean;
  onToggleTorch: () => void;
  isCurator: boolean;
  isBusy: boolean;
  onInstaScan: () => void;
  /** Only pass for games whose recognition pipeline accepts scan hints. */
  scanHints?: TcgScanHintToggles;
}

const SCAN_HINT_OPTIONS: {
  hint: TcgScanHint;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  activeIcon: React.ComponentProps<typeof Ionicons>["name"];
  description: string;
}[] = [
  {
    hint: "foil",
    label: "Foil",
    icon: "diamond-outline",
    activeIcon: "diamond",
    description: "Holo or foil card, tolerates glare on the name",
  },
  {
    hint: "promo",
    label: "Promo",
    icon: "star-outline",
    activeIcon: "star",
    description: "Promo card, only matches promo sets",
  },
];

// Shared by every TCG camera flow. Add new games through this control so
// Curators always have the same explicit, one-tap server OCR option.
export function TcgScannerTools({
  colors,
  torchOn,
  onToggleTorch,
  isCurator,
  isBusy,
  onInstaScan,
  scanHints,
}: TcgScannerToolsProps) {
  return (
    <View style={styles.container}>
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.action, torchOn && { borderColor: colors.primary }]}
          onPress={onToggleTorch}
          accessibilityRole="switch"
          accessibilityState={{ checked: torchOn }}
          accessibilityLabel={torchOn ? "Turn flashlight off" : "Turn flashlight on"}
        >
          <Ionicons name={torchOn ? "flashlight" : "flashlight-outline"} size={19} color="#FFF" />
          <Text style={styles.actionText}>Torch</Text>
        </TouchableOpacity>
        {isCurator && (
          <TouchableOpacity
            style={[styles.action, styles.instaScan, isBusy && styles.disabled]}
            onPress={onInstaScan}
            disabled={isBusy}
            accessibilityRole="button"
            accessibilityLabel="InstaScan with online OCR"
          >
            <Ionicons name="sparkles" size={19} color="#FFF" />
            <Text style={styles.actionText}>InstaScan</Text>
          </TouchableOpacity>
        )}
      </View>
      {scanHints && (
        <View style={styles.hints}>
          {SCAN_HINT_OPTIONS.map(({ hint, label, icon, activeIcon, description }) => {
            const active = scanHints[hint];
            return (
              <TouchableOpacity
                key={hint}
                style={[styles.hint, active && { borderColor: colors.primary, backgroundColor: "rgba(0,0,0,0.78)" }]}
                onPress={() => scanHints.onToggle(hint)}
                disabled={isBusy}
                accessibilityRole="switch"
                accessibilityState={{ checked: active, disabled: isBusy }}
                accessibilityLabel={`${label} card`}
                accessibilityHint={description}
              >
                <Ionicons
                  name={active ? activeIcon : icon}
                  size={14}
                  color={active ? colors.primary : "#FFF"}
                />
                <Text style={styles.hintText}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
      {isCurator && (
        <Text style={styles.disclosure}>InstaScan sends the cropped card photo for online OCR.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: "center", marginTop: 10 },
  actions: { flexDirection: "row", gap: 10 },
  action: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 15,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.44)",
    backgroundColor: "rgba(0,0,0,0.62)",
  },
  instaScan: { borderColor: "rgba(255,255,255,0.75)" },
  actionText: { color: "#FFF", fontSize: 13, fontWeight: "700" },
  hints: { flexDirection: "row", gap: 8, marginTop: 8 },
  hint: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.32)",
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  hintText: { color: "#FFF", fontSize: 12, fontWeight: "700" },
  disclosure: {
    color: "rgba(255,255,255,0.82)",
    fontSize: 11,
    textAlign: "center",
    marginTop: 7,
  },
  disabled: { opacity: 0.42 },
});
