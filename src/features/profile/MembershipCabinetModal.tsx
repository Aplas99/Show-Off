import { Modal, Pressable, StyleSheet, View } from "react-native";
import MembershipPanel from "./MembershipPanel";

interface MembershipCabinetModalProps {
    visible: boolean;
    onDismiss: () => void;
}

/**
 * Bottom-sheet "cabinet" presentation of the membership panel, opened from the
 * Settings button. Tapping the dimmed backdrop or the close/handle dismisses it.
 */
export function MembershipCabinetModal({
    visible,
    onDismiss,
}: MembershipCabinetModalProps) {
    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            statusBarTranslucent
            onRequestClose={onDismiss}
        >
            <View style={styles.backdrop}>
                <Pressable
                    style={StyleSheet.absoluteFill}
                    onPress={onDismiss}
                    accessibilityRole="button"
                    accessibilityLabel="Close membership"
                />
                <MembershipPanel mode="sheet" onClose={onDismiss} />
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        justifyContent: "flex-end",
        backgroundColor: "rgba(0,0,0,0.6)",
    },
});
