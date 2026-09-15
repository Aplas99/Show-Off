import { useColors } from "@/constants/theme";
import { Link } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

export default function SubscriptionDisclosure({ onOpenPolicy }: { onOpenPolicy?: () => void }) {
  const colors = useColors();
  return (
    <View style={styles.container}>
      <Text style={[styles.text, { color: colors.onSurfaceVariant }]}>
        Payment is charged to your store account when you confirm. Subscriptions renew
        automatically unless cancelled at least 24 hours before the current period ends.
        Manage or cancel in the store account used to subscribe. Deleting your Show Off
        account or the app does not cancel billing. Any eligible introductory offer and
        its subsequent renewal price are shown in the store confirmation.
      </Text>
      <View style={styles.links}>
        <Link href="/legal/terms" onPress={onOpenPolicy} style={{ color: colors.primary }}>Terms of Use</Link>
        <Link href="/legal/privacy" onPress={onOpenPolicy} style={{ color: colors.primary }}>Privacy Policy</Link>
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  container: { marginVertical: 16, gap: 12 },
  text: { fontSize: 12, lineHeight: 18 },
  links: { flexDirection: "row", flexWrap: "wrap", gap: 24, paddingVertical: 12 },
});
