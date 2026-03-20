import { TAB_BAR_HEIGHT } from "@/constants/layoutConfig";
import { COLORS } from "@/constants/theme";
import { Ionicons } from "@expo/vector-icons";
import AntDesign from "@expo/vector-icons/AntDesign";
import Feather from "@expo/vector-icons/Feather";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import React, { useEffect, useRef } from "react";
import {
  Animated,
  Platform,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const ICON_SIZE = 22;
const ACTIVE_CIRCLE = 52;

// Map route names to their icons
const TAB_ICONS: Record<string, { lib: "ionicons" | "antdesign" | "feather"; name: string }> = {
  discover: { lib: "ionicons", name: "home" },
  marketplace: { lib: "antdesign", name: "eye" },
  create: { lib: "ionicons", name: "add-circle-outline" },
  showcase: { lib: "ionicons", name: "albums" },
  profile: { lib: "feather", name: "user" },
};

function TabIcon({ lib, name, color, size }: { lib: string; name: string; color: string; size: number }) {
  if (lib === "antdesign") {
    return <AntDesign name={name as any} size={size} color={color} />;
  }
  if (lib === "feather") {
    return <Feather name={name as any} size={size} color={color} />;
  }
  return <Ionicons name={name as any} size={size} color={color} />;
}

function AnimatedTab({
  route,
  isFocused,
  onPress,
  onLongPress,
}: {
  route: any;
  isFocused: boolean;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const scaleAnim = useRef(new Animated.Value(isFocused ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(scaleAnim, {
      toValue: isFocused ? 1 : 0,
      damping: 15,
      stiffness: 200,
      useNativeDriver: true,
    }).start();
  }, [isFocused, scaleAnim]);

  const iconConfig = TAB_ICONS[route.name];
  if (!iconConfig) return null;

  const circleScale = scaleAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  const iconScale = scaleAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.15],
  });

  const iconColor = isFocused ? "#1a1a1a" : "rgba(255,255,255,0.4)";

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityState={isFocused ? { selected: true } : {}}
      onPress={onPress}
      onLongPress={onLongPress}
      style={styles.tabButton}
      activeOpacity={0.7}
    >
      {/* Active circle background */}
      <Animated.View
        style={[
          styles.activeCircle,
          {
            transform: [{ scale: circleScale }],
            opacity: scaleAnim,
          },
        ]}
      />
      {/* Icon */}
      <Animated.View style={{ transform: [{ scale: iconScale }] }}>
        <TabIcon
          lib={iconConfig.lib}
          name={iconConfig.name}
          color={iconColor}
          size={ICON_SIZE}
        />
      </Animated.View>
    </TouchableOpacity>
  );
}

export default function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  // Filter out hidden routes (href: null)
  const visibleRoutes = state.routes.filter((route) => {
    const options = descriptors[route.key]?.options;
    // In expo-router, href: null sets tabBarItemStyle display to 'none' or uses
    // a custom approach. We check for the common pattern.
    if ((options as any)?.href === null) return false;
    // Also filter by tabBarButton being undefined (expo-router uses this too)
    const tabBarStyle = options?.tabBarItemStyle as any;
    if (tabBarStyle?.display === "none") return false;
    return true;
  });

  return (
    <View
      style={[
        styles.barOuter,
        {
          paddingBottom: insets.bottom + (Platform.OS === "android" ? 8 : 0),
        },
      ]}
    >
      <View style={styles.barInner}>
        {visibleRoutes.map((route) => {
          const actualIndex = state.routes.indexOf(route);
          const isFocused = state.index === actualIndex;

          const onPress = () => {
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          const onLongPress = () => {
            navigation.emit({
              type: "tabLongPress",
              target: route.key,
            });
          };

          return (
            <AnimatedTab
              key={route.key}
              route={route}
              isFocused={isFocused}
              onPress={onPress}
              onLongPress={onLongPress}
            />
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  barOuter: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.surfaceContainerLow,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 12,
    paddingTop: 4,
    // Subtle top shadow
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 10,
  },
  barInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-evenly",
    width: "100%",
    height: TAB_BAR_HEIGHT + 12,
  },
  tabButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
  },
  activeCircle: {
    position: "absolute",
    width: ACTIVE_CIRCLE,
    height: ACTIVE_CIRCLE,
    borderRadius: ACTIVE_CIRCLE / 2,
    backgroundColor: COLORS.primary,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
});
