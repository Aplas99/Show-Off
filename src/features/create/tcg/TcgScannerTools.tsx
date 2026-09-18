import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import type { ThemeColors } from "@/constants/theme";

interface TcgScannerToolsProps {
  colors: ThemeColors;
  torchOn: boolean;
  onToggleTorch: () => void;
  isCurator: boolean;
  isBusy: boolean;
  onInstaScan: () => void;
}

// Shared by every TCG camera flow. Add new games through this control so
// Curators always have the same explicit, one-tap server OCR option.
export function TcgScannerTools({
  colors,
  torchOn,
  onToggleTorch,
  isCurator,
  isBusy,
  onInstaScan,
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
  disclosure: {
    color: "rgba(255,255,255,0.82)",
    fontSize: 10,
    textAlign: "center",
    marginTop: 7,
  },
  disabled: { opacity: 0.42 },
});
