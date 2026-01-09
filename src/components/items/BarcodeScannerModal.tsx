import { COLORS } from "@/constants/theme";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";

interface BarcodeScannerModalProps {
    visible: boolean;
    onClose: () => void;
    onBarcodeScanned: (barcode: string) => void;
}

export default function BarcodeScannerModal({
    visible,
    onClose,
    onBarcodeScanned,
}: BarcodeScannerModalProps) {
    return (
        <Modal
            visible={visible}
            animationType="slide"
            presentationStyle="pageSheet"
            onRequestClose={onClose}
        >
            <View style={styles.container}>
                <View style={styles.header}>
                    <Text style={styles.title}>Scan Barcode</Text>
                    <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                        <Ionicons name="close" size={24} color={COLORS.white} />
                    </TouchableOpacity>
                </View>
                <View style={styles.content}>
                    <Text style={styles.text}>Camera Placeholder</Text>
                    <TouchableOpacity
                        style={styles.mockButton}
                        onPress={() => onBarcodeScanned("1234567890123")}
                    >
                        <Text style={styles.mockButtonText}>Simulate Scan</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.background,
    },
    header: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        padding: 16,
    },
    title: {
        fontSize: 18,
        fontWeight: "bold",
        color: COLORS.white,
    },
    closeButton: {
        padding: 8,
    },
    content: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
    },
    text: {
        color: COLORS.grey,
        marginBottom: 20,
    },
    mockButton: {
        padding: 16,
        backgroundColor: COLORS.primary,
        borderRadius: 8,
    },
    mockButtonText: {
        color: COLORS.white,
        fontWeight: "bold",
    },
});
