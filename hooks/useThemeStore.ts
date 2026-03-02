import { Appearance } from "react-native";
import { create } from "zustand";

const storage = new MMKV({ id: "theme-store" });

export type ThemeMode = "light" | "dark" | "system";

interface ThemeState {
    mode: ThemeMode;
    setMode: (mode: ThemeMode) => void;
    isDark: boolean;
}

const getSystemIsDark = () => Appearance.getColorScheme() === "dark";

const resolveIsDark = (mode: ThemeMode): boolean => {
    if (mode === "system") return getSystemIsDark();
    return mode === "dark";
};

const persistedMode = (storage.getString("theme-mode") as ThemeMode) || "dark";

export const useThemeStore = create<ThemeState>((set) => ({
    mode: persistedMode,
    isDark: resolveIsDark(persistedMode),
    setMode: (mode: ThemeMode) => {
        storage.set("theme-mode", mode);
        set({ mode, isDark: resolveIsDark(mode) });
    },
}));

// Listen for system appearance changes
Appearance.addChangeListener(({ colorScheme }) => {
    const { mode } = useThemeStore.getState();
    if (mode === "system") {
        useThemeStore.setState({ isDark: colorScheme === "dark" });
    }
});
