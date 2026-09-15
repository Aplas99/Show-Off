import { useColors } from "@/constants/theme";
import { OPERATOR_NAME, POLICY_VERSION, policies, supportMailUrl, type PolicyPage } from "@/lib/policies";
import { Link, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export function generateStaticParams() {
  return Object.keys(policies).map((page) => ({ page }));
}

export default function PolicyScreen() {
  const { page } = useLocalSearchParams<{ page: string }>();
  const colors = useColors();
  const [error, setError] = useState(false);
  const policy = Object.prototype.hasOwnProperty.call(policies, page) ? policies[page as PolicyPage] : null;
  return <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]}>
    <ScrollView contentContainerStyle={styles.content}>
      <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>{policy?.title ?? "Page not found"}</Text>
      <Text style={{ color: colors.textDim }}>{OPERATOR_NAME} | Updated {POLICY_VERSION}</Text>
      {policy?.sections.map(([heading, body]) => <View key={heading} style={styles.section}>
        <Text accessibilityRole="header" style={[styles.heading, { color: colors.text }]}>{heading}</Text>
        <Text style={[styles.body, { color: colors.text }]}>{body}</Text>
      </View>)}
      {(page === "support" || page === "deletion") && <TouchableOpacity accessibilityRole="button" style={styles.link}
        onPress={() => Linking.openURL(supportMailUrl(page === "deletion")).catch(() => setError(true))}>
        <Text style={{ color: colors.primary }}>{page === "deletion" ? "Email a deletion request" : "Email support"}</Text>
      </TouchableOpacity>}
      {error && <Text accessibilityRole="alert" style={{ color: colors.text }}>No email app opened. Email onistudiosupport@gmail.com using your preferred mail service.</Text>}
      {Object.entries(policies).map(([key, value]) => <Link key={key} href={{ pathname: "/legal/[page]", params: { page: key } }} style={[styles.link, { color: colors.primary }]}>{value.title}</Link>)}
      <Link href="/" style={[styles.link, { color: colors.primary }]}>Return to Show Off</Link>
    </ScrollView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 24, width: "100%", maxWidth: 850, alignSelf: "center", gap: 16 },
  title: { fontSize: 28, fontWeight: "700" },
  heading: { fontSize: 20, fontWeight: "600" },
  body: { fontSize: 16, lineHeight: 25 },
  section: { gap: 8 },
  link: { paddingVertical: 14, minHeight: 48, fontSize: 16 },
});
