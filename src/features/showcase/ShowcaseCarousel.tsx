import { ItemWithProduct } from "@/api/items";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import React, { useRef } from "react";
import {
  Animated,
  Dimensions,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const { width: screenWidth, height: screenHeight } = Dimensions.get("window");
const ITEM_SIZE = screenWidth * 0.65; // 65% of screen width for larger posters
const SPACER_SIZE = (screenWidth - ITEM_SIZE) / 2;
const BACKDROP_HEIGHT = screenHeight * 0.75; // Cover top 75% of screen (extended)
const POSTER_HEIGHT = screenHeight * 0.45; // Poster card height

const AnimatedFlatList = Animated.createAnimatedComponent(FlatList);
const AnimatedImage = Animated.createAnimatedComponent(Image);

type Props = {
  data: ItemWithProduct[];
  onItemPress?: (item: ItemWithProduct) => void;
  onIndexChange?: (index: number) => void;
};

const Backdrop = React.memo(
  ({ data, scrollX }: { data: ItemWithProduct[]; scrollX: Animated.Value }) => {
    return (
      <View style={styles.backdropContainer} pointerEvents="none">
        {data.map((item, index) => {
          // Parse product data to get backdrop image
          // Data is already parsed by the API layer
          const productData = item.products?.data || {};

          // Determine backdrop image
          const backdropImageUrl =
            item.image_url ||
            (productData?.images && productData.images.length > 0
              ? productData.images[0]
              : undefined);

          if (!backdropImageUrl) {
            return null;
          }

          const adjustedIndex = index + 1;
          const inputRange = [
            (adjustedIndex - 2) * ITEM_SIZE,
            (adjustedIndex - 1) * ITEM_SIZE,
          ];

          // The Window: Moves from -width to 0 (Left -> Right)
          const translateX = scrollX.interpolate({
            inputRange,
            outputRange: [-screenWidth, 0],
            extrapolate: "clamp",
          });

          // The World Inside: Moves from +width to 0 (Right -> Left)
          // This counter-movement makes the image appear stationary/parallaxed relative to the screen
          const inverseTranslateX = scrollX.interpolate({
            inputRange,
            outputRange: [screenWidth, 0],
            extrapolate: "clamp",
          });

          return (
            <Animated.View
              key={item.id}
              style={[
                styles.backdropImageContainer,
                {
                  overflow: "hidden", // The Curtain Clipping Magic
                  transform: [{ translateX }],
                },
              ]}
            >
              <AnimatedImage
                source={{ uri: backdropImageUrl }}
                style={[
                  styles.backdropImage,
                  {
                    transform: [{ translateX: inverseTranslateX }],
                  },
                ]}
                contentFit="cover"
                transition={0}
                cachePolicy="memory-disk"
                priority="high"
                recyclingKey={item.id.toString()}
              />
            </Animated.View>
          );
        })}
        <LinearGradient
          colors={[
            "rgba(0,0,0,0)",
            "rgba(0,0,0,0.3)",
            "rgba(0,0,0,0.8)",
            "#000000",
          ]}
          locations={[0, 0.4, 0.7, 1]}
          style={styles.backdropGradient}
        />
      </View>
    );
  },
);

function ShowcaseCarousel({ data, onItemPress, onIndexChange }: Props) {
  const scrollX = useRef(new Animated.Value(0)).current;
  const insets = useSafeAreaInsets();

  // Handle empty items
  if (!data || data.length === 0) {
    return null;
  }

  // Add spacers at the beginning and end for centering
  const dataWithSpacers = React.useMemo(
    () => [
      { key: "left-spacer", isSpacer: true },
      ...data,
      { key: "right-spacer", isSpacer: true },
    ],
    [data],
  );

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

      <Backdrop data={data} scrollX={scrollX} />

      <AnimatedFlatList
        data={dataWithSpacers}
        renderItem={({ item, index }) => {
          // Check if it's a spacer
          if ((item as any).isSpacer) {
            return <View style={{ width: SPACER_SIZE }} />;
          }

          const actualItem = item as ItemWithProduct;
          const inputRange = [
            (index - 2) * ITEM_SIZE,
            (index - 1) * ITEM_SIZE,
            index * ITEM_SIZE,
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
                  width: ITEM_SIZE,
                  transform: [{ scale }],
                  paddingTop: screenHeight * 0.25 + insets.top, // Adjust for status bar
                },
              ]}
            >
              <TouchableOpacity
                onPress={() => onItemPress?.(actualItem)}
                style={styles.itemContent}
                activeOpacity={0.9}
              >
                <View style={styles.posterCard}>
                  {imageUrl ? (
                    <Image
                      source={{ uri: imageUrl }}
                      style={styles.posterImage}
                      contentFit="cover"
                      transition={0}
                      cachePolicy="memory-disk"
                      priority="high"
                      recyclingKey={actualItem.id.toString()}
                    />
                  ) : (
                    <View style={styles.imagePlaceholder}>
                      <Text style={styles.placeholderText}>No Image</Text>
                    </View>
                  )}
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
        snapToInterval={ITEM_SIZE}
        decelerationRate={0}
        bounces={false}
        scrollEventThrottle={16}
        removeClippedSubviews={true}
        maxToRenderPerBatch={3}
        windowSize={5}
        initialNumToRender={3}
        getItemLayout={(data, index) => ({
          length: ITEM_SIZE,
          offset: ITEM_SIZE * index,
          index,
        })}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: true },
        )}
        onMomentumScrollEnd={(event) => {
          const index = Math.round(
            event.nativeEvent.contentOffset.x / ITEM_SIZE,
          );
          const actualIndex = index - 1;
          if (actualIndex >= 0 && actualIndex < data.length) {
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
  },
  backdropContainer: {
    position: "absolute",
    width: screenWidth,
    height: BACKDROP_HEIGHT,
    top: 0,
    overflow: "hidden",
  },
  backdropImageContainer: {
    position: "absolute",
    width: screenWidth,
    height: BACKDROP_HEIGHT,
    top: 0,
    left: 0,
  },
  backdropImage: {
    width: screenWidth,
    height: BACKDROP_HEIGHT,
    // Improve image rendering quality
    backgroundColor: "#000",
  },
  backdropGradient: {
    position: "absolute",
    width: screenWidth,
    height: BACKDROP_HEIGHT,
    bottom: 0,
    top: 0,
  },
  listContent: {
    paddingVertical: 0,
  },
  itemContainer: {
    justifyContent: "flex-start",
    alignItems: "center",
    // paddingTop is handled inline to account for safe area insets
  },
  itemContent: {
    width: "100%",
    alignItems: "center",
  },
  posterCard: {
    width: "100%",
    height: POSTER_HEIGHT,
    backgroundColor: "#FFF",
    borderRadius: 20,
    padding: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 12,
    marginTop: 0,
  },
  posterImage: {
    width: "100%",
    height: "100%",
    backgroundColor: "#E0E0E0",
    borderRadius: 14,
    // Improve image rendering quality
    overflow: "hidden",
  },
  imagePlaceholder: {
    width: "100%",
    height: "100%",
    backgroundColor: "#E0E0E0",
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  placeholderText: {
    color: "#999",
    fontSize: 14,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 40,
  },
  emptyText: {
    color: "#9CA3AF",
    fontSize: 16,
    textAlign: "center",
  },
});
