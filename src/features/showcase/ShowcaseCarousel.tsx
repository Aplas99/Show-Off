import { ItemWithProduct } from "@/api/items";
import { COLORS } from "@/constants/theme";
import { DEFAULT_SHOWCASE_ACCENT } from "@/src/features/showcase/ShowcaseVisuals";
import { Image } from "@/src/components/media/ProtectedImage";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const OVERLAP = 10; // Extra width to prevent sub-pixel gaps on Android

const AnimatedFlatList = Animated.createAnimatedComponent(FlatList);

const PLACEHOLDER_IMAGE = require("../../../assets/images/placeholder.png");

type Props = {
  data: ItemWithProduct[];
  onItemPress?: (item: ItemWithProduct) => void;
  onIndexChange?: (index: number) => void;
  accentColor?: string;
};

const Backdrop = React.memo(
  function Backdrop({
    activeIndex,
    backdropHeight,
    data,
    itemSize,
    screenWidth,
    scrollX,
  }: {
    activeIndex: number;
    backdropHeight: number;
    data: ItemWithProduct[];
    itemSize: number;
    screenWidth: number;
    scrollX: Animated.Value;
  }) {
    const visibleBackdrops = data
      .map((item, index) => ({ item, index }))
      .filter(({ index }) => Math.abs(index - activeIndex) <= 1);

    return (
      <View
        style={[styles.backdropContainer, { height: backdropHeight, width: screenWidth }]}
        pointerEvents="none"
      >
        {visibleBackdrops.map(({ item, index }) => {
          // Parse product data to get backdrop image
          // Data is already parsed by the API layer
          const productData = item.products?.data || {};

          // Determine backdrop image
          const backdropImageUrl =
            item.image_url ||
            (productData?.images && productData.images.length > 0
              ? productData.images[0]
              : undefined);

          const adjustedIndex = index + 1;
          const inputRange = [
            (adjustedIndex - 2) * itemSize,
            (adjustedIndex - 1) * itemSize,
            adjustedIndex * itemSize,
          ];

          // Fade removed as per user request
          const opacity = 1;

          // The Curtain: Moves from -width to 0
          // We add OVERLAP to ensure it fully covers the previous image on the right
          const translateX = scrollX.interpolate({
            inputRange: [inputRange[0], inputRange[1]],
            outputRange: [-screenWidth - OVERLAP, 0],
            extrapolate: "clamp",
          });

          // The Stationary World: Moves from +width to 0 (counteracts parent movement)
          const inverseTranslateX = scrollX.interpolate({
            inputRange: [inputRange[0], inputRange[1]],
            outputRange: [screenWidth + OVERLAP, 0],
            extrapolate: "clamp",
          });

          return (
            <Animated.View
              key={item.id}
              style={[
                styles.backdropImageContainer,
                {
                  width: screenWidth + OVERLAP, // Slightly wider
                  height: backdropHeight,
                  overflow: "hidden",
                  opacity,
                  transform: [{ translateX }],
                  zIndex: index,
                },
              ]}
            >
              <Animated.View
                style={{
                  width: screenWidth + OVERLAP,
                  height: backdropHeight,
                  transform: [{ translateX: inverseTranslateX }],
                }}
              >
                <Image
                  source={backdropImageUrl ? { uri: backdropImageUrl } : PLACEHOLDER_IMAGE}
                  style={{ width: screenWidth, height: backdropHeight }}
                  contentFit="cover"
                  transition={0}
                  cachePolicy="memory-disk"
                  priority="normal"
                  recyclingKey={item.id.toString()}
                />
              </Animated.View>
            </Animated.View>
          );
        })}
        <LinearGradient
          colors={[
            "rgba(14,14,14,0)",
            "rgba(14,14,14,0.3)",
            "rgba(14,14,14,0.8)",
            COLORS.background,
          ]}
          locations={[0, 0.4, 0.7, 1]}
          style={{
            height: backdropHeight,
            position: "absolute",
            width: screenWidth,
          }}
        />
      </View>
    );
  },
);

