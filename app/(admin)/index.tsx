import { useModerationReports, useResolveReport } from "@/api/safety";
import { useColors } from "@/constants/theme";
import { useState } from "react";
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";

export default function ModerationScreen() {
  const colors = useColors();
  const reports = useModerationReports();
  const resolve = useResolveReport();
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  return <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ padding: 24, gap: 16 }}>
    <Text accessibilityRole="header" style={{ color: colors.text, fontSize: 24 }}>Moderation queue</Text>
    <Text style={{ color: colors.text }}>Latest 100 reports. Review context, record a reason, then resolve. Contact support for appeals. Do not download or reproduce child abuse material.</Text>
    <TextInput accessibilityLabel="Moderation resolution note" placeholder="Resolution note (required)" placeholderTextColor={colors.grey} value={note} onChangeText={setNote} multiline maxLength={2000} style={{ color: colors.text, borderWidth: 1, borderColor: colors.border, padding: 12 }} />
    <Text accessibilityLiveRegion="polite" style={{ color: colors.text }}>{message}</Text>
    {reports.isLoading && <ActivityIndicator />}
    {reports.isError && <Text style={{ color: colors.danger }} onPress={() => void reports.refetch()}>Reports could not be loaded. Tap to retry.</Text>}
    {reports.data?.length === 0 && <Text style={{ color: colors.text }}>No reports.</Text>}
    {reports.data?.map((report) => <View key={report.id} style={{ padding: 16, borderWidth: 1, borderColor: colors.border, gap: 8 }}>
      <Text style={{ color: colors.text }}>{report.target_type} {report.target_id} — {report.reason} — {report.status}</Text>
      <Text selectable style={{ color: colors.text }}>{report.details}</Text>
      <Text selectable style={{ color: colors.text }}>{JSON.stringify(report.context, null, 2)}</Text>
      {!!report.resolution && <Text style={{ color: colors.text }}>{report.resolution}</Text>}
      {(["restrict", "suspend", "dismiss", "restore", "unsuspend", ...(report.target_type === "showcase" ? ["rate_18"] : [])]).map((action) => <TouchableOpacity key={action} disabled={resolve.isPending || note.trim().length < 3} style={{ minHeight: 44, justifyContent: "center" }} onPress={async () => {
        try { await resolve.mutateAsync({ reportId: report.id, action, note }); setMessage("Moderation action recorded."); }
        catch (error) { setMessage(error instanceof Error ? error.message : "Moderation action failed."); }
      }}><Text style={{ color: colors.primary }}>{action.replace(/_/g, " ")}</Text></TouchableOpacity>)}
    </View>)}
  </ScrollView>;
}
