import { resendConfirmation } from "@/api/auth";
import { useColors } from "@/constants/theme";
import { emailSchema } from "@/lib/authValidation";
import { useMutation } from "@tanstack/react-query";
import { Link } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

export default function ConfirmEmail() {
  const colors = useColors();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("Open your confirmation email on the device and browser where you signed up. Check your spam folder too.");
  const [cooldown, setCooldown] = useState(false);
  const resend = useMutation({ mutationFn: resendConfirmation });
  useEffect(() => {
    if (!cooldown) return;
    const timer = setTimeout(() => setCooldown(false), 60000);
    return () => clearTimeout(timer);
  }, [cooldown]);
  const handleResend = async () => {
    if (resend.isPending || cooldown) return;
    const parsed = emailSchema.safeParse(email.trim());
    if (!parsed.success) { setMessage("Enter a valid email address."); return; }
    setCooldown(true);
    try {
      await resend.mutateAsync(parsed.data);
      setMessage("If this address needs confirmation, a new link has been sent. You can request another in one minute.");
    } catch {
      setMessage("Could not resend confirmation. Wait a minute and try again.");
    }
  };
  return (
    <KeyboardAwareScrollView contentContainerStyle={[styles.container, { backgroundColor: colors.background }]} keyboardShouldPersistTaps="handled">
      <Text accessibilityRole="header" style={[styles.heading, { color: colors.text }]}>Confirm your email</Text>
      <Text accessibilityLiveRegion="polite" style={{ color: colors.text }}>{message}</Text>
      <TextInput accessibilityLabel="Email address" placeholder="Email address" placeholderTextColor={colors.textDim}
        style={[styles.input, { color: colors.text, backgroundColor: colors.inputBg }]} value={email}
        onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" editable={!resend.isPending} />
      <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: resend.isPending || cooldown }}
        style={[styles.button, { backgroundColor: colors.primary, opacity: cooldown ? 0.6 : 1 }]}
        disabled={resend.isPending || cooldown} onPress={handleResend}>
        {resend.isPending ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>{cooldown ? "Wait before resending" : "Resend confirmation"}</Text>}
      </TouchableOpacity>
      <Link href="/(auth)/signin" style={[styles.link, { color: colors.primary }]}>Return to sign in</Link>
    </KeyboardAwareScrollView>
  );
}
const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: "center", padding: 24, gap: 20, width: "100%", maxWidth: 568, alignSelf: "center" },
  heading: { fontSize: 26, fontWeight: "700" },
  input: { padding: 16, borderRadius: 12, minHeight: 48, fontSize: 16 },
  button: { padding: 14, minHeight: 48, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  buttonText: { color: "#FFFFFF", fontWeight: "600" },
  link: { paddingVertical: 16, textAlign: "center" },
});
