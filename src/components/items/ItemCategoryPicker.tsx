import {
    ITEM_CATEGORIES,
    ITEM_CATEGORY_ICONS,
    ITEM_CATEGORY_LABELS,
    type ItemCategory,
} from "@/constants/itemCategory";
import type { ThemeColors } from "@/constants/theme";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

interface Props {
    value: ItemCategory;
    onChange: (category: ItemCategory) => void;
    colors: ThemeColors;
    /** Shown under the chips, e.g. to explain an auto-detected value. */
    hint?: string;
}

export default function ItemCategoryPicker({ value, onChange, colors, hint }: Props) {
    return (
        <View>
            <View style={styles.row} accessibilityRole="radiogroup">
                {ITEM_CATEGORIES.map((category) => {
                    const selected = category === value;
                    return (
                        <TouchableOpacity
                            key={category}
                            onPress={() => onChange(category)}
                            style={[
                                styles.chip,
                                { borderColor: colors.border, backgroundColor: colors.inputBg },
                                selected && { borderColor: colors.primary, backgroundColor: `${colors.primary}22` },
                            ]}
                            accessibilityRole="radio"
                            accessibilityState={{ selected }}
                            accessibilityLabel={ITEM_CATEGORY_LABELS[category]}
                        >
                            <Ionicons
                                name={ITEM_CATEGORY_ICONS[category]}
                                size={16}
                                color={selected ? colors.primary : colors.grey}
                            />
                            <Text
                                style={[styles.chipText, { color: selected ? colors.primary : colors.text }]}
                                numberOfLines={1}
                            >
                                {ITEM_CATEGORY_LABELS[category]}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </View>
            {hint ? <Text style={[styles.hint, { color: colors.textDim }]}>{hint}</Text> : null}
        </View>
    );
}

const styles = StyleSheet.create({
    row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    chip: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        minHeight: 40,
        paddingHorizontal: 14,
        borderRadius: 20,
        borderWidth: 1,
    },
    chipText: { fontSize: 14, fontWeight: "600" },
    hint: { fontSize: 13, marginTop: 8 },
});
