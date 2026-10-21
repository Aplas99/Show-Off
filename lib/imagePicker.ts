import * as ImagePicker from "expo-image-picker";
import { Alert, Platform } from "react-native";
import { showMessage } from "@/lib/dialogs";

export type ImageSource = "camera" | "library";

export type PickImagesOptions = {
  title?: string;
  allowsMultipleSelection?: boolean;
  selectionLimit?: number;
  allowsEditing?: boolean;
  aspect?: [number, number];
  quality?: number;
};

/**
 * Asks whether to take a new photo or choose existing ones. Web has no
 * reliable in-page camera here (mobile browsers already offer the camera
 * from the file picker), so it goes straight to the library.
 */
export function chooseImageSource(title = "Add photo"): Promise<ImageSource | null> {
  if (Platform.OS === "web") return Promise.resolve("library");
  return new Promise((resolve) => {
    Alert.alert(title, undefined, [
      { text: "Take Photo", onPress: () => resolve("camera") },
      { text: "Choose from Library", onPress: () => resolve("library") },
      { text: "Cancel", style: "cancel", onPress: () => resolve(null) },
    ], { cancelable: true, onDismiss: () => resolve(null) });
  });
}

async function ensurePermission(source: ImageSource): Promise<boolean> {
  if (Platform.OS === "web") return true;
  const permission = source === "camera"
    ? await ImagePicker.requestCameraPermissionsAsync()
    : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (permission.granted) return true;
  showMessage(
    source === "camera" ? "Camera access needed" : "Photo access needed",
    source === "camera"
      ? "Allow camera access in Settings to take photos of your items."
      : "Allow photo library access in Settings to add images of your items.",
  );
  return false;
}

/**
 * Lets the user take a photo or pick from their library, handling
 * permissions. Resolves with the chosen assets, or null when cancelled.
 */
export async function pickImages(options: PickImagesOptions = {}): Promise<ImagePicker.ImagePickerAsset[] | null> {
  const source = await chooseImageSource(options.title);
  if (!source || !(await ensurePermission(source))) return null;

  const base: ImagePicker.ImagePickerOptions = {
    mediaTypes: ["images"],
    quality: options.quality ?? 0.85,
    allowsEditing: options.allowsEditing,
    aspect: options.aspect,
  };
  try {
    const result = source === "camera"
      ? await ImagePicker.launchCameraAsync(base)
      : await ImagePicker.launchImageLibraryAsync({
        ...base,
        // iOS ignores allowsEditing when multiple selection is on.
        allowsMultipleSelection: options.allowsMultipleSelection,
        selectionLimit: options.selectionLimit,
      });
    if (result.canceled || result.assets.length === 0) return null;
    return result.assets;
  } catch (error: unknown) {
    showMessage(
      source === "camera" ? "Couldn't open camera" : "Couldn't open photos",
      error instanceof Error ? error.message : "Please try again.",
    );
    return null;
  }
}
