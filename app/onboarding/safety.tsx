import { signOut } from "@/api/auth";
import { useColors } from "@/constants/theme";
import { useAuthStore } from "@/hooks/useAuthStore";
import { AGE_COLLECTION_EXPLANATION, reportedAgeSchema } from "@/lib/ageAccess";
import { POLICY_VERSION } from "@/lib/policies";
import { supabase } from "@/lib/supabase";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

export default function SafetyOnboarding() {
  const colors = useColors();
  const router = useRouter();
  const qc = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id);
  const setNeedsSafety = useAuthStore((s) => s.setNeedsSafety);
  const [age, setAge] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const profile = useQuery({ queryKey: ["account-age", userId], enabled: !!userId, queryFn: async () => {
    const { data, error } = await supabase.from("profile").select("reported_age").eq("id", userId!).maybeSingle();
    if (error) throw new Error("Could not load your age. Please retry.");
    return data;
  } });
  const save = useMutation({ mutationFn: async () => {
    if (profile.isPending || profile.isError) throw new Error("Wait for your profile to load or retry.");
    const parsed = reportedAgeSchema.safeParse(profile.data?.reported_age ?? Number(age));
    if (!parsed.success) throw new Error(parsed.error.issues[0].message);
    if (!accepted) throw new Error("Please accept the terms and community standards.");
    const { error } = await supabase.rpc("accept_account_standards", { p_age: parsed.data, p_version: POLICY_VERSION });
    if (error) throw new Error("Could not save your choices. Try again, or contact support to correct your recorded age.");
  }, onSuccess: () => {
    qc.clear();
    setNeedsSafety(false);
    router.replace("/");
  } });
  return <KeyboardAwareScrollView contentContainerStyle={[styles.container, { backgroundColor: colors.background }]} keyboardShouldPersistTaps="handled">
    <Text style={[styles.heading, { color: colors.text }]} accessibilityRole="header">Before you start</Text>
    <Text style={{ color: colors.text }}>{AGE_COLLECTION_EXPLANATION}</Text>
    <Text style={{ color: colors.text }}>We record when you provide your age to apply restrictions as time passes. Contact support if it needs correction.</Text>
    {profile.isPending ? <ActivityIndicator /> : profile.isError ? <TouchableOpacity onPress={() => profile.refetch()} style={styles.button}><Text style={{ color: colors.primary }}>Retry loading profile</Text></TouchableOpacity> : profile.data?.reported_age != null ?
      <Text style={{ color: colors.text }}>Age recorded at signup: {profile.data.reported_age}</Text> :
      <TextInput style={[styles.input, { color: colors.text, backgroundColor: colors.inputBg }]} accessibilityLabel="Your current age" placeholder="Your current age" placeholderTextColor={colors.textDim} keyboardType="number-pad" maxLength={3} value={age} onChangeText={setAge} />}
    {(["terms", "community", "privacy"] as const).map((page) => <Link key={page} href={{ pathname: "/legal/[page]", params: { page } }} style={[styles.button, { color: colors.primary }]}>Read {page === "community" ? "Community Standards" : page === "privacy" ? "Privacy Policy" : "Terms of Use"}</Link>)}
    <View style={styles.row}><Switch value={accepted} onValueChange={setAccepted} accessibilityLabel="Accept terms and community standards" />
      <Text style={[styles.acceptance, { color: colors.text }]}>I agree to the Terms of Use and Community Standards and have read the Privacy Policy. If required for my age, my parent or guardian agrees.</Text></View>
    {error && <Text accessibilityRole="alert" style={{ color: colors.danger }}>{error}</Text>}
    <TouchableOpacity accessibilityRole="button" style={[styles.button, { backgroundColor: colors.primary }]} disabled={save.isPending || profile.isPending || profile.isError}
      onPress={() => { setError(null); save.mutateAsync().catch((e: unknown) => setError(e instanceof Error ? e.message : "Please try again.")); }}>
      {save.isPending ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>Continue</Text>}
    </TouchableOpacity>
    <Link href={{ pathname: "/legal/[page]", params: { page: "deletion" } }} style={[styles.button, { color: colors.primary }]}>Help or request account deletion</Link>
    <TouchableOpacity accessibilityRole="button" style={styles.button} onPress={() => signOut().catch(() => setError("Could not sign out. Please retry."))}><Text style={{ color: colors.primary }}>Sign out</Text></TouchableOpacity>
  </KeyboardAwareScrollView>;
}
const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: "center", padding: 24, gap: 16 },
  heading: { fontSize: 26, fontWeight: "700" },
  input: { padding: 16, minHeight: 48, borderRadius: 12, fontSize: 16 },
  button: { padding: 14, minHeight: 48, borderRadius: 12, textAlign: "center" },
  buttonText: { color: "#FFFFFF", textAlign: "center", fontWeight: "600" },
  row: { flexDirection: "row", gap: 12, alignItems: "center" },
  acceptance: { flex: 1 },
});
