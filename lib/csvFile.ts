import { Directory, File, Paths } from "expo-file-system";
import { Platform, Share } from "react-native";
import { ITEM_CSV_MAX_BYTES } from "./itemCsv";

/**
 * Hands a CSV to the user: a browser download on web, the share sheet on iOS
 * (Save to Files, AirDrop, Mail...), and a folder picker on Android.
 * Resolves false when the user cancels.
 */
export async function saveCsvFile(fileName: string, csv: string): Promise<boolean> {
  if (Platform.OS === "web") {
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    return true;
  }

  if (Platform.OS === "android") {
    const directory = await Directory.pickDirectoryAsync().catch(() => null);
    if (!directory) return false;
    directory.createFile(fileName, "text/csv").write(csv);
    return true;
  }

  const file = new File(Paths.cache, fileName);
  if (file.exists) file.delete();
  file.create();
  file.write(csv);
  const result = await Share.share({ url: file.uri, title: fileName });
  return result.action !== Share.dismissedAction;
}

/** Lets the user pick a CSV and returns its text, or null when cancelled. */
export async function pickCsvFile(): Promise<string | null> {
  if (Platform.OS === "web") {
    const file = await new Promise<globalThis.File | null>((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".csv,text/csv";
      input.onchange = () => resolve(input.files?.[0] ?? null);
      input.oncancel = () => resolve(null);
      input.click();
    });
    if (!file) return null;
    if (file.size > ITEM_CSV_MAX_BYTES) throw new Error(csvTooLargeMessage());
    return file.text();
  }

  const picked = await File.pickFileAsync().catch(() => null);
  if (!picked) return null;
  const file = Array.isArray(picked) ? picked[0] : picked;
  if (!file) return null;
  if (file.size > ITEM_CSV_MAX_BYTES) throw new Error(csvTooLargeMessage());
  return file.text();
}

function csvTooLargeMessage() {
  return `CSV files can be up to ${ITEM_CSV_MAX_BYTES / (1024 * 1024)}MB.`;
}
