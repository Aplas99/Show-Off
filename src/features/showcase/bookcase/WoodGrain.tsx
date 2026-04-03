import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { StyleSheet, View } from "react-native";
import { WOOD_BASE, WOOD_DARK, WOOD_HIGHLIGHT, WOOD_MID } from "./constants";

/**
 * Simplified WoodGrain — 4 lines instead of 8, single LinearGradient
 * (was 8 skewed Views + 2 LinearGradients per instance, called 6+ times per page)
 */
const WoodGrain = React.memo(({ intensity = 1 }: { intensity?: number }) => (
    <View style={StyleSheet.absoluteFill} collapsable={false}>
        <LinearGradient
            colors={[WOOD_HIGHLIGHT, WOOD_MID, WOOD_BASE, WOOD_DARK]}
            locations={[0, 0.3, 0.7, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
        />
        {/* 4 grain lines (was 8) */}
        <View style={grainStyles.container}>
            <View style={[grainStyles.line, { left: "15%", opacity: 0.07 * intensity }]} />
            <View style={[grainStyles.line, { left: "32%", opacity: 0.05 * intensity }]} />
            <View style={[grainStyles.line, { left: "58%", opacity: 0.09 * intensity }]} />
            <View style={[grainStyles.line, { left: "78%", opacity: 0.06 * intensity }]} />
        </View>
    </View>
));

const grainStyles = StyleSheet.create({
    container: {
        ...StyleSheet.absoluteFillObject,
        flexDirection: "row",
        overflow: "hidden",
    },
    line: {
        position: "absolute",
        top: 0,
        bottom: 0,
        width: 2,
        backgroundColor: WOOD_DARK,
    },
});

export default WoodGrain;
