import { formatPrice } from "@/api/pokemon/ocrPostprocessing";
import { type PricePoint } from "@/api/prices";
import { useColors } from "@/constants/theme";
import React, { useMemo, useState } from "react";
import { StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from "react-native-svg";

const CHART_HEIGHT = 120;
const PADDING_X = 6;
const PADDING_Y = 10;

/**
 * Compact market-price line chart (react-native-svg — no extra native deps).
 * Renders a filled area line with first/last labels; a single data point
 * renders as a dot with its value.
 */
export default function PriceHistoryChart({ points }: { points: PricePoint[] }) {
  const colors = useColors();
  const [width, setWidth] = useState(0);

  const geometry = useMemo(() => {
    if (points.length === 0 || width === 0) return null;

    const prices = points.map((point) => point.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const span = max - min || 1;
    const innerWidth = width - PADDING_X * 2;
    const innerHeight = CHART_HEIGHT - PADDING_Y * 2;

    const coords = points.map((point, index) => ({
      x:
        PADDING_X +
        (points.length === 1 ? innerWidth / 2 : (index / (points.length - 1)) * innerWidth),
      y: PADDING_Y + innerHeight - ((point.price - min) / span) * innerHeight,
    }));

    const line = coords
      .map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`)
      .join(" ");
    const area = `${line} L${coords[coords.length - 1].x.toFixed(1)},${CHART_HEIGHT} L${coords[0].x.toFixed(1)},${CHART_HEIGHT} Z`;

    return { coords, line, area, min, max };
  }, [points, width]);

  const onLayout = (event: LayoutChangeEvent) =>
    setWidth(event.nativeEvent.layout.width);

  const first = points[0];
  const last = points[points.length - 1];
  const delta = first && last ? last.price - first.price : 0;
  const deltaColor = delta > 0 ? "#22c55e" : delta < 0 ? colors.danger : colors.grey;

  return (
    <View onLayout={onLayout}>
      {last && (
        <View style={styles.summaryRow}>
          <Text style={[styles.currentPrice, { color: colors.text }]}>
            {formatPrice(last.price)}
          </Text>
          {points.length > 1 && (
            <Text style={[styles.delta, { color: deltaColor }]}>
              {delta >= 0 ? "▲" : "▼"} {formatPrice(Math.abs(delta))} since{" "}
              {first.capturedOn}
            </Text>
          )}
        </View>
      )}
      {geometry && width > 0 && (
        <Svg width={width} height={CHART_HEIGHT}>
          <Defs>
            <LinearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={colors.primary} stopOpacity="0.35" />
              <Stop offset="1" stopColor={colors.primary} stopOpacity="0.02" />
            </LinearGradient>
          </Defs>
          {points.length > 1 && (
            <>
              <Path d={geometry.area} fill="url(#priceFill)" />
              <Path
                d={geometry.line}
                stroke={colors.primary}
                strokeWidth={2.5}
                fill="none"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </>
          )}
          <Circle
            cx={geometry.coords[geometry.coords.length - 1].x}
            cy={geometry.coords[geometry.coords.length - 1].y}
            r={4}
            fill={colors.primary}
          />
        </Svg>
      )}
      {points.length === 1 && (
        <Text style={[styles.singlePointNote, { color: colors.grey }]}>
          Price tracking started {first.capturedOn}. Check back as history
          builds daily.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  summaryRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 10,
    marginBottom: 4,
  },
  currentPrice: { fontSize: 20, fontWeight: "800" },
  delta: { fontSize: 12, fontWeight: "700" },
  singlePointNote: { fontSize: 11, marginTop: 4 },
});
