import { useThemeStore } from "@/hooks/useThemeStore";

export interface ThemeColors {
  background: string;
  surface: string;
  surfaceLight: string;
  primary: string;
  secondary: string;
  white: string;
  text: string;
  textDim: string;
  grey: string;
  border: string;
  slate: string;
  card: string;
  overlay: string;
  danger: string;
  inputBg: string;
}

export const DARK_COLORS: ThemeColors = {
  background: "#000000",
  surface: "#121212",
  surfaceLight: "#1E1E1E",
  primary: "#9B5DE5",
  secondary: "#F15BB5",
  white: "#FFFFFF",
  text: "#FFFFFF",
  textDim: "#888888",
  grey: "#7C7C7C",
  border: "#333333",
  slate: "#2A2A2A",
  card: "#161616",
  overlay: "rgba(0, 0, 0, 0.6)",
  danger: "#EF4444",
  inputBg: "#121212",
};

export const LIGHT_COLORS: ThemeColors = {
  background: "#F5F0EB",
  surface: "#EDE8E2",
  surfaceLight: "#E5E0DA",
  primary: "#9B5DE5",
  secondary: "#F15BB5",
  white: "#1A1A1A",
  text: "#1A1A1A",
  textDim: "#6B6B6B",
  grey: "#8A8A8A",
  border: "#D5D0CA",
  slate: "#DDD8D2",
  card: "#FFFFFF",
  overlay: "rgba(0, 0, 0, 0.4)",
  danger: "#DC2626",
  inputBg: "#FFFFFF",
};

/**
 * @deprecated Use `useColors()` instead for theme-aware colors.
 */
export const COLORS = DARK_COLORS;

/**
 * Hook that returns the active color palette based on the current theme.
 */
export function useColors(): ThemeColors {
  const isDark = useThemeStore((s) => s.isDark);
  return isDark ? DARK_COLORS : LIGHT_COLORS;
}
