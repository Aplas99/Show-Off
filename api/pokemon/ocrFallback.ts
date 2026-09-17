import { supabase } from "@/lib/supabase";

import { cardScanDebug, cardScanError } from "./cardScanDebug";
import type { PokemonOcrResult } from "./recognition";

// The Railway URL and bearer secret live in Supabase Edge Function secrets.
// Only the prepared card crop is sent after opt-in and a failed device pass.
const FALLBACK_TIMEOUT_MS = 30_000;

export async function recognizeTextWithFallbackService(
  imageUri: string,
): Promise<PokemonOcrResult | null> {
  const startedAt = Date.now();
  try {
    const form = new FormData();
    form.append("image", {
      uri: imageUri,
      name: "card.jpg",
      type: "image/jpeg",
    } as unknown as Blob);

    const { data, error } = await supabase.functions.invoke("ocr-fallback", {
      body: form,
      timeout: FALLBACK_TIMEOUT_MS,
    });
    if (error) throw error;
    if (typeof data?.text !== "string") return null;

    cardScanDebug("ocr.fallback-completed", {
      durationMs: Date.now() - startedAt,
      textLength: data.text.length,
    });
    return { text: data.text, blocks: data.blocks };
  } catch (error) {
    cardScanError("ocr.fallback-failed", error);
    return null;
  }
}
