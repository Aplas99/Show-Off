import { useColors } from "@/constants/theme";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

export default function MarketScreen() {
    const colors = useColors();
    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <Text style={[styles.text, { color: colors.textDim }]}>Marketplace — Coming Soon</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
    },
    text: {
        fontSize: 16,
        fontWeight: "600",
    },
});
