import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity } from "react-native";

export function AppleSignInButton({ onPress, disabled }: { onPress: () => void; disabled: boolean }) {
  return <TouchableOpacity style={styles.button} onPress={onPress} disabled={disabled}
    accessibilityRole="button" accessibilityLabel="Sign in with Apple" accessibilityState={{ disabled }}>
    {disabled ? <ActivityIndicator color="#FFFFFF" /> : <Ionicons name="logo-apple" size={22} color="#FFFFFF" />}
    <Text style={styles.text}>Sign in with Apple</Text>
  </TouchableOpacity>;
}
const styles = StyleSheet.create({
  button: { minHeight: 48, backgroundColor: "#000000", borderColor: "#FFFFFF", borderWidth: 1, borderRadius: 8, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", padding: 12, marginVertical: 12 },
  text: { color: "#FFFFFF", fontSize: 17, fontWeight: "600" },
});
