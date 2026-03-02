import { TAB_BAR_HEIGHT } from "@/constants/layoutConfig";
import { useColors } from "@/constants/theme";
import { useAuthStore } from "@/hooks/useAuthStore";
import { Ionicons } from "@expo/vector-icons";
import AntDesign from "@expo/vector-icons/AntDesign";
import Feather from "@expo/vector-icons/Feather";
import * as NavigationBar from "expo-navigation-bar";
import { Redirect, Tabs } from "expo-router";
import React, { useEffect } from "react";
import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const { session } = useAuthStore();
  const colors = useColors();

  useEffect(() => {
    if (Platform.OS === "android") {
      NavigationBar.setBehaviorAsync("overlay-swipe");
    }
  }, []);

  if (!session) {
    return <Redirect href="/(auth)/signin" />;
  }

  return (
    <Tabs
      screenOptions={{
        tabBarShowLabel: false,
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.grey,
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          height:
            TAB_BAR_HEIGHT +
            insets.bottom +
            (Platform.OS === "android" ? 10 : 0),
          backgroundColor: colors.surface,
          borderTopWidth: 0,
          paddingTop: 10,
          paddingBottom: insets.bottom + (Platform.OS === "android" ? 10 : 0),
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
        },
      }}
    >
      <Tabs.Screen name="index" options={{ href: null }} />
      <Tabs.Screen
        name="discover"
        options={{
          tabBarIcon: ({ size, color }) => (
            <Ionicons name="home" size={size} color={color} />
          ),
          tabBarAccessibilityLabel: "Discover",
          tabBarLabel: "Discover",
        }}
      />
      <Tabs.Screen
        name="marketplace"
        options={{
          tabBarIcon: ({ size, color }) => (
            <AntDesign name="eye" size={size} color={color} />
          ),
          tabBarAccessibilityLabel: "Marketplace",
          tabBarLabel: "Marketplace",
        }}
      />
      <Tabs.Screen
        name="create"
        options={{
          tabBarIcon: ({ size, color }) => (
            <Ionicons
              name="add-circle-outline"
              size={size * 1.1}
              color={color}
            />
          ),
          tabBarAccessibilityLabel: "Create new item",
          tabBarLabel: "Create",
        }}
      />
      <Tabs.Screen
        name="showcase"
        options={{
          tabBarIcon: ({ size, color }) => (
            <Ionicons name="albums" size={size} color={color} />
          ),
          tabBarAccessibilityLabel: "Showcase",
          tabBarLabel: "Showcase",
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          tabBarIcon: ({ size, color }) => (
            <Feather name="user" size={size} color={color} />
          ),
          tabBarAccessibilityLabel: "Profile",
          tabBarLabel: "Profile",
        }}
      />
    </Tabs>
  );
}

