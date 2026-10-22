import type { Text } from "@infinitered/react-native-mlkit-text-recognition";

import { createActionLogger } from "@/lib/actionDebug";

// One ML Kit loader for every card scanner (Pokémon, Magic, Riftbound and the
// shared-pipeline games).

export const ML_KIT_UNAVAILABLE_MESSAGE = "Card OCR requires a development build; it is unavailable in Expo Go.";

type MlKitModule = typeof import("@infinitered/react-native-mlkit-text-recognition");

const ocrDebug = createActionLogger("CardOcr");

function loadMlKit(): MlKitModule | null {
  try {
    // A plain require keeps ML Kit in the main bundle. A lazy import() is
    // served as a separate dev bundle that Metro can fail to link
    // ("Requiring unknown module"), which left recognizeText undefined.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("@infinitered/react-native-mlkit-text-recognition") as MlKitModule;
  } catch (error) {
    // In Expo Go the native module is missing; anything else is a real
    // bundling problem, so keep its message in the logs.
    ocrDebug.error("ml-kit.load-failed", error);
    return null;
  }
}

export async function recognizeTextWithMlKit(imageUri: string): Promise<Text> {
  const mlKit = loadMlKit();
  if (typeof mlKit?.recognizeText !== "function") throw new Error(ML_KIT_UNAVAILABLE_MESSAGE);
  try {
    return await mlKit.recognizeText(imageUri);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("RNMLKitTextRecognition") || message.includes("native module")) {
      throw new Error(ML_KIT_UNAVAILABLE_MESSAGE);
    }
    throw error;
  }
}
