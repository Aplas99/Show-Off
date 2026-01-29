import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { StyleSheet, View } from "react-native";
import { WOOD_BASE, WOOD_DARK, WOOD_HIGHLIGHT, WOOD_MID } from "./constants";

// --- Wood Texture Component ---
const WoodGrain = React.memo(({ intensity = 1 }: { intensity?: number }) => (
    <View style={StyleSheet.absoluteFill}>
        <LinearGradient
            colors={[WOOD_HIGHLIGHT, WOOD_MID, WOOD_BASE, WOOD_DARK]}
            locations={[0, 0.3, 0.7, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
        />
        {/* Wood grain lines */}
        <View style={grainStyles.container}>
            {[...Array(8)].map((_, i) => (
                <View
                    key={i}
                    style={[
                        grainStyles.line,
                        {
                            left: `${10 + i * 12}%`,
                            opacity: 0.08 * intensity + (i % 3 === 0 ? 0.05 : 0),
                            transform: [{ skewX: `${-2 + (i % 2) * 4}deg` }],
                        },
                    ]}
                />
            ))}
        </View>
        {/* Vignette overlay */}
        <LinearGradient
            colors={["rgba(0,0,0,0.2)", "transparent", "rgba(0,0,0,0.3)"]}
            locations={[0, 0.5, 1]}
            style={StyleSheet.absoluteFill}
        />
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
