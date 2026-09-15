import { useBlockedUsers, useSetUserBlock } from "@/api/safety";
import { useColors } from "@/constants/theme";
import { useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";

export default function BlockedAccounts() {
  const colors = useColors();
  const blocks = useBlockedUsers();
  const unblock = useSetUserBlock();
  const [message, setMessage] = useState("");
  return <View style={{ padding: 16, gap: 8 }}>
    <Text accessibilityRole="header" style={{ color: colors.text }}>Blocked accounts</Text>
    <Text style={{ color: colors.text }}>Unblocking does not restore follows.</Text>
    {blocks.isError && <Text onPress={() => void blocks.refetch()} style={{ color: colors.danger }}>Could not load blocks. Tap to retry.</Text>}
    {blocks.data?.length === 0 && <Text style={{ color: colors.text }}>No blocked accounts.</Text>}
    {blocks.data?.map((block) => <TouchableOpacity key={block.blocked_id} disabled={unblock.isPending} accessibilityRole="button" style={{ minHeight: 44 }} onPress={async () => {
      try { await unblock.mutateAsync({ userId: block.blocked_id, blocked: false }); setMessage("Account unblocked."); }
      catch { setMessage("Could not unblock. Please retry."); }
    }}><Text style={{ color: colors.primary }}>Unblock {block.blocked_id}</Text></TouchableOpacity>)}
    <Text accessibilityLiveRegion="polite" style={{ color: colors.text }}>{message}</Text>
  </View>;
}
