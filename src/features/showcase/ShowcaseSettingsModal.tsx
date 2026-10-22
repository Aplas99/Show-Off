import { useDeleteShowcase, useSetShowcasePublic, type ShowcaseRow } from "@/api/showcase";
import { useColors } from "@/constants/theme";
import { useState } from "react";
import { ActivityIndicator, Modal, Platform, ScrollView, Share, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";

export default function ShowcaseSettingsModal({ showcase, onClose, onDeleted }: { showcase: ShowcaseRow; onClose: () => void; onDeleted: () => void }) {
  const colors = useColors();
  const update = useSetShowcasePublic();
  const remove = useDeleteShowcase();
  const [name, setName] = useState(showcase.name);
  const [description, setDescription] = useState(showcase.description ?? "");
  const [isPublic, setIsPublic] = useState(showcase.is_public);
  const [rating, setRating] = useState<"general" | "18_plus" | null>(showcase.audience_rating);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const pending = update.isPending || remove.isPending;
  const save = async (share: boolean) => {
    setError(null);
    try {
      await update.mutateAsync({ showcaseId: showcase.id, name, description, isPublic, audienceRating: rating ?? undefined });
      if (share && isPublic) {
        const origin = Platform.OS === "web" && typeof window !== "undefined" ? window.location.origin : process.env.EXPO_PUBLIC_SITE_URL;
        const url = origin ? `${origin.replace(/\/$/, "")}/s/${showcase.id}` : `showoff:///s/${showcase.id}`;
        await Share.share({ message: `View my Show Off showcase: ${url}`, url });
      }
      onClose();
    } catch (failure: unknown) { setError(failure instanceof Error ? failure.message : "Could not save. Please retry."); }
  };
  return <Modal visible transparent animationType="slide" onRequestClose={() => { if (!pending) onClose(); }}>
    <View style={styles.overlay}><ScrollView contentContainerStyle={[styles.panel, { backgroundColor: colors.background }]} keyboardShouldPersistTaps="handled">
      <Text accessibilityRole="header" style={[styles.heading, { color: colors.text }]}>Showcase settings</Text>
      <TextInput style={[styles.input, { color: colors.text, backgroundColor: colors.inputBg }]} value={name} onChangeText={setName} maxLength={100} accessibilityLabel="Showcase name" editable={!pending} />
      <TextInput style={[styles.input, { color: colors.text, backgroundColor: colors.inputBg }]} value={description} onChangeText={setDescription} multiline maxLength={2000} accessibilityLabel="Showcase description" placeholder="Description" placeholderTextColor={colors.textDim} editable={!pending} />
      <View style={styles.row}><Text style={{ color: colors.text }}>Public showcase</Text><Switch value={isPublic} onValueChange={(value) => { setIsPublic(value); if (!value) setRating(null); }} disabled={pending} accessibilityLabel="Public showcase" /></View>
      {isPublic && <View style={styles.section}>
        <Text style={{ color: colors.text }}>Choose the audience for the whole showcase. An 18+ rating does not allow prohibited content.</Text>
        {([['general', 'General audience'], ['18_plus', '18+ mature collectibles']] as const).map(([value, label]) => <TouchableOpacity key={value} accessibilityRole="radio" accessibilityState={{ checked: rating === value }} style={[styles.button, { borderColor: rating === value ? colors.primary : colors.border, borderWidth: 1 }]} onPress={() => setRating(value)} disabled={pending}>
          <Text style={[styles.buttonText, { color: colors.text }]}>{rating === value ? "Selected: " : ""}{label}</Text>
        </TouchableOpacity>)}
        <Text style={{ color: colors.textDim }}>Items or uploaded media also used in an 18+ public showcase stay restricted for younger viewers, even when reused here.</Text>
      </View>}
      {error && <Text accessibilityRole="alert" style={{ color: colors.danger }}>{error}</Text>}
      {pending ? <ActivityIndicator /> : <>
        <TouchableOpacity accessibilityRole="button" style={[styles.button, { backgroundColor: colors.primary }]} onPress={() => save(false)}><Text style={[styles.buttonText, styles.white]}>Save changes</Text></TouchableOpacity>
        {isPublic && <TouchableOpacity accessibilityRole="button" style={styles.button} onPress={() => save(true)}><Text style={[styles.buttonText, { color: colors.primary }]}>Save and share</Text></TouchableOpacity>}
        {!showcase.is_default && <TouchableOpacity accessibilityRole="button" style={styles.button} onPress={() => {
          if (!confirmDelete) { setConfirmDelete(true); return; }
          remove.mutateAsync(showcase.id).then(onDeleted).catch(() => setError("Could not delete this showcase. Please retry."));
        }}><Text style={[styles.buttonText, { color: colors.danger }]}>{confirmDelete ? "Confirm permanent showcase deletion" : "Delete showcase"}</Text></TouchableOpacity>}
        {confirmDelete && <Text style={{ color: colors.text }}>The showcase and its links will be deleted. Your collection items remain in your account.</Text>}
        <TouchableOpacity accessibilityRole="button" style={styles.button} onPress={onClose}><Text style={[styles.buttonText, { color: colors.primary }]}>Close</Text></TouchableOpacity>
      </>}
    </ScrollView></View>
  </Modal>;
}
const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", padding: 20 },
  panel: { padding: 24, gap: 16, borderRadius: 18 },
  heading: { fontSize: 24, fontWeight: "700" },
  input: { minHeight: 48, padding: 14, borderRadius: 10, fontSize: 16 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  section: { gap: 12 },
  button: { minHeight: 48, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, justifyContent: "center" },
  // Labels fill the button width so long or large-font text wraps instead of clipping.
  buttonText: { alignSelf: "stretch", textAlign: "center", fontSize: 16, fontWeight: "600" },
  white: { color: "#FFFFFF" },
});
