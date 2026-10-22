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
  // --- Digital Curator Design System ---
  /** Deep background: `#0e0e0e` (dark) — the obsidian canvas. */
  surfaceDim: string;
  /** Lowest container: `#000000` (dark) — deepest layer. */
  surfaceContainerLowest: string;
  /** Low container: `#131313` (dark) — subtle card bg. */
  surfaceContainerLow: string;
  /** Mid container: `#1a1a1a` (dark) — standard card bg. */
  surfaceContainer: string;
  /** High container: `#20201f` (dark) — interactive cards. */
  surfaceContainerHigh: string;
  /** Highest container: `#262626` (dark) — surface variant. */
  surfaceContainerHighest: string;
  /** Surface variant (same as highest in dark). */
  surfaceVariant: string;
  /** Primary container: `#be87ff` (dark) — lighter purple for gradients. */
  primaryContainer: string;
  /** Dim primary variant. */
  primaryDim: string;
  /** Tertiary accent: `#ff94a4` (dark) — coral/pink for badges. */
  tertiary: string;
  /** Outline for subtle borders: `#767575` (dark). */
  outline: string;
  /** Outline variant for ghost borders: `#484847` (dark). */
  outlineVariant: string;
  /** On-surface-variant for muted text: `#adaaaa` (dark). */
  onSurfaceVariant: string;
  /** Secondary container: `#682888` (dark). */
  secondaryContainer: string;
  /** Error container. */
  errorContainer: string;
  /** Dim error variant. */
  errorDim: string;
}

export const DARK_COLORS: ThemeColors = {
  background: "#0e0e0e",
  surface: "#0e0e0e",
  surfaceLight: "#1E1E1E",
  primary: "#9B7BFF",
  secondary: "#c77dff",
  white: "#FFFFFF",
  text: "#FFFFFF",
  textDim: "#9C9C9C",
  grey: "#929292",
  border: "#333333",
  slate: "#2A2A2A",
  card: "#1a1a1a",
  overlay: "rgba(0, 0, 0, 0.6)",
  danger: "#EF4444",
  inputBg: "#000000",
  // --- Digital Curator Design System ---
  surfaceDim: "#0e0e0e",
  surfaceContainerLowest: "#000000",
  surfaceContainerLow: "#131313",
  surfaceContainer: "#1a1a1a",
  surfaceContainerHigh: "#20201f",
  surfaceContainerHighest: "#262626",
  surfaceVariant: "#262626",
  primaryContainer: "#7B5CDB",
  primaryDim: "#8468E8",
  tertiary: "#ff94a4",
  outline: "#767575",
  outlineVariant: "#484847",
  onSurfaceVariant: "#adaaaa",
  secondaryContainer: "#682888",
  errorContainer: "#a70138",
  errorDim: "#d73357",
};

export const LIGHT_COLORS: ThemeColors = {
  background: "#F5F0EB",
  surface: "#EDE8E2",
  surfaceLight: "#E5E0DA",
  primary: "#8048D0",
  secondary: "#F15BB5",
  white: "#1A1A1A",
  text: "#1A1A1A",
  textDim: "#5A5A5A",
  grey: "#6A6A6A",
  border: "#D5D0CA",
  slate: "#DDD8D2",
  card: "#FFFFFF",
  overlay: "rgba(0, 0, 0, 0.4)",
  danger: "#DC2626",
  inputBg: "#FFFFFF",
  // --- Digital Curator Design System (light mode approximations) ---
  surfaceDim: "#E5E0DA",
  surfaceContainerLowest: "#FFFFFF",
  surfaceContainerLow: "#F5F0EB",
  surfaceContainer: "#EDE8E2",
  surfaceContainerHigh: "#E5E0DA",
  surfaceContainerHighest: "#DDD8D2",
  surfaceVariant: "#DDD8D2",
  primaryContainer: "#E8D5FF",
  primaryDim: "#B07FE0",
  tertiary: "#E87585",
  outline: "#8A8A8A",
  outlineVariant: "#C5C0BA",
  onSurfaceVariant: "#5A5A5A",
  secondaryContainer: "#F0D9FF",
  errorContainer: "#FFE0E5",
  errorDim: "#C92040",
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

/**
 * Brand palette for each card game (Create screen game picker). These are
 * the games' own colors, so they stay the same in light and dark mode.
 * Keys match `ItemGame` in lib/itemCards.ts.
 */
export interface GameBrandColors {
  /** Card background, top-left to bottom-right. */
  gradient: readonly [string, string];
  /** Icon, highlight and button color. */
  accent: string;
  /** Text drawn on the accent color. */
  onAccent: string;
}

export const GAME_BRAND_COLORS: Record<string, GameBrandColors> = {
  pokemon: { gradient: ["#2A75BB", "#16306E"], accent: "#FFCB05", onAccent: "#1A1A1A" },
  magic: { gradient: ["#3B2A1C", "#100B07"], accent: "#E8B04B", onAccent: "#1A1A1A" },
  riftbound: { gradient: ["#0A323C", "#0A1428"], accent: "#C8AA6E", onAccent: "#1A1A1A" },
  ygo: { gradient: ["#5B2A86", "#1E0B33"], accent: "#D4AF37", onAccent: "#1A1A1A" },
  op: { gradient: ["#C8102E", "#5E0716"], accent: "#F5C518", onAccent: "#1A1A1A" },
  lor: { gradient: ["#25368A", "#0B1238"], accent: "#E7C873", onAccent: "#1A1A1A" },
  fab: { gradient: ["#7A1F1F", "#2B0A0A"], accent: "#E0B15A", onAccent: "#1A1A1A" },
  dgm: { gradient: ["#0077C8", "#003E73"], accent: "#FF8C1A", onAccent: "#1A1A1A" },
  swu: { gradient: ["#2B2B2B", "#0A0A0A"], accent: "#FFE81F", onAccent: "#1A1A1A" },
  dbs: { gradient: ["#F57C00", "#9E2A00"], accent: "#FFE082", onAccent: "#1A1A1A" },
  cfv: { gradient: ["#1565C0", "#1A237E"], accent: "#4FC3F7", onAccent: "#1A1A1A" },
  cpk: { gradient: ["#2A0F2E", "#0D0D0D"], accent: "#FCEE0A", onAccent: "#1A1A1A" },
};
