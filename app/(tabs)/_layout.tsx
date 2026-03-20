import { useAuthStore } from "@/hooks/useAuthStore";
import CustomTabBar from "@/src/components/navigation/CustomTabBar";
import * as NavigationBar from "expo-navigation-bar";
import { Redirect, Tabs } from "expo-router";
import React, { useEffect } from "react";
import { Platform } from "react-native";

export default function TabLayout() {
  const { session } = useAuthStore();

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
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        tabBarShowLabel: false,
        headerShown: false,
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tabs.Screen name="index" options={{ href: null }} />
      <Tabs.Screen
        name="discover"
        options={{
          tabBarAccessibilityLabel: "Discover",
          tabBarLabel: "Discover",
        }}
      />
      <Tabs.Screen
        name="marketplace"
        options={{
          tabBarAccessibilityLabel: "Marketplace",
          tabBarLabel: "Marketplace",
        }}
      />
      <Tabs.Screen
        name="create"
        options={{
          tabBarAccessibilityLabel: "Create new item",
          tabBarLabel: "Create",
        }}
      />
      <Tabs.Screen
        name="showcase"
        options={{
          tabBarAccessibilityLabel: "Showcase",
          tabBarLabel: "Showcase",
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          tabBarAccessibilityLabel: "Profile",
          tabBarLabel: "Profile",
        }}
      />
    </Tabs>
  );
}