function ShowcaseCarousel({ data, onItemPress, onIndexChange, accentColor = DEFAULT_SHOWCASE_ACCENT }: Props) {
  const scrollX = useRef(new Animated.Value(0)).current;
  const [activeIndex, setActiveIndex] = useState(0);
  const insets = useSafeAreaInsets();
  const { height: screenHeight, width: screenWidth } = useWindowDimensions();
  const layoutWidth = Math.min(screenWidth, 900);
  const itemSize = layoutWidth * 0.65;
  const spacerSize = (layoutWidth - itemSize) / 2;
  const backdropHeight = screenHeight * 0.75;
  const posterHeight = screenHeight * 0.45;

  // Add spacers at the beginning and end for centering
  const dataWithSpacers = React.useMemo(
    () => [
      { key: "left-spacer", isSpacer: true },
      ...data,
      { key: "right-spacer", isSpacer: true },
    ],
    [data],
  );

  useEffect(() => {
    setActiveIndex((index) => Math.min(index, Math.max(data.length - 1, 0)));
  }, [data.length]);

  if (data.length === 0) {
    return null;
  }

  return (
    <View style={styles.carouselWrapper}>
      {/* Black Status Bar Strip */}
      {/* <View
        style={{
          height: insets.top,
          backgroundColor: "black",
          width: "100%",
          zIndex: 100,
          position: "absolute",
          top: 0,
        }}
      /> */}

      <Backdrop
        activeIndex={activeIndex}
        backdropHeight={backdropHeight}
        data={data}
        itemSize={itemSize}
        screenWidth={layoutWidth}
        scrollX={scrollX}
      />

      <AnimatedFlatList
        data={dataWithSpacers}
        renderItem={({ item, index }) => {
          // Check if it's a spacer
          if ((item as any).isSpacer) {
            return <View style={{ width: spacerSize }} />;
          }

          const actualItem = item as ItemWithProduct;
          const inputRange = [
            (index - 2) * itemSize,
            (index - 1) * itemSize,
            index * itemSize,
          ];

          const scale = scrollX.interpolate({
            inputRange,
            outputRange: [0.75, 1, 0.75],
            extrapolate: "clamp",
          });

          // Parse product data
          // Data is already parsed by the API layer
          const productData = actualItem.products?.data || {};

          const imageUrl =
            actualItem.image_url ||
            (productData?.images && productData.images.length > 0
              ? productData.images[0]
              : undefined);

          return (
            <Animated.View
              style={[
                styles.itemContainer,
                {
                  width: itemSize,
                  transform: [{ scale }],
                  paddingTop: screenHeight * 0.25 + insets.top,
                },
              ]}
            >
              <TouchableOpacity
                onPress={() => onItemPress?.(actualItem)}
                style={styles.itemContent}
                activeOpacity={0.9}
              >
                <View style={[styles.posterCard, { height: posterHeight, borderColor: accentColor, shadowColor: accentColor }]}>
                  <Image
                    source={imageUrl ? { uri: imageUrl } : PLACEHOLDER_IMAGE}
                    style={styles.posterImage}
                    contentFit="cover"
                    transition={0}
                    cachePolicy="memory-disk"
                    priority="high"
                    recyclingKey={actualItem.id.toString()}
                  />
                  <LinearGradient colors={[`${accentColor}42`, "transparent", "rgba(0,0,0,0.22)"]}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} pointerEvents="none" />
                </View>
              </TouchableOpacity>
            </Animated.View>
          );
        }}
        keyExtractor={(item, index) => {
          if ((item as any).isSpacer) {
            return (item as any).key;
          }
          return String((item as ItemWithProduct).id);
        }}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={itemSize}
        disableIntervalMomentum
        decelerationRate={0.2}
        bounces={false}
        scrollEventThrottle={16}
        removeClippedSubviews={true}
        maxToRenderPerBatch={3}
        windowSize={5}
        initialNumToRender={3}
        getItemLayout={(data, index) => ({
          length: itemSize,
          offset: itemSize * index,
          index,
        })}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: true },
        )}
        onMomentumScrollEnd={(event) => {
          const actualIndex = Math.round(
            event.nativeEvent.contentOffset.x / itemSize,
          );
          if (actualIndex >= 0 && actualIndex < data.length) {
            setActiveIndex(actualIndex);
            onIndexChange?.(actualIndex);
          }
        }}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No items to display</Text>
          </View>
        }
      />
    </View>
  );
}

export default React.memo(ShowcaseCarousel);

const styles = StyleSheet.create({
  carouselWrapper: {
    flex: 1,
    justifyContent: "flex-start",
    width: "100%",
    maxWidth: 900,
    alignSelf: "center",
  },
  backdropContainer: {
    position: "absolute",
    top: 0,
    overflow: "hidden",
  },
  backdropImageContainer: {
    position: "absolute",
    top: 0,
    left: 0,
  },
  listContent: {
    paddingVertical: 0,
  },
  itemContainer: {
    justifyContent: "flex-start",
    alignItems: "center",
  },
  itemContent: {
    width: "100%",
    alignItems: "center",
  },
  posterCard: {
    width: "100%",
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: COLORS.surfaceContainerHigh,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.6,
    shadowRadius: 50,
    elevation: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  posterImage: {
    width: "100%",
    height: "100%",
    backgroundColor: COLORS.surfaceContainerHigh,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 40,
  },
  emptyText: {
    color: COLORS.onSurfaceVariant,
    fontSize: 16,
    textAlign: "center",
  },
});
