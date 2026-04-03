import { useColors } from "@/constants/theme";
import { useThemeStore } from "@/hooks/useThemeStore";
import * as NavigationBar from "expo-navigation-bar";
import React, { useEffect } from "react";
import { Platform, StatusBar } from "react-native";

interface ThemeProviderProps {
    children: React.ReactNode;
}

export default function ThemeProvider({ children }: ThemeProviderProps) {
    const isDark = useThemeStore((s) => s.isDark);
    const colors = useColors();

    useEffect(() => {
        // Update StatusBar
        StatusBar.setBarStyle(isDark ? "light-content" : "dark-content", true);

        // Update Android NavigationBar
        if (Platform.OS === "android") {
            NavigationBar.setBackgroundColorAsync(colors.background);
            NavigationBar.setButtonStyleAsync(isDark ? "light" : "dark");
        }
    }, [isDark, colors.background]);

    return <>{children}</>;
}
