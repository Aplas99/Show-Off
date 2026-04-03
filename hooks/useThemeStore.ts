import { Appearance } from "react-native";
import { create } from "zustand";

export type ThemeMode = "light" | "dark" | "system";

/**
 * Simple synchronous key/value store for theme persistence.
 * Tries MMKV first (dev builds), falls back to in-memory (Expo Go).
 */
interface SyncStorage {
    getString(key: string): string | undefined;
    set(key: string, value: string): void;
}

function createStorage(): SyncStorage {
    try {
        // MMKV is a native module — only works in dev builds, not Expo Go
        const { MMKV } = require("react-native-mmkv");
        const mmkv = new MMKV({ id: "theme-store" });
        return mmkv as SyncStorage;
    } catch {
        // Fallback: in-memory store (Expo Go compatibility)
        const mem = new Map<string, string>();
        return {
            getString: (key: string) => mem.get(key),
            set: (key: string, value: string) => mem.set(key, value),
        };
    }
}

const storage = createStorage();

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
