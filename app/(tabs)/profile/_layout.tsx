import { useColors } from "@/constants/theme";
import { Stack } from "expo-router";
import React from "react";

export default function ProfileLayout() {
    const colors = useColors();

    return (
        <Stack
            screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: colors.background },
                animation: "slide_from_right",
            }}
        >
            <Stack.Screen name="index" />
            <Stack.Screen name="settings" />
        </Stack>
    );
}
