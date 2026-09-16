import { reportReasons, useReportContent, useSetUserBlock, type ReportType } from "@/api/safety";
import { useColors } from "@/constants/theme";
import { useAuthStore } from "@/hooks/useAuthStore";
import { useState } from "react";
import { Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

export default function ContentSafetyMenu({ type, id, ownerId }: { type: ReportType; id: string | number; ownerId?: string }) {
  const colors = useColors();
  const userId = useAuthStore((state) => state.user?.id);
  const report = useReportContent();
  const block = useSetUserBlock();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<typeof reportReasons[number]>("other");
  const [details, setDetails] = useState("");
  const [message, setMessage] = useState("");
  const [confirmBlock, setConfirmBlock] = useState(false);
  if (!userId || ownerId === userId) return null;
  const busy = report.isPending || block.isPending;
  return <>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Report content or block account" style={styles.button} onPress={() => { setOpen(true); setMessage(""); setConfirmBlock(false); }}>
      <Text style={{ color: colors.primary }}>Report / Block</Text>
    </TouchableOpacity>
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => { if (!busy) setOpen(false); }}>
      <View style={styles.backdrop}><ScrollView style={[styles.sheet, { backgroundColor: colors.background }]} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>Report a concern</Text>
        <Text style={{ color: colors.text }}>Choose a reason. Do not attach or reproduce suspected child abuse material.</Text>
        {reportReasons.map((value) => <TouchableOpacity key={value} accessibilityRole="radio" accessibilityState={{ selected: reason === value }} style={styles.button} onPress={() => setReason(value)}><Text style={{ color: reason === value ? colors.primary : colors.text }}>{reason === value ? "Selected: " : ""}{value.replace(/_/g, " ")}</Text></TouchableOpacity>)}
        <TextInput accessibilityLabel="Report details" value={details} onChangeText={setDetails} maxLength={2000} multiline placeholder="Additional context (optional)" placeholderTextColor={colors.grey} style={[styles.input, { color: colors.text, borderColor: colors.border }]} />
        <Text accessibilityLiveRegion="polite" style={{ color: colors.text }}>{message}</Text>
        <TouchableOpacity disabled={busy} style={styles.button} onPress={async () => {
          try { await report.mutateAsync({ type, id: String(id), reason, details }); setMessage("Report sent to Oni Studios for review."); setDetails(""); }
          catch (error) { setMessage(error instanceof Error ? error.message : "Could not send report. Please retry."); }
        }}><Text style={{ color: colors.primary }}>{report.isPending ? "Sending..." : "Send report"}</Text></TouchableOpacity>
        {type !== "account" && ownerId && <TouchableOpacity disabled={busy} style={styles.button} onPress={async () => {
          try { await report.mutateAsync({ type: "account", id: ownerId, reason, details }); setMessage("Account report sent for review."); }
          catch (error) { setMessage(error instanceof Error ? error.message : "Could not report account."); }
        }}><Text style={{ color: colors.primary }}>Report this account</Text></TouchableOpacity>}
        {ownerId && <TouchableOpacity disabled={busy} style={styles.button} onPress={async () => {
          if (!confirmBlock) { setConfirmBlock(true); setMessage("Blocking hides content between these signed-in accounts and removes follows. Public content remains accessible while signed out. Tap Confirm block to continue."); return; }
          try { await block.mutateAsync({ userId: ownerId, blocked: true }); setOpen(false); }
          catch (error) { setMessage(error instanceof Error ? error.message : "Could not block account."); }
        }}><Text style={{ color: colors.danger }}>{confirmBlock ? "Confirm block" : "Block account"}</Text></TouchableOpacity>}
        <TouchableOpacity disabled={busy} style={styles.button} onPress={() => setOpen(false)}><Text style={{ color: colors.text }}>Close</Text></TouchableOpacity>
      </ScrollView></View>
    </Modal>
  </>;
}
const styles = StyleSheet.create({ button: { minHeight: 44, justifyContent: "center", padding: 8 }, backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", padding: 20 }, sheet: { maxHeight: "90%", borderRadius: 16 }, content: { padding: 20, gap: 8 }, title: { fontSize: 20, fontWeight: "700" }, input: { minHeight: 80, borderWidth: 1, padding: 12, borderRadius: 8 } });
